import type { ClubStatus } from '../../types';

const statuses: ClubStatus[] = ['trial', 'active', 'expired', 'blocked'];

/** Only supported filters enter requests, including links copied from another browser. */
export function readClubFilters(params: URLSearchParams) {
  const value = params.get('status');
  return {
    search: params.get('search') ?? '',
    status: statuses.includes(value as ClubStatus) ? value as ClubStatus : undefined,
  };
}

export function clubListUrl(search = '', status?: ClubStatus) {
  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (status) params.set('status', status);
  return `/admin/clubs${params.size ? `?${params}` : ''}`;
}

export function clubDetailUrl(id: number, name: string, tab?: 'contracts') {
  const params = new URLSearchParams({ search: name, club: String(id) });
  if (tab) params.set('tab', tab);
  return `/admin/clubs?${params}`;
}
