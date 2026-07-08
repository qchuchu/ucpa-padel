import type { Offer } from "./types.js";

const BASE = "https://www.anybuddyapp.com";

type Club = { key: string; slug: string; NAME: string; SHORT: string };

// Paris intramuros (75xxx) only.
// Excluded: play-padel-alfortville (94), forest-hill-marnes-la-coquette (92),
// 4-padel-saint-ouen (93), lagardere-paris-racing (no online slots),
// ucpa-sport-station-a-paris-paris (direct UCPA API has full inventory).
const CLUBS: Club[] = [
  { key: "trinquet",     slug: "trinquet-village-paris",     NAME: "Trinquet Village - Paris 16e",       SHORT: "Trinquet" },
  { key: "padelistes",   slug: "les-padelistes-bercy-paris", NAME: "Padelistes Bercy - Paris 12e",       SHORT: "Padelistes" },
  { key: "4padel20",     slug: "4padel-paris-20",            NAME: "4PADEL - Paris 20e",                 SHORT: "4Padel20" },
  { key: "aquaboulevard", slug: "aquaboulevard-de-paris",    NAME: "Forest Hill Aquaboulevard - Paris 15e", SHORT: "Aquaboul" },
  { key: "parispadel",   slug: "paris-padel",                NAME: "Paris Padel - Paris 20e",            SHORT: "ParisPadel" },
  { key: "padel15",      slug: "padel-15-paris",             NAME: "Padel 15 - Paris 15e",               SHORT: "Padel15" },
  { key: "sportfield16", slug: "sportfield-paris",           NAME: "Sportfield Tour Eiffel - Paris 16e", SHORT: "Sportf16" },
  { key: "sportfield12", slug: "sportfield-bercy-paris",     NAME: "Sportfield Bercy - Paris 12e",       SHORT: "Sportf12" },
];

function endTime(time: string, duration: number): string {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + duration;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}h${String(t % 60).padStart(2, "0")}`;
}

async function fetchDay(slug: string, date: string): Promise<Offer[]> {
  const url =
    `${BASE}/api/v1/availabilities?clubSlug=${slug}` +
    `&dateFrom=${date}&dateTo=${date}T23%3A59&activity=padel`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Anybuddy API error: ${res.status}`);
  const { data } = await res.json();

  const slots: Offer[] = [];
  for (const { startDateTime, services } of data ?? []) {
    const time = startDateTime.slice(11); // "14:00"
    // one row per (duration, price) — courts can be priced differently at the same hour
    const groups = new Map<string, { svc: any; stock: number }>();
    for (const svc of services) {
      const key = `${svc.duration}|${svc.price}`;
      const group = groups.get(key);
      if (group) group.stock++;
      else groups.set(key, { svc, stock: 1 });
    }
    for (const { svc, stock } of groups.values()) {
      slots.push({
        start: time.replace(":", "h"),
        end: endTime(time, svc.duration),
        duration: svc.duration,
        stock,
        price: svc.price / 100,
        bookingUrl:
          `${BASE}/fr/club/${slug}?date=${date}` +
          `&serviceId=${svc.id}&time=${encodeURIComponent(time)}&duration=${svc.duration}`,
      });
    }
  }
  return slots.sort(
    (a, b) => a.start.localeCompare(b.start) || a.duration - b.duration
  );
}

export const clubs = CLUBS.map((c) => ({
  ...c,
  fetchDay: (date: string) => fetchDay(c.slug, date),
}));
