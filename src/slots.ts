import * as ucpa from "./api.js";
import { DAYS_OF_WEEK } from "./api.js";
import { clubs as anybuddyClubs } from "./anybuddy.js";
import type { Offer, PolledOffer } from "./types.js";

export const CLUBS: Record<string, any> = {
  ucpa: { ...ucpa, key: "ucpa", SHORT: "UCPA" },
};
for (const c of anybuddyClubs) CLUBS[c.key] = c;

export { DAYS_OF_WEEK };

export type SlotGroup = { start: string; offers: Offer[] };

export async function fetchDayAll(
  date: string,
  clubFilter: string | null = null,
  clubs: Record<string, any> = CLUBS
): Promise<{ slots: SlotGroup[]; errors: string[]; ok: string[] }> {
  const keys = clubFilter ? [clubFilter] : Object.keys(clubs);
  const results = await Promise.allSettled(keys.map((k) => clubs[k].fetchDay(date)));
  const offers: Offer[] = [];
  const errors: string[] = [];
  const ok: string[] = []; // clubs whose fetch succeeded this call
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      ok.push(keys[i]);
      offers.push(...r.value.map((s: Offer) => ({ ...s, club: keys[i] })));
    } else errors.push(`${keys[i]}: ${r.reason?.message ?? r.reason}`);
  });

  const byStart = new Map<string, Offer[]>();
  for (const o of offers) {
    if (o.stock === 0) continue; // UCPA reports full slots; nothing bookable → hide
    if (!byStart.has(o.start)) byStart.set(o.start, []);
    byStart.get(o.start)!.push(o);
  }
  const slots = [...byStart.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, group]) => ({
      start,
      offers: group.sort((a, b) => a.price - b.price || a.duration - b.duration),
    }));
  return { slots, errors, ok };
}

export function filterByDuration(slots: SlotGroup[], want: number | null): SlotGroup[] {
  if (!want) return slots;
  if (want !== 120) {
    return slots
      .map((g) => ({ start: g.start, offers: g.offers.filter((o) => o.duration === want) }))
      .filter((g) => g.offers.length > 0);
  }
  // 2h: direct 120min offers, or two consecutive 60min bookings at the same club
  const byStart = new Map(slots.map((g) => [g.start, g.offers]));
  return slots
    .map((g) => {
      const offers = g.offers.filter((o) => o.duration === 120);
      // skip clubs with a direct 2h offer (one payment beats two); price-sorted, so first pair is cheapest
      const seen = new Set<string>(offers.map((o) => o.club!));
      for (const o of g.offers) {
        if (o.duration !== 60 || seen.has(o.club!) || o.end <= o.start) continue; // no midnight wrap
        const next = (byStart.get(o.end) ?? []).find(
          (n) => n.club === o.club && n.duration === 60
        );
        if (!next) continue;
        seen.add(o.club!);
        offers.push({
          club: o.club,
          start: o.start,
          end: next.end,
          duration: 120,
          stock: Math.min(o.stock, next.stock),
          price: o.price + next.price,
          type: o.type === next.type ? o.type : o.type && next.type ? "HC+HP" : undefined,
          bookingUrls: [o.bookingUrl!, next.bookingUrl!],
        });
      }
      return { start: g.start, offers: offers.sort((a, b) => a.price - b.price) };
    })
    .filter((g) => g.offers.length > 0);
}

// Flat list of every available offer across all clubs for the given dates, plus
// synthetic 2h offers stitched from two consecutive 1h bookings (bookingUrls set).
// `scanned` holds the `club|date` pairs whose fetch succeeded — callers use it to
// tell a genuinely-gone slot from one whose club just failed this cycle.
// Memoizes UCPA's weekly response so a 14-day horizon = 2 weekly fetches, not 14.
export async function fetchAvailable(
  dates: string[]
): Promise<{ offers: PolledOffer[]; scanned: Set<string> }> {
  const weekCache = new Map<string, Promise<any>>();
  const memoUcpa = {
    ...CLUBS.ucpa,
    fetchDay: async (date: string) => {
      const key = ucpa.weekKey(date);
      if (!weekCache.has(key)) weekCache.set(key, ucpa.fetchWeek(date));
      return ucpa.slotsFromData(await weekCache.get(key), date);
    },
  };
  const clubs = { ...CLUBS, ucpa: memoUcpa };
  const offers: PolledOffer[] = [];
  const scanned = new Set<string>();
  for (const date of dates) {
    const { slots, ok } = await fetchDayAll(date, null, clubs);
    for (const k of ok) scanned.add(`${k}|${date}`);
    for (const g of slots) for (const o of g.offers) offers.push({ ...o, date } as PolledOffer);
    // stitched 2h (two consecutive 1h at the same club) — only the synthetic ones
    for (const g of filterByDuration(slots, 120))
      for (const o of g.offers)
        if (o.bookingUrls) offers.push({ ...o, date } as PolledOffer);
  }
  return { offers, scanned };
}
