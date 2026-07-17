/** InputNumber uchun ming ajratkichli pul formatlash (tables sahifasi) */

export const moneyFormatter = (value?: string | number): string =>
  `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export const moneyParser = (value?: string): number => {
  const cleaned = (value ?? '').replace(/\s/g, '');
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
};
