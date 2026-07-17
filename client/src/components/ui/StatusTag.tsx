import type { CSSProperties, ReactNode } from 'react';
import { TOKENS } from '../../theme/tokens';

const { semantic, emerald, gold, text, neonGreen } = TOKENS.color;

/** Bitta holatning vizual retsepti */
interface StatusStyle {
  color: string;
  dot?: boolean;
}

/**
 * Semantik holat -> palitra rangi xaritasi.
 * Domen holatlari (sessiya/klub/to'lov) va umumiy semantikalar bir joyda —
 * sahifalar bo'ylab 'green'/'red' preset tarqoqligining o'rnini bosadi.
 */
const STATUS_STYLES: Record<string, StatusStyle> = {
  // Sessiya holatlari
  active: { color: neonGreen, dot: true },
  paused: { color: semantic.warning, dot: true },
  completed: { color: semantic.info },
  cancelled: { color: text.tertiary },

  // Stol holatlari
  busy: { color: gold.base, dot: true },
  free: { color: emerald.glow },

  // Klub/obuna holatlari
  trial: { color: semantic.info },
  expired: { color: semantic.warning },
  blocked: { color: semantic.error },

  // To'lov/qarz
  paid: { color: semantic.success },
  debt: { color: semantic.error },
  partial: { color: semantic.warning },

  // Umumiy semantikalar
  success: { color: semantic.success },
  warning: { color: semantic.warning },
  error: { color: semantic.error },
  info: { color: semantic.info },
  default: { color: text.secondary },
};

interface StatusTagProps {
  /** Holat kaliti (active/paused/completed/busy/free/paid/... yoki semantik) */
  status: string;
  /** Ko'rsatiladigan matn (i18n dan keladi — komponent tarjima qilmaydi) */
  label: ReactNode;
  /** Jonli nuqta ko'rsatilsinmi (holat xaritasidagi qiymatni bekor qiladi) */
  dot?: boolean;
  style?: CSSProperties;
}

/**
 * Palitraga mos holat yorlig'i — shaffof rangli fon, mos chegara va
 * "jonli" holatlar uchun pulsli nuqta.
 */
const StatusTag = ({ status, label, dot, style }: StatusTagProps) => {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.default;
  const showDot = dot ?? s.dot ?? false;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        borderRadius: 6,
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: '20px',
        color: s.color,
        background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${s.color} 30%, transparent)`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {showDot && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: s.color,
            boxShadow: `0 0 6px ${s.color}`,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
};

export default StatusTag;
