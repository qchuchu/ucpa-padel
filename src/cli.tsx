import React, { useState, useEffect } from "react";
import { render, Box, Text, Newline, useInput } from "ink";
import { execSync } from "child_process";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { CLUBS, fetchDayAll, filterByDuration, DAYS_OF_WEEK } from "./slots.js";

type ClubKey = string;

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
      const { slots: allSlots, errors } = await fetchDayAll(dateArg, clubArg);
      const slots = filterByDuration(allSlots, durationArg);
      const dateObj = new Date(dateArg + "T00:00:00");
      const dayName = DAYS_OF_WEEK[(dateObj.getDay() + 6) % 7];
      const base = { date: dateArg, day: dayName, ...(errors.length ? { errors } : {}) };

      if (slotArg) {
        // Return every club's booking URL(s) for a specific start time
        const start = slotArg.replace(":", "h");
        const offers = slots.find((g) => g.start === start)?.offers ?? [];
        if (offers.length === 0) {
          console.error(`No available slot at ${slotArg}`);
          process.exit(1);
        }
        console.log(JSON.stringify({ ...base, start, offers }));
      } else {
        // List all slots for the day, grouped by start time
        console.log(JSON.stringify({
          ...base,
          slots: slots.map((g) => ({
            start: g.start,
            offers: g.offers.map(({ bookingUrl, bookingUrls, ...o }: any) => o),
          })),
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

function bookingUrls(offer: any): string[] {
  return offer.bookingUrls ?? [offer.bookingUrl];
}

function openBooking(offer: any) {
  for (const url of bookingUrls(offer)) {
    try {
      execSync(`open ${JSON.stringify(url)}`);
    } catch {}
  }
}

const DURATIONS: { value: number | null; label: string }[] = [
  { value: null, label: "tous" },
  { value: 60, label: "1h" },
  { value: 90, label: "1h30" },
  { value: 120, label: "2h" },
];

function App() {
  const today = toDateStr(new Date());
  const [step, setStep] = useState<"loading" | "slot" | "offer" | "result">("loading");
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [durIdx, setDurIdx] = useState(0);

  const dateObj = new Date(date + "T00:00:00");
  const dayName = DAYS_OF_WEEK[(dateObj.getDay() + 6) % 7];
  const duration = DURATIONS[durIdx];
  const visible = filterByDuration(slots, duration.value);

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

    if (ch === "d") {
      setDurIdx((durIdx + 1) % DURATIONS.length);
      return;
    }

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
    const group = visible[Number(item.value)];
    if (!group || group.offers.length === 0) return;

    if (group.offers.length === 1) {
      setResult(group.offers[0]);
      setStep("result");
      openBooking(group.offers[0]);
    } else {
      setOffers(group.offers);
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
              {"📆 "}{dayName} {date}{" — "}{visible.length} créneaux
            </Text>
            <Text>
              {"Durée: "}
              {DURATIONS.map((d, i) => (
                <Text key={d.label} color={i === durIdx ? "yellow" : "gray"} bold={i === durIdx}>
                  {i > 0 ? " | " : ""}{d.label}
                </Text>
              ))}
            </Text>
            <Text color="gray">{"← → jour   p/n semaine   d durée"}</Text>
          </Box>
          <SelectInput
            key={duration.label}
            items={visible.map((_g: any, i: number) => ({
              label: String(i),
              value: String(i),
              key: String(i),
            }))}
            itemComponent={({ label, isSelected }: { label: string; isSelected?: boolean }) => {
              const group = visible[Number(label)];
              if (!group) return null;
              // one chip per club — prices/durations live in the offer picker
              const seen = new Set<string>();
              const chips = group.offers.filter((o: any) => !seen.has(o.club) && seen.add(o.club));
              return (
                <Box gap={1} flexWrap="wrap">
                  <Text color={isSelected ? "yellow" : "white"}>
                    {isSelected ? "❯" : " "}
                  </Text>
                  <Text bold color="white">
                    {group.start}
                  </Text>
                  {chips.map((o: any, i: number) => (
                    <React.Fragment key={i}>
                      {i > 0 && <Text color="gray">|</Text>}
                      <Text color={offerColor(o)}>
                        {CLUBS[o.club as ClubKey].SHORT}
                      </Text>
                    </React.Fragment>
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
            <Text color="magenta">●</Text> Clubs Anybuddy
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
                    {o.price}€{o.type ? ` (${o.type})` : ""}{o.bookingUrls ? " · 2×1h" : ""}
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
            {result.bookingUrls && (
              <Text color="yellow">⚠ 2 réservations d'1h à payer séparément</Text>
            )}
            <Newline />
            {bookingUrls(result).map((url: string) => (
              <Text key={url} bold color="cyan">🔗 {url}</Text>
            ))}
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
