import type { TFunction } from 'i18next';
import { formatNumber } from '../../utils/format';
import {
  LIMIT_MAX_MINUTES,
  LIMIT_MIN_MINUTES,
  limitBounds,
  limitDuration,
  limitProblem,
} from '../../utils/limit';

/**
 * SUMMA LIMITI MATNLARI — o'yinni boshlash va limitni o'zgartirish oynalari
 * uchun umumiy (ikkalasida bir xil so'zlar chiqishi uchun bitta joyda).
 */

/** Limit vaqti matni: "1 soat 15 daqiqa"; bir daqiqadan kam bo'lsa — soniyalar */
export const formatLimitDuration = (totalSeconds: number, t: TFunction): string => {
  const { hours, minutes, seconds } = limitDuration(totalSeconds);
  const parts: string[] = [];
  if (hours > 0) parts.push(t('tables.durHours', { n: hours }));
  if (minutes > 0) parts.push(t('tables.durMinutes', { n: minutes }));
  if (parts.length === 0) parts.push(t('tables.durSeconds', { n: seconds }));
  return parts.join(' ');
};

/**
 * Forma tekshiruvi matni — serverdagi qoida bilan bir xil (utils/limit.ts).
 * null — summa yaroqli. Chegara summasi butun birlikkacha yaxlitlanadi
 * (kichigi YUQORIGA, kattasi PASTGA): ko'rsatilgan summani kiritgan kassir o'tadi.
 */
export const limitErrorText = (
  amount: number | null | undefined,
  pricePerHour: number,
  t: TFunction,
): string | null => {
  if (amount == null) return t('tables.limitRequired');
  const problem = limitProblem(amount, pricePerHour);
  if (problem === null) return null;
  if (problem === 'needsPrice') return t('tables.limitNeedsPrice');
  const { min, max } = limitBounds(pricePerHour);
  return problem === 'tooSmall'
    ? t('tables.limitTooSmall', { min: formatNumber(Math.ceil(min)), minutes: LIMIT_MIN_MINUTES })
    : t('tables.limitTooLarge', { max: formatNumber(Math.floor(max)), hours: LIMIT_MAX_MINUTES / 60 });
};
