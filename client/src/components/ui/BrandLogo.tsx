import type { CSSProperties } from 'react';
import { TOKENS } from '../../theme/tokens';

interface BrandLogoProps {
  /** Belgi (mark) balandligi, px */
  size?: number;
  /** Yozuv (wordmark) ko'rsatilsinmi */
  withWordmark?: boolean;
  style?: CSSProperties;
  className?: string;
}

const { gold, emerald, text } = TOKENS.color;

/**
 * Prime Billiard brend belgisi — zumrad mato ustidagi oltin soqqa va kiy.
 * Sidebar, Login, Register va Landing bitta shu komponentdan foydalanadi
 * (avval 4 joyda har xil nusxa bor edi).
 */
const BrandLogo = ({ size = 40, withWordmark = false, style, className }: BrandLogoProps) => (
  <span
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: Math.max(8, size * 0.3),
      lineHeight: 1,
      ...style,
    }}
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Prime Billiard"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <defs>
        <linearGradient id="pb-felt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={emerald.felt} />
          <stop offset="100%" stopColor={emerald.deepest} />
        </linearGradient>
        <radialGradient id="pb-ball" cx="0.35" cy="0.3" r="0.9">
          <stop offset="0%" stopColor={gold.hover} />
          <stop offset="55%" stopColor={gold.base} />
          <stop offset="100%" stopColor={gold.active} />
        </radialGradient>
      </defs>
      {/* Mato foni — yumaloq kvadrat, nozik oltin chegara */}
      <rect x="1" y="1" width="46" height="46" rx="12" fill="url(#pb-felt)" />
      <rect
        x="1"
        y="1"
        width="46"
        height="46"
        rx="12"
        fill="none"
        stroke={gold.base}
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      {/* Kiy — orqada diagonal kumush chiziq */}
      <line
        x1="9"
        y1="39"
        x2="36"
        y2="12"
        stroke={text.secondary}
        strokeOpacity="0.75"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Oltin soqqa */}
      <circle cx="29" cy="28" r="10" fill="url(#pb-ball)" />
      {/* Soqqadagi yaltirash */}
      <circle cx="25.5" cy="24.5" r="3" fill="#fff" fillOpacity="0.55" />
      {/* Soqqa raqam doirasi — zumrad "P" */}
      <circle cx="31" cy="30.5" r="4.4" fill={emerald.deepest} fillOpacity="0.9" />
      <text
        x="31"
        y="33.6"
        textAnchor="middle"
        fontSize="6.4"
        fontWeight="700"
        fill={gold.hover}
        fontFamily="inherit"
      >
        P
      </text>
    </svg>
    {withWordmark && (
      <span
        style={{
          fontSize: Math.max(13, size * 0.4),
          fontWeight: 800,
          letterSpacing: 2,
          color: text.primary,
          whiteSpace: 'nowrap',
        }}
      >
        PRIME <span style={{ color: gold.base }}>BILLIARD</span>
      </span>
    )}
  </span>
);

export default BrandLogo;
