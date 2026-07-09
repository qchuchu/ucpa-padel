export const HORIZON_DAYS = 14;

// Data dates are keyed YYYY-MM-DD; default the view to "today" in Paris.
export function todayParis(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Noon-UTC anchor avoids any DST/day-shift when doing date math or formatting.
function anchor(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00Z');
}

export function addDays(dateStr: string, n: number): string {
  const d = anchor(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayLabel(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  }).format(anchor(dateStr));
}

// short form for the compact date pill, e.g. "mer. 8 juil."
export function dayLabelShort(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Paris',
  }).format(anchor(dateStr));
}

export function endTime(start: string, duration: number): string {
  const [h, m] = start.split('h').map(Number);
  const t = h * 60 + m + duration;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}h${String(t % 60).padStart(2, '0')}`;
}

export function durationLabel(min: number): string {
  if (min === 60) return '1h';
  if (min === 90) return '1h30';
  if (min === 120) return '2h';
  return `${min}min`;
}
