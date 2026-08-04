import { describe, expect, it } from 'vitest';
import { applyQueueToTables, sessionRefOf } from './overlay';
import type { QueueEntry } from './queue';
import type { BilliardTable, Session } from '../types';

/**
 * OFLAYN QOPLAMA TESTLARI.
 *
 * Bu mantiq kassaning EKRANIDA nima ko'rinishini belgilaydi: internet yo'q
 * paytda boshlangan o'yin, pauza vaqti va bar summasi. Xatosi bevosita pulga
 * ta'sir qiladi (kassir noto'g'ri summani ko'radi yoki amalni takrorlaydi),
 * shuning uchun har bir invariant shu yerda muhrlangan.
 */

const NOW = Date.parse('2026-08-04T10:00:00Z');

const makeTable = (id: number, number: number, sessions: Session[] = []): BilliardTable =>
  ({
    id,
    clubId: 1,
    name: `Stol ${number}`,
    number,
    pricePerHour: 60000,
    status: sessions.length > 0 ? 'busy' : 'free',
    description: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    sessions,
  }) as BilliardTable;

const makeEntry = (
  seq: number,
  kind: string,
  meta: Record<string, unknown>,
  overrides: Partial<QueueEntry> = {},
): QueueEntry => ({
  seq,
  localId: `L${seq}`,
  scope: 'u1|c1',
  method: 'post',
  url: '/x',
  idempotencyKey: `k${seq}`,
  labelKey: 'offline.actGeneric',
  createdAt: 0,
  attempts: 0,
  status: 'pending',
  meta: { kind, ...meta },
  ...overrides,
});

describe('applyQueueToTables', () => {
  it('oflayn boshlangan o‘yin stolni band qiladi va lokal belgi qo‘yadi', () => {
    const result = applyQueueToTables(
      [makeTable(1, 1)],
      [
        makeEntry(1, 'session.start', {
          tableId: 1,
          startTime: '2026-08-04T09:00:00Z',
          pricePerHour: 60000,
        }),
      ],
      NOW,
    );

    const session = result[0].sessions?.[0];
    expect(result[0].status).toBe('busy');
    expect(session).toBeDefined();
    // Sintetik ID MANFIY bo'lishi shart — serverdagi haqiqiy ID bilan to'qnashmasin
    expect(session!.id).toBeLessThan(0);
    expect(session!.offlineLocalId).toBe('L1');
    // Narx muhrlanadi: jonli summa shu narxdan hisoblanadi
    expect(session!.pricePerHour).toBe(60000);
  });

  it('server allaqachon sessiyani qaytargan bo‘lsa qoplama QO‘LLANMAYDI (dublikat yo‘q)', () => {
    const real = { id: 99, tableId: 1, status: 'active' } as Session;
    const result = applyQueueToTables(
      [makeTable(1, 1, [real])],
      [makeEntry(1, 'session.start', { tableId: 1, startTime: '2026-08-04T09:00:00Z' })],
      NOW,
    );

    expect(result[0].sessions).toHaveLength(1);
    expect(result[0].sessions?.[0].id).toBe(99);
  });

  it('pauza va davom ettirish totalPausedMs ni to‘g‘ri oshiradi', () => {
    const result = applyQueueToTables(
      [makeTable(1, 1)],
      [
        makeEntry(1, 'session.start', { tableId: 1, startTime: '2026-08-04T09:00:00Z' }),
        makeEntry(2, 'session.pause', { sessionRef: '$local:L1', at: '2026-08-04T09:30:00Z' }),
        makeEntry(3, 'session.resume', { sessionRef: '$local:L1', at: '2026-08-04T09:40:00Z' }),
      ],
      NOW,
    );

    const session = result[0].sessions![0];
    expect(session.totalPausedMs).toBe(10 * 60 * 1000);
    expect(session.status).toBe('active');
    expect(session.pausedAt).toBeNull();
  });

  it('bar buyurtmasi bar summasiga qo‘shiladi', () => {
    const result = applyQueueToTables(
      [makeTable(1, 1)],
      [
        makeEntry(1, 'session.start', { tableId: 1, startTime: '2026-08-04T09:00:00Z' }),
        makeEntry(2, 'order.create', { sessionRef: '$local:L1', amount: 25000 }),
      ],
      NOW,
    );

    expect(result[0].sessions![0].barAmount).toBe(25000);
  });

  it('XATO holatdagi yozuv qoplanmaydi — u bajarilmagan', () => {
    const result = applyQueueToTables(
      [makeTable(1, 1)],
      [
        makeEntry(1, 'session.start', { tableId: 1, startTime: '2026-08-04T09:00:00Z' }, {
          status: 'failed',
        }),
      ],
      NOW,
    );

    expect(result[0].status).toBe('free');
  });

  it('kirish massivini O‘ZGARTIRMAYDI', () => {
    const source = [makeTable(1, 1)];
    applyQueueToTables(source, [makeEntry(1, 'session.start', { tableId: 1 })], NOW);
    expect(source[0].status).toBe('free');
    expect(source[0].sessions).toHaveLength(0);
  });

  it('navbat bo‘sh bo‘lsa ro‘yxat o‘zgarmaydi', () => {
    const source = [makeTable(1, 1)];
    expect(applyQueueToTables(source, [], NOW)).toBe(source);
  });
});

describe('sessionRefOf', () => {
  it('oflayn sessiya uchun $local havolasi, serverdagi uchun ID', () => {
    expect(sessionRefOf({ id: -5, offlineLocalId: 'abc' })).toBe('$local:abc');
    expect(sessionRefOf({ id: 42 } as Session)).toBe('42');
  });
});
