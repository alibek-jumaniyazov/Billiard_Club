import { describe, expect, it } from 'vitest';
import {
  clockOffsetMs,
  round2,
  secondsAmount,
  segmentsMatchSession,
  sessionDurationSeconds,
  sessionElapsedMs,
  sessionLimitLeftMs,
  sessionSegmentBilling,
  sessionTableAmount,
  type LimitTiming,
  type SegmentLike,
  type SessionTiming,
} from './session';

/**
 * SESSIYA HISOBI TESTLARI — bu fayl mijozdan olinadigan PULNI hisoblaydi
 * va serverdagi formulaning aynan nusxasi bo'lishi shart. Shu sababli
 * invariantlar shu yerda muhrlangan: formulaning har qanday o'zgarishi
 * (yaxlitlash, pauza, transfer) darhol ko'rinadi.
 */

const T = (iso: string) => Date.parse(iso);

const timing = (over: Partial<SessionTiming> = {}): SessionTiming => ({
  startTime: '2026-08-04T09:00:00Z',
  status: 'active',
  pausedAt: null,
  totalPausedMs: 0,
  pricePerHour: 60000,
  ...over,
});

describe('round2 va secondsAmount', () => {
  it('ikki kasr xonagacha yaxlitlaydi', () => {
    expect(round2(1.005)).toBe(1.0);
    expect(round2(2.345)).toBe(2.35);
    expect(round2(-0.001)).toBe(-0);
  });

  it('soatlik narxni soniyalarga bo‘ladi', () => {
    // 60 000 so'm/soat, 1 soat = 60 000
    expect(secondsAmount(60000, 3600)).toBe(60000);
    // 30 daqiqa = yarmi
    expect(secondsAmount(60000, 1800)).toBe(30000);
    // Manfiy soniyalar nolga tenglashtiriladi (himoya)
    expect(secondsAmount(60000, -100)).toBe(0);
  });
});

describe('sessionElapsedMs', () => {
  it('pauzasiz sessiyada o‘tgan vaqt', () => {
    expect(sessionElapsedMs(timing(), T('2026-08-04T10:00:00Z'))).toBe(3600_000);
  });

  it('yakunlangan pauzalar ayiriladi', () => {
    const t = timing({ totalPausedMs: 600_000 });
    expect(sessionElapsedMs(t, T('2026-08-04T10:00:00Z'))).toBe(3000_000);
  });

  it('JORIY (tugallanmagan) pauza ham ayiriladi', () => {
    const t = timing({ status: 'paused', pausedAt: '2026-08-04T09:40:00Z' });
    // 09:00 -> 10:00 = 60 daq, shundan 09:40 dan beri pauza = 20 daq
    expect(sessionElapsedMs(t, T('2026-08-04T10:00:00Z'))).toBe(40 * 60_000);
  });

  it('hech qachon manfiy bo‘lmaydi (soat orqaga ketsa ham)', () => {
    expect(sessionElapsedMs(timing(), T('2026-08-04T08:00:00Z'))).toBe(0);
  });
});

describe('sessionDurationSeconds', () => {
  it('soniyalarni PASTGA yaxlitlaydi (server bilan lockstep)', () => {
    const t = timing({ startTime: '2026-08-04T09:59:59.500Z' });
    expect(sessionDurationSeconds(t, T('2026-08-04T10:00:00.400Z'))).toBe(0);
    expect(sessionDurationSeconds(t, T('2026-08-04T10:00:00.600Z'))).toBe(1);
  });
});

describe('sessionSegmentBilling (transfer qilingan sessiya)', () => {
  const segments: SegmentLike[] = [
    {
      tableId: 1,
      pricePerHour: 60000,
      startedAt: '2026-08-04T09:00:00Z',
      endedAt: '2026-08-04T09:30:00Z',
      pausedMs: 0,
    },
    {
      tableId: 2,
      pricePerHour: 90000,
      startedAt: '2026-08-04T09:30:00Z',
      endedAt: null,
      pausedMs: 0,
    },
  ];

  it('har segment O‘Z narxi bilan hisoblanadi', () => {
    const { items, tableAmount } = sessionSegmentBilling(
      timing(),
      segments,
      T('2026-08-04T10:00:00Z'),
    );

    // 30 daq x 60 000/soat = 30 000; 30 daq x 90 000/soat = 45 000
    expect(items[0].amount).toBe(30000);
    expect(items[1].amount).toBe(45000);
    expect(tableAmount).toBe(75000);
  });

  it('segment soniyalari yig‘indisi umumiy davomiylikka teng (kumulyativ yaxlitlash)', () => {
    const { items } = sessionSegmentBilling(timing(), segments, T('2026-08-04T10:00:00Z'));
    const total = items.reduce((sum, i) => sum + i.billedSeconds, 0);
    expect(total).toBe(sessionDurationSeconds(timing(), T('2026-08-04T10:00:00Z')));
  });

  it('ochiq segment sessiyaning YANGI pauza qiymatini oladi', () => {
    const t = timing({ totalPausedMs: 300_000 }); // 5 daqiqa pauza
    const { items } = sessionSegmentBilling(t, segments, T('2026-08-04T10:00:00Z'));
    // Yopiq segmentda pauza yo'q -> hammasi ochiq segmentga tushadi
    expect(items[1].pausedMs).toBe(300_000);
    expect(items[1].amount).toBe(secondsAmount(90000, 25 * 60));
  });
});

