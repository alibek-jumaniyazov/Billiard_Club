import type { PointerEvent } from 'react';
import { motion, type Variants } from 'framer-motion';
import { TOKENS } from '../../theme/tokens';

/**
 * Landing bo'limlari uchun umumiy primitivlar — Landing.tsx va
 * pages/landing/* komponentlari bir xil harakat va sarlavha uslubida bo'lsin.
 */

/** Token hexini shaffof rgba() ga aylantiradi — sahifada hex takrorlanmasin */
export const hexToRgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/* Harakat variantlari — faqat transform + opacity (60fps) */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: TOKENS.motion.duration.slow, ease: TOKENS.motion.easing.out },
  },
};

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

/** Bo'lim sarlavhasi: oltin overline + sarlavha + ixtiyoriy izoh */
export const SectionHeading = ({
  overline,
  title,
  subtitle,
}: {
  overline: string;
  title: string;
  subtitle?: string;
}) => (
  <motion.div
    className="lp-heading"
    variants={fadeUp}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.3 }}
  >
    <div className="lp-heading__overline">{overline}</div>
    <h2 className="lp-heading__title">{title}</h2>
    {subtitle ? <p className="lp-heading__subtitle">{subtitle}</p> : null}
  </motion.div>
);

/** Soniyalar -> "01:12:05" (demo taymerlar uchun) */
export const formatHms = (totalSec: number): string => {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

/** Soatlik narx bo'yicha summa — 100 so'mgacha yaxlitlanadi (ilovadagidek) */
export const amountFor = (seconds: number, pricePerHour: number): number =>
  Math.round(((seconds / 3600) * pricePerHour) / 100) * 100;

/**
 * Kursor ortidan yuradigan yorug'lik: panjara konteyneriga bitta
 * onPointerMove beriladi, u kursor ostidagi kartaga --mx/--my o'rnatadi
 * (CSS radial-gradient shu nuqtadan chiziladi). Faqat sichqoncha uchun.
 */
export const spotlightMove = (selector: string) => (event: PointerEvent<HTMLElement>) => {
  if (event.pointerType !== 'mouse') return;
  const card = (event.target as HTMLElement).closest<HTMLElement>(selector);
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
  card.style.setProperty('--my', `${event.clientY - rect.top}px`);
};
