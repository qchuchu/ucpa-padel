import React, { useState, useEffect } from "react";
import { render, Box, Text, Newline, useInput } from "ink";
import { execSync } from "child_process";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import * as ucpa from "./api.js";
import * as trinquet from "./anybuddy.js";
import { DAYS_OF_WEEK } from "./api.js";

const CLUBS = { ucpa, trinquet } as const;
type ClubKey = keyof typeof CLUBS;
const CLUB_KEYS = Object.keys(CLUBS) as ClubKey[];

// --- Agent mode (non-interactive) ---
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const dateArg = args[args.indexOf("--date") + 1];
const slotArg = args.includes("--slot") ? args[args.indexOf("--slot") + 1] : null;
const durationArg = args.includes("--duration") ? Number(args[args.indexOf("--duration") + 1]) : null;
const clubArg = (args.includes("--club") ? args[args.indexOf("--club") + 1] : "ucpa") as ClubKey;

if (jsonMode) {
  (async () => {
    if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg) || !CLUBS[clubArg]) {
      console.error("Usage: padel --json --date YYYY-MM-DD [--slot HH:MM] [--duration MIN] [--club ucpa|trinquet]");
      process.exit(2);
    }

    try {
      const club = CLUBS[clubArg];
      const daySlots = await club.fetchDay(dateArg);
      const dateObj = new Date(dateArg + "T00:00:00");
      const dayName = DAYS_OF_WEEK[(dateObj.getDay() + 6) % 7];

      if (slotArg) {
        // Return booking URL for a specific slot
        const start = slotArg.replace(":", "h");
        const matches = daySlots.filter(
          (s: any) => s.start === start && (durationArg === null || s.duration === durationArg)
        );
        if (matches.length === 0) {
          console.error(`No slot found at ${slotArg}`);
          process.exit(1);
        }
        const { bookingUrl, ...match } = matches[0]; // several durations? pass --duration to pick
        console.log(JSON.stringify({
          date: dateArg,
          day: dayName,
          club: clubArg,
          slot: { ...match, available: match.stock > 0 },
          bookingUrl,
        }));
      } else {
        // List all slots for the day
        console.log(JSON.stringify({
          date: dateArg,
          day: dayName,
          club: clubArg,
          slots: daySlots
            .filter((s: any) => s.stock > 0)
            .map(({ bookingUrl, ...s }: any) => s),
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

function App() {
  const today = toDateStr(new Date());
  const [step, setStep] = useState<"loading" | "slot" | "result">("loading");
  const [date, setDate] = useState(today);
  const [clubKey, setClubKey] = useState<ClubKey>("ucpa");
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [result, setResult] = useState<any | null>(null);

  const dateObj = new Date(date + "T00:00:00");
  const dayName = DAYS_OF_WEEK[(dateObj.getDay() + 6) % 7];

  const loadDate = async (dateStr: string, club: ClubKey = clubKey) => {
    setDate(dateStr);
    setError(null);
    setStep("loading");

    try {
      const daySlots = await CLUBS[club].fetchDay(dateStr);
      setSlots(daySlots);
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
    if (step === "result" && (key.backspace || key.delete || key.escape)) {
      loadDate(date);
      return;
    }
    if (step !== "slot" && step !== "loading") return;

    if (ch === "c") {
      const next = CLUB_KEYS[(CLUB_KEYS.indexOf(clubKey) + 1) % CLUB_KEYS.length];
      setClubKey(next);
      loadDate(date, next);
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

  const handleSlotSelect = (item: { label: string; value: string }) => {
    const slot = slots[Number(item.value)];
    if (!slot || slot.stock === 0) return;

    setResult(slot);
    setStep("result");

    // Open in browser
    try {
      execSync(`open ${JSON.stringify(slot.bookingUrl)}`);
    } catch {}
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          {"🎾 "}{CLUBS[clubKey].NAME}
        </Text>
      </Box>

      {step === "loading" && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text>Chargement {dayName} {date}...</Text>
            <Text color="gray">{"← → jour   p/n semaine   c club"}</Text>
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
            <Text color="gray">{"← → jour   p/n semaine   c club"}</Text>
          </Box>
          <SelectInput
            items={slots.map((_s: any, i: number) => ({
              label: String(i),
              value: String(i),
              key: String(i),
            }))}
            itemComponent={({ label, isSelected }: { label: string; isSelected?: boolean }) => {
              const slot = slots[Number(label)];
              if (!slot) return null;
              const available = slot.stock > 0;
              return (
                <Box gap={1}>
                  <Text color={isSelected ? "yellow" : "white"}>
                    {isSelected ? "❯" : " "}
                  </Text>
                  <Text
                    color={available ? (slot.type === "HC" ? "cyan" : "red") : "gray"}
                    bold={available}
                    strikethrough={!available}
                  >
                    {slot.start} - {slot.end}
                  </Text>
                  <Text color={available ? "green" : "gray"}>
                    {available ? `${slot.stock} terrain${slot.stock > 1 ? "s" : ""}` : "complet"}
                  </Text>
                  <Text color={slot.type === "HC" ? "cyan" : slot.type === "HP" ? "red" : "yellow"}>
                    {` ${slot.price}€${slot.type ? ` (${slot.type})` : ""}`}
                  </Text>
                </Box>
              );
            }}
            onSelect={handleSlotSelect}
          />
          <Newline />
          {clubKey === "ucpa" ? (
            <Text color="gray">
              <Text color="cyan">●</Text> Heures Creuses 36€{"   "}
              <Text color="red">●</Text> Heures Pleines 48€{"   "}
              <Text strikethrough color="gray">──</Text> Complet
            </Text>
          ) : (
            <Text color="gray">Réservation via Anybuddy · prix par terrain</Text>
          )}
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
            <Text><Text bold>Club : </Text>{CLUBS[clubKey].NAME}</Text>
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
