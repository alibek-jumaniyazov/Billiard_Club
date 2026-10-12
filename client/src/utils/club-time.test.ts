import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import { clubWallTimeToIso, inClubTime } from './club-time';

describe('reservation club timezone', () => {
  it('shows the next club day at midnight regardless of browser timezone', () => {
    expect(inClubTime('2026-10-12T19:30:00Z', 'Asia/Tashkent').format('YYYY-MM-DD HH:mm')).toBe('2026-10-13 00:30');
  });
  it('sends the selected club wall time as the correct absolute instant', () => {
    expect(clubWallTimeToIso(dayjs('2026-10-13T00:30:00'), 'Asia/Tashkent')).toBe('2026-10-12T19:30:00.000Z');
  });
  it('honors daylight-saving offsets for clubs in other timezones', () => {
    expect(clubWallTimeToIso(dayjs('2026-07-15T18:00:00'), 'Europe/Berlin')).toBe('2026-07-15T16:00:00.000Z');
    expect(clubWallTimeToIso(dayjs('2026-12-15T18:00:00'), 'Europe/Berlin')).toBe('2026-12-15T17:00:00.000Z');
  });
});
