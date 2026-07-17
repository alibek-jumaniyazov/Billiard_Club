import type { CSSProperties, ReactNode } from 'react';
import { TOKENS } from '../../theme/tokens';

interface GlassCardProps {
  children: ReactNode;
  /** Ichki bo'shliq (px) */
  padding?: number;
  /** Chegara radiusi (standart: lg) */
  radius?: number;
  style?: CSSProperties;
  className?: string;
}

/**
 * Glassmorphism o'rami — shaffof fon + blur + grafit chegara (hoverda oltin
 * tusga yumshoq o'tadi — .glass-card klassi index.css da).
 * EHTIYOTKORLIK bilan ishlating: faqat navbar/overlay kabi "suzuvchi"
 * yuzalar uchun; oddiy kontent kartalari uchun antd Card qoladi.
 */
const GlassCard = ({
  children,
  padding = TOKENS.spacing.lg,
  radius = TOKENS.radius.lg,
  style,
  className,
}: GlassCardProps) => (
  <div
    className={className ? `glass-card ${className}` : 'glass-card'}
    style={{
      background: 'rgba(28, 38, 34, 0.6)' /* bg.bg2 @ 60% */,
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      borderRadius: radius,
      padding,
      boxShadow: `${TOKENS.shadow.level2}, ${TOKENS.shadow.cardHighlight}`,
      ...style,
    }}
  >
    {children}
  </div>
);

export default GlassCard;
