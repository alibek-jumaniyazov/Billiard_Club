import { describe, expect, it } from 'vitest';
import { applyQueueToTables, hasPendingOps, sessionRefOf, withOfflineTransfers } from './overlay';
import type { QueueEntry } from './queue';
import type { BilliardTable, Session } from '../types';
import { sessionChargeAmount, sessionTableAmount } from '../utils/session';

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

  it('oflayn hisob-kitob stolni bo‘shatadi — serverdagi sessiya ham, oflayn boshlangani ham', () => {
    const real = { id: 42, tableId: 2, status: 'active', barAmount: 0 } as Session;
    const result = applyQueueToTables(
      [makeTable(1, 1), makeTable(2, 2, [real])],
      [
        makeEntry(1, 'session.start', { tableId: 1, startTime: '2026-08-04T09:00:00Z' }),
        makeEntry(2, 'session.end', { sessionRef: '$local:L1', tableId: 1, amount: 60000 }),
        makeEntry(3, 'session.end', { sessionRef: '42', tableId: 2, amount: 15000 }),
      ],
      NOW,
    );

    expect(result[0].sessions).toEqual([]);
    expect(result[0].status).toBe('free');
    expect(result[1].sessions).toEqual([]);
    expect(result[1].status).toBe('free');
  });

  it('hisob-kitobdan keyin o‘sha stolda oflayn YANGI o‘yin boshlanadi', () => {
    const result = applyQueueToTables(
      [makeTable(1, 1)],
      [
        makeEntry(1, 'session.start', { tableId: 1, startTime: '2026-08-04T08:00:00Z' }),
        makeEntry(2, 'session.end', { sessionRef: '$local:L1', tableId: 1 }),
        makeEntry(3, 'session.start', { tableId: 1, startTime: '2026-08-04T09:30:00Z' }),
      ],
      NOW,
    );

    expect(result[0].status).toBe('busy');
    expect(result[0].sessions).toHaveLength(1);
    expect(result[0].sessions![0].offlineLocalId).toBe('L3');
    expect(result[0].sessions![0].startTime).toBe('2026-08-04T09:30:00Z');
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

  it('oflayn boshlangan o‘yinning summa limiti kartada ko‘rinadi', () => {
    const result = applyQueueToTables(
      [makeTable(1, 1), makeTable(2, 2)],
      [
        makeEntry(1, 'session.start', {
          tableId: 1, startTime: '2026-08-04T09:00:00Z', pricePerHour: 60000, limitAmount: 50000,
        }),
        makeEntry(2, 'session.start', { tableId: 2, startTime: '2026-08-04T09:00:00Z', plannedMinutes: 60 }),
      ],
      NOW,
    );

    // Limit va belgilangan vaqt bir-biriga aralashmaydi
    expect(result[0].sessions?.[0].limitAmount).toBe(50000);
    expect(result[0].sessions?.[0].plannedMinutes).toBeNull();
    expect(result[1].sessions?.[0].limitAmount).toBeNull();
    expect(result[1].sessions?.[0].plannedMinutes).toBe(60);
  });

  it('oflayn boshlangan o‘yin klubning yaxlitlash qadamini oladi — kartadagi summa yaxlit', () => {
    // 60 000/soat × 46 daqiqa 48 soniya = aniq 46 800 so'm
    const startTime = new Date(NOW - 2808 * 1000).toISOString();
    const result = applyQueueToTables(
      [makeTable(1, 1), makeTable(2, 2)],
      [
        makeEntry(1, 'session.start', { tableId: 1, startTime, pricePerHour: 60000, roundingStep: 1000 }),
        makeEntry(2, 'session.start', { tableId: 2, startTime, pricePerHour: 60000 }),
      ],
      NOW,
    );
    const rounded = result[0].sessions![0];
    const exact = result[1].sessions![0];
    expect(rounded.roundingStep).toBe(1000);
    expect(sessionChargeAmount(rounded, 60000, NOW)).toBe(47000);
    // Eski navbat yozuvi (qadamsiz) — avvalgidek aniq summa
    expect(exact.roundingStep).toBe(0);
    expect(sessionChargeAmount(exact, 60000, NOW)).toBe(46800);
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

/* ------------------------------------------- Oflayn bekor qilish / ko'chirish */

const serverSession = (overrides: Partial<Session> = {}): Session =>
  ({
    id: 42,
    clubId: 1,
    tableId: 1,
    status: 'active',
    startTime: '2026-08-04T08:00:00.000Z',
    pausedAt: null,
    totalPausedMs: 0,
    pricePerHour: 60000,
    barAmount: 0,
    plannedMinutes: null,
    limitAmount: null,
    ...overrides,
  }) as Session;

describe('applyQueueToTables — bekor qilish', () => {
  it('oflayn bekor qilish stolni darhol bo‘shatadi (serverdagi va oflayn boshlangan o‘yin)', () => {
    const result = applyQueueToTables(
      [makeTable(1, 1), makeTable(2, 2, [serverSession({ id: 42, tableId: 2 })])],
      [
        makeEntry(1, 'session.start', { tableId: 1, startTime: '2026-08-04T09:55:00Z' }),
        makeEntry(2, 'session.cancel', { sessionRef: '$local:L1', tableId: 1, at: '2026-08-04T09:57:00Z' }),
        makeEntry(3, 'session.cancel', { sessionRef: '42', tableId: 2, at: '2026-08-04T09:58:00Z' }),
      ],
      NOW,
    );
    expect(result[0]).toMatchObject({ status: 'free', sessions: [] });
    expect(result[1]).toMatchObject({ status: 'free', sessions: [] });
  });

  it('xato bo‘lgan bekor qilish qoplanmaydi — stol band ko‘rinadi', () => {
    const result = applyQueueToTables(
      [makeTable(2, 2, [serverSession({ id: 42, tableId: 2 })])],
      [makeEntry(1, 'session.cancel', { sessionRef: '42', tableId: 2 }, { status: 'failed' })],
      NOW,
    );
    expect(result[0].status).toBe('busy');
    expect(result[0].sessions?.[0].id).toBe(42);
  });
});

describe('applyQueueToTables — ko‘chirish', () => {
  const cheap = (id: number, sessions: Session[] = []) => makeTable(id, id, sessions);
  const vip = (id: number) => ({ ...makeTable(id, id), pricePerHour: 120000 }) as BilliardTable;

  it('o‘yin maqsad stolga o‘tadi, manba bo‘shaydi, bo‘linish nuqtasi yoziladi', () => {
    const result = applyQueueToTables(
      [cheap(1, [serverSession({ totalPausedMs: 5 * 60_000 })]), vip(2)],
      [makeEntry(1, 'session.transfer', {
        sessionRef: '42', tableId: 1, toTableId: 2, at: '2026-08-04T09:00:00.000Z',
      })],
      NOW,
    );
    expect(result[0]).toMatchObject({ status: 'free', sessions: [] });
    expect(result[1].status).toBe('busy');
    const moved = result[1].sessions![0];
    expect(moved).toMatchObject({ id: 42, tableId: 2, pricePerHour: 120000 });
    expect(moved.offlineTransfers).toEqual([{
      at: '2026-08-04T09:00:00.000Z',
      fromTableId: 1,
      toTableId: 2,
      fromPricePerHour: 60000,
      toPricePerHour: 120000,
      totalPausedMs: 5 * 60_000,
    }]);
  });

  it('ko‘chirilgan o‘yinga keyingi pauza va buyurtma yangi stolda qo‘llanadi', () => {
    const result = applyQueueToTables(
      [cheap(1), vip(2)],
      [
        makeEntry(1, 'session.start', { tableId: 1, startTime: '2026-08-04T08:00:00Z', pricePerHour: 60000 }),
        makeEntry(2, 'session.transfer', { sessionRef: '$local:L1', tableId: 1, toTableId: 2, at: '2026-08-04T09:00:00Z' }),
        makeEntry(3, 'order.create', { sessionRef: '$local:L1', tableId: 2, amount: 15000 }),
        makeEntry(4, 'session.pause', { sessionRef: '$local:L1', tableId: 2, at: '2026-08-04T09:30:00Z' }),
      ],
      NOW,
    );
    expect(result[0].status).toBe('free');
    const moved = result[1].sessions![0];
    expect(moved.offlineLocalId).toBe('L1');
    expect(moved.barAmount).toBe(15000);
    expect(moved.status).toBe('paused');
  });

  it('haqiqat ustun: maqsad stol band yoki o‘yin allaqachon boshqa stolda bo‘lsa qoplanmaydi', () => {
    const busyTarget = applyQueueToTables(
      [cheap(1, [serverSession()]), cheap(2, [serverSession({ id: 77, tableId: 2 })])],
      [makeEntry(1, 'session.transfer', { sessionRef: '42', tableId: 1, toTableId: 2, at: '2026-08-04T09:00:00Z' })],
      NOW,
    );
    expect(busyTarget[0].sessions?.[0].id).toBe(42);
    expect(busyTarget[1].sessions?.[0].id).toBe(77);

    // Server ko'chirishni allaqachon qabul qilgan (navbat hali o'chirilmagan): ikki marta ko'chmaydi
    const alreadyMoved = applyQueueToTables(
      [cheap(1), cheap(2, [serverSession({ tableId: 2 })])],
      [makeEntry(1, 'session.transfer', { sessionRef: '42', tableId: 1, toTableId: 2, at: '2026-08-04T09:00:00Z' })],
      NOW,
    );
    expect(alreadyMoved[1].sessions?.[0].offlineTransfers).toBeUndefined();
    expect(alreadyMoved[0].status).toBe('free');
  });
});

describe('applyQueueToTables — o‘yin vaqti / summa limiti', () => {
  it('limit qo‘yilsa belgilangan vaqt tozalanadi; { plannedMinutes: null } ikkalasini olib tashlaydi', () => {
    const limited = applyQueueToTables(
      [makeTable(1, 1, [serverSession({ plannedMinutes: 60 })])],
      [makeEntry(1, 'session.plan', { sessionRef: '42', tableId: 1, limitAmount: 70000, plannedMinutes: null })],
      NOW,
    );
    expect(limited[0].sessions?.[0]).toMatchObject({ limitAmount: 70000, plannedMinutes: null });

    const extended = applyQueueToTables(
      [makeTable(1, 1, [serverSession({ limitAmount: 50000 })])],
      [makeEntry(1, 'session.plan', { sessionRef: '42', tableId: 1, plannedMinutes: 90, limitAmount: null })],
      NOW,
    );
    expect(extended[0].sessions?.[0]).toMatchObject({ limitAmount: null, plannedMinutes: 90 });

    const cleared = applyQueueToTables(
      [makeTable(1, 1, [serverSession({ limitAmount: 50000 })])],
      [makeEntry(1, 'session.plan', { sessionRef: '42', tableId: 1, plannedMinutes: null, limitAmount: null })],
      NOW,
    );
    expect(cleared[0].sessions?.[0]).toMatchObject({ limitAmount: null, plannedMinutes: null });
  });
});

describe('withOfflineTransfers', () => {
  const moveAt9 = {
    at: '2026-08-04T09:00:00.000Z',
    fromTableId: 1,
    toTableId: 2,
    fromPricePerHour: 60000,
    toPricePerHour: 120000,
    totalPausedMs: 0,
  };

  it('ko‘chirish bo‘lmasa keshdagi segmentlar o‘zgarmaydi', () => {
    const base = [{ tableId: 1, pricePerHour: 60000, startedAt: '2026-08-04T08:00:00Z', endedAt: null, pausedMs: 0 }];
    expect(withOfflineTransfers({ startTime: '2026-08-04T08:00:00Z' }, base)).toBe(base);
  });

  it('summa server bilan bir xil bo‘linadi: eski narx — ko‘chirishgacha, yangisi — undan keyin', () => {
    const session = serverSession({ tableId: 2, pricePerHour: 120000, offlineTransfers: [moveAt9] });
    const segments = withOfflineTransfers(session, null)!;
    expect(segments).toEqual([
      { tableId: 1, pricePerHour: 60000, startedAt: '2026-08-04T08:00:00.000Z', endedAt: '2026-08-04T09:00:00.000Z', pausedMs: 0 },
      { tableId: 2, pricePerHour: 120000, startedAt: '2026-08-04T09:00:00.000Z', endedAt: null, pausedMs: 0 },
    ]);
    // 08:00–09:00 × 60 000 + 09:00–10:00 × 120 000
    expect(sessionTableAmount(session, 120000, NOW, segments)).toBe(180000);
  });

  it('serverdagi segment keshi ustiga bo‘linadi va yopilgan segment pauzasi to‘g‘ri chiqadi', () => {
    // Ilgari 1 -> 3 ko'chirilgan (server segmentlari), endi oflayn 3 -> 2
    const base = [
      { tableId: 1, pricePerHour: 60000, startedAt: '2026-08-04T08:00:00.000Z', endedAt: '2026-08-04T08:30:00.000Z', pausedMs: 10 * 60_000 },
      { tableId: 3, pricePerHour: 60000, startedAt: '2026-08-04T08:30:00.000Z', endedAt: null, pausedMs: 0 },
    ];
    const session = serverSession({
      tableId: 2,
      totalPausedMs: 25 * 60_000,
      offlineTransfers: [{ ...moveAt9, fromTableId: 3, totalPausedMs: 25 * 60_000 }],
    });
    const segments = withOfflineTransfers(session, base)!;
    expect(segments).toHaveLength(3);
    // Ochiq segment pauzasi = jami 25 daqiqa - yopilgan segmentdagi 10 daqiqa
    expect(segments[1]).toMatchObject({ tableId: 3, endedAt: '2026-08-04T09:00:00.000Z', pausedMs: 15 * 60_000 });
    expect(segments[2]).toMatchObject({ tableId: 2, startedAt: '2026-08-04T09:00:00.000Z', endedAt: null });
    expect(base[1].endedAt).toBeNull(); // kesh o'zgartirilmaydi
    // Faol: 20 daqiqa + 15 daqiqa (60 000) + 60 daqiqa (120 000)
    expect(sessionTableAmount(session, 120000, NOW, segments)).toBe(155000);
  });
});

describe('hasPendingOps', () => {
  const session = { id: 42 } as Session;

  it('sessiya yoki stol kaliti mos keladigan KUTAYOTGAN amalni topadi', () => {
    const entries = [makeEntry(1, 'order.create', { sessionRef: '42', tableId: 1, deps: ['session:42', 'table:1'] })];
    expect(hasPendingOps(entries, session, [1])).toBe(true);
    expect(hasPendingOps(entries, { id: 7 } as Session, [1])).toBe(true); // shu stol
    expect(hasPendingOps(entries, { id: 7 } as Session, [5])).toBe(false);
  });

  it('ko‘chirishning maqsad stoli ham hisobga olinadi; xato yozuv onlayn amalni ushlamaydi', () => {
    const transfer = makeEntry(1, 'session.transfer', {
      sessionRef: '9', tableId: 3, toTableId: 4, deps: ['session:9', 'table:3', 'table:4'],
    });
    expect(hasPendingOps([transfer], null, [4])).toBe(true);
    expect(hasPendingOps([{ ...transfer, status: 'failed' }], null, [4])).toBe(false);
  });

  it('deps siz eski yozuvlar meta maydonlari bo‘yicha topiladi', () => {
    const legacy = makeEntry(1, 'session.pause', { sessionRef: '$local:L9', tableId: 2 });
    expect(hasPendingOps([legacy], { id: -1, offlineLocalId: 'L9' } as Session)).toBe(true);
    expect(hasPendingOps([legacy], session, [2])).toBe(true);
    expect(hasPendingOps([legacy], session, [3])).toBe(false);
  });
});
