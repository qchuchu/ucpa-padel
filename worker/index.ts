import { initSchema, pool } from "./db.js";
import { poll } from "./poll.js";

// Railway cron service: poll once, then exit so nothing is billed between runs.
// A throw exits non-zero and the run shows as failed; the next tick starts clean.
await initSchema();
await poll();
await pool.end();