describe('sessionTableAmount', () => {
  it('segmentlar berilsa ular bo‘yicha hisoblaydi', () => {
    const segments: SegmentLike[] = [
      {
        tableId: 1,
        pricePerHour: 60000,
        startedAt: '2026-08-04T09:00:00Z',
        endedAt: null,
        pausedMs: 0,
      },
    ];
    expect(sessionTableAmount(timing(), 999, T('2026-08-04T10:00:00Z'), segments)).toBe(60000);
  });

  it('segmentsiz sessiyada MUHRLANGAN narx ishlatiladi (zaxira narx emas)', () => {
    expect(sessionTableAmount(timing({ pricePerHour: 50000 }), 999, T('2026-08-04T10:00:00Z'))).toBe(
      50000,
    );
  });

  it('muhrlangan narx yo‘q bo‘lsa zaxira narxga tushadi', () => {
    expect(sessionTableAmount(timing({ pricePerHour: null }), 40000, T('2026-08-04T10:00:00Z'))).toBe(
      40000,
    );
  });
});

describe('segmentsMatchSession', () => {
  const open = (tableId: number): SegmentLike => ({
    tableId,
    pricePerHour: 1,
    startedAt: '',
    endedAt: null,
    pausedMs: 0,
  });

  it('ochiq segment joriy stolga mos bo‘lsa kesh yaroqli', () => {
    expect(segmentsMatchSession({ tableId: 2 }, [open(2)])).toBe(true);
  });

  it('boshqa terminal ko‘chirgan bo‘lsa kesh yaroqsiz', () => {
    expect(segmentsMatchSession({ tableId: 3 }, [open(2)])).toBe(false);
  });
});

