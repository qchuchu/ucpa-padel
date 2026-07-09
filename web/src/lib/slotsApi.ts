import { createServerFn } from '@tanstack/react-start'
import { endTime } from './date'

export type Offer = {
  club: string
  start: string
  end: string
  duration: number
  price: number
  stock: number
  bookingUrls: Array<string>
}

// pg is loaded via dynamic import *inside* the handler so it never enters the
// client module graph. Pool is cached on globalThis to survive dev HMR.
async function querySlots(date: string): Promise<Array<Offer>> {
  const { default: pg } = await import('pg')
  const g = globalThis as unknown as { __padelPool?: InstanceType<typeof pg.Pool> }
  g.__padelPool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
  })
  const { rows } = await g.__padelPool.query(
    `SELECT club, start, duration, price, stock, booking_urls
     FROM slots
     WHERE date = $1 AND stock > 0
     ORDER BY start, club, duration`,
    [date],
  )
  return rows.map((r) => ({
    club: r.club,
    start: r.start,
    end: endTime(r.start, r.duration),
    duration: r.duration,
    price: Number(r.price),
    stock: r.stock,
    bookingUrls: r.booking_urls ?? [],
  }))
}

export const getSlotsForDate = createServerFn({ method: 'GET' })
  .inputValidator((date: string) => date)
  .handler(({ data }) => querySlots(data))
