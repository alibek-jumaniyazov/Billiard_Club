import { describe, expect, it } from 'vitest';
import {
  LIMIT_MAX_MINUTES,
  LIMIT_MIN_MINUTES,
  limitBounds,
  limitDuration,
  limitProblem,
  limitSeconds,
  quickLimitAmounts,
} from './limit';

/**
 * SUMMA LIMITI — "50 000 so'mga o'ynayman": pul stol narxi bo'yicha vaqtga
 * aylanadi. Chegaralar serverdagi qoidaning nusxasi
 * (server/src/modules/sessions/session-limit.ts, testi: server/test/session-limit.test.ts)
 * — bu yerdagi qiymatlar o'sha test bilan BIR XIL bo'lishi shart.
 */

describe('limitSeconds', () => {
  it('pul stol narxiga qarab vaqtga aylanadi', () => {
    // 40 000 so'm/soat stolda 50 000 so'm = 1 soat 15 daqiqa
    expect(limitSeconds(50_000, 40_000)).toBe(75 * 60);
    // 60 000 so'm/soat stolda o'sha pul — 50 daqiqa
    expect(limitSeconds(50_000, 60_000)).toBe(50 * 60);
    expect(limitSeconds(50_000, 35_000)).toBeCloseTo(5142.857, 3);
  });

  it('bepul stolda (narx 0) limitga hech qachon yetilmaydi', () => {
    expect(limitSeconds(50_000, 0)).toBeNull();
    expect(limitProblem(50_000, 0)).toBe('needsPrice');
  });
});

describe('limitBounds va limitProblem (server bilan lockstep)', () => {
  it('chegaralar: kamida 5 daqiqalik, ko‘pi bilan 24 soatlik summa', () => {
    expect(LIMIT_MIN_MINUTES).toBe(5);
    expect(LIMIT_MAX_MINUTES).toBe(1440);
    expect(limitBounds(60_000)).toEqual({ min: 5_000, max: 1_440_000 });
    // 5 daqiqa = 3 333,33… -> tiyingacha YUQORIGA
    expect(limitBounds(40_000)).toEqual({ min: 3_333.34, max: 960_000 });
  });

  it('chegaradagi qiymatlar o‘tadi, tashqarisi sababi bilan rad etiladi', () => {
    expect(limitProblem(5_000, 60_000)).toBeNull();
    expect(limitProblem(1_440_000, 60_000)).toBeNull();
    expect(limitProblem(50_000, 40_000)).toBeNull();
    // Eng ko'p uchraydigan xato: "50 000" o'rniga "50"
    expect(limitProblem(50, 40_000)).toBe('tooSmall');
    expect(limitProblem(4_999.99, 60_000)).toBe('tooSmall');
    expect(limitProblem(1_440_000.01, 60_000)).toBe('tooLarge');
    expect(limitProblem(Number.NaN, 40_000)).toBe('tooSmall');
  });

  it('qabul qilingan chegara summalari haqiqatan 5 daqiqa … 24 soat oralig‘ida', () => {
    for (const price of [7_000, 12_500, 25_000, 33_333, 40_000, 99_999, 150_000, 12.5]) {
      const { min, max } = limitBounds(price);
      expect(limitSeconds(min, price)!).toBeGreaterThanOrEqual(LIMIT_MIN_MINUTES * 60);
      expect(limitSeconds(max, price)!).toBeLessThanOrEqual(LIMIT_MAX_MINUTES * 60);
      expect(limitProblem(min, price)).toBeNull();
      expect(limitProblem(max, price)).toBeNull();
    }
  });
});

describe('quickLimitAmounts', () => {
  it('stol narxiga mos yumaloq summalar', () => {
    expect(quickLimitAmounts(40_000)).toEqual([20_000, 30_000, 50_000, 100_000]);
    expect(quickLimitAmounts(20_000)).toEqual([10_000, 20_000, 30_000, 50_000]);
    expect(quickLimitAmounts(60_000)).toEqual([30_000, 50_000, 100_000, 200_000]);
    expect(quickLimitAmounts(100_000)).toEqual([50_000, 100_000, 200_000, 300_000]);
    // Valyutaga bog'liq emas: 10 $/soat
    expect(quickLimitAmounts(10)).toEqual([5, 10, 20, 30]);
  });

  it('so‘ralgan sondagina summa qaytaradi', () => {
    expect(quickLimitAmounts(40_000, 3)).toEqual([20_000, 30_000, 50_000]);
  });

  it('har bir summa formadan o‘tadi (chegara ichida) va o‘sish tartibida', () => {
    for (const price of [3_000, 7_000, 18_000, 25_000, 45_000, 80_000, 150_000, 400_000, 2.5, 12.5]) {
      const amounts = quickLimitAmounts(price);
      expect(amounts).toHaveLength(4);
      amounts.forEach((amount, index) => {
        expect(limitProblem(amount, price)).toBeNull();
        if (index > 0) expect(amount).toBeGreaterThan(amounts[index - 1]);
        // Suzuvchi nuqta "dumi" yo'q (0.30000000000000004 kabi)
        expect(Math.round(amount * 100) / 100).toBe(amount);
      });
      // Birinchisi taxminan 25–60 daqiqalik o'yin — juda mayda emas
      expect(limitSeconds(amounts[0], price)!).toBeGreaterThanOrEqual(24 * 60);
      expect(limitSeconds(amounts[0], price)!).toBeLessThanOrEqual(60 * 60);
    }
  });

  it('bepul yoki yaroqsiz narxda tugmalar yo‘q', () => {
    expect(quickLimitAmounts(0)).toEqual([]);
    expect(quickLimitAmounts(-5)).toEqual([]);
    expect(quickLimitAmounts(Number.NaN)).toEqual([]);
    expect(quickLimitAmounts(Number.POSITIVE_INFINITY)).toEqual([]);
  });
});

describe('limitDuration', () => {
  it('butun daqiqaga teng vaqt aniq ko‘rsatiladi', () => {
    expect(limitDuration(75 * 60)).toEqual({ hours: 1, minutes: 15, seconds: 0, approximate: false });
    expect(limitDuration(50 * 60)).toEqual({ hours: 0, minutes: 50, seconds: 0, approximate: false });
  });

  it('butun bo‘lmagan vaqt PASTGA yaxlitlanadi va "taxminan" deb belgilanadi', () => {
    // 50 000 / 35 000 soat = 1 soat 25 daqiqa 42,86 soniya
    expect(limitDuration(5142.857)).toEqual({ hours: 1, minutes: 25, seconds: 42, approximate: true });
    expect(limitDuration(59.4)).toEqual({ hours: 0, minutes: 0, seconds: 59, approximate: true });
  });

  it('suzuvchi nuqta xatosi butun daqiqani buzmaydi', () => {
    const fortyMinutes = { hours: 0, minutes: 40, seconds: 0, approximate: false };
    // Bo'lishdan qolgan "dum" (2400.0000000001) — "taxminan" emas
    expect(limitDuration(2400.0000000001)).toEqual(fortyMinutes);
    // ...va 2399.9999999999 — 39 daqiqa 59 soniya emas
    expect(limitDuration(2399.9999999999)).toEqual(fortyMinutes);
  });

  it('manfiy qiymat nolga tenglashtiriladi', () => {
    expect(limitDuration(-10)).toEqual({ hours: 0, minutes: 0, seconds: 0, approximate: false });
  });
});
