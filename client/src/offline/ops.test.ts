import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
import type { CashShift, Customer, Debt, Reservation, ShiftReport } from '../types';

const state = vi.hoisted(() => ({
  scope: 'u7|c3',
  now: Date.parse('2026-11-21T10:00:00.000Z'),
  request: vi.fn(),
}));
vi.mock('../api/client', () => ({ default: { request: state.request } }));
vi.mock('./cache', () => ({ fullScope: () => state.scope }));
vi.mock('./license', () => ({ effectiveNow: () => state.now, requireOfflineLease: async () => undefined }));

import { enqueue, flushQueue, queueList, queueRemove, type QueueEntry } from './queue';
import {
  applyCustomerCreates,
  applyDebtPayments,
  applyReservationOps,
  applyShiftOps,
  closeMustQueue,
  findReservationOverlaps,
  hasQueuedDeps,
  localRef,
  offlineCustomerOptions,
  offlineDebtPayments,
  pendingDebtPaymentsTotal,
  queueCustomerCreate,
  queueDebtPayment,
  queueReservationCreate,
  queueReservationStatus,
  queueShiftClose,
  queueShiftOpen,
  shiftCloseBarrierDeps,
} from './ops';

/**
 * OFLAYN OPERATSIYALAR TESTLARI (qarz, bron, mijoz, smena).
 *
 * Bu yozuvlar internetsiz paytda olingan PULNI va berilgan va'dalarni
 * (bron) saqlaydi: navbat yozuvining shakli (vaqt muhri, kalit, bog'liqlik)
 * va ekrandagi optimistik ko'rinish shu yerda muhrlangan.
 */

const iso = (ms: number) => new Date(ms).toISOString();

const entry = (
  seq: number,
  kind: string,
  meta: Record<string, unknown>,
  overrides: Partial<QueueEntry> = {},
): QueueEntry => ({
  seq,
  localId: `L${seq}`,
  scope: 'u7|c3',
  method: 'post',
  url: '/x',
  idempotencyKey: `k${seq}`,
  labelKey: 'x',
  createdAt: 0,
  attempts: 0,
  status: 'pending',
  meta: { kind, ...meta },
  ...overrides,
});

const debt = (id: number, remainingDebt: number, extra: Partial<Debt> = {}): Debt => ({
  id,
  clubId: 3,
  sessionId: null,
  userId: null,
  customerName: `Mijoz ${id}`,
  customerPhone: '998901112233',
  tableAmount: remainingDebt,
  barAmount: 0,
  totalDebt: remainingDebt,
  paidAmount: 0,
  remainingDebt,
  description: null,
  isPaid: false,
  paidAt: null,
  dueDate: null,
  writtenOffAt: null,
  writtenOffReason: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  ...extra,
});

