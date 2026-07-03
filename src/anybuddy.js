const BASE = "https://www.anybuddyapp.com";
const CLUB = "trinquet-village-paris";

export const NAME = "Trinquet Village - Paris 16e";

function endTime(time, duration) {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + duration;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}h${String(t % 60).padStart(2, "0")}`;
}

export async function fetchDay(date) {
  const url =
    `${BASE}/api/v1/availabilities?clubSlug=${CLUB}` +
    `&dateFrom=${date}&dateTo=${date}T23%3A59&activity=padel`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Anybuddy API error: ${res.status}`);
  const { data } = await res.json();

  const slots = [];
  for (const { startDateTime, services } of data ?? []) {
    const time = startDateTime.slice(11); // "14:00"
    // one row per (duration, price) — courts can be priced differently at the same hour
    const groups = new Map();
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
          `${BASE}/fr/club/${CLUB}?date=${date}` +
          `&serviceId=${svc.id}&time=${encodeURIComponent(time)}&duration=${svc.duration}`,
      });
    }
  }
  return slots.sort(
    (a, b) => a.start.localeCompare(b.start) || a.duration - b.duration
  );
}
