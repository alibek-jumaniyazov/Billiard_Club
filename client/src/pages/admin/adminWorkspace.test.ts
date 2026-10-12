import { describe, expect, it } from 'vitest';
import { clubDetailUrl, clubListUrl, readClubFilters } from './adminWorkspace';

describe('admin club navigation', () => {
  it('keeps supported status filters from dashboard links', () => {
    expect(readClubFilters(new URLSearchParams('status=expired&search=Prime')))
      .toEqual({ search: 'Prime', status: 'expired' });
  });
  it('does not send unsupported status values to the API', () => {
    expect(readClubFilters(new URLSearchParams('status=unexpected')).status).toBeUndefined();
  });
  it('preserves names containing reserved characters when sharing a search', () => {
    const url = clubListUrl('  A&B + VIP  ', 'active');
    expect(readClubFilters(new URL(url, 'https://example.test').searchParams))
      .toEqual({ search: 'A&B + VIP', status: 'active' });
    expect(clubListUrl('  ')).toBe('/admin/clubs');
  });
  it('targets the exact club, including clubs with identical names', () => {
    const params = new URL(clubDetailUrl(42, 'Club & Co', 'contracts'), 'https://example.test').searchParams;
    expect(params.get('club')).toBe('42');
    expect(params.get('search')).toBe('Club & Co');
    expect(params.get('tab')).toBe('contracts');
  });
});
