import { describe, expect, it } from 'vitest';
import { buildLightHubView, hubControlling, withHubLightState } from './light-hub';
import type { QueueEntry } from './queue';
import type { BilliardTable, Session } from '../types';
import type { LightHubStatus } from './desktop';

/**
 * Kassa -> chiroq markazi: internetsiz paytda chiroq o'yinga ergashishi shu
 * ma'lumotga bog'liq. `pending` belgisi noto'g'ri bo'lsa, internet qaytgan zahoti
 * eski bulut holati o'ynayotgan stolni qorong'ida qoldirardi.
 */

const NOW = Date.parse('2026-11-21T18:00:00Z');

const table = (id: number, session?: Partial<Session>): BilliardTable => ({
  id, clubId: 1, name: `Stol ${id}`, number: id, pricePerHour: 40000, status: session ? 'busy' : 'free',
  description: null, isActive: true, createdAt: '', updatedAt: '',
  sessions: session ? [{
    id: id * 10, clubId: 1, tableId: id, status: 'active', startTime: '2026-11-21T17:00:00Z', pausedAt: null,
    totalPausedMs: 0, ...session,
  } as Session] : [],
}) as BilliardTable;

const entry = (seq: number, kind: string, meta: Record<string, unknown>, status: QueueEntry['status'] = 'pending'): QueueEntry => ({
  seq, localId: `L${seq}`, scope: 'u|c', method: 'post', url: '/x', idempotencyKey: `k${seq}`,
  labelKey: 'x', createdAt: NOW - 1000, attempts: 0, status, meta: { kind, ...meta },
});

describe('buildLightHubView', () => {
  it('serverdagi o‘yinlar navbatsiz (pending=false), pauza vaqti bilan', () => {
    const view = buildLightHubView(
      [table(1), table(2, { status: 'paused', pausedAt: '2026-11-21T17:30:00Z' }), table(3, {})],
      [], NOW - 5000, NOW,
    );
    expect(view.fetchedAt).toBe(NOW - 5000);
    expect(view.tables).toEqual([
      { tableId: 1, session: null, since: null, pending: false, endedAt: null },
      { tableId: 2, session: 'paused', since: '2026-11-21T17:30:00.000Z', pending: false, endedAt: null },
      { tableId: 3, session: 'active', since: '2026-11-21T17:00:00.000Z', pending: false, endedAt: null },
    ]);
  });

  it('navbatdagi amallar stolni "pending" qiladi; tugagan o‘yinga endedAt qo‘yiladi', () => {
    const view = buildLightHubView(
      // 1-stol: oflayn boshlangan (overlay sessiya qo'shgan); 2-stol: oflayn yakunlangan (overlay bo'shatgan)
      [table(1, { startTime: '2026-11-21T17:59:00Z' }), table(2)],
      [
        entry(1, 'session.start', { tableId: 1, startTime: '2026-11-21T17:59:00Z' }),
        entry(2, 'session.end', { tableId: 2, at: '2026-11-21T17:58:00Z' }),
        // Bar buyurtmasi chiroqqa ta'sir qilmaydi
        entry(3, 'order.create', { tableId: 1, amount: 5000 }),
        // Xato bo'lib to'xtagan amal "pending" emas (ekranda ham ko'rsatilmaydi)
        entry(4, 'session.pause', { tableId: 1, at: '2026-11-21T17:59:30Z' }, 'failed'),
      ],
      NOW - 60_000, NOW,
    );
    expect(view.tables[0]).toEqual({
      tableId: 1, session: 'active', since: '2026-11-21T17:59:00.000Z', pending: true, endedAt: null,
    });
    expect(view.tables[1]).toEqual({
      tableId: 2, session: null, since: '2026-11-21T17:58:00.000Z', pending: true, endedAt: '2026-11-21T17:58:00.000Z',
    });
  });

  it('bir stolda bir nechta amal — eng oxirgisi hisobga olinadi', () => {
    const view = buildLightHubView(
      [table(1, { status: 'active' })],
      [
        entry(1, 'session.pause', { tableId: 1, at: '2026-11-21T17:50:00Z' }),
        entry(2, 'session.resume', { tableId: 1, at: '2026-11-21T17:55:00Z' }),
      ],
      null, NOW,
    );
    expect(view.tables[0].since).toBe('2026-11-21T17:55:00.000Z');
    expect(view.tables[0].pending).toBe(true);
  });
});

describe('withHubLightState', () => {
  const status = (overrides: Partial<LightHubStatus> = {}): LightHubStatus => ({
    available: true, error: null, encryption: true, enabled: true, running: true,
    hub: {
      running: true, kind: 'desktop', agentVersion: '1.4.0-desktop', rulesKnown: true, serverNow: '', evidenceAt: null,
      cloud: { configured: true, online: false, lastOkAt: null, lastError: 'offline', authFailed: false },
      tables: [
        { tableId: 1, tableNumber: 1, tableName: 'Stol 1', driver: 'tuya', desired: true, source: 'local', ok: true,
          actual: true, error: null, at: null, authMissing: false },
        { tableId: 2, tableNumber: 2, tableName: 'Stol 2', driver: 'sonoff', desired: false, source: 'cloud', ok: false,
          actual: null, error: 'timeout', at: null, authMissing: false },
      ],
    },
    ...overrides,
  });

  it('markaz holati kartaga o‘tadi (internetsiz ham)', () => {
    const [one, two, three] = withHubLightState([table(1), table(2), table(3)], status(), NOW);
    expect(one.lightControl).toBe(true);
    expect(one.lightState).toBe(true);
    expect(Date.parse(one.lightFreshUntil!)).toBeGreaterThan(NOW);
    expect(two.lightState).toBeNull();
    expect(two.lightError).toBe('timeout');
    expect(three).toEqual(table(3));
  });

  it('token bekor qilingan yoki markaz ishlamasa — o‘zgarishsiz', () => {
    const tables = [table(1)];
    expect(withHubLightState(tables, status({ running: false }), NOW)).toBe(tables);
    const revoked = status();
    revoked.hub!.cloud.authFailed = true;
    expect(hubControlling(revoked)).toBe(false);
    expect(withHubLightState(tables, revoked, NOW)).toBe(tables);
    expect(withHubLightState(tables, null, NOW)).toBe(tables);
  });
});
