import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cachePut,
  isCacheable,
  noteServedFromCache,
  resetScreenData,
  screenDataAsOf,
  setCacheScope,
} from './cache';

describe('offline read cache whitelist', () => {
  it('caches the current-state screens a cashier needs offline', () => {
    for (const url of [
      '/tables',
      '/reservations',
      '/debts',
      '/debts/7/payments',
      '/shifts/current',
      '/orders',
      '/expenses',
      '/customers/12',
    ]) {
      expect(isCacheable(url), url).toBe(true);
    }
  });

  it('never caches financial reports, dashboards or the auth check', () => {
    for (const url of [
      '/reports/daily',
      '/reports/products',
      '/dashboard/stats',
      '/orders/stats/today',
      '/shifts',
      '/shifts/3',
      '/auth/me',
    ]) {
      expect(isCacheable(url), url).toBe(false);
    }
  });

  it('skips queries pinned to an exact instant — their key never repeats', () => {
    expect(isCacheable('/reservations', { from: '2026-11-21', to: '2026-11-21', page: 1 })).toBe(true);
    expect(
      isCacheable('/reservations', { from: '2026-11-21T09:30:00.000Z', to: '2026-11-21T15:30:00.000Z' }),
    ).toBe(false);
  });
});

describe('data age shown by the offline banner', () => {
  beforeEach(() => {
    setCacheScope('u1|c1');
    resetScreenData();
  });

  it('is the oldest data on the current screen; a fresh response replaces its cached copy', async () => {
    expect(screenDataAsOf()).toBeNull();
    noteServedFromCache('/reservations', { from: '2026-11-21' }, 1_000);
    noteServedFromCache('/tables', undefined, 5_000);
    expect(screenDataAsOf()).toBe(1_000);

    await cachePut('/reservations', { from: '2026-11-21' }, { success: true, data: [] });
    expect(screenDataAsOf()).toBe(5_000);

    resetScreenData();
    expect(screenDataAsOf()).toBeNull();
  });
});
