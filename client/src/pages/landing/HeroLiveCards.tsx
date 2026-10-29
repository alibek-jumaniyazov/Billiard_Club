import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BulbFilled, CheckCircleFilled, CoffeeOutlined, MobileOutlined, WifiOutlined } from '@ant-design/icons';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../utils/format';
import { formatHms } from './shared';

/**
 * Hero stoli ustidagi "jonli" bildirishnomalar — o'yin bilan tizim qanday
 * bog'langanini ko'rsatadi: chiroq yondi, bar buyurtmasi stol hisobiga tushdi,
 * egasining telefonida tushum, internet uzilsa ham kassa ishlaydi.
 * Navbat bilan almashadi, hero ekrandan chiqsa to'xtaydi; harakat
 * kamaytirilganda birinchi karta statik turadi.
 *
 * Mehmon o'zi o'ynasa (HeroStage) — navbat to'xtaydi va UNING o'yini haqidagi
 * karta chiqadi: "o'yin boshlandi", keyin "chek tayyor".
 */

export type HeroNotice =
  | { id: number; kind: 'start' }
  | { id: number; kind: 'receipt'; seconds: number; amount: number };

type Tone = 'gold' | 'green' | 'blue' | 'warn';

const CARDS: { key: string; icon: ReactNode; tone: Tone }[] = [
  { key: 'heroCard1', icon: <BulbFilled />, tone: 'gold' },
  { key: 'heroCard2', icon: <CoffeeOutlined />, tone: 'green' },
  { key: 'heroCard3', icon: <MobileOutlined />, tone: 'blue' },
  { key: 'heroCard4', icon: <WifiOutlined />, tone: 'warn' },
];

const CYCLE_MS = 3600;
/** Mehmon o'yini haqidagi karta shuncha turadi, keyin navbat davom etadi */
const NOTICE_MS = { start: 4500, receipt: 8000 } as const;

const HeroLiveCards = ({ notice = null }: { notice?: HeroNotice | null }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.1 });
  const reduce = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState<HeroNotice | null>(null);

  useEffect(() => {
    if (!notice) return;
    setActive(notice);
    const id = window.setTimeout(
      () => setActive((current) => (current?.id === notice.id ? null : current)),
      NOTICE_MS[notice.kind],
    );
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!inView || reduce || active) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % CARDS.length), CYCLE_MS);
    return () => window.clearInterval(id);
  }, [inView, reduce, active]);

  let card: { key: string; icon: ReactNode; tone: Tone; title: string; sub: string };
  if (active?.kind === 'start') {
    card = {
      key: `game-${active.id}`,
      icon: <BulbFilled />,
      tone: 'gold',
      title: t('landing.heroGameStartTitle'),
      sub: t('landing.heroGameStartSub'),
    };
  } else if (active?.kind === 'receipt') {
    card = {
      key: `game-${active.id}`,
      icon: <CheckCircleFilled />,
      tone: 'green',
      title: t('landing.heroGameEndTitle'),
      sub: t('landing.heroGameEndSub', { time: formatHms(active.seconds), amount: formatNumber(active.amount) }),
    };
  } else {
    const base = CARDS[index];
    card = { ...base, title: t(`landing.${base.key}Title`), sub: t(`landing.${base.key}Sub`) };
  }

  return (
    // Mehmonning o'z o'yini haqidagi xabar ekran o'quvchiga ham aytiladi
    <div ref={ref} className="lp-hero-cards" aria-live={active ? 'polite' : 'off'}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={card.key}
          className={`lp-hero-card is-${card.tone}${active ? ' is-game' : ''}`}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="lp-hero-card__icon" aria-hidden>
            {card.icon}
          </span>
          <span className="lp-hero-card__text">
            <b>{card.title}</b>
            <small>{card.sub}</small>
          </span>
          <span className="lp-hero-card__time">{t('landing.heroCardNow')}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default HeroLiveCards;
