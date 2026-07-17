/**
 * Qo'llab-quvvatlanadigan vaqt mintaqalari (IANA nomlari).
 * Settings.timezone faqat shu ro'yxatdan qiymat qabul qiladi —
 * noto'g'ri qiymat SQL "AT TIME ZONE" hisob-kitoblarini buzmasligi uchun.
 */
export const SUPPORTED_TIMEZONES = [
  'Asia/Tashkent',
  'Asia/Samarkand',
  'Asia/Almaty',
  'Asia/Bishkek',
  'Asia/Dushanbe',
  'Asia/Ashgabat',
  'Asia/Baku',
  'Asia/Yerevan',
  'Asia/Tbilisi',
  'Europe/Moscow',
  'Asia/Yekaterinburg',
  'Asia/Novosibirsk',
  'Europe/Kiev',
  'Europe/Istanbul',
  'Asia/Dubai',
] as const;

export const DEFAULT_TIMEZONE = 'Asia/Tashkent';

/** Ro'yxatda bo'lmagan qiymat uchun xavfsiz standart qaytaradi */
export const safeTimezone = (value?: string | null): string =>
  value && (SUPPORTED_TIMEZONES as readonly string[]).includes(value) ? value : DEFAULT_TIMEZONE;