describe('sessionLimitLeftMs (summa limiti)', () => {
  const START = '2026-08-04T09:00:00Z';
  // 40 000 so'm/soat stolda 50 000 so'm = 1 soat 15 daqiqa
  const limited = (over: Partial<LimitTiming> = {}): LimitTiming =>
    ({ ...timing({ startTime: START, pricePerHour: 40000 }), limitAmount: 50000, ...over });
  const MIN = 60_000;

  it('limit yo‘q bo‘lsa null', () => {
    expect(sessionLimitLeftMs(timing(), 40000, T('2026-08-04T10:00:00Z'))).toBeNull();
    expect(sessionLimitLeftMs(limited({ limitAmount: null }), 40000, T('2026-08-04T10:00:00Z'))).toBeNull();
  });

  it('qolgan vaqt = (limit − o‘ynalgan summa) / narx', () => {
    // 09:00 dan 10:00 gacha 40 000 o'ynaldi -> 10 000 qoldi = 15 daqiqa
    expect(sessionLimitLeftMs(limited(), 40000, T('2026-08-04T10:00:00Z'))).toBe(15 * MIN);
    // Boshida — to'liq 75 daqiqa
    expect(sessionLimitLeftMs(limited(), 40000, T(START))).toBe(75 * MIN);
  });

  it('limit tugagach qiymat manfiy — qancha vaqt oshib ketgani', () => {
    expect(sessionLimitLeftMs(limited(), 40000, T('2026-08-04T10:15:00Z'))).toBe(0);
    expect(sessionLimitLeftMs(limited(), 40000, T('2026-08-04T10:20:00Z'))).toBe(-5 * MIN);
  });

  it('"tugadi" payti chekdagi summa limitga yetgan soniyaga to‘g‘ri keladi', () => {
    // 35 000/soat: 50 000 so'mga 5142,86 soniya kerak
    const s = limited({ pricePerHour: 35000 });
    const at = (seconds: number) => T(START) + seconds * 1000;
    expect(sessionLimitLeftMs(s, 35000, at(5142))!).toBeGreaterThan(0);
    expect(sessionTableAmount(s, 35000, at(5142))).toBeLessThan(50000);
    expect(sessionLimitLeftMs(s, 35000, at(5143))!).toBeLessThanOrEqual(0);
    expect(sessionTableAmount(s, 35000, at(5143))).toBeGreaterThanOrEqual(50000);
  });

  it('pauzada qolgan vaqt o‘zgarmaydi (faol vaqt to‘xtagan)', () => {
    const paused = limited({ status: 'paused', pausedAt: '2026-08-04T09:30:00Z' });
    expect(sessionLimitLeftMs(paused, 40000, T('2026-08-04T09:45:00Z'))).toBe(45 * MIN);
    expect(sessionLimitLeftMs(paused, 40000, T('2026-08-04T11:00:00Z'))).toBe(45 * MIN);
    // Yakunlangan pauzalar ham hisobga kirmaydi
    const resumed = limited({ totalPausedMs: 30 * MIN });
    expect(sessionLimitLeftMs(resumed, 40000, T('2026-08-04T10:00:00Z'))).toBe(45 * MIN);
  });

  it('muhrlangan narx bo‘lmasa stol narxi (fallback) ishlatiladi', () => {
    const legacy = limited({ pricePerHour: null });
    expect(sessionLimitLeftMs(legacy, 50000, T(START))).toBe(60 * MIN);
  });

  it('bepul stolda (narx 0) limitga yetilmaydi — null', () => {
    expect(sessionLimitLeftMs(limited({ pricePerHour: 0 }), 0, T(START))).toBeNull();
    expect(sessionLimitLeftMs(limited({ pricePerHour: null }), 0, T(START))).toBeNull();
  });

  describe('ko‘chirilgan o‘yin (segmentlar)', () => {
    // 09:00–09:30 arzon stolda (40 000), keyin qimmat stolda (60 000)
    const segments: SegmentLike[] = [
      { tableId: 1, pricePerHour: 40000, startedAt: START, endedAt: '2026-08-04T09:30:00Z', pausedMs: 0 },
      { tableId: 2, pricePerHour: 60000, startedAt: '2026-08-04T09:30:00Z', endedAt: null, pausedMs: 0 },
    ];
    const moved = limited({ pricePerHour: 60000 });

    it('qolgan pul YANGI stol narxida vaqtga aylanadi', () => {
      // Birinchi stolda 20 000 o'ynaldi -> 30 000 qoldi; 60 000/soat da bu 30 daqiqa
      expect(sessionLimitLeftMs(moved, 60000, T('2026-08-04T09:30:00Z'), segments)).toBe(30 * MIN);
      expect(sessionLimitLeftMs(moved, 60000, T('2026-08-04T09:45:00Z'), segments)).toBe(15 * MIN);
      expect(sessionLimitLeftMs(moved, 60000, T('2026-08-04T10:00:00Z'), segments)).toBe(0);
      // Aynan shu payt chekdagi summa limitga teng
      expect(sessionTableAmount(moved, 60000, T('2026-08-04T10:00:00Z'), segments)).toBe(50000);
    });

    it('bitta ochiq segment — segmentsiz hisob bilan bir xil natija', () => {
      const single: SegmentLike[] = [
        { tableId: 1, pricePerHour: 40000, startedAt: START, endedAt: null, pausedMs: 0 },
      ];
      const now = T('2026-08-04T09:50:20Z');
      expect(sessionLimitLeftMs(limited(), 40000, now, single)).toBe(sessionLimitLeftMs(limited(), 40000, now));
    });

    it('bepul stolga ko‘chirilsa limit vaqtga aylanmaydi — null', () => {
      const free: SegmentLike[] = [segments[0], { ...segments[1], pricePerHour: 0 }];
      expect(sessionLimitLeftMs(moved, 0, T('2026-08-04T09:45:00Z'), free)).toBeNull();
    });

    it('ochiq segmentdagi pauza qolgan vaqtni kamaytirmaydi', () => {
      const withPause = limited({ pricePerHour: 60000, totalPausedMs: 10 * MIN });
      // 09:30 dan 09:55 gacha: 25 daqiqa, shundan 10 daqiqa pauza -> 15 daqiqa o'ynaldi
      expect(sessionLimitLeftMs(withPause, 60000, T('2026-08-04T09:55:00Z'), segments)).toBe(15 * MIN);
    });
  });
});

describe('clockOffsetMs', () => {
  it('serverNow bo‘lmasa siljish nol', () => {
    expect(clockOffsetMs(undefined)).toBe(0);
    expect(clockOffsetMs('buzuq-sana')).toBe(0);
  });
});
