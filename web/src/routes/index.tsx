import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  type ColumnDef,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { slotsQueryOptions } from '../lib/slotsQuery'
import type { Offer } from '../lib/slotsApi'
import { CLUBS } from '../lib/clubs'
import {
  HORIZON_DAYS,
  addDays,
  dayLabel,
  durationLabel,
  todayParis,
} from '../lib/date'
import { useLocalStorage } from '../lib/useLocalStorage'

export const Route = createFileRoute('/')({
  validateSearch: (s: Record<string, unknown>): { date?: string } => ({
    date: typeof s.date === 'string' ? s.date : undefined,
  }),
  loaderDeps: ({ search }) => ({ date: search.date ?? todayParis() }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(slotsQueryOptions(deps.date)),
  component: Home,
})

type Row = { start: string; cells: Record<string, Array<Offer>> }

const DURATIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'Tous' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2h' },
]

function Home() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const date = search.date ?? todayParis()
  const { data: offers } = useSuspenseQuery(slotsQueryOptions(date))

  const [duration, setDuration] = useLocalStorage<number | null>(
    'padel.duration',
    null,
  )
  const [columnVisibility, setColumnVisibility] =
    useLocalStorage<VisibilityState>('padel.courts', {})
  const [showFilters, setShowFilters] = useState(false)

  const today = todayParis()
  const maxDate = addDays(today, HORIZON_DAYS)
  const canPrev = date > today
  const canNext = date < maxDate
  const go = (n: number) =>
    navigate({ search: { date: addDays(date, n) }, resetScroll: false })

  const filtered = useMemo(
    () => offers.filter((o) => duration == null || o.duration === duration),
    [offers, duration],
  )

  const rows = useMemo<Array<Row>>(() => {
    const byStart = new Map<string, Record<string, Array<Offer>>>()
    for (const o of filtered) {
      let cells = byStart.get(o.start)
      if (!cells) byStart.set(o.start, (cells = {}))
      ;(cells[o.club] ??= []).push(o)
    }
    return [...byStart.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, cells]) => ({ start, cells }))
  }, [filtered])

  const columns = useMemo<Array<ColumnDef<Row>>>(
    () => [
      {
        id: 'start',
        header: 'Heure',
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">
            {row.original.start}
          </span>
        ),
      },
      ...CLUBS.map(
        (club): ColumnDef<Row> => ({
          id: club.key,
          header: club.short,
          cell: ({ row }) => (
            <Cell offers={row.original.cells[club.key] ?? []} />
          ),
        }),
      ),
    ],
    [],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  })

  const visibleClubs = CLUBS.filter((c) => columnVisibility[c.key] !== false)
  const hiddenCount = CLUBS.length - visibleClubs.length

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-3 pb-16 text-zinc-900 dark:text-zinc-100">
      <header className="sticky top-0 z-20 -mx-3 border-b border-zinc-200 bg-white/90 px-3 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold">🎾 Padel Paris</h1>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium active:scale-95 dark:border-zinc-700"
          >
            Filtres
            {(duration != null || hiddenCount > 0) && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-xs text-white">
                {(duration != null ? 1 : 0) + (hiddenCount > 0 ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            disabled={!canPrev}
            onClick={() => go(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 text-lg disabled:opacity-30 active:scale-95 dark:border-zinc-700"
            aria-label="Jour précédent"
          >
            ‹
          </button>
          <div className="flex-1 text-center text-sm font-semibold capitalize">
            {dayLabel(date)}
          </div>
          <button
            disabled={!canNext}
            onClick={() => go(1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 text-lg disabled:opacity-30 active:scale-95 dark:border-zinc-700"
            aria-label="Jour suivant"
          >
            ›
          </button>
        </div>

        {showFilters && (
          <FilterPanel
            duration={duration}
            setDuration={setDuration}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibility}
          />
        )}
      </header>

      {rows.length === 0 ? (
        <p className="mt-16 text-center text-sm text-zinc-500">
          Aucun créneau disponible pour ce filtre.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2 md:hidden">
            {rows.map((r) => {
              const clubs = visibleClubs.filter((c) => r.cells[c.key]?.length)
              if (!clubs.length) return null
              return (
                <div
                  key={r.start}
                  className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="text-base font-bold tabular-nums">
                    {r.start}
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    {clubs.map((c) => (
                      <div
                        key={c.key}
                        className="flex items-start justify-between gap-3"
                      >
                        <span className="pt-1 text-sm text-zinc-500">
                          {c.short}
                        </span>
                        <div className="flex flex-wrap justify-end gap-1">
                          {sortOffers(r.cells[c.key]).map((o, i) => (
                            <OfferChip key={i} o={o} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-3 hidden overflow-x-auto rounded-xl border border-zinc-200 md:block dark:border-zinc-800">
            <table className="w-full border-collapse text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h, i) => (
                      <th
                        key={h.id}
                        className={`border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-left font-semibold whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-900 ${
                          i === 0 ? 'sticky left-0 z-10' : ''
                        }`}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="even:bg-zinc-50/50 dark:even:bg-zinc-900/40"
                  >
                    {row.getVisibleCells().map((cell, i) => (
                      <td
                        key={cell.id}
                        className={`border-b border-zinc-100 px-3 py-2 align-top dark:border-zinc-800/60 ${
                          i === 0
                            ? 'sticky left-0 bg-white dark:bg-zinc-950'
                            : ''
                        }`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function sortOffers(offers: Array<Offer>): Array<Offer> {
  return [...offers].sort(
    (a, b) => a.duration - b.duration || a.price - b.price,
  )
}

function Cell({ offers }: { offers: Array<Offer> }) {
  if (!offers.length)
    return <span className="text-zinc-300 dark:text-zinc-700">·</span>
  return (
    <div className="flex flex-col items-start gap-1">
      {sortOffers(offers).map((o, i) => (
        <OfferChip key={i} o={o} />
      ))}
    </div>
  )
}

function OfferChip({ o }: { o: Offer }) {
  const label = `${durationLabel(o.duration)} · ${o.price}€${o.stock > 1 ? ` · ${o.stock}` : ''}`
  const base =
    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap'

  // stitched 2h = two separate 1h bookings → two links
  if (o.bookingUrls.length >= 2) {
    return (
      <span
        className={`${base} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}
        title="2 réservations d'1h séparées"
      >
        {label}
        <a
          href={o.bookingUrls[0]}
          target="_blank"
          rel="noreferrer"
          className="underline"
          aria-label="Réserver la 1re heure"
        >
          ①
        </a>
        <a
          href={o.bookingUrls[1]}
          target="_blank"
          rel="noreferrer"
          className="underline"
          aria-label="Réserver la 2e heure"
        >
          ②
        </a>
      </span>
    )
  }

  const href = o.bookingUrls[0]
  const cls = `${base} bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200`
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {label} ↗
    </a>
  ) : (
    <span className={cls}>{label}</span>
  )
}

function FilterPanel({
  duration,
  setDuration,
  columnVisibility,
  setColumnVisibility,
}: {
  duration: number | null
  setDuration: (v: number | null) => void
  columnVisibility: VisibilityState
  setColumnVisibility: (
    updater: VisibilityState | ((old: VisibilityState) => VisibilityState),
  ) => void
}) {
  const isVisible = (key: string) => columnVisibility[key] !== false
  const toggle = (key: string) =>
    setColumnVisibility((old) => ({ ...old, [key]: !(old[key] !== false) }))
  const setAll = (visible: boolean) =>
    setColumnVisibility(Object.fromEntries(CLUBS.map((c) => [c.key, visible])))

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <div>
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Durée
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DURATIONS.map((d) => (
            <button
              key={d.label}
              onClick={() => setDuration(d.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium active:scale-95 ${
                duration === d.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Terrains
          </span>
          <span className="flex gap-2 text-xs">
            <button
              onClick={() => setAll(true)}
              className="text-emerald-600 underline"
            >
              tout
            </button>
            <button
              onClick={() => setAll(false)}
              className="text-zinc-500 underline"
            >
              aucun
            </button>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CLUBS.map((c) => (
            <button
              key={c.key}
              onClick={() => toggle(c.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium active:scale-95 ${
                isVisible(c.key)
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800'
              }`}
            >
              {c.short}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
