import { CLUBS, DAYS_OF_WEEK } from "../src/slots.js";
import type { PolledOffer } from "../src/types.js";

function durLabel(min: number): string {
  if (min === 60) return "1h";
  if (min === 90) return "1h30";
  if (min === 120) return "2h";
  return `${min}min`;
}

export async function sendSlack(webhookUrl: string, offer: PolledOffer): Promise<void> {
  const name = CLUBS[offer.club]?.NAME ?? offer.club;
  const d = new Date(offer.date + "T00:00:00");
  const dayName = DAYS_OF_WEEK[(d.getDay() + 6) % 7];
  const dm = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

  const urls = offer.bookingUrls ?? (offer.bookingUrl ? [offer.bookingUrl] : []);
  const split = urls.length > 1; // stitched 2×1h: two separate bookings

  const lines = [
    `🎾 *Créneau ${durLabel(offer.duration)}* — ${name}`,
    `${dayName} ${dm} · ${offer.start}–${offer.end} · ${offer.price}€${offer.type ? ` (${offer.type})` : ""} · ${offer.stock} terrain${offer.stock > 1 ? "s" : ""}`,
  ];
  if (split) lines.push(`⚠️ 2 réservations d'1h séparées — à faire vite (2 paiements)`);

  const buttons = urls.map((url, i) => ({
    type: "button",
    text: {
      type: "plain_text",
      text: split ? (i === 0 ? "Réserver 1re heure →" : "Réserver 2e heure →") : "Réserver →",
    },
    url,
  }));

  const blocks: any[] = [{ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } }];
  if (buttons.length) blocks.push({ type: "actions", elements: buttons });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `Créneau ${durLabel(offer.duration)} — ${name} · ${dayName} ${dm} ${offer.start}`,
      blocks,
    }),
  });
  if (!res.ok) throw new Error(`Slack webhook ${res.status}`);
}
