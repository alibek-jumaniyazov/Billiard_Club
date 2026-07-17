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
 * Glassmorphism o'rami — shaffof fon + blur + oltin tusli 1px chegara.
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
    className={className}
    style={{
      background: 'rgba(24, 28, 26, 0.6)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      border: `1px solid ${TOKENS.color.gold.line}`,
      borderRadius: radius,
      padding,
      boxShadow: TOKENS.shadow.level2,
      ...style,
    }}
  >
    {children}
  </div>
);

export default GlassCard;
