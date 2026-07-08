import type { Offer } from "./types.js";

const BASE_URL =
  "https://www.ucpa.com/sport-station/api/areas-offers/weekly/alpha_hp";
const ESPACE = "area_1639603579_a4ec61b0-5ded-11ec-aab6-45fce5b83b3e";
const WORKSPACE = "alpha_hp";
const PAGE_URL = "%2Fsport-station%2Fparis-19%2Fmon-terrain-padel";

export const DAYS_OF_WEEK = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
];

export async function fetchWeek(date: string): Promise<any> {
  const [year, month, day] = date.split("-");
  const timeParam = `${day}-${month}-${year}`;

  const url = `${BASE_URL}?reservationPeriod=1&espace=${ESPACE}&time=${timeParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function findSlot(data: any, targetDate: string, targetHour: number) {
  const date = new Date(targetDate + "T00:00:00");
  const dayIndex = (date.getDay() + 6) % 7; // Monday=0 ... Sunday=6

  const column = data.planner.columns[dayIndex];
  if (!column) return null;

  const startTime = `${String(targetHour).padStart(2, "0")}h00`;

  return column.items.find((item: any) => item.startTime === startTime) ?? null;
}

export function buildBookingUrl(slot: any): string {
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

export function getSlots(data: any, targetDate: string): any[] {
  const date = new Date(targetDate + "T00:00:00");
  const dayIndex = (date.getDay() + 6) % 7;
  const column = data.planner.columns[dayIndex];
  if (!column) return [];
  return column.items;
}

export const NAME = "UCPA Paris 19e - Rosa Parks";

export function slotsFromData(data: any, date: string): Offer[] {
  return getSlots(data, date).map((s: any) => {
    const offPeak = s.activity_color === "#00BEC3";
    return {
      start: s.startTime,
      end: s.endTime,
      duration: 60,
      stock: s.stock,
      price: offPeak ? 36 : 48,
      type: offPeak ? "HC" : "HP",
      bookingUrl: buildBookingUrl(s),
    };
  });
}

export async function fetchDay(date: string): Promise<Offer[]> {
  return slotsFromData(await fetchWeek(date), date);
}

// Monday (Mon=0) of date's week — the memo key for one weekly UCPA response
export function weekKey(date: string): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
