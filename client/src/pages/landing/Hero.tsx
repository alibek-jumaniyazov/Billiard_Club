import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { AndroidFilled, ArrowRightOutlined, GlobalOutlined, WindowsFilled } from '@ant-design/icons';
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HeroStage from './HeroStage';
import { fadeUp, stagger } from './shared';

const HERO_TRUST_KEYS = ['heroTrust1', 'heroTrust2', 'heroTrust3'] as const;

/** Yopishqoq sahna faqat yetarli joy bo'lganda: planshet/kompyuter va past bo'lmagan ekran */
const PIN_QUERY = '(min-width: 768px) and (min-height: 600px)';

/**
 * "Billiard klubingiz — to'liq nazoratda" → ikki satr: to'q + xira.
 * Tire faqat matnda (qidiruv botlari, ekran o'quvchi) — ekranda satr ko'chishi o'rnini bosadi.
 */
const splitTitle = (title: string): [string, string] => {
  const i = title.indexOf(' — ');
  return i > 0 ? [title.slice(0, i), title.slice(i + 3)] : [title, ''];
};

const usePinned = (): boolean => {
  const reduce = useReducedMotion();
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(PIN_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PIN_QUERY);
    const sync = () => setMatch(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return match && !reduce;
};

/** Element tepasining berilgan ajdod ichidagi LAYOUT o'rni (transformlarsiz) */
const offsetWithin = (el: HTMLElement, ancestor: HTMLElement): number => {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
};

/**
 * HERO — sarlavha va KATTA o'ynasa bo'ladigan stol.
 *
 * Kompyuter/planshetda sahna "yopishqoq": sarlavha joyida qotib turadi, stol esa
 * ekran pastidan 3D egilgan holatda ko'tarilib, sarlavha USTIGA chiqadi va
 * tekislanadi; oxirida atrof biroz xiralashadi va stol ustida lampa yonadi.
 * Telefonda va "Harakatni kamaytirish" yoqilganda — oddiy oqim (matn so'nadi,
 * stol yaqinlashadi). Hammasi transform/opacity; o'yin koordinatalari
 * getBoundingClientRect bilan hisoblanadi — 2D transformga chidamli, 3D egilish
 * paytida esa stol bosilmaydi (is-settling).
 */
const Hero = ({ onStart }: { onStart: () => void }) => {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const pinned = usePinned();
  const [lead, tail] = splitTitle(t('landing.heroTitle'));

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: pinned ? ['start start', 'end end'] : ['start start', 'end start'],
  });

  /* ------------------------------------------------- Yopishqoq sahna */

  // Stolning boshlang'ich surilishi (px): tepasi matn ostida, ekran pastidan "mo'ralab" turadi
  const startY = useMotionValue(0);
  useLayoutEffect(() => {
    if (!pinned) return;
    const measure = () => {
      const sticky = stickyRef.current;
      const copy = copyRef.current;
      const stage = stageRef.current;
      if (!sticky || !copy || !stage) return;
      const vh = sticky.clientHeight;
      const copyBottom = offsetWithin(copy, sticky) + copy.offsetHeight;
      const stageTop = offsetWithin(stage, sticky);
      const peek = Math.min(220, Math.max(110, vh * 0.2));
      const startTop = Math.min(Math.max(copyBottom + 28, vh - peek), vh - 90);
      startY.set(Math.max(0, startTop - stageTop));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (copyRef.current) ro.observe(copyRef.current);
    if (stageRef.current) ro.observe(stageRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pinned, startY]);

  // 0 → 0.72: stol ko'tariladi; qolgani — joyida "nafas" (lampa yonadi)
  const rise = useTransform(scrollYProgress, [0, 0.72], [0, 1], { clamp: true });
  const eased = useTransform(rise, (v) => 1 - (1 - v) ** 3);
  const pinY = useTransform([eased, startY] as MotionValue<number>[], ([e, s]: number[]) => s * (1 - e));
  const pinScale = useTransform(eased, [0, 1], [0.84, 1]);
  const pinTilt = useTransform(eased, [0, 1], [26, 0]);
  const copyScale = useTransform(scrollYProgress, [0, 0.6], [1, 0.92]);
  const copyFade = useTransform(scrollYProgress, [0.1, 0.52], [1, 0]);
  const copyLift = useTransform(scrollYProgress, [0, 0.6], [0, -48]);
  const lampOn = useTransform(scrollYProgress, [0.42, 0.82], [0, 1]);

  // Egilish paytida stolni bosib bo'lmaydi: 3D proyeksiyada mo'ljal noto'g'ri tushardi
  useMotionValueEvent(eased, 'change', (v) => {
    stageRef.current?.classList.toggle('is-settling', pinned && v < 0.995);
  });

  /* --------------------------------------- Oddiy oqim (telefon) */

  const flowCopyY = useTransform(scrollYProgress, [0, 0.5], [0, -90]);
  const flowCopyOpacity = useTransform(scrollYProgress, [0, 0.38], [1, 0]);
  const flowScale = useTransform(scrollYProgress, [0, 0.3], [0.9, 1]);
  const flowY = useTransform(scrollYProgress, [0, 0.3], [0, -24]);

  const copyStyle = reduce
    ? undefined
    : pinned
      ? { scale: copyScale, opacity: copyFade, y: copyLift }
      : { y: flowCopyY, opacity: flowCopyOpacity };
  const stageStyle = reduce
    ? undefined
    : pinned
      ? { y: pinY, scale: pinScale, rotateX: pinTilt, transformPerspective: 1500 }
      : { scale: flowScale, y: flowY };

  /* Platformalar — dastur qayerda ishlashi birinchi ekranda */
  const platforms = (
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
  );

  return (
    <section ref={trackRef} className={`lp-hero2${pinned ? ' is-pinned' : ''}`}>
      <div ref={stickyRef} className="lp-hero2__sticky">
        <div className="lp-hero2__paper" aria-hidden />
        {pinned && (
          <>
            {/* Zal chiroqlari pasayadi, stol lampasi yonadi */}
            <motion.div className="lp-hero2__dim" aria-hidden style={{ opacity: lampOn }} />
            <motion.div className="lp-hero2__lamp" aria-hidden style={{ opacity: lampOn }} />
          </>
        )}

        <motion.div ref={copyRef} className="lp-container lp-hero2__copy" style={copyStyle}>
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
            {pinned && <motion.div variants={fadeUp}>{platforms}</motion.div>}
          </motion.div>
        </motion.div>

        <div className="lp-container lp-container--wide lp-hero2__stage-wrap">
          <motion.div ref={stageRef} className="lp-hero2__stage" style={stageStyle}>
            <HeroStage />
          </motion.div>
          {!pinned && platforms}
        </div>
      </div>
    </section>
  );
};

export default Hero;
