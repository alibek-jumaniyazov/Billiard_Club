import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  isStepMultiple,
  normalizeRoundingStep,
  roundToStep,
  settleTableRounding,
} from '../src/common/money/table-rounding';
import { UpdateSettingsDto } from '../src/modules/settings/dto/settings.dto';

/**
 * "Stolda yig'ilgan pulni yaxlitlash" formulasi. Shu jadval klientdagi
 * nusxa testida ham AYNAN takrorlanadi (client/src/utils/rounding.test.ts):
 * kartadagi summa bilan kassaga yoziladigan summa bir xil bo'lishi shart.
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

test('roundToStep: eng yaqin yaxlit summa, yarmi yuqoriga', () => {
  for (const [amount, step, expected] of CASES) {
    assert.equal(roundToStep(amount, step), expected, `${amount} / ${step}`);
  }
});

test('normalizeRoundingStep: faqat ruxsat etilgan qadamlar, qolgani 0', () => {
  for (const step of [100, 500, 1000, 5000]) assert.equal(normalizeRoundingStep(step), step);
  for (const bad of [0, 7, 250, 10000, -1000, '1000', null, undefined, Number.NaN]) {
    assert.equal(normalizeRoundingStep(bad), 0, String(bad));
  }
});

test('isStepMultiple', () => {
  assert.equal(isStepMultiple(47000, 1000), true);
  assert.equal(isStepMultiple(0, 1000), true);
  assert.equal(isStepMultiple(46800, 1000), false);
  assert.equal(isStepMultiple(46500, 500), true);
  assert.equal(isStepMultiple(46500, 0), false);
});

test('settleTableRounding: oddiy yaxlitlash va farq', () => {
  assert.deepEqual(settleTableRounding(46800, 1000), { amount: 47000, rounding: 200 });
  assert.deepEqual(settleTableRounding(46300, 1000), { amount: 46000, rounding: -300 });
  assert.deepEqual(settleTableRounding(46812.5, 0), { amount: 46812.5, rounding: 0 });
  // O'chiq yaxlitlashda kassir ko'rgan summa ham e'tiborga olinmaydi
  assert.deepEqual(settleTableRounding(46812.5, 0, 46000, 500), { amount: 46812.5, rounding: 0 });
});

test('settleTableRounding: chegaradan endigina o‘tgan summa — kassir ko‘rgani qabul qilinadi', () => {
  // Ekranda 46 000 edi (aniq 46 499), server yozganda 46 504 bo'ldi
  assert.deepEqual(settleTableRounding(46504.17, 1000, 46000, 500), { amount: 46000, rounding: -504.17 });
  // Bir xil qiymat — o'zgarishsiz
  assert.deepEqual(settleTableRounding(46800, 1000, 47000, 500), { amount: 47000, rounding: 200 });
});

test('settleTableRounding: eski, oshirilgan yoki yaxlit bo‘lmagan summa rad etiladi', () => {
  // Juda eski ekran: 46 000 endi oynadan tashqarida (aniq 47 604, oyna 500)
  assert.deepEqual(settleTableRounding(47604, 1000, 46000, 500), { amount: 48000, rounding: 396 });
  // Serverdagidan KATTA summa hech qachon olinmaydi
  assert.deepEqual(settleTableRounding(46300, 1000, 47000, 500), { amount: 46000, rounding: -300 });
  // Qadamga karrali emas — yaxlitlangan qiymat emas
  assert.deepEqual(settleTableRounding(46504, 1000, 46504, 500), { amount: 47000, rounding: 496 });
  // Manfiy yoki NaN
  assert.deepEqual(settleTableRounding(46504, 1000, Number.NaN, 500), { amount: 47000, rounding: 496 });
});

test('UpdateSettingsDto: yaxlitlash qadami faqat ro‘yxatdan', async () => {
  for (const ok of [0, 100, 500, 1000, 5000]) {
    const errors = await validate(plainToInstance(UpdateSettingsDto, { tableRoundingStep: ok }));
    assert.equal(errors.length, 0, `${ok} qabul qilinishi kerak`);
  }
  for (const bad of [250, 700, 10000, -1000, 1000.5]) {
    const errors = await validate(plainToInstance(UpdateSettingsDto, { tableRoundingStep: bad }));
    assert.ok(errors.length > 0, `${bad} rad etilishi kerak`);
  }
});
