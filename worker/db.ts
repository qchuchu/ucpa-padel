import pg from "pg";

// Railway injects DATABASE_URL. Private-network URL needs no SSL; set
// DATABASE_SSL=true when connecting to a public Postgres host (e.g. local tests).
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slots (
      slot_key   text PRIMARY KEY,
      club text, date date, start text, duration int,
      price numeric, stock int,
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE slots ADD COLUMN IF NOT EXISTS booking_urls text[];
    CREATE TABLE IF NOT EXISTS slot_events (
      id bigserial PRIMARY KEY,
      slot_key text, club text, date date, start text, duration int,
      event text,
      price numeric, stock int,
      at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS notifications (
      watch_id text, slot_key text, sent_at timestamptz DEFAULT now(),
      PRIMARY KEY (watch_id, slot_key)
    );
  `);
}
