import { useRef } from 'react';
import { Button } from 'antd';
import { AndroidFilled, ArrowRightOutlined, GlobalOutlined, WindowsFilled } from '@ant-design/icons';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HeroStage from './HeroStage';
import { fadeUp, stagger } from './shared';

const HERO_TRUST_KEYS = ['heroTrust1', 'heroTrust2', 'heroTrust3'] as const;

/**
 * "Billiard klubingiz — to'liq nazoratda" → ikki satr: to'q + xira.
 * Tire faqat matnda (qidiruv botlari, ekran o'quvchi) — ekranda satr ko'chishi o'rnini bosadi.
 */
const splitTitle = (title: string): [string, string] => {
  const i = title.indexOf(' — ');
  return i > 0 ? [title.slice(0, i), title.slice(i + 3)] : [title, ''];
};

/**
 * HERO — markazda yirik serif sarlavha, ostida KATTA o'ynasa bo'ladigan stol.
 *
 * Scroll bilan (Apple uslubi): matn yuqoriga suzib so'nadi, stol esa 90% dan
 * to'liq o'lchamga "yaqinlashadi". Hammasi transform/opacity — o'yin
 * koordinatalari getBoundingClientRect bilan hisoblanadi, transformga chidamli.
 */
const Hero = ({ onStart }: { onStart: () => void }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const copyY = useTransform(scrollYProgress, [0, 0.5], [0, -90]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.38], [1, 0]);
  const stageScale = useTransform(scrollYProgress, [0, 0.3], [0.9, 1]);
  const stageY = useTransform(scrollYProgress, [0, 0.3], [0, -24]);
  const [lead, tail] = splitTitle(t('landing.heroTitle'));

  return (
    <section ref={ref} className="lp-hero2">
      <div className="lp-hero2__paper" aria-hidden />

      <motion.div className="lp-container lp-hero2__copy" style={reduce ? undefined : { y: copyY, opacity: copyOpacity }}>
        <motion.div initial="hidden" animate="visible" variants={stagger}>
          {/* H1 — qidiruv so'zi bilan ("billiard klublari uchun boshqaruv tizimi"); shior — H2 */}
          <motion.h1 variants={fadeUp} className="lp-eyebrow">
            {t('landing.heroBadge')}
          </motion.h1>
          <motion.h2 variants={fadeUp} className="lp-hero2__title">
            <span>{lead}</span>
            {tail && (
              <>
                <span className="lp-sr-only"> — </span>
                <em>{tail}</em>
              </>
            )}
          </motion.h2>
          <motion.p variants={fadeUp} className="lp-hero2__sub">
            {t('landing.heroSubtitle')}
          </motion.p>
          <motion.div variants={fadeUp} className="lp-hero2__actions">
            <Button type="primary" size="large" className="lp-cta-btn lp-cta-btn--lg" onClick={onStart}>
              {t('landing.heroCta')} <ArrowRightOutlined />
            </Button>
            <a className="lp-text-link" href="#demo">
              {t('landing.heroSecondary')} <ArrowRightOutlined />
            </a>
          </motion.div>
          <motion.ul variants={fadeUp} className="lp-hero2__trust">
            {HERO_TRUST_KEYS.map((key) => (
              <li key={key}>{t(`landing.${key}`)}</li>
            ))}
          </motion.ul>
        </motion.div>
      </motion.div>

      <div className="lp-container lp-container--wide lp-hero2__stage-wrap">
        <motion.div className="lp-hero2__stage" style={reduce ? undefined : { scale: stageScale, y: stageY }}>
          <HeroStage />
        </motion.div>
        {/* Platformalar — dastur qayerda ishlashi birinchi ekranda */}
        <div className="lp-platforms">
          <Link to="/download#windows" className="lp-platform">
            <WindowsFilled aria-hidden /> Windows
          </Link>
          <Link to="/download#android" className="lp-platform">
            <AndroidFilled aria-hidden /> Android
          </Link>
          <Link to="/login" className="lp-platform">
            <GlobalOutlined aria-hidden /> {t('landing.platformWeb')}
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Hero;
