import { useId, type CSSProperties } from 'react';
import { FONT_FAMILY_DISPLAY, TOKENS } from '../../theme/tokens';

interface BrandLogoProps {
  /** Belgi (mark) balandligi, px */
  size?: number;
  /** Yozuv (wordmark) ko'rsatilsinmi */
  withWordmark?: boolean;
  style?: CSSProperties;
  className?: string;
}

const { gold, emerald, text, ivory } = TOKENS.color;

/**
 * Billiard Club brend belgisi — "B" monogrammasi: tik turgan kiy (harf o'zagi)
 * va unga tegib turgan ikki fil suyagi shar (harfning ikki qorni), chiroq
 * yoritgan mato ustida. 16 px da ham "B" bo'lib o'qiladi.
 *
 * Geometriya client/public/favicon.svg va desktop/build/make-icons.mjs (MARK)
 * bilan AYNAN bir xil — ikonkalar ham shu belgidan chiziladi.
 *
 * Gradient ID lari har nusxada noyob (useId): sahifada bir nechta logo bor va
 * ulardan biri yashirin (display:none) bo'lsa, umumiy ID li gradientlar
 * boshqa nusxalarda ham "yo'qolib" qolardi.
 */
const BrandLogo = ({ size = 40, withWordmark = false, style, className }: BrandLogoProps) => {
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `bl-${name}-${uid}`;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(8, size * 0.28),
        lineHeight: 1,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="img"
        aria-label="Billiard Club"
        style={{ flexShrink: 0, display: 'block' }}
      >
        <defs>
          <linearGradient id={id('felt')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={emerald.base} />
            <stop offset="1" stopColor={emerald.deepest} />
          </linearGradient>
          <radialGradient id={id('lamp')} cx="0.5" cy="0.1" r="0.6">
            <stop offset="0" stopColor={emerald.bright} stopOpacity="0.38" />
            <stop offset="1" stopColor={emerald.bright} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id('cue')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={gold.hover} />
            <stop offset="0.3" stopColor="#f5dfa6" />
            <stop offset="0.65" stopColor={gold.base} />
            <stop offset="1" stopColor={gold.active} />
          </linearGradient>
          <radialGradient id={id('ivory')} cx="0.31" cy="0.29" r="0.8">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.42" stopColor={ivory} />
            <stop offset="1" stopColor="#c4b9a2" />
          </radialGradient>
          <radialGradient id={id('spec')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={id('stem')}>
            <rect x="13.6" y="8" width="5" height="32" rx="2.5" />
          </clipPath>
          <filter id={id('shadow')} x="-20%" y="-20%" width="150%" height="150%">
            <feDropShadow dx="0.8" dy="1.3" stdDeviation="0.9" floodColor="#03120b" floodOpacity="0.55" />
          </filter>
        </defs>
        {/* Mato: diagonal gradient + tepadagi chiroq yorug'i + oltin inkrustatsiya chizig'i */}
        <rect x="1" y="1" width="46" height="46" rx="12" fill={`url(#${id('felt')})`} />
        <rect x="1" y="1" width="46" height="46" rx="12" fill={`url(#${id('lamp')})`} />
        <rect
          x="2.8"
          y="2.8"
          width="42.4"
          height="42.4"
          rx="10.2"
          fill="none"
          stroke={gold.base}
          strokeOpacity="0.75"
          strokeWidth="0.6"
        />
        <g filter={`url(#${id('shadow')})`}>
          {/* Kiy — harf o'zagi, tepasida fil suyagi ferrul */}
          <rect x="13.6" y="8" width="5" height="32" rx="2.5" fill={`url(#${id('cue')})`} />
          <g clipPath={`url(#${id('stem')})`}>
            <rect x="13.6" y="8" width="5" height="2.6" fill={ivory} />
            <rect x="13.6" y="10.6" width="5" height="0.5" fill={gold.active} />
          </g>
          {/* Ikki shar — "B" qorinlari */}
          <circle cx="24.9" cy="15.5" r="7.5" fill={`url(#${id('ivory')})`} />
          <circle cx="25.9" cy="31.5" r="8.5" fill={`url(#${id('ivory')})`} />
        </g>
        <circle cx="22.2" cy="12.2" r="1.8" fill={`url(#${id('spec')})`} />
        <circle cx="22.84" cy="27.76" r="2.04" fill={`url(#${id('spec')})`} />
      </svg>
      {withWordmark && (
        <span
          style={{
            fontFamily: FONT_FAMILY_DISPLAY,
            fontSize: Math.max(13, size * 0.38),
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: text.primary,
            whiteSpace: 'nowrap',
          }}
        >
          BILLIARD <span style={{ color: gold.base }}>CLUB</span>
        </span>
      )}
    </span>
  );
};

export default BrandLogo;
