import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClubInfo, User } from '../types';
const state = vi.hoisted(() => ({ lease: { userId: 11, clubId: 1, role: 'admin', status: 'active', endsAt: null as string | null } }));
vi.mock('./license', () => ({ effectiveNow: () => Date.now(), readLicense: async () => state.lease }));
import { loadSessionSnapshot, saveSessionSnapshot } from './session-snapshot';

describe('offline identity is bound to signed claims', () => {
  let stored: Map<string, string>;
  let token: string;
  const user = { id: 11, role: 'admin', clubId: 1 } as User;
  const club = { id: 1, status: 'active', isExpired: false, effectiveEndsAt: null } as ClubInfo;
  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
    token = `header.${btoa(JSON.stringify({ sub: 11, exp: Math.floor(Date.now() / 1000) + 900 }))}.signature`;
    state.lease = { userId: 11, clubId: 1, role: 'admin', status: 'active', endsAt: null };
  });
  afterEach(() => vi.unstubAllGlobals());
  it('never restores a forged superadmin role', async () => {
    saveSessionSnapshot(token, { ...user, role: 'superadmin' }, club);
    expect(await loadSessionSnapshot(token)).toBeNull();
  });
  it('rejects a different employee or club in the unsigned snapshot', async () => {
    saveSessionSnapshot(token, { ...user, id: 12 }, club);
    expect(await loadSessionSnapshot(token)).toBeNull();
    saveSessionSnapshot(token, user, { ...club, id: 2 });
    expect(await loadSessionSnapshot(token)).toBeNull();
  });
  it('uses the signed expiry even when cached profile dates were edited', async () => {
    state.lease.endsAt = new Date(Date.now() - 1000).toISOString();
    saveSessionSnapshot(token, user, { ...club, effectiveEndsAt: '2099-01-01T00:00:00Z' });
    expect((await loadSessionSnapshot(token))?.club).toMatchObject({ isExpired: true, effectiveEndsAt: state.lease.endsAt });
  });
});
