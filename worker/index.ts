import { initSchema } from "./db.js";
import { poll } from "./poll.js";

const POLL_MS = Number(process.env.POLL_MS ?? 60000);

let running = false;
async function tick(): Promise<void> {
  if (running) {
    console.log("[tick] previous poll still running, skipping");
    return;
  }
  running = true;
  try {
    await poll();
  } catch (e) {
    console.error("[poll] failed:", e);
  } finally {
    running = false;
  }
}

await initSchema();
console.log(`[worker] started — polling every ${POLL_MS}ms, horizon ${process.env.HORIZON_DAYS ?? 14}d`);
await tick();
setInterval(tick, POLL_MS);