describe('offline ops — queue entries', () => {
  beforeEach(async () => {
    state.scope = 'u7|c3';
    state.request.mockReset();
    await db.idbClear(db.STORE_QUEUE);
    await db.idbClear(db.STORE_META);
  });

  it('a debt payment keeps the original key, the moment the cash was taken and a per-customer dependency', async () => {
    const takenAt = state.now - 90_000;
    await queueDebtPayment(
      { id: 5, customerId: 9, customerName: 'Ali', customerPhone: '998901112233' },
      { amount: 12000.004, paymentMethod: 'cash' },
      'pay-key-1',
      takenAt,
    );
    await queueDebtPayment({ id: 6, customerId: null, customerName: 'Vali', customerPhone: null }, { amount: 500, paymentMethod: 'card' });
    const [first, second] = await queueList();
    expect(first).toMatchObject({
      method: 'post',
      url: '/debts/5/pay',
      idempotencyKey: 'pay-key-1',
      body: { amount: 12000, paymentMethod: 'cash', offlineAt: iso(takenAt) },
      labelKey: 'debts.offlinePay',
      meta: { kind: 'debt.pay', debtId: 5, amount: 12000, deps: ['debt:9'] },
    });
    // Ro'yxatdan o'tmagan qarzdor — kalit qarzning o'zi bo'yicha; vaqt — joriy (server) soat
    expect(second.meta).toMatchObject({ deps: ['debt:#6'], at: iso(state.now) });
  });

  it('a customer added offline can be booked offline; the booking gets the real customer ID on replay', async () => {
    const customerId = await queueCustomerCreate({ name: '  Sardor ', phone: '+998901234567' }, 'cust-key');
    const reservationId = await queueReservationCreate(
      { tableId: 3, tableName: 'Stol 3', customerId: localRef(customerId), startsAt: '2026-11-21T15:00:00.000Z', durationMinutes: 90 },
      '21.11 20:00',
      'res-key',
    );
    await queueReservationStatus({ ref: localRef(reservationId), name: 'Sardor', timeLabel: '21.11 20:00' }, 'confirmed', 'status-key');

    const rows = await queueList();
    expect(rows.map((row) => row.meta?.deps)).toEqual([
      [`customer:$local:${customerId}`],
      [`reservation:$local:${reservationId}`, `customer:$local:${customerId}`],
      [`reservation:$local:${reservationId}`],
    ]);
    expect(rows[0].body).toMatchObject({ name: 'Sardor', phone: '+998901234567', offlineAt: iso(state.now) });
    expect(rows[2]).toMatchObject({ method: 'put', url: `/reservations/$local:${reservationId}`, body: { status: 'confirmed' } });

    state.request
      .mockResolvedValueOnce({ data: { data: { id: 41 } } })
      .mockResolvedValueOnce({ data: { data: { id: 77 } } })
      .mockResolvedValueOnce({ data: { data: { id: 77 } } });
    expect(await flushQueue(state.scope)).toMatchObject({ sent: 3, blocked: false });
    const calls = state.request.mock.calls.map(([config]) => config);
    expect(calls[1]).toMatchObject({ url: '/reservations', data: { customerId: 41, tableId: 3, durationMinutes: 90 } });
    expect(calls[2]).toMatchObject({ url: '/reservations/77', data: { status: 'confirmed' } });
    expect(calls.map((config) => config.headers['Idempotency-Key'])).toEqual(['cust-key', 'res-key', 'status-key']);
  });

  it('discarding an offline customer also discards the booking made for it (nothing is left half-linked)', async () => {
    const customerId = await queueCustomerCreate({ name: 'Sardor' });
    await queueReservationCreate(
      { tableId: 3, tableName: 'Stol 3', customerId: localRef(customerId), startsAt: '2026-11-21T15:00:00.000Z' },
      '21.11 20:00',
    );
    await queueDebtPayment({ id: 5, customerId: 9, customerName: 'Ali', customerPhone: null }, { amount: 1000, paymentMethod: 'cash' });
    const [customer] = await queueList();
    expect(await queueRemove(customer.seq!)).toBe(2);
    expect((await queueList()).map((row) => row.meta?.kind)).toEqual(['debt.pay']);
  });

  it('cancel goes to the cancel endpoint; a shift close waits for earlier money entries but not for bookings', async () => {
    await queueDebtPayment({ id: 5, customerId: 9, customerName: 'Ali', customerPhone: null }, { amount: 1000, paymentMethod: 'cash' });
    // pos.ts dagi hisob-kitob yozuvining o'rnini bosuvchi (stol kaliti bilan)
    await enqueue({ scope: state.scope, method: 'put', url: '/sessions/4/end', labelKey: 'offline.actEnd', meta: { kind: 'session.end', deps: ['table:2'] } });
    await queueReservationStatus({ ref: 12, name: 'Aziz', timeLabel: '21.11 19:00' }, 'cancelled');
    const openId = await queueShiftOpen({ openingCash: 50000, note: ' ' }, 'open-key');
    await queueShiftClose(localRef(openId), { countedCash: 81000.5, cashOut: 1000 }, 'close-key', state.now + 60_000);

    const rows = await queueList();
    expect(rows[2]).toMatchObject({ method: 'post', url: '/reservations/12/cancel', body: { offlineAt: iso(state.now) } });
    expect(rows[3]).toMatchObject({ url: '/shifts/open', body: { openingCash: 50000, offlineAt: iso(state.now) }, meta: { deps: ['shift'] } });
    expect(rows[3].body).not.toHaveProperty('note', ' ');
    expect(rows[4]).toMatchObject({
      url: `/shifts/$local:${openId}/close`,
      idempotencyKey: 'close-key',
      body: { countedCash: 81000.5, cashOut: 1000, offlineAt: iso(state.now + 60_000) },
      meta: { kind: 'shift.close', deps: ['shift', 'debt:9', 'table:2'] },
    });
  });

  it('the close barrier only takes keys from the same account and skips booking/customer keys', () => {
    const entries = [
      entry(1, 'debt.pay', { deps: ['debt:9'] }),
      entry(2, 'reservation.create', { deps: ['reservation:$local:L2', 'customer:4'] }),
      entry(3, 'session.end', { deps: ['table:2', 'shift'] }),
      entry(4, 'debt.pay', { deps: ['debt:1'] }, { scope: 'u8|c3' }),
      entry(5, 'session.start', {}),
      // Kalitsiz eski yozuv — kalitlar queue.ts dagidek tableId/sessionRef dan olinadi
      entry(6, 'order.create', { tableId: 7, sessionRef: '$local:L1' }),
    ];
    expect(shiftCloseBarrierDeps(entries, 'u7|c3')).toEqual(['debt:9', 'session:$local:L1', 'table:2', 'table:7']);
  });

  it('a new operation goes behind queued work on the same object even when online', () => {
    const entries = [
      entry(1, 'debt.pay', { deps: ['debt:9'] }),
      entry(2, 'reservation.status', { deps: ['reservation:12'] }),
    ];
    expect(hasQueuedDeps(entries, ['debt:9'])).toBe(true);
    expect(hasQueuedDeps(entries, ['debt:10'])).toBe(false);
    expect(hasQueuedDeps(entries, ['reservation:12'])).toBe(true);
    // "Hammasiga bog'liq" (kalitsiz) yozuv bor — ehtiyot uchun navbat orqali
    expect(hasQueuedDeps([...entries, entry(3, 'unknown', {})], ['debt:10'])).toBe(true);
  });
});

