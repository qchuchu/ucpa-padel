import React, { useState, useEffect } from "react";
import { render, Box, Text, Newline, useInput } from "ink";
import { execSync } from "child_process";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import * as ucpa from "./api.js";
import { clubs as anybuddyClubs } from "./anybuddy.js";
import { DAYS_OF_WEEK } from "./api.js";

const CLUBS: Record<string, any> = {
  ucpa: { ...ucpa, key: "ucpa", SHORT: "UCPA" },
};
for (const c of anybuddyClubs) CLUBS[c.key] = c;
type ClubKey = string;

async function fetchDayAll(date: string, clubFilter: ClubKey | null = null) {
  const keys = (clubFilter ? [clubFilter] : Object.keys(CLUBS)) as ClubKey[];
  const results = await Promise.allSettled(keys.map((k) => CLUBS[k].fetchDay(date)));
  const offers: any[] = [];
  const errors: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") offers.push(...r.value.map((s: any) => ({ ...s, club: keys[i] })));
    else errors.push(`${keys[i]}: ${r.reason?.message ?? r.reason}`);
  });

  const byStart = new Map<string, any[]>();
  for (const o of offers) {
    if (!byStart.has(o.start)) byStart.set(o.start, []);
    byStart.get(o.start)!.push(o);
  }
  const slots = [...byStart.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, group]) => ({
      start,
      offers: group.sort((a, b) => a.price - b.price || a.duration - b.duration),
    }));
  return { slots, errors };
}

// --- Agent mode (non-interactive) ---
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const dateArg = args[args.indexOf("--date") + 1];
const slotArg = args.includes("--slot") ? args[args.indexOf("--slot") + 1] : null;
const durationArg = args.includes("--duration") ? Number(args[args.indexOf("--duration") + 1]) : null;
const clubArg = (args.includes("--club") ? args[args.indexOf("--club") + 1] : null) as ClubKey | null;

