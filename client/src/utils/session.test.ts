import { describe, expect, it } from 'vitest';
import {
  clockOffsetMs,
  round2,
  secondsAmount,
  segmentsMatchSession,
  sessionDurationSeconds,
  sessionElapsedMs,
  sessionSegmentBilling,
  sessionTableAmount,
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

describe('clockOffsetMs', () => {
  it('serverNow bo‘lmasa siljish nol', () => {
    expect(clockOffsetMs(undefined)).toBe(0);
    expect(clockOffsetMs('buzuq-sana')).toBe(0);
  });
});
