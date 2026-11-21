/**
 * SUMMA LIMITI ("50 000 so'mga o'ynayman") — limitni vaqtga aylantirish va tekshirish.
 *
 * Kassir o'yinni boshlashda vaqt o'rniga PUL kiritadi; shu pulga to'g'ri
 * keladigan vaqt stolning soatlik narxidan chiqadi: vaqt = limit / narx.
 * Limit faqat ogohlantirish chegarasi — hisob baribir haqiqiy vaqt bo'yicha.
 *
 * LOCKSTEP: chegaralar serverdagi qoidaning AYNAN nusxasi
 * (server/src/modules/sessions/session-limit.ts). Birini o'zgartirsangiz
 * ikkinchisini ham o'zgartiring — aks holda forma o'tkazgan qiymatni server
 * rad etadi (yoki aksincha).
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

export type LimitProblem = 'needsPrice' | 'tooSmall' | 'tooLarge';

/**
 * Limit shu narxda qabul qilinadimi. null — hammasi joyida.
 * Narxi 0 bo'lgan (bepul) stolda limitga hech qachon yetilmaydi.
 */
export const limitProblem = (limitAmount: number, pricePerHour: number): LimitProblem | null => {
  if (!(pricePerHour > 0)) return 'needsPrice';
  const { min, max } = limitBounds(pricePerHour);
  if (!(limitAmount >= min)) return 'tooSmall';
  if (limitAmount > max) return 'tooLarge';
  return null;
};

/** "Yumaloq" summalar zinapoyasi: 1, 2, 3, 5 × 10ⁿ (10 000, 20 000, 30 000, 50 000, 100 000 …) */
const NICE_STEPS = [1, 2, 3, 5];

/**
 * Tez tanlash summalari — kassir eng ko'p so'raladigan miqdorlarni bitta
 * bosishda kiritadi (telefonda klaviatura ochishga hojat qolmaydi).
 *
 * Stol narxiga moslanadi: taxminan 25 daqiqalik o'yindan boshlab ketma-ket
 * to'rtta yumaloq summa. Masalan 40 000/soat -> 20 000, 30 000, 50 000, 100 000;
 * 100 000/soat -> 50 000, 100 000, 200 000, 300 000. Valyutaga bog'liq emas
 * (10 $/soat -> 5, 10, 20, 30).
 */
export const quickLimitAmounts = (pricePerHour: number, count = 4): number[] => {
  if (!(pricePerHour > 0) || !Number.isFinite(pricePerHour)) return [];
  // 0.4 soatlik (24 daqiqa) summa. "* 2 / 5" — butun narxlarda ANIQ natija:
  // "* 0.4" 10 000 o'rniga 10000.000000000002 berib, yumaloq summani tashlab yuborishi mumkin
  const from = settle((pricePerHour * 2) / 5);
  const amounts: number[] = [];
  let exp = Math.floor(Math.log10(from));
  // Chegara: zinapoyaning 12 pog'onasi istalgan narx uchun yetarli
  for (let guard = 0; amounts.length < count && guard < 12; guard += 1, exp += 1) {
    for (const step of NICE_STEPS) {
      // Manfiy darajada bo'lish ishlatiladi: 3 * 10 ** -1 = 0.30000000000000004
      const value = exp >= 0 ? step * 10 ** exp : step / 10 ** -exp;
      if (amounts.length < count && value >= from && limitProblem(value, pricePerHour) === null) {
        amounts.push(value);
      }
    }
  }
  return amounts;
};

/** Limitga teng vaqt bo'laklari: "1 soat 15 daqiqa" ko'rinishi uchun */
export interface LimitDuration {
  hours: number;
  minutes: number;
  /** Faqat bir daqiqadan kam vaqt uchun ma'noli (aks holda ko'rsatilmaydi) */
  seconds: number;
  /** Vaqt butun daqiqaga teng emas — "≈" bilan ko'rsatiladi */
  approximate: boolean;
}

/**
 * Soniyalarni soat/daqiqaga ajratadi. Daqiqa PASTGA yaxlitlanadi: mijozga
 * va'da qilingan vaqt hech qachon haqiqiysidan ko'p ko'rsatilmasin.
 */
export const limitDuration = (totalSeconds: number): LimitDuration => {
  // settle: 2399.9999999999 kabi suzuvchi nuqta xatosi 39 daqiqa 59 soniya bo'lib qolmasin
  const total = Math.max(0, settle(totalSeconds));
  const whole = Math.floor(total);
  return {
    hours: Math.floor(whole / 3600),
    minutes: Math.floor((whole % 3600) / 60),
    seconds: whole % 60,
    approximate: whole % 60 !== 0 || total !== whole,
  };
};
