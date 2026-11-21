import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkLimitAmount,
  limitBounds,
  limitSeconds,
  LIMIT_MAX_MINUTES,
  LIMIT_MIN_MINUTES,
} from '../src/modules/sessions/session-limit';

/**
 * SUMMA LIMITI — "50 000 so'mga o'ynayman": limit vaqtga stol narxi bo'yicha
 * aylantiriladi. Klient (client/src/utils/limit.ts) AYNAN shu qoidani
 * ishlatadi — bu testlar ikkala tomonning umumiy shartnomasi.
 */

test("limit stol narxiga qarab vaqtga aylanadi", () => {
  // 40 000 so'm/soat stolda 50 000 so'm = 1 soat 15 daqiqa
  assert.equal(limitSeconds(50_000, 40_000), 75 * 60);
  // 60 000 so'm/soat stolda o'sha pul — 50 daqiqa
  assert.equal(limitSeconds(50_000, 60_000), 50 * 60);
  // Butun daqiqaga teng bo'lmagan holat ham aniq (kasr soniyalar bilan)
  assert.ok(Math.abs(limitSeconds(50_000, 35_000)! - 5142.857) < 0.001);
});

test('bepul stolda (narx 0) limitga hech qachon yetilmaydi', () => {
  assert.equal(limitSeconds(50_000, 0), null);
  assert.deepEqual(checkLimitAmount(50_000, 0), { key: 'sessions.limitNeedsPrice' });
});

test("chegaralar: kamida 5 daqiqalik, ko'pi bilan 24 soatlik summa", () => {
  assert.equal(LIMIT_MIN_MINUTES, 5);
  assert.equal(LIMIT_MAX_MINUTES, 1440);
  // 60 000/soat: 5 daqiqa = 5 000, 24 soat = 1 440 000 (aniq qiymatlar)
  assert.deepEqual(limitBounds(60_000), { min: 5_000, max: 1_440_000 });
  // 40 000/soat: 5 daqiqa = 3 333,33… -> tiyingacha YUQORIGA (aks holda 5 daqiqadan kam chiqardi)
  assert.deepEqual(limitBounds(40_000), { min: 3_333.34, max: 960_000 });
});

test('chegaradagi qiymatlar qabul qilinadi, tashqarisi — aniq sabab bilan rad etiladi', () => {
  assert.equal(checkLimitAmount(5_000, 60_000), null);
  assert.equal(checkLimitAmount(1_440_000, 60_000), null);
  assert.equal(checkLimitAmount(50_000, 40_000), null);

  // Eng ko'p uchraydigan xato: "50 000" o'rniga "50" terilgan
  assert.deepEqual(checkLimitAmount(50, 40_000), { key: 'sessions.limitTooSmall', min: 3_333.34 });
  assert.deepEqual(checkLimitAmount(4_999.99, 60_000), { key: 'sessions.limitTooSmall', min: 5_000 });
  assert.deepEqual(checkLimitAmount(1_440_000.01, 60_000), {
    key: 'sessions.limitTooLarge',
    max: 1_440_000,
  });
});

test("yaroqsiz son (NaN) limit sifatida o'tmaydi", () => {
  assert.equal(checkLimitAmount(Number.NaN, 40_000)?.key, 'sessions.limitTooSmall');
});

test("qabul qilingan eng kichik limit haqiqatan kamida 5 daqiqalik o'yinga teng", () => {
  for (const price of [7_000, 12_500, 25_000, 33_333, 40_000, 99_999, 150_000, 12.5]) {
    const { min, max } = limitBounds(price);
    assert.ok(limitSeconds(min, price)! >= LIMIT_MIN_MINUTES * 60, `min @ ${price}`);
    assert.ok(limitSeconds(max, price)! <= LIMIT_MAX_MINUTES * 60, `max @ ${price}`);
    assert.equal(checkLimitAmount(min, price), null);
    assert.equal(checkLimitAmount(max, price), null);
  }
});
