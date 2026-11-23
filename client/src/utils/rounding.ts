/**
 * STOLDA YIG'ILGAN PULNI YAXLITLASH — serverdagi
 * server/src/common/money/table-rounding.ts ning AYNAN nusxasi.
 *
 * Stol vaqti hisobi o'zgarmaydi (sekundlik aniq). Yaxlitlash faqat STOL
 * SUMMASIGA qo'llanadi — kartada, kassa oynasida, chekda va kassaga tushadigan
 * pulda eng yaqin yaxlit summa turadi: 46 800 → 47 000, 46 300 → 46 000,
 * 46 500 → 47 000 (yarmi yuqoriga). Bar summasi yaxlitlanmaydi.
 *
 * Qadam har o'yinga boshlanganda muhrlanadi (session.roundingStep) — barcha
 * kassalar bir xil summani ko'radi va server yakunni AYNAN shu bilan yozadi.
 */

/** Ruxsat etilgan qadamlar (valyuta birligida). 0 — yaxlitlash o'chiq. */
export const TABLE_ROUNDING_STEPS = [100, 500, 1000, 5000] as const;

/** Standart qadam — egasi yaxlitlashni yoqqanda birinchi tanlanadigan */
export const DEFAULT_ROUNDING_STEP = 1000;

/** Ro'yxatda yo'q har qanday qiymat (null, eski server, noto'g'ri son) — 0 */
export const normalizeRoundingStep = (value: unknown): number =>
  typeof value === 'number' && (TABLE_ROUNDING_STEPS as readonly number[]).includes(value)
    ? value
    : 0;

/**
 * Eng yaqin `step` ga yaxlitlash, yarmi yuqoriga. Hisob BUTUN TIYINLARDA —
 * suzuvchi nuqta shovqini (46 499,999…) yarim chegarani surib yubormaydi.
 * `step` 0 bo'lsa summa o'zgarmaydi.
 */
export const roundToStep = (amount: number, step: number): number => {
  if (!(step > 0) || !Number.isFinite(amount)) return amount;
  const cents = Math.round(amount * 100);
  const stepCents = Math.round(step * 100);
  return (Math.floor((cents + stepCents / 2) / stepCents) * stepCents) / 100;
};

/** Yaxlitlash farqi: yaxlit − aniq (+200 yoki −300), tiyingacha */
export const roundingDelta = (exact: number, step: number): number =>
  Math.round((roundToStep(exact, step) - exact) * 100) / 100;

/**
 * KO'RSATISH uchun aniq summa va farq. Ekranda pul butun so'mda turadi
 * (formatNumber), shuning uchun aniq summa ham butun so'mga keltiriladi va farq
 * SHUNDAN chiqariladi: "aniq 46 913 · +87" yig'indisi yaxlit 47 000 ga AYNAN
 * teng. Tiyinli qiymatlar (46 912,50 va +87,50) alohida yaxlitlansa ekranda
 * 46 913 + 88 = 47 001 bo'lib qolardi — mijoz chekda xato ko'rardi.
 * Bazadagi qiymatlar o'zgarmaydi (tiyingacha aniq saqlanadi).
 */
export const roundingForDisplay = (
  charged: number,
  exact: number,
): { exact: number; delta: number } => {
  const shownExact = Math.round(exact);
  return { exact: shownExact, delta: Math.round(charged) - shownExact };
};
