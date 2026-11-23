import { describe, expect, it } from 'vitest';
import {
  normalizeRoundingStep,
  roundingDelta,
  roundingForDisplay,
  roundToStep,
  TABLE_ROUNDING_STEPS,
} from './rounding';
import { sessionChargeAmount, sessionLimitLeftMs, type SessionTiming } from './session';

/**
 * "Stolda yig'ilgan pulni yaxlitlash" — klient nusxasi.
 *
 * Jadval serverdagi test bilan AYNAN bir xil (server/test/table-rounding.test.ts):
 * kartada ko'rinadigan summa kassaga yoziladigan summaga bir so'mga ham farq
 * qilmasligi shart.
 */
const CASES: Array<[amount: number, step: number, expected: number]> = [
  // Egasining misollari
  [46800, 1000, 47000],
  [46300, 1000, 46000],
  // Yarmi — yuqoriga; yarmidan bir tiyin kam — pastga
  [46500, 1000, 47000],
  [46499.99, 1000, 46000],
  [46500.01, 1000, 47000],
  // Qisqa o'yin
  [0, 1000, 0],
  [250, 1000, 0],
  [499.99, 1000, 0],
  [500, 1000, 1000],
  // Boshqa qadamlar
  [46400, 500, 46500],
  [46150, 500, 46000],
  [46250, 500, 46500],
  [46080, 100, 46100],
  [46030, 100, 46000],
  [49000, 5000, 50000],
  [46500, 5000, 45000],
  [47500, 5000, 50000],
  // Sekundlik hisobdan chiqadigan kasr summalar (15 000/soat)
  [3333.33, 1000, 3000],
  [41666.67, 1000, 42000],
  // Yaxlitlash o'chiq — summa o'zgarmaydi
  [46812.5, 0, 46812.5],
];

describe('roundToStep (server bilan bir xil jadval)', () => {
  it.each(CASES)('%d / %d → %d', (amount, step, expected) => {
    expect(roundToStep(amount, step)).toBe(expected);
  });

  it('ruxsat etilgan qadamlar server ro‘yxati bilan bir xil', () => {
    expect([...TABLE_ROUNDING_STEPS]).toEqual([100, 500, 1000, 5000]);
  });
});

describe('normalizeRoundingStep', () => {
  it('faqat ruxsat etilgan qadamlar, qolgani 0 (eski server, buzuq qiymat)', () => {
    for (const step of TABLE_ROUNDING_STEPS) expect(normalizeRoundingStep(step)).toBe(step);
    for (const bad of [0, 7, 250, 10000, -1000, '1000', null, undefined, Number.NaN]) {
      expect(normalizeRoundingStep(bad)).toBe(0);
    }
  });
});

describe('roundingDelta', () => {
  it('yaxlit − aniq, tiyingacha', () => {
    expect(roundingDelta(46800, 1000)).toBe(200);
    expect(roundingDelta(46300, 1000)).toBe(-300);
    expect(roundingDelta(46812.5, 0)).toBe(0);
  });
});

describe('roundingForDisplay — chekdagi arifmetika butun so‘mda to‘g‘ri', () => {
  it('tiyinli aniq summa: ko‘rinadigan aniq + farq = yaxlit summa', () => {
    // Bazada: aniq 46 912,50 va +87,50. Alohida yaxlitlansa 46 913 + 88 = 47 001 bo'lardi
    expect(roundingForDisplay(47000, 46912.5)).toEqual({ exact: 46913, delta: 87 });
    expect(roundingForDisplay(46000, 46300.4)).toEqual({ exact: 46300, delta: -300 });
  });

  it('har qanday kasr summada yig‘indi aynan yaxlit summaga teng', () => {
    for (let cents = 4_650_000; cents < 4_660_000; cents += 37) {
      const exact = cents / 100;
      const charged = roundToStep(exact, 1000);
      const shown = roundingForDisplay(charged, exact);
      expect(shown.exact + shown.delta).toBe(charged);
    }
  });
});

describe('sessionChargeAmount — kartadagi va kassadagi summa', () => {
  const START = '2026-08-04T06:00:00Z';
  const at = (seconds: number) => Date.parse(START) + seconds * 1000;
  const timing = (extra: Partial<SessionTiming> & { roundingStep?: number; limitAmount?: number | null } = {}) => ({
    startTime: START,
    status: 'active' as const,
    pausedAt: null,
    totalPausedMs: 0,
    pricePerHour: 15000,
    ...extra,
  });

  it('qadam bo‘lmasa — aniq sekundlik summa (avvalgi xatti-harakat)', () => {
    // 15 000/soat × 11 232 soniya = 46 800
    expect(sessionChargeAmount(timing(), 15000, at(11232))).toBe(46800);
    expect(sessionChargeAmount(timing({ roundingStep: 0 }), 15000, at(11232))).toBe(46800);
  });

  it('1000 qadam: 46 800 → 47 000, 46 300 → 46 000', () => {
    expect(sessionChargeAmount(timing({ roundingStep: 1000 }), 15000, at(11232))).toBe(47000);
    expect(sessionChargeAmount(timing({ roundingStep: 1000 }), 15000, at(11112))).toBe(46000);
  });

  it('transfer (segmentlar) bilan ham jami summa yaxlitlanadi', () => {
    const segments = [
      { tableId: 1, pricePerHour: 15000, startedAt: START, endedAt: '2026-08-04T07:00:00Z', pausedMs: 0 },
      { tableId: 2, pricePerHour: 30000, startedAt: '2026-08-04T07:00:00Z', endedAt: null, pausedMs: 0 },
    ];
    // 15 000 (1 soat) + 30 000 × 25 daqiqa 36 soniya (12 800) = 27 800 → 28 000
    expect(sessionChargeAmount(timing({ roundingStep: 1000 }), 15000, at(3600 + 1536), segments)).toBe(28000);
  });

  it('summa limiti ANIQ summa bo‘yicha qoladi — yaxlitlash o‘yin vaqtini qisqartirmaydi', () => {
    const limited = timing({ roundingStep: 1000, limitAmount: 50000 });
    // Aniq 49 500 da kartada allaqachon 50 000, lekin limit hali tugamagan
    const almost = at(11880); // 15 000 × 11 880 / 3600 = 49 500
    expect(sessionChargeAmount(limited, 15000, almost)).toBe(50000);
    expect(sessionLimitLeftMs(limited, 15000, almost)).toBeGreaterThan(0);
    expect(sessionLimitLeftMs(limited, 15000, at(12000))).toBeLessThanOrEqual(0);
  });
});
