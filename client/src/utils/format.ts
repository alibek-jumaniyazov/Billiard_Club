/** Yagona pul/vaqt formatlash — sahifalar bo'ylab bir xil ko'rinish */

const numberFormat = new Intl.NumberFormat('ru-RU');

/** 150000 -> "150 000" (valyuta belgisiz — belgi t('common.sum') dan olinadi) */
export const formatNumber = (amount: number | null | undefined): string =>
  numberFormat.format(Math.round(amount ?? 0));

/** 150000 -> "150 000 so'm" */
export const formatMoney = (amount: number | null | undefined, symbol = "so'm"): string =>
  `${formatNumber(amount)} ${symbol}`;

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
