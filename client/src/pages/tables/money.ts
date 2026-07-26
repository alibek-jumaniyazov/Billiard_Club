/** InputNumber uchun ming ajratkichli pul formatlash (tables sahifasi) */

/**
 * Butun qismga ming ajratkich qo'yadi, kasr qismiga TEGMAYDI.
 * (Avvalgi versiya butun satrga regex qo'llab "1234.5678" ni "1 234.5 678"
 * ga aylantirib yuborardi.)
 */
export const moneyFormatter = (value?: string | number): string => {
  const raw = `${value ?? ''}`;
  if (raw === '') return '';
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const dot = body.indexOf('.');
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const rest = dot === -1 ? '' : body.slice(dot);
  return `${negative ? '-' : ''}${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${rest}`;
};

/**
 * Pul maydonini o'qish.
 *
 * MUHIM: noto'g'ri kiritilgan qiymat 0 GA AYLANTIRILMAYDI. Avval har qanday
 * o'qib bo'lmaydigan matn jimgina 0 bo'lardi — natijada "150 000" o'rniga
 * "150.000" yozilgan stol narxi 150 so'm bo'lib ketar, bo'sh maydon esa
 * `required` qoidasini chetlab o'tib 0 bo'lib saqlanardi.
 *  - bo'sh kiritma -> '' (rc-input-number qiymatni null qiladi -> `required` ishlaydi)
 *  - o'qib bo'lmaydigan kiritma -> NaN (rc-input-number oxirgi TO'G'RI qiymatni saqlaydi)
 * Vergul kasr ajratkichi sifatida qabul qilinadi (mahalliy klaviatura odati).
 */
export const moneyParser = (value?: string): number | string => {
  const cleaned = (value ?? '')
    .replace(/[\s  ]/g, '')
    .replace(',', '.');
  if (cleaned === '') return '';
  const n = Number(cleaned);
  return Number.isNaN(n) ? NaN : n;
};