if (jsonMode) {
  (async () => {
    if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg) || (clubArg && !CLUBS[clubArg])) {
      console.error(`Usage: padel --json --date YYYY-MM-DD [--slot HH:MM] [--duration MIN] [--club ${Object.keys(CLUBS).join("|")}]`);
      process.exit(2);
    }

    try {
      const { slots, errors } = await fetchDayAll(dateArg, clubArg);
      const dateObj = new Date(dateArg + "T00:00:00");
      const dayName = DAYS_OF_WEEK[(dateObj.getDay() + 6) % 7];
      const base = { date: dateArg, day: dayName, ...(errors.length ? { errors } : {}) };

      if (slotArg) {
        // Return every club's booking URL for a specific start time
        const start = slotArg.replace(":", "h");
        const group = slots.find((g) => g.start === start);
        const offers = (group?.offers ?? []).filter(
          (o: any) => o.stock > 0 && (durationArg === null || o.duration === durationArg)
        );
        if (offers.length === 0) {
          console.error(`No available slot at ${slotArg}`);
          process.exit(1);
        }
        console.log(JSON.stringify({ ...base, start, offers }));
      } else {
        // List all slots for the day, grouped by start time
        console.log(JSON.stringify({
          ...base,
          slots: slots
            .map((g) => ({
              start: g.start,
              offers: g.offers
                .filter((o: any) => o.stock > 0)
                .map(({ bookingUrl, ...o }: any) => o),
            }))
            .filter((g) => g.offers.length > 0),
        }));
      }
      process.exit(0);
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
  })();
} else {
// --- Interactive mode (Ink UI) ---

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function offerColor(offer: any): string {
  if (offer.type === "HC") return "cyan";
  if (offer.type === "HP") return "red";
  return "magenta";
}

function openBooking(offer: any) {
  try {
    execSync(`open ${JSON.stringify(offer.bookingUrl)}`);
  } catch {}
}

function App() {
  const today = toDateStr(new Date());
  const [step, setStep] = useState<"loading" | "slot" | "offer" | "result">("loading");
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [result, setResult] = useState<any | null>(null);

  const dateObj = new Date(date + "T00:00:00");
  const dayName = DAYS_OF_WEEK[(dateObj.getDay() + 6) % 7];

  const loadDate = async (dateStr: string) => {
    setDate(dateStr);
    setError(null);
    setStep("loading");

    try {
      const { slots: daySlots, errors } = await fetchDayAll(dateStr);
      setSlots(daySlots);
      setWarnings(errors);
      setStep("slot");
    } catch (e: any) {
      setError(e.message);
      setStep("loading");
    }
  };

  useEffect(() => {
    loadDate(today);
  }, []);

  useInput((ch, key) => {
    if ((step === "result" || step === "offer") && (key.backspace || key.delete || key.escape)) {
      setStep("slot");
      return;
    }
    if (step !== "slot" && step !== "loading") return;

    let delta = 0;
    if (key.leftArrow) delta = -1;
    else if (key.rightArrow) delta = 1;
    else if (ch === "p") delta = -7;
    else if (ch === "n") delta = 7;

    if (delta !== 0) {
      const current = new Date(date + "T00:00:00");
      const next = addDays(current, delta);
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      if (next < todayDate) return;
      loadDate(toDateStr(next));
    }
  });

  const handleSlotSelect = (item: { value: string }) => {
    const group = slots[Number(item.value)];
    const available = group?.offers.filter((o: any) => o.stock > 0) ?? [];
    if (available.length === 0) return;

    if (available.length === 1) {
      setResult(available[0]);
      setStep("result");
      openBooking(available[0]);
    } else {
      setOffers(available);
      setStep("offer");
    }
  };

  const handleOfferSelect = (item: { value: string }) => {
    const offer = offers[Number(item.value)];
    if (!offer) return;
    setResult(offer);
    setStep("result");
    openBooking(offer);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          {"🎾 Padel Paris intramuros — "}{Object.keys(CLUBS).length}{" clubs"}
        </Text>
      </Box>

      {step === "loading" && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text>Chargement {dayName} {date}...</Text>
            <Text color="gray">{"← → jour   p/n semaine"}</Text>
          </Box>
          {error && (
            <Text color="red">{"   ⚠ "}{error}</Text>
          )}
        </Box>
      )}

      {step === "slot" && (
        <Box flexDirection="column">
          <Box marginBottom={1} gap={2}>
            <Text bold>
              {"📆 "}{dayName} {date}{" — "}{slots.length} créneaux
            </Text>
            <Text color="gray">{"← → jour   p/n semaine"}</Text>
          </Box>
          <SelectInput
            items={slots.map((_g: any, i: number) => ({
              label: String(i),
              value: String(i),
              key: String(i),
            }))}
            itemComponent={({ label, isSelected }: { label: string; isSelected?: boolean }) => {
              const group = slots[Number(label)];
              if (!group) return null;
              const available = group.offers.some((o: any) => o.stock > 0);
              return (
                <Box gap={1} flexWrap="wrap">
                  <Text color={isSelected ? "yellow" : "white"}>
                    {isSelected ? "❯" : " "}
                  </Text>
                  <Text bold={available} strikethrough={!available} color={available ? "white" : "gray"}>
                    {group.start}
                  </Text>
                  {group.offers.map((o: any, i: number) => (
                    <Text
                      key={i}
                      color={o.stock > 0 ? offerColor(o) : "gray"}
                      strikethrough={o.stock === 0}
                    >
                      {CLUBS[o.club as ClubKey].SHORT} {o.price}€
                      {o.duration !== 60 ? `/${o.duration}min` : ""}
                      {o.stock > 1 ? ` ×${o.stock}` : ""}
                    </Text>
                  ))}
                </Box>
              );
            }}
            onSelect={handleSlotSelect}
          />
          <Newline />
          <Text color="gray">
            <Text color="cyan">●</Text> UCPA HC 36€{"   "}
            <Text color="red">●</Text> UCPA HP 48€{"   "}
            <Text color="magenta">●</Text> Clubs Anybuddy{"   "}
            <Text strikethrough color="gray">──</Text> Complet
          </Text>
          {warnings.map((w) => (
            <Text key={w} color="red">{"⚠ "}{w}</Text>
          ))}
        </Box>
      )}

      {step === "offer" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>{"🏟  "}{offers[0]?.start}{" — choisir un club"}</Text>
          </Box>
          <SelectInput
            items={offers.map((_o: any, i: number) => ({
              label: String(i),
              value: String(i),
              key: String(i),
            }))}
            itemComponent={({ label, isSelected }: { label: string; isSelected?: boolean }) => {
              const o = offers[Number(label)];
              if (!o) return null;
              return (
                <Box gap={1}>
                  <Text color={isSelected ? "yellow" : "white"}>
                    {isSelected ? "❯" : " "}
                  </Text>
                  <Text bold color={offerColor(o)}>
                    {CLUBS[o.club as ClubKey].NAME}
                  </Text>
                  <Text>
                    {o.start} - {o.end}
                  </Text>
                  <Text color="green">
                    {o.stock} terrain{o.stock > 1 ? "s" : ""}
                  </Text>
                  <Text>
                    {o.price}€{o.type ? ` (${o.type})` : ""}
                  </Text>
                </Box>
              );
            }}
            onSelect={handleOfferSelect}
          />
          <Newline />
          <Text color="gray">{"Esc  retour aux créneaux"}</Text>
        </Box>
      )}

      {step === "result" && result && (
        <Box flexDirection="column">
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="green"
            paddingX={2}
            paddingY={1}
          >
            <Text bold color="green">✅ Lien de réservation généré !</Text>
            <Newline />
            <Text><Text bold>Club : </Text>{CLUBS[result.club as ClubKey].NAME}</Text>
            <Text><Text bold>Date : </Text>{dayName} {date}</Text>
            <Text><Text bold>Créneau : </Text>{result.start} - {result.end}</Text>
            <Text>
              <Text bold>Terrains dispos : </Text>
              <Text color="green">{result.stock}</Text>
            </Text>
            <Text>
              <Text bold>Prix : </Text>
              {result.price}€{result.type ? ` (${result.type})` : ""}
            </Text>
            <Newline />
            <Text bold color="cyan">🔗 {result.bookingUrl}</Text>
          </Box>
          <Newline />
          <Text color="gray">🌐 Ouvert dans le navigateur !</Text>
          <Newline />
          <Text color="gray">{"Esc  retour aux créneaux"}</Text>
        </Box>
      )}
    </Box>
  );
}

render(<App />);
} // end interactive mode
