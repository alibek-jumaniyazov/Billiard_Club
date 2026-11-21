/**
 * SUMMA LIMITI ("50 000 so'mga o'ynayman") — limitni vaqtga aylantirish va tekshirish.
 *
 * Limit plannedMinutes kabi faqat OGOHLANTIRISH chegarasi: stol summasi shu
 * qiymatga yetganda kassirga signal beriladi, hisob esa baribir haqiqiy vaqt
 * bo'yicha yuritiladi. Vaqt ekvivalenti = limit / soatlik narx.
 *
 * Chegaralar plannedMinutes bilan bir xil (5 daqiqa … 24 soat): juda kichik
 * qiymat deyarli doim terish xatosi ("50 000" o'rniga "50" — bunday limit bir
 * necha soniyada tugardi), juda kattasi esa ma'nosiz.
 *
 * LOCKSTEP: klient AYNAN shu qoidani ishlatadi (client/src/utils/limit.ts) —
 * kassir xatoni forma yuborilmasidan oldin ko'radi. Birini o'zgartirsangiz
 * ikkinchisini ham o'zgartiring.
 */

/** Limitga teng o'yin vaqti kamida shuncha daqiqa bo'lishi kerak */
export const LIMIT_MIN_MINUTES = 5;
/** ...va ko'pi bilan shuncha (24 soat) */
export const LIMIT_MAX_MINUTES = 1440;

/**
 * 2 kasr xonagacha YUQORIGA/PASTGA yaxlitlash. Avval 6 xonagacha yaxlitlanadi:
 * aks holda suzuvchi nuqta xatosi (5000.000000001) chegarani bir tiyinga
 * siljitib yuborardi.
 */
const settle = (n: number): number => Math.round(n * 1e6) / 1e6;
const ceil2 = (n: number): number => Math.ceil(settle(n * 100)) / 100;
const floor2 = (n: number): number => Math.floor(settle(n * 100)) / 100;

/** Limitga to'g'ri keladigan o'yin vaqti (soniya, kasr bilan); narx 0 bo'lsa null */
export const limitSeconds = (limitAmount: number, pricePerHour: number): number | null =>
  pricePerHour > 0 ? (limitAmount * 3600) / pricePerHour : null;

/** Shu narxda qabul qilinadigan eng kichik va eng katta limit */
export const limitBounds = (pricePerHour: number): { min: number; max: number } => ({
  min: ceil2((pricePerHour * LIMIT_MIN_MINUTES) / 60),
  max: floor2((pricePerHour * LIMIT_MAX_MINUTES) / 60),
});

export type LimitError =
  | { key: 'sessions.limitNeedsPrice' }
  | { key: 'sessions.limitTooSmall'; min: number }
  | { key: 'sessions.limitTooLarge'; max: number };

/**
 * Limit shu narxda qabul qilinadimi. null — hammasi joyida.
 * Narxi 0 bo'lgan (bepul) stolda limitga hech qachon yetilmaydi — rad etiladi.
 */
export const checkLimitAmount = (limitAmount: number, pricePerHour: number): LimitError | null => {
  if (!(pricePerHour > 0)) return { key: 'sessions.limitNeedsPrice' };
  const { min, max } = limitBounds(pricePerHour);
  if (!(limitAmount >= min)) return { key: 'sessions.limitTooSmall', min };
  if (limitAmount > max) return { key: 'sessions.limitTooLarge', max };
  return null;
};
