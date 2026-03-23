import React, { useState, useEffect } from "react";
import { render, Box, Text, Newline, useInput } from "ink";
import { execSync } from "child_process";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import {
  fetchWeek,
  getSlots,
  buildBookingUrl,
  DAYS_OF_WEEK,
} from "./api.js";

// --- Agent mode (non-interactive) ---
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const dateArg = args[args.indexOf("--date") + 1];
const slotArg = args.includes("--slot") ? args[args.indexOf("--slot") + 1] : null;

if (jsonMode) {
  (async () => {
    if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
      console.error("Usage: ucpa-padel --json --date YYYY-MM-DD [--slot HH:MM]");
      process.exit(2);
    }

    try {
      const data = await fetchWeek(dateArg);
      const daySlots = getSlots(data, dateArg);
      const dateObj = new Date(dateArg + "T00:00:00");
      const dayName = DAYS_OF_WEEK[(dateObj.getDay() + 6) % 7];

      if (slotArg) {
        // Return booking URL for a specific slot
        const match = daySlots.find((s: any) => s.startTime === slotArg.replace(":", "h"));
        if (!match) {
          console.error(`No slot found at ${slotArg}`);
          process.exit(1);
        }
        console.log(JSON.stringify({
          date: dateArg,
          day: dayName,
          slot: {
            start: match.startTime,
            end: match.endTime,
            stock: match.stock,
            available: match.stock > 0,
            price: match.activity_color === "#00BEC3" ? 36 : 48,
            type: match.activity_color === "#00BEC3" ? "HC" : "HP",
          },
          bookingUrl: buildBookingUrl(match),
        }));
      } else {
        // List all slots for the day
        console.log(JSON.stringify({
          date: dateArg,
          day: dayName,
          slots: daySlots.filter((s: any) => s.stock > 0).map((s: any) => ({
            start: s.startTime,
            end: s.endTime,
            stock: s.stock,
            price: s.activity_color === "#00BEC3" ? 36 : 48,
            type: s.activity_color === "#00BEC3" ? "HC" : "HP",
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

function App() {
  const today = toDateStr(new Date());
  const [step, setStep] = useState<"loading" | "slot" | "result">("loading");
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [result, setResult] = useState<{ slot: any; url: string } | null>(null);

  const dateObj = new Date(date + "T00:00:00");
  const dayName = DAYS_OF_WEEK[(dateObj.getDay() + 6) % 7];

  const loadDate = async (dateStr: string) => {
    setDate(dateStr);
    setError(null);
    setStep("loading");

    try {
      const data = await fetchWeek(dateStr);
      const daySlots = getSlots(data, dateStr);
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
    const slot = slots.find((s: any) => s.startTime === item.value);
    if (!slot || slot.stock === 0) return;

    const url = buildBookingUrl(slot);
    setResult({ slot, url });
    setStep("result");

    // Open in browser
    try {
      execSync(`open ${JSON.stringify(url)}`);
    } catch {}
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          {"🎾 UCPA Padel - Paris 19e - Rosa Parks"}
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
            items={slots.map((s: any) => ({
              label: s.startTime,
              value: s.startTime,
            }))}
            itemComponent={({ label, isSelected }: { label: string; isSelected?: boolean }) => {
              const slot = slots.find((s: any) => s.startTime === label);
              if (!slot) return null;
              const available = slot.stock > 0;
              const isOffPeak = slot.activity_color === "#00BEC3";
              return (
                <Box gap={1}>
                  <Text color={isSelected ? "yellow" : "white"}>
                    {isSelected ? "❯" : " "}
                  </Text>
                  <Text
                    color={available ? (isOffPeak ? "cyan" : "red") : "gray"}
                    bold={available}
                    strikethrough={!available}
                  >
                    {slot.startTime} - {slot.endTime}
                  </Text>
                  <Text color={available ? "green" : "gray"}>
                    {available ? `${slot.stock} terrain${slot.stock > 1 ? "s" : ""}` : "complet"}
                  </Text>
                  <Text color={isOffPeak ? "cyan" : "red"}>
                    {isOffPeak ? " (HC 36€)" : " (HP 48€)"}
                  </Text>
                </Box>
              );
            }}
            onSelect={handleSlotSelect}
          />
          <Newline />
          <Text color="gray">
            <Text color="cyan">●</Text> Heures Creuses 36€{"   "}
            <Text color="red">●</Text> Heures Pleines 48€{"   "}
            <Text strikethrough color="gray">──</Text> Complet
          </Text>
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
            <Text><Text bold>Date : </Text>{dayName} {date}</Text>
            <Text><Text bold>Créneau : </Text>{result.slot.startTime} - {result.slot.endTime}</Text>
            <Text>
              <Text bold>Terrains dispos : </Text>
              <Text color="green">{result.slot.stock}</Text>
            </Text>
            <Text>
              <Text bold>Prix : </Text>
              {result.slot.activity_color === "#00BEC3" ? "36€ (HC)" : "48€ (HP)"}
            </Text>
            <Newline />
            <Text bold color="cyan">🔗 {result.url}</Text>
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
