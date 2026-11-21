import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BilliardTable, Session } from '../types';
import type { QueueEntry } from './queue';

/**
 * OFLAYN KASSA AMALLARI — navbatga AYNAN nima yozilishi.
 *
 * Server oflayn amalni faqat shu yerda yozilgan tana bo'yicha qayta bajaradi
 * (`offlineAt`, `fromTableId`, `payments`, `customerId`), navbat esa `meta.deps`
 * bo'yicha tartib va bloklashni hal qiladi. Xato bevosita pulga ta'sir qiladi,
 * shuning uchun har bir maydon shu testlarda muhrlangan.
 */

const state = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, ids: 0 }));
vi.mock('./queue', () => ({
  newId: () => `id${++state.ids}`,
  enqueue: vi.fn(async (entry: Record<string, unknown>) => {
    const localId = (entry.localId as string | undefined) ?? `id${++state.ids}`;
    state.rows.push({ ...entry, localId });
    return localId;
  }),
}));
vi.mock('./cache', () => ({ fullScope: () => 'u1|c1' }));

import {
  queueCancelSession, queueEndSession, queueOrder, queuePauseResume, queuePlanChange,
  queueStartSession, queueTransferSession,
} from './pos';
import { applyQueueToTables } from './overlay';
import { buildLightHubView } from './light-hub';

const NOW = Date.parse('2026-11-21T18:00:00.000Z');
const OFFSET = 1500; // server soati kassadan 1.5 s oldinda
const AT = new Date(NOW + OFFSET).toISOString();

const table = (id: number, price = 40000): BilliardTable => ({
  id, clubId: 1, name: `Stol ${id}`, number: id, pricePerHour: price, status: 'free',
  description: null, isActive: true, createdAt: '', updatedAt: '', sessions: [],
}) as BilliardTable;

const session = (overrides: Partial<Session> = {}): Session => ({
  id: 42, clubId: 1, tableId: 1, status: 'active', startTime: '2026-11-21T17:00:00.000Z',
  pausedAt: null, totalPausedMs: 0, pricePerHour: 40000, barAmount: 0, ...overrides,
}) as Session;

const last = () => state.rows[state.rows.length - 1] as {
  url: string; method: string; body: Record<string, unknown>; labelKey: string;
  labelParams: Record<string, unknown>; meta: Record<string, unknown>; localId: string;
};

