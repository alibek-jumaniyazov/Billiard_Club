import { describe, expect, it } from 'vitest';
import type { Reservation } from '../../types';
import { arrivalQueue, clubDateKey, reservationLink } from './operations';

const now = Date.parse('2026-10-12T19:30:00Z');
const row = (id: number, minutes: number, status: Reservation['status'] = 'confirmed') =>
  ({ id, startsAt: new Date(now + minutes * 60_000).toISOString(), status } as Reservation);

describe('arrival queue', () => {
  it('keeps late and upcoming arrivals in time order, excluding final states and outside the window', () => {
    expect(arrivalQueue([row(1, 30), row(2, -45), row(3, 10, 'seated'), row(4, 5, 'cancelled'),
      row(5, -61), row(6, 1440), row(7, 20, 'pending')], now).map((r) => r.id)).toEqual([2, 7, 1]);
  });
  it('merges status queues without duplicates and bounds the output', () => {
    expect(arrivalQueue([row(5, 10), row(2, 10), row(2, 10), row(6, 20)], now, 2).map((r) => r.id)).toEqual([2, 5]);
  });
  it('ignores malformed dates instead of rendering a broken arrival', () => {
    expect(arrivalQueue([{ ...row(1, 0), startsAt: 'invalid' }], now)).toEqual([]);
  });
});

describe('club date links', () => {
  it('links across midnight using the club timezone, not the browser timezone', () => {
    expect(clubDateKey(now, 'Asia/Tashkent')).toBe('2026-10-13');
    expect(reservationLink(row(4, 0), 'Asia/Tashkent')).toBe('/reservations?date=2026-10-13&reservation=4');
    expect(clubDateKey(now, 'America/New_York')).toBe('2026-10-12');
  });
});
