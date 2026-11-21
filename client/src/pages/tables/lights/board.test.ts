import { describe, expect, it } from 'vitest';
import type { LightHubStatus, LightHubTableStatus } from '../../../offline/desktop';
import type { LightsOverview, TableLightConfig } from '../../../types';
import { boardMetrics, buildBoardRows, hubControlsHere, lightController } from './board';

const NOW = Date.parse('2026-11-21T12:00:00Z');

const row = (tableId: number, patch: Partial<TableLightConfig> = {}): TableLightConfig => ({
  tableId, tableNumber: tableId, tableName: `Stol ${tableId}`, isActive: true, driver: 'shelly_gen2', host: '10.0.0.5',
  channel: 0, inverted: false, hasAuth: false, onUrl: null, offUrl: null, config: null, overrideOn: null,
  overrideUntil: null, state: true, syncedAt: new Date(NOW - 5000).toISOString(), error: null, desired: true,
  sessionStatus: 'active', overrideActive: false, ...patch,
});

const overview = (tables: TableLightConfig[], patch: Partial<LightsOverview> = {}): LightsOverview => ({
  mode: 'bridge', offOnPause: false, offDelaySec: 0, preOnMinutes: 0, forceSyncSec: 60, verify: true,
  serverNow: new Date(NOW).toISOString(), forceSyncMs: 60000, canEdit: true,
  bridge: { exists: true, name: null, lastSeenAt: null, online: true, agentVersion: '3.0.0' },
  tables, ...patch,
});

const hubEntry = (tableId: number, patch: Partial<LightHubTableStatus> = {}): LightHubTableStatus => ({
  tableId, tableNumber: tableId, tableName: `Stol ${tableId}`, driver: 'tuya', desired: true, source: 'cloud',
  ok: true, actual: true, error: null, at: new Date(NOW).toISOString(), authMissing: false, ...patch,
});

const hubStatus = (tables: LightHubTableStatus[], patch: Partial<NonNullable<LightHubStatus['hub']>['cloud']> = {}): LightHubStatus => ({
  available: true, error: null, encryption: true, enabled: true, running: true,
  hub: {
    running: true, kind: 'desktop', agentVersion: 'desktop-1.4.0', rulesKnown: true,
    cloud: { configured: true, online: false, lastOkAt: null, lastError: null, authFailed: false, ...patch },
    serverNow: new Date(NOW).toISOString(), evidenceAt: null, tables,
  },
});

describe('buildBoardRows', () => {
  it('serverdagi ko‘rinish: tasdiqlangan holat, qo‘lda boshqaruv va ulanmagan stol', () => {
    const rows = buildBoardRows(overview([
      row(1),
      row(2, { state: null, desired: false, overrideActive: true, overrideOn: false, overrideUntil: '2026-11-21T12:30:00Z' }),
      row(3, { driver: 'none', state: null, syncedAt: null }),
      row(4, { isActive: false }),
    ]), null, NOW);
    expect(rows.map((r) => r.tableId)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ shown: true, health: 'confirmed', manual: null });
    // Javob bermaydigan rele: yuborilgan buyruq ko'rsatiladi, holat — "tasdiqlanmagan"
    expect(rows[1]).toMatchObject({ shown: false, health: 'unconfirmed', manual: { on: false, local: false } });
    expect(rows[2]).toMatchObject({ configured: false, health: 'unconfigured' });
    expect(boardMetrics(rows)).toEqual({ configured: 2, total: 3, on: 1, attention: 1 });
  });

  it('markaz shu kompyuterda: rele javobi va xato markazdan olinadi', () => {
    const rows = buildBoardRows(
      overview([row(1, { driver: 'tuya' }), row(2, { driver: 'tuya' })]),
      hubStatus([hubEntry(1, { actual: false, desired: true, ok: true }), hubEntry(2, { ok: false, error: 'timeout', actual: null })]),
      NOW,
    );
    expect(rows[0]).toMatchObject({ shown: false, health: 'pending' });
    expect(rows[1]).toMatchObject({ shown: null, health: 'error', error: 'timeout' });
  });

  it('internet yo‘q: ro‘yxat faqat markazdan, lokal qo‘lda boshqaruv belgilanadi', () => {
    const rows = buildBoardRows(null, hubStatus([
      hubEntry(5, { source: 'override-local', desired: false, actual: false }),
      hubEntry(2, { authMissing: true, ok: null, actual: null }),
    ]), NOW);
    expect(rows.map((r) => r.tableId)).toEqual([2, 5]);
    expect(rows[0]).toMatchObject({ authMissing: true, health: 'error' });
    expect(rows[1].manual).toEqual({ on: false, until: null, local: true });
    expect(boardMetrics(rows).attention).toBe(1);
  });

  it('token bekor qilingan markaz relelarni boshqarmaydi — server ma’lumoti qoladi', () => {
    const status = hubStatus([hubEntry(1, { actual: false })], { authFailed: true });
    expect(hubControlsHere(status)).toBe(false);
    expect(buildBoardRows(overview([row(1)]), status, NOW)[0].shown).toBe(true);
  });
});

describe('lightController', () => {
  it('kim boshqarayotganini to‘g‘ri aytadi', () => {
    const data = overview([]);
    expect(lightController('bridge', data, hubStatus([]))).toBe('this-pc');
    expect(lightController('bridge', data, null)).toBe('agent');
    expect(lightController('bridge', overview([], { bridge: { exists: true, name: null, lastSeenAt: null, online: false, agentVersion: null } }), null)).toBe('agent-offline');
    expect(lightController('bridge', overview([], { bridge: { exists: false, name: null, lastSeenAt: null, online: false, agentVersion: null } }), null)).toBe('none');
    expect(lightController('direct', data, null)).toBe('server');
    expect(lightController('off', data, null)).toBe('off');
    expect(lightController(null, null, null)).toBe('none');
  });
});