beforeEach(() => {
  state.rows = [];
  state.ids = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('navbat yozuvlari: offlineAt, tana va bog‘liqlik kalitlari', () => {
  it('o‘yin boshlash — stol va o‘z lokal sessiyasi kaliti (keyingi amallar unga bog‘lanadi)', async () => {
    const localId = await queueStartSession(table(1), { limitAmount: 50000 }, 'k1', OFFSET);
    const row = last();
    expect(row.localId).toBe(localId);
    expect(row.body).toMatchObject({ tableId: 1, limitAmount: 50000, offlineAt: AT });
    expect(row.meta.deps).toEqual(['table:1', `session:$local:${localId}`]);
  });

  it('pauza va bar buyurtmasi — sessiya + stol kalitlari; buyurtma haqiqiy vaqti bilan', async () => {
    await queuePauseResume(table(1), session(), false, 'k2', OFFSET);
    expect(last().meta.deps).toEqual(['session:42', 'table:1']);

    await queueOrder(table(1), session(), [{ productId: 7, quantity: 2 }], 24000, 'k3', OFFSET);
    expect(last().body).toEqual({ sessionId: 42, items: [{ productId: 7, quantity: 2 }], offlineAt: AT });
    expect(last().meta).toMatchObject({ kind: 'order.create', at: AT, amount: 24000, deps: ['session:42', 'table:1'] });

    // Oflayn boshlangan sessiya: tanada `$local:` havolasi (navbat songa almashtiradi)
    await queueOrder(table(1), session({ id: -3, offlineLocalId: 'L1' }), [{ productId: 7, quantity: 1 }], 12000);
    expect(last().body.sessionId).toBe('$local:L1');
    expect(last().meta.deps).toEqual(['session:$local:L1', 'table:1']);
  });

  it('o‘yin vaqti / limit — PUT /plan, oflayn belgisi bilan', async () => {
    await queuePlanChange(table(1), session(), { limitAmount: 70000 }, 'k4', OFFSET);
    expect(last()).toMatchObject({
      method: 'put', url: '/sessions/42/plan', body: { limitAmount: 70000, offlineAt: AT },
      labelKey: 'offline.actPlan',
    });
    expect(last().meta).toMatchObject({ kind: 'session.plan', limitAmount: 70000, plannedMinutes: null });

    await queuePlanChange(table(1), session(), { plannedMinutes: null }, 'k5', OFFSET);
    expect(last().body).toEqual({ plannedMinutes: null, offlineAt: AT });
  });

  it('bekor qilish — bosilgan payt serverga boradi, chiroq markazi uchun stol va vaqt', async () => {
    await queueCancelSession(table(1), session(), 'k6', OFFSET);
    expect(last()).toMatchObject({
      method: 'put', url: '/sessions/42/cancel', body: { offlineAt: AT }, labelKey: 'offline.actCancel',
    });
    expect(last().meta).toEqual({
      kind: 'session.cancel', sessionRef: '42', tableId: 1, at: AT, deps: ['session:42', 'table:1'],
    });
  });

  it('ko‘chirish — manba stol tekshiruv uchun yuboriladi, ikkala stol ham kalit', async () => {
    await queueTransferSession(table(1), session({ id: -3, offlineLocalId: 'L1' }), table(2, 90000), 'k7', OFFSET);
    expect(last()).toMatchObject({
      method: 'post',
      url: '/sessions/$local:L1/transfer',
      body: { tableId: 2, fromTableId: 1, offlineAt: AT },
      labelKey: 'offline.actTransfer',
      labelParams: { table: 'Stol 1 (№1)', target: 'Stol 2 (№2)' },
    });
    expect(last().meta).toMatchObject({
      kind: 'session.transfer', tableId: 1, toTableId: 2, at: AT,
      deps: ['session:$local:L1', 'table:1', 'table:2'],
    });
  });

  it('qarzli hisob-kitob — mijoz va qarz kalitlari; bo‘sh to‘lov ro‘yxati aniq yuboriladi', async () => {
    await queueEndSession(table(1), session(), {
      payments: [], discount: 0, expectedBarAmount: 0,
      isDebt: true, isTableDebt: true, isBarDebt: true, customerId: 5, customerName: 'Aziz',
    }, 0, 'k8', NOW, 40000);
    const row = last();
    expect(row.body).toMatchObject({ payments: [], isDebt: true, customerId: 5, offlineAt: new Date(NOW).toISOString() });
    expect(row.labelKey).toBe('offline.actEndDebt');
    expect(row.labelParams).toMatchObject({ customer: 'Aziz' });
    expect(row.meta).toMatchObject({
      kind: 'session.end', debt: 40000, customerId: 5,
      deps: ['session:42', 'table:1', 'customer:5', 'debt:5'],
    });
  });

  it('ro‘yxatdagi mijozsiz qarz navbatga YOZILMAYDI', async () => {
    await expect(queueEndSession(table(1), session(), {
      payments: [], expectedBarAmount: 0, isDebt: true, isTableDebt: true, customerName: 'Erkin ism',
    }, 0, 'k9', NOW)).rejects.toThrow('OFFLINE_DEBT_NEEDS_CUSTOMER');
    expect(state.rows).toHaveLength(0);
  });
});

describe('oflayn ko‘chirish va bekor qilish — ekran va chiroq markazi', () => {
  it('ko‘chirilgan o‘yin yangi stolda yonadi, eski stol va bekor qilingan stol o‘chadi', async () => {
    const tables = [
      { ...table(1), status: 'busy', sessions: [session()] } as BilliardTable,
      table(2, 90000),
      { ...table(3), status: 'busy', sessions: [session({ id: 43, tableId: 3 })] } as BilliardTable,
    ];
    await queueTransferSession(tables[0], session(), tables[1], 'k10', OFFSET);
    await queueCancelSession(tables[2], session({ id: 43, tableId: 3 }), 'k11', OFFSET);
    const entries = state.rows.map((row, index) => ({
      ...row, seq: index + 1, createdAt: NOW, attempts: 0, status: 'pending',
    })) as unknown as QueueEntry[];

    const view = applyQueueToTables(tables, entries, NOW);
    expect(view.map((tbl) => tbl.status)).toEqual(['free', 'busy', 'free']);
    expect(view[1].sessions?.[0]).toMatchObject({ id: 42, tableId: 2, pricePerHour: 90000 });

    const hub = buildLightHubView(view, entries, NOW - 60_000, NOW);
    expect(hub.tables).toEqual([
      { tableId: 1, session: null, since: AT, pending: true, endedAt: AT },
      { tableId: 2, session: 'active', since: AT, pending: true, endedAt: null },
      { tableId: 3, session: null, since: AT, pending: true, endedAt: AT },
    ]);
  });
});