describe('offline ops — what the screens show', () => {
  it('pending payments reduce the shown balance; a rejected one only flags the debt', () => {
    const debts = [debt(1, 30000), debt(2, 8000, { customerName: 'Vali', customerPhone: null })];
    const entries = [
      entry(1, 'debt.pay', { debtId: 1, amount: 10000, customerName: 'Mijoz 1', customerPhone: '998901112233', paymentMethod: 'cash', at: iso(state.now) }),
      entry(2, 'debt.pay', { debtId: 1, amount: 20000, customerName: 'Mijoz 1', customerPhone: '998901112233', paymentMethod: 'card', at: iso(state.now) }),
      entry(3, 'debt.pay', { debtId: 2, amount: 5000, customerName: 'Vali', customerPhone: null, paymentMethod: 'cash', at: iso(state.now) }, { status: 'failed', lastError: 'Bu qarz allaqachon to‘langan' }),
    ];
    const [first, second] = applyDebtPayments(debts, entries);
    expect(first).toMatchObject({ remainingDebt: 0, paidAmount: 30000, isPaid: true, offlinePaid: 30000 });
    expect(second).toMatchObject({ remainingDebt: 8000, isPaid: false, offlineFailed: true });
    expect(second.offlinePaid).toBeUndefined();
    expect(debts[0].remainingDebt).toBe(30000);

    expect(pendingDebtPaymentsTotal(entries, { status: 'unpaid', search: '' })).toBe(30000);
    expect(pendingDebtPaymentsTotal(entries, { status: 'all', search: '+998 90 111' })).toBe(30000);
    expect(pendingDebtPaymentsTotal(entries, { status: 'unpaid', search: 'vali' })).toBe(0);
    expect(pendingDebtPaymentsTotal(entries, { status: 'paid', search: '' })).toBe(0);
    expect(offlineDebtPayments(entries, 2)).toEqual([
      expect.objectContaining({ amount: 5000, offlineMark: 'failed', offlineError: 'Bu qarz allaqachon to‘langan' }),
    ]);
  });

  it('bookings: new ones appear on their own day, status changes apply at once, a rejected booking stays visible', () => {
    const day = '2026-11-21';
    const dayOf = (value: string) => value.slice(0, 10);
    const server: Reservation[] = [{
      id: 10, clubId: 3, tableId: 1, customerId: null, customerName: 'Aziz', customerPhone: null,
      startsAt: '2026-11-21T13:00:00.000Z', durationMinutes: null, status: 'pending', notes: null,
      createdAt: '', updatedAt: '',
    }];
    const entries = [
      entry(1, 'reservation.create', { tableId: 2, tableName: 'Stol 2', tableNumber: 2, customerId: null, customerName: 'Bobur', customerPhone: null, startsAt: '2026-11-21T15:00:00.000Z', durationMinutes: 60, notes: null, at: iso(state.now) }),
      entry(2, 'reservation.create', { tableId: 2, tableName: 'Stol 2', tableNumber: 2, customerId: null, customerName: 'Ertaga', customerPhone: null, startsAt: '2026-11-22T15:00:00.000Z', durationMinutes: null, notes: null, at: iso(state.now) }),
      entry(3, 'reservation.status', { reservationRef: '10', status: 'cancelled' }),
      entry(4, 'reservation.status', { reservationRef: '$local:L1', status: 'confirmed' }),
      entry(5, 'reservation.create', { tableId: 1, tableName: 'Stol 1', tableNumber: 1, customerId: null, customerName: 'Rad', customerPhone: null, startsAt: '2026-11-21T13:30:00.000Z', durationMinutes: null, notes: null, at: iso(state.now) },
        { status: 'failed', lastError: 'Bu vaqtda stol allaqachon band' }),
    ];
    const rows = applyReservationOps(server, entries, { day, status: null, dayOf });
    expect(rows.map((r) => [r.customerName, r.status])).toEqual([
      ['Aziz', 'cancelled'],
      ['Rad', 'pending'],
      ['Bobur', 'confirmed'],
    ]);
    expect(rows[0]).toMatchObject({ offlineStatusPending: true });
    expect(rows[1]).toMatchObject({ offlineLocalId: 'L5', offlineMark: 'failed', offlineError: 'Bu vaqtda stol allaqachon band' });
    expect(rows[2]).toMatchObject({ offlineLocalId: 'L1', table: { name: 'Stol 2' }, id: -1 });
    expect(server[0].status).toBe('pending');

    // Oflayn oldindan tekshiruv: navbatdagi bron bilan to'qnashadi, rad etilgani va bekor qilingani — yo'q
    expect(findReservationOverlaps(rows, { tableId: 2, startsAt: '2026-11-21T15:30:00.000Z' }).map((r) => r.customerName)).toEqual(['Bobur']);
    expect(findReservationOverlaps(rows, { tableId: 1, startsAt: '2026-11-21T13:15:00.000Z', durationMinutes: 30 })).toEqual([]);
    expect(applyReservationOps(server, entries, { day, status: 'confirmed', dayOf }).some((r) => r.offlineLocalId)).toBe(false);
  });

  it('customers added offline come first (search-aware); only pending ones can be picked for a booking', () => {
    const server: Customer[] = [{ id: 1, clubId: 3, name: 'Aziz', phone: '+998900000001', notes: null, createdAt: '', updatedAt: '' }];
    const entries = [
      entry(1, 'customer.create', { name: 'Sardor', phone: '+998901234567', notes: null, at: iso(state.now) }),
      entry(2, 'customer.create', { name: 'Rad', phone: null, notes: null, at: iso(state.now) }, { status: 'failed', lastError: 'xato' }),
    ];
    expect(applyCustomerCreates(server, entries).map((c) => [c.name, c.offlineMark ?? 'server'])).toEqual([
      ['Sardor', 'pending'], ['Rad', 'failed'], ['Aziz', 'server'],
    ]);
    expect(applyCustomerCreates(server, entries, '1234').map((c) => c.name)).toEqual(['Sardor', 'Aziz']);
    expect(offlineCustomerOptions(entries)).toEqual([{ value: '$local:L1', name: 'Sardor', phone: '+998901234567' }]);
  });

  it('shift: an offline close hides the open shift until sent, an offline open shows a local shift, rejected ones are listed', () => {
    const shift = { id: 5, openingCash: 50000, openedAt: '2026-11-21T03:00:00.000Z', closedAt: null } as CashShift;
    const report: ShiftReport = { shift, summary: null, expectedCash: 50000 };

    const closed = applyShiftOps(report, [entry(1, 'shift.close', { shiftRef: '5', countedCash: 81000, at: iso(state.now) })]);
    expect(closed).toMatchObject({ shift: null, closePending: { countedCash: 81000, at: iso(state.now) }, openPending: false });

    const handover = applyShiftOps(report, [
      entry(1, 'shift.close', { shiftRef: '5', countedCash: 81000, at: iso(state.now) }),
      entry(2, 'shift.open', { openingCash: 20000, note: null, at: iso(state.now + 60_000) }),
    ]);
    expect(handover).toMatchObject({ openPending: true, closePending: null, summary: null });
    expect(handover.shift).toMatchObject({ id: -2, offlineLocalId: 'L2', openingCash: 20000, openedAt: iso(state.now + 60_000) });

    const localClosed = applyShiftOps(null, [
      entry(1, 'shift.open', { openingCash: 0, note: null, at: iso(state.now) }),
      entry(2, 'shift.close', { shiftRef: '$local:L1', countedCash: 0, at: iso(state.now + 1000) }),
    ]);
    expect(localClosed).toMatchObject({ shift: null, closePending: { countedCash: 0 } });

    const rejected = applyShiftOps(report, [entry(1, 'shift.close', { shiftRef: '5', countedCash: 1 }, { status: 'failed' })]);
    expect(rejected.shift).toBe(shift);
    expect(rejected.failed).toHaveLength(1);
  });

  it('an online close is routed through the queue while money or shift entries are still unsent', () => {
    expect(closeMustQueue([])).toBe(false);
    expect(closeMustQueue([entry(1, 'reservation.create', {}), entry(2, 'customer.create', {})])).toBe(false);
    expect(closeMustQueue([entry(1, 'debt.pay', {})])).toBe(true);
    expect(closeMustQueue([entry(1, 'session.end', {}, { status: 'failed' })])).toBe(true);
    expect(closeMustQueue([entry(1, 'unknown', {}), entry(2, 'customer.create', {})])).toBe(true);
  });
});
