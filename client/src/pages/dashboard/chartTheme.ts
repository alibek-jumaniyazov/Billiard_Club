import type { CSSProperties } from 'react';
import { FONT_FAMILY, TOKENS } from '../../theme/tokens';

/**
 * Recharts uchun umumiy qorong'i tema parchalari — uchala grafik bitta
 * ko'rinishda bo'lishi uchun (o'qlar, to'r, tooltip) shu yerdan olinadi.
 */

/** O'q yorliqlari — kumush ikkilamchi matn, mayda */
export const AXIS_TICK = {
  fill: TOKENS.color.text.tertiary,
  fontSize: 11.5,
  fontFamily: FONT_FAMILY,
} as const;

/** To'r chiziqlari — deyarli ko'rinmas grafit */
export const GRID_STROKE = TOKENS.color.border.subtle;

/** O'q chizig'i */
export const AXIS_LINE = { stroke: TOKENS.color.border.base } as const;

/** Tooltip idishi — ko'tarilgan karbon yuza */
export const TOOLTIP_CONTENT_STYLE: CSSProperties = {
  background: TOKENS.color.bg.bg2,
  border: `1px solid ${TOKENS.color.border.strong}`,
  borderRadius: TOKENS.radius.sm,
  boxShadow: TOKENS.shadow.level2,
  padding: '8px 12px',
  fontFamily: FONT_FAMILY,
  fontSize: 12.5,
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: TOKENS.color.text.primary,
  fontWeight: 600,
  marginBottom: 4,
};

export const TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: TOKENS.color.text.secondary,
  padding: '1px 0',
};

/** Hover kursori (bar grafiklar uchun) — yumshoq yoritish */
export const HOVER_CURSOR = { fill: TOKENS.color.bg.bg3, opacity: 0.55 } as const;

/**
 * Katta so'm qiymatlari uchun ixcham o'q yorlig'i: 1 500 000 -> "1.5 mln".
 * Suffikslar i18n dan keladi (dashboard.mln / dashboard.thousandShort).
 */
export const compactMoney = (value: number, mln: string, thousand: string): string => {
  const abs = Math.abs(value);
  const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)} ${mln}`;
  if (abs >= 1_000) return `${trim(value / 1_000)} ${thousand}`;
  return String(value);
};
