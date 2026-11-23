/**
 * STOLDA YIG'ILGAN PULNI YAXLITLASH (Sozlamalar → Hisob-kitob).
 *
 * Stol vaqti hisobi o'zgarmaydi — u avvalgidek SEKUNDLIK aniq yuritiladi.
 * Yaxlitlash faqat STOL SUMMASINING o'ziga qo'llanadi: kartada, chekda va
 * kassaga tushadigan pulda eng yaqin yaxlit summa turadi:
 *   46 800 → 47 000,  46 300 → 46 000,  46 500 → 47 000 (yarmi — yuqoriga).
 * Bar (buyurtmalar) summasi yaxlitlanmaydi — mahsulot narxlari o'zi aniq.
 *
 * Aniq summa yo'qolmaydi: farq (yaxlit − aniq) sessiyaning `tableRounding`
 * ustunida saqlanadi va chekda, o'yinlar tarixida, hisobotda ko'rinadi.
 *
 * DIQQAT: klientdagi nusxa (client/src/utils/rounding.ts) AYNAN shu formula —
 * kartadagi summa bilan kassaga yoziladigan summa bir so'mga ham farq qilmasin.
 */

/** Ruxsat etilgan qadamlar (valyuta birligida). 0 — yaxlitlash o'chiq. */
export const TABLE_ROUNDING_STEPS = [100, 500, 1000, 5000] as const;

/** Sozlama va sessiya ustunidagi qiymatlar: 0 yoki ruxsat etilgan qadam */
export const TABLE_ROUNDING_VALUES: readonly number[] = [0, ...TABLE_ROUNDING_STEPS];

/**
 * Bazadan/so'rovdan kelgan qiymatni ishonchli qadamga keltiradi: ro'yxatda
 * yo'q har qanday qiymat (null, satr, manfiy) — 0, ya'ni yaxlitlash yo'q.
 */
export const normalizeRoundingStep = (value: unknown): number =>
  typeof value === 'number' && (TABLE_ROUNDING_STEPS as readonly number[]).includes(value)
    ? value
    : 0;

/**
 * Eng yaqin `step` ga yaxlitlash, yarmi yuqoriga.
 *
 * Hisob BUTUN TIYINLARDA: avval summa tiyinga keltiriladi (round2 bilan bir
 * xil), so'ng butun sonlar ustida yaxlitlanadi — suzuvchi nuqta shovqini
 * (46 499,999…) yarim chegarani hech qachon u yoki bu tomonga surib yubormaydi.
 * `step` 0 yoki noto'g'ri bo'lsa summa o'zgarmaydi.
 */
export const roundToStep = (amount: number, step: number): number => {
  if (!(step > 0) || !Number.isFinite(amount)) return amount;
  const cents = Math.round(amount * 100);
  const stepCents = Math.round(step * 100);
  return (Math.floor((cents + stepCents / 2) / stepCents) * stepCents) / 100;
};

/** Summa qadamga karralimi (masalan 47 000 — 1 000 ga karrali) */
export const isStepMultiple = (amount: number, step: number): boolean => {
  if (!(step > 0) || !Number.isFinite(amount)) return false;
  return Math.round(amount * 100) % Math.round(step * 100) === 0;
};

/**
 * YAKUNIY stol summasi (hisob-kitob paytida).
 *
 * Odatda — aniq summaning yaxlit qiymati. Lekin kassir "Yakunlash" tugmasini
 * bosgan oni bilan server hisobni yozgan oni orasida taymer bir necha soniya
 * yuradi; shu oraliqda yaxlitlash chegarasidan o'tib ketsa (46 499 → 46 501),
 * ekranda 46 000 turgan bo'lsa ham server 47 000 yozib qo'yardi — kassadagi
 * pul ekrandagidan farq qiladi. Shuning uchun kassir ko'rgan yaxlit summa
 * (`expected`) qabul qilinadi, lekin FAQAT:
 *   - qadamga karrali bo'lsa (yaxlitlangan qiymat ekani aniq);
 *   - [yaxlit(aniq − graceAmount), yaxlit(aniq)] oralig'ida bo'lsa — ya'ni
 *     u yaqin o'tmishdagi haqiqiy summaning yaxlit qiymati. Taymer faqat
 *     o'sadi, shuning uchun serverdagidan KATTA qiymat hech qachon olinmaydi.
 * Aks holda `expected` e'tiborga olinmaydi (eski yoki soxta ekran).
 *
 * `rounding` — yaxlit − aniq (kassaga ustama +200 yoki chegirma −300).
 */
export const settleTableRounding = (
  exact: number,
  step: number,
  expected?: number,
  graceAmount = 0,
): { amount: number; rounding: number } => {
  if (!(step > 0)) return { amount: exact, rounding: 0 };
  const rounded = roundToStep(exact, step);
  let amount = rounded;
  if (expected !== undefined && Number.isFinite(expected) && isStepMultiple(expected, step)) {
    const lowest = roundToStep(Math.max(0, exact - Math.max(0, graceAmount)), step);
    const shown = Math.round(expected * 100) / 100;
    if (shown >= lowest && shown <= rounded) amount = shown;
  }
  return { amount, rounding: Math.round((amount - exact) * 100) / 100 };
};
