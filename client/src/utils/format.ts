/** Yagona pul/vaqt formatlash — sahifalar bo'ylab bir xil ko'rinish */

const numberFormat = new Intl.NumberFormat('ru-RU');

/** 150000 -> "150 000" (valyuta belgisiz — belgi t('common.sum') dan olinadi) */
export const formatNumber = (amount: number | null | undefined): string =>
  numberFormat.format(Math.round(amount ?? 0));

/**
 * Standart valyuta belgisi — AppSettingsContext klub sozlamasidan (yoki
 * t('common.sum') zaxirasidan) o'rnatadi. React'dan tashqaridagi formatlash
 * ham bir xil belgini ishlatishi uchun modul darajasida saqlanadi.
 */
let defaultCurrencySymbol = "so'm";

/** Klub valyuta belgisini o'rnatadi (bo'sh qiymat e'tiborsiz qoldiriladi) */
export const setDefaultCurrencySymbol = (symbol: string): void => {
  const next = symbol.trim();
  if (next) defaultCurrencySymbol = next;
};

/** 150000 -> "150 000 so'm" */
export const formatMoney = (
  amount: number | null | undefined,
  symbol = defaultCurrencySymbol,
): string => `${formatNumber(amount)} ${symbol}`;

/**
 * InputNumber uchun ming ajratkichli pul formatlash — narx maydonlari boshqa
 * pul maydonlari bilan bir xil ko'rinsin (bitta ortiqcha nol darrov sezilsin).
 * Butun qismga ajratkich qo'yadi, kasr qismiga TEGMAYDI (butun satrga regex
 * qo'llansa "1234.5678" -> "1 234.5 678" bo'lib buzilardi).
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
 * Pul maydonini o'qish (moneyFormatter juftligi).
 *
 * MUHIM: noto'g'ri kiritilgan qiymat 0 GA AYLANTIRILMAYDI:
 *  - bo'sh kiritma -> '' (rc-input-number qiymatni null qiladi -> `required` ishlaydi)
 *  - o'qib bo'lmaydigan kiritma -> NaN (rc-input-number oxirgi TO'G'RI qiymatni saqlaydi)
 * Vergul kasr ajratkichi sifatida qabul qilinadi (mahalliy klaviatura odati).
 * `\s` uzilmas bo'shliqlarni (U+00A0, U+202F) ham qamrab oladi.
 */
export const moneyParser = (value?: string): number | string => {
  const cleaned = (value ?? '').replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return '';
  const n = Number(cleaned);
  return Number.isNaN(n) ? NaN : n;
};

/** 95 (daqiqa) -> "1 s 35 daq" */
export const formatDuration = (
  minutes: number | null | undefined,
  hourLabel = 's',
  minuteLabel = 'daq',
): string => {
  const total = Math.max(0, Math.round(minutes ?? 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} ${minuteLabel}`;
  return `${h} ${hourLabel} ${m} ${minuteLabel}`;
};

/** Millisekundlarni HH:MM:SS ga aylantiradi (jonli taymer uchun) */
export const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/** Soniyalarni HH:MM:SS ga aylantiradi (server durationSeconds uchun) */
export const formatSeconds = (seconds: number | null | undefined): string =>
  formatElapsed(Math.max(0, seconds ?? 0) * 1000);

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ISO sana -> "HH:mm" (mahalliy vaqt) — "boshlandi" yorlig'i uchun */
export const formatClock = (iso: string | number | Date | null | undefined): string => {
  if (iso == null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/**
 * Xabar matnini normallashtirish: CRLF -> LF, satr oxiridagi bo'shliqlar
 * olib tashlanadi, 3 va undan ortiq ketma-ket bo'sh satr ikkitaga
 * qisqartiriladi. `white-space: pre-wrap` bilan birga ishlatiladi — ataylab
 * qo'yilgan xat boshi va abzatslar SAQLANADI, faqat tasodifiy "shovqin"
 * tozalanadi (nusxa-ko'chirilgan matnlar odatda shundan aziyat chekadi).
 */
export const normalizeMessageBody = (body: string | null | undefined): string =>
  (body ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Sana guruhi kaliti — i18n da `notifications.group.<key>` */
export type DateGroupKey = 'today' | 'yesterday' | 'week' | 'earlier';

/**
 * ISO sana -> guruh kaliti. dayjs isToday/isYesterday plaginlarisiz:
 * kun chegarasi bo'yicha oddiy taqqoslash yetarli va bog'liqlik qo'shmaydi.
 */
export const dateGroupKey = (iso: string | number | Date): DateGroupKey => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'earlier';

  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 7) return 'week';
  return 'earlier';
};

/** ISO sana -> "DD.MM.YYYY HH:mm" (chek/chop etish uchun) */
export const formatDateTime = (iso: string | number | Date | null | undefined): string => {
  if (iso == null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
};
