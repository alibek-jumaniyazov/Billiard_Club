import type { CSSProperties } from 'react';
import { TOKENS } from '../../theme/tokens';
import { formatNumber } from '../../utils/format';

type MoneySize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<MoneySize, { fontSize: number; fontWeight: number }> = {
  sm: { fontSize: 13, fontWeight: 500 },
  md: { fontSize: 15, fontWeight: 600 },
  lg: { fontSize: 20, fontWeight: 700 },
  xl: { fontSize: 26, fontWeight: 700 },
};

interface MoneyTextProps {
  /** Summa (raqam) */
  amount: number | null | undefined;
  /** Valyuta yorlig'i — i18n dan keladi (masalan t('common.sum')) */
  currency?: string;
  /** O'lcham (standart: md) */
  size?: MoneySize;
  /** true bo'lsa musbat/manfiy rang va +/- belgisi qo'shiladi */
  signed?: boolean;
  /** Maxsus rang (signed dan ustun emas) */
  color?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Pul qiymati matni — tabular-nums bilan tekis ustunlar, yagona format
 * (utils/format.formatNumber) va ixtiyoriy +/- ranglash.
 */
const MoneyText = ({
  amount,
  currency,
  size = 'md',
  signed = false,
  color,
  style,
  className,
}: MoneyTextProps) => {
  const value = amount ?? 0;
  const { fontSize, fontWeight } = SIZE_MAP[size];

  const resolvedColor = signed
    ? value >= 0
      ? TOKENS.color.semantic.success
      : TOKENS.color.semantic.error
    : (color ?? TOKENS.color.text.primary);

  const sign = signed && value > 0 ? '+' : '';

  return (
    <span
      className={`tabular-nums${className ? ` ${className}` : ''}`}
      style={{ fontSize, fontWeight, color: resolvedColor, whiteSpace: 'nowrap', ...style }}
    >
      {sign}
      {formatNumber(value)}
      {currency && (
        <span style={{ fontSize: Math.round(fontSize * 0.82), fontWeight: 500, opacity: 0.75 }}>
          {' '}
          {currency}
        </span>
      )}
    </span>
  );
};

export default MoneyText;
