/**
 * Klub egasi botining matn yordamchilari — SOF funksiyalar (testlanadi).
 * Telegram HTML rejimi: dinamik matn faqat `esc()` orqali qo'yiladi.
 */

export type BotLang = 'uz' | 'ru';

export const botLang = (value: unknown): BotLang => (value === 'ru' ? 'ru' : 'uz');

/** HTML parse_mode uchun xavfsiz matn */
export const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Bo'linmaydigan bo'shliq — summa qator oxirida bo'linib ketmasin */
const NBSP = ' ';

/** 1250000 -> "1 250 000"; manfiy son haqiqiy minus belgisi bilan */
export const formatNumber = (value: number): string => {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  const sign = rounded < 0 ? '−' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
};

export const formatMoney = (value: number, symbol: string): string =>
  `${formatNumber(value)}${NBSP}${esc(symbol)}`;

/** Ishorali summa: +120 000 / −20 000 (kassa farqi kabi) */
export const formatSigned = (value: number, symbol: string): string =>
  `${value > 0 ? '+' : ''}${formatMoney(value, symbol)}`;

/** Davomiylik: "1 soat 12 daq" / "1 ч 12 мин" */
export const formatDuration = (totalSeconds: number, lang: BotLang): string => {
  const minutes = Math.max(0, Math.round((Number.isFinite(totalSeconds) ? totalSeconds : 0) / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = lang === 'ru' ? 'ч' : 'soat';
  const m = lang === 'ru' ? 'мин' : 'daq';
  if (hours === 0) return `${rest}${NBSP}${m}`;
  if (rest === 0) return `${hours}${NBSP}${h}`;
  return `${hours}${NBSP}${h} ${rest}${NBSP}${m}`;
};

/** Jonli taymer ko'rinishi: 1:05 (soat:daqiqa) */
export const formatClockDuration = (totalSeconds: number): string => {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
};

const MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const MONTHS_RU_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const WEEKDAYS_UZ = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const WEEKDAYS_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export interface DayParts {
  year: number;
  month: number;
  day: number;
}

/** Kalendar bo'yicha kun qo'shish (oy/yil chegarasi to'g'ri o'tadi) */
export const addDays = (d: DayParts, delta: number): DayParts => {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + delta));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
};

export const dayKey = (d: DayParts): string =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

export const parseDayKey = (key: string): DayParts => {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number);
  return { year, month, day };
};

/** 0 — yakshanba ... 6 — shanba */
export const weekday = (d: DayParts): number => new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();

export const weekdayName = (d: DayParts, lang: BotLang): string =>
  (lang === 'ru' ? WEEKDAYS_RU : WEEKDAYS_UZ)[weekday(d)];

/** "23-noyabr, yakshanba" / "23 ноября, воскресенье" */
export const formatDayLabel = (d: DayParts, lang: BotLang): string =>
  lang === 'ru'
    ? `${d.day} ${MONTHS_RU_GEN[d.month - 1]}, ${WEEKDAYS_RU[weekday(d)]}`
    : `${d.day}-${MONTHS_UZ[d.month - 1]}, ${WEEKDAYS_UZ[weekday(d)]}`;

/** "17–23-noyabr" / "17–23 ноября" (oy almashsa ikkalasi yoziladi) */
export const formatRangeLabel = (from: DayParts, to: DayParts, lang: BotLang): string => {
  const sameMonth = from.month === to.month && from.year === to.year;
  if (lang === 'ru') {
    return sameMonth
      ? `${from.day}–${to.day} ${MONTHS_RU_GEN[to.month - 1]}`
      : `${from.day} ${MONTHS_RU_GEN[from.month - 1]} – ${to.day} ${MONTHS_RU_GEN[to.month - 1]}`;
  }
  return sameMonth
    ? `${from.day}–${to.day}-${MONTHS_UZ[to.month - 1]}`
    : `${from.day}-${MONTHS_UZ[from.month - 1]} – ${to.day}-${MONTHS_UZ[to.month - 1]}`;
};

/** Oy nomi bosh harf bilan: "Noyabr" / "Ноябрь" */
export const monthName = (month: number, lang: BotLang): string => {
  const name = (lang === 'ru' ? MONTHS_RU : MONTHS_UZ)[month - 1] ?? '';
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** O'zgarish foizi: "▲ 12%", "▼ 5%"; taqqoslab bo'lmasa null */
export const formatChange = (current: number, previous: number): string | null => {
  if (!(previous > 0) || !Number.isFinite(current)) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return '= 0%';
  return pct > 0 ? `▲ ${pct}%` : `▼ ${Math.abs(pct)}%`;
};

/** 'HH:MM' ni daqiqaga aylantiradi (noto'g'ri bo'lsa null) */
export const parseClock = (value: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Berilgan onning mintaqadagi soat:daqiqasi (daqiqalarda) */
export const localMinutes = (tz: string, at: Date): number => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
};

/** Mintaqadagi soat: "14:32" */
export const formatLocalTime = (tz: string, at: Date): string => {
  const minutes = localMinutes(tz, at);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

/**
 * Telegram xabari 4096 belgidan oshmasin: uzun matn QATOR chegarasida bo'linadi
 * (bizning teglar har doim bitta qator ichida yopiladi, shuning uchun HTML buzilmaydi).
 */
export const splitMessage = (html: string, max = 3900): string[] => {
  if (html.length <= max) return [html];
  const parts: string[] = [];
  let current = '';
  for (const line of html.split('\n')) {
    const piece = line.length > max ? `${line.slice(0, max - 1)}…` : line;
    if (current && current.length + 1 + piece.length > max) {
      parts.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) parts.push(current);
  return parts;
};
