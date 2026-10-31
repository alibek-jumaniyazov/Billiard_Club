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

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * Karta "chuqurlikdan" ko'tariladi: pastdan, oldinga egilgan holda — prujina
 * bilan tekislanadi. Kartalar to'plami (muammolar, imkoniyatlar, tariflar…) uchun.
 */
export const riseCard: Variants = {
  hidden: { opacity: 0, y: 64, rotateX: -18, scale: 0.95, transformPerspective: 1200 },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    scale: 1,
    transformPerspective: 1200,
    transition: { type: 'spring', stiffness: 80, damping: 17, mass: 0.9 },
  },
};

export const staggerCards: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.11, delayChildren: 0.05 } },
};

/** Yon tomondan kirish: ikki ustunli bo'limda matn bir tomondan, rasm ikkinchisidan */
export const slideFrom = (side: 'left' | 'right'): Variants => ({
  hidden: {
    opacity: 0,
    x: side === 'left' ? -72 : 72,
    rotateY: side === 'left' ? 10 : -10,
    transformPerspective: 1400,
  },
  visible: {
    opacity: 1,
    x: 0,
    rotateY: 0,
    transformPerspective: 1400,
    transition: { duration: 1, ease: EASE_OUT },
  },
});

/** So'z niqob ostidan ko'tariladi (sarlavhalar) */
const wordUp: Variants = {
  hidden: { y: '115%' },
  visible: { y: '0%', transition: { duration: 0.9, ease: EASE_OUT } },
};
const headingFade: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE_OUT } },
};

/**
 * Sarlavha so'zlari niqob ostidan birin-ketin ko'tariladi (Apple uslubi).
 * Ekran o'quvchi butun matnni aria-label dan o'qiydi; bo'laklar yashirin.
 */
export const RevealWords = ({ text, className, as: Tag = 'h2' }: { text: string; className?: string; as?: 'h2' | 'h3' }) => {
  const MotionTag = Tag === 'h2' ? motion.h2 : motion.h3;
  return (
    <MotionTag className={className} aria-label={text} variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.055 } } }}>
      {text.split(' ').map((word, i) => (
        <span key={i} aria-hidden>
          <span className="lp-word">
            <motion.span className="lp-word__inner" variants={wordUp}>
              {word}
            </motion.span>
          </span>{' '}
        </span>
      ))}
    </MotionTag>
  );
};

/** Bo'lim sarlavhasi: oltin overline + so'zma-so'z ko'tariladigan sarlavha + izoh */
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
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.35 }}
    variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
  >
    <motion.div className="lp-heading__overline" variants={headingFade}>
      {overline}
    </motion.div>
    <RevealWords text={title} className="lp-heading__title" />
    {subtitle ? (
      <motion.p className="lp-heading__subtitle" variants={headingFade}>
        {subtitle}
      </motion.p>
    ) : null}
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
