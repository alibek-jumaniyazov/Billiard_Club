import type { Reservation } from '../../types';

export const RESERVATION_LOOKBACK_MS = 60 * 60_000;
export const RESERVATION_LOOKAHEAD_MS = 24 * 60 * 60_000;

/** A bounded arrival queue, including guests up to an hour late. */
export function arrivalQueue(rows: Reservation[], now: number, limit = 4): Reservation[] {
  const unique = new Map<number, Reservation>();
  for (const row of rows) {
    const starts = Date.parse(row.startsAt);
    if ((row.status === 'pending' || row.status === 'confirmed') && Number.isFinite(starts)
      && starts >= now - RESERVATION_LOOKBACK_MS && starts < now + RESERVATION_LOOKAHEAD_MS) {
      unique.set(row.id, row);
    }
  }
  return [...unique.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id).slice(0, limit);
}

export function clubDateKey(at: number | string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(at));
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-');
}

export function reservationLink(row: Reservation, timezone: string): string {
  return `/reservations?date=${clubDateKey(row.startsAt, timezone)}&reservation=${row.id}`;
}
