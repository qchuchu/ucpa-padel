const BASE_URL =
  "https://www.ucpa.com/sport-station/api/areas-offers/weekly/alpha_hp";
const ESPACE = "area_1639603579_a4ec61b0-5ded-11ec-aab6-45fce5b83b3e";
const WORKSPACE = "alpha_hp";
const PAGE_URL = "%2Fsport-station%2Fparis-19%2Fmon-terrain-padel";

const DAYS_OF_WEEK = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
];

export async function fetchWeek(date) {
  const [year, month, day] = date.split("-");
  const timeParam = `${day}-${month}-${year}`;

  const url = `${BASE_URL}?reservationPeriod=1&espace=${ESPACE}&time=${timeParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function findSlot(data, targetDate, targetHour) {
  const date = new Date(targetDate + "T00:00:00");
  const dayIndex = (date.getDay() + 6) % 7; // Monday=0 ... Sunday=6

  const column = data.planner.columns[dayIndex];
  if (!column) return null;

  const startTime = `${String(targetHour).padStart(2, "0")}h00`;

  const slot = column.items.find((item) => item.startTime === startTime);
  return slot || null;
}

export function buildBookingUrl(slot) {
  const activities = slot.activity_codes.join(",");
  const codes = slot.codes.join(",");

  return (
    `https://www.ucpa.com/loisirs-reservation/products` +
    `?activities=${activities}` +
    `&codes=${codes}` +
    `&start_time=${slot.start_time}` +
    `&end_time=${slot.end_time}` +
    `&workspace=${WORKSPACE}` +
    `&page_url=${PAGE_URL}`
  );
}

export function getSlots(data, targetDate) {
  const date = new Date(targetDate + "T00:00:00");
  const dayIndex = (date.getDay() + 6) % 7;
  const column = data.planner.columns[dayIndex];
  if (!column) return [];
  return column.items;
}

export { DAYS_OF_WEEK };
