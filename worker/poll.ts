import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { pool } from "./db.js";
import { fetchAvailable, DAYS_OF_WEEK } from "../src/slots.js";
import type { PolledOffer } from "../src/types.js";
import { sendSlack } from "./notify.js";

type Watch = {
  id: string;
  clubs?: string[];
  days?: string[];
  from?: string;
  to?: string;
  duration?: number | number[] | null;
};

const HORIZON_DAYS = Number(process.env.HORIZON_DAYS ?? 14);
const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const __dirname = dirname(fileURLToPath(import.meta.url));

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function horizonDates(): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    out.push(toISO(d));
  }
  return out;
}

const keyOf = (o: { club: string; date: string; start: string; duration: number }) =>
  `${o.club}|${o.date}|${o.start}|${o.duration}`;

async function loadWatches(): Promise<Watch[]> {
  const raw = await readFile(join(__dirname, "..", "watches.json"), "utf8");
  return JSON.parse(raw);
}

function matches(w: Watch, o: PolledOffer): boolean {
  if (w.clubs?.length && !w.clubs.includes(o.club)) return false;
  if (w.days?.length) {
    const d = new Date(o.date + "T00:00:00");
    if (!w.days.includes(DAYS_OF_WEEK[(d.getDay() + 6) % 7])) return false;
  }
  if (w.from && o.start < w.from) return false;
  if (w.to && o.start > w.to) return false;
  if (w.duration != null) {
    const allowed = Array.isArray(w.duration) ? w.duration : [w.duration];
    if (!allowed.includes(o.duration)) return false;
  }
  return true;
}

async function logEvent(event: string, o: any, key: string): Promise<void> {
  await pool.query(
    `INSERT INTO slot_events (slot_key, club, date, start, duration, event, price, stock)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [key, o.club, o.date, o.start, o.duration, event, o.price, o.stock]
  );
}

async function purgePast(): Promise<void> {
  // A past date leaves the horizon, so poll() never re-scans it and never diffs it away.
  // ponytail: seq scan each run; add an index on (date) if these tables ever get big enough to feel it
  const { rowCount } = await pool.query("DELETE FROM slot_events WHERE date < current_date");
  await pool.query("DELETE FROM slots WHERE date < current_date");
  if (rowCount) console.log(`[purge] dropped ${rowCount} events for past dates`);
}

export async function poll(): Promise<void> {
  await purgePast();
  const dates = horizonDates();
  const { offers: fresh, scanned } = await fetchAvailable(dates);
  const freshByKey = new Map(fresh.map((o) => [keyOf(o), o]));

  const prevRows = (
    await pool.query("SELECT slot_key, club, date, start, duration, price, stock FROM slots")
  ).rows;
  const prev = new Map<string, any>(prevRows.map((r) => [r.slot_key, r]));
  const coldStart = prev.size === 0;

  // upsert current snapshot
  // ponytail: one query per slot (hundreds); batch into a multi-row insert if it gets slow
  for (const o of freshByKey.values()) {
    const urls = o.bookingUrls ?? (o.bookingUrl ? [o.bookingUrl] : []);
    await pool.query(
      `INSERT INTO slots (slot_key, club, date, start, duration, price, stock, booking_urls, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (slot_key) DO UPDATE SET price = $6, stock = $7, booking_urls = $8, updated_at = now()`,
      [keyOf(o), o.club, o.date, o.start, o.duration, o.price, o.stock, urls]
    );
  }

  if (coldStart) {
    console.log(`[poll] cold start: seeded ${freshByKey.size} slots, no notifications`);
    return;
  }

  // diffs
  const appeared: PolledOffer[] = [];
  const changed: PolledOffer[] = [];
  for (const [key, o] of freshByKey) {
    const p = prev.get(key);
    if (!p) appeared.push(o);
    else if (Number(p.price) !== o.price || p.stock !== o.stock) changed.push(o);
  }
  // Only a slot whose club+date we re-scanned OK this cycle can count as gone.
  // A club that errored keeps its slots untouched — no flap, no fake re-notify.
  const disappeared = [...prev.keys()].filter((k) => {
    const clubDate = k.split("|").slice(0, 2).join("|");
    return scanned.has(clubDate) && !freshByKey.has(k);
  });

  // drop disappeared from snapshot + let them re-notify if they come back
  if (disappeared.length) {
    await pool.query("DELETE FROM slots WHERE slot_key = ANY($1)", [disappeared]);
    await pool.query("DELETE FROM notifications WHERE slot_key = ANY($1)", [disappeared]);
  }

  // event log (the historical asset — transitions only)
  for (const o of appeared) await logEvent("appeared", o, keyOf(o));
  for (const o of changed) await logEvent("changed", o, keyOf(o));
  for (const k of disappeared) await logEvent("disappeared", prev.get(k), k);

  const summary = `+${appeared.length} appeared, ${changed.length} changed, -${disappeared.length} gone`;

  // No webhook configured → seed + log events only, don't consume notifications.
  if (!WEBHOOK) {
    console.log(`[poll] ${summary} (no SLACK_WEBHOOK_URL, notifications skipped)`);
    return;
  }

  // notify: newly appeared slots matching a watch, once each
  const watches = await loadWatches();
  let sent = 0;
  for (const o of appeared) {
    for (const w of watches) {
      if (!matches(w, o)) continue;
      const ins = await pool.query(
        "INSERT INTO notifications (watch_id, slot_key) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [w.id, keyOf(o)]
      );
      if (ins.rowCount === 0) continue; // already notified this appearance
      try {
        await sendSlack(WEBHOOK, o);
        sent++;
      } catch (e: any) {
        console.error("[slack]", e.message);
      }
    }
  }

  console.log(`[poll] ${summary}, ${sent} notified`);
}
