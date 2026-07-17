import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Avatar, Button, Col, Collapse, Drawer, Row, Segmented } from 'antd';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CoffeeOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  GlobalOutlined,
  MailOutlined,
  MenuOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  StarFilled,
  TeamOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  motion,
  MotionConfig,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from 'framer-motion';
import { useAppSettings } from '../context/AppSettingsContext';
import { SUPPORT_PHONE, SUPPORT_TELEGRAM } from '../constants';
import { TOKENS } from '../theme/tokens';
import { AnimatedBackground, BilliardTable, BrandLogo, GlassCard } from '../components/ui';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { formatNumber } from '../utils/format';
import { publicApi } from '../api';
import type { Plan } from '../types';

const { bg, border, emerald, gold, text, semantic } = TOKENS.color;

/** Aloqa emaili (kontakt bo'limi) — env orqali sozlanadi */
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@billiardclub.uz';

/** Token hexini shaffof rgba() ga aylantiradi — sahifada hex takrorlanmasin */
const hexToRgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/* Neytral shaffof qatlamlar (brend ranglari EMAS — alfa-overlay) */
const NAV_BG = hexToRgba(bg.bg0, 0.82);
/** 40px dan pastga aylantirilganda navbar foni biroz zichlashadi */
const NAV_BG_SCROLLED = hexToRgba(bg.bg0, 0.94);
const SOFT_PANEL = 'rgba(255, 255, 255, 0.02)';
const CARD_TINT = 'rgba(255, 255, 255, 0.03)';

const container: CSSProperties = { maxWidth: 1180, margin: '0 auto', padding: '0 24px' };
const sectionPad: CSSProperties = { padding: 'clamp(56px, 9vw, 96px) 0' };

/* Harakat variantlari — faqat transform + opacity (60fps) */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: TOKENS.motion.duration.slow, ease: TOKENS.motion.easing.out },
  },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const NAV_LINKS = [
  { id: 'features', key: 'navFeatures' },
  { id: 'pricing', key: 'navPricing' },
  { id: 'faq', key: 'navFaq' },
  { id: 'contact', key: 'navContact' },
] as const;

const FEATURE_ITEMS: { key: string; icon: ReactNode }[] = [
  { key: 'feature1', icon: <ClockCircleOutlined /> },
  { key: 'feature2', icon: <CoffeeOutlined /> },
  { key: 'feature3', icon: <CreditCardOutlined /> },
  { key: 'feature4', icon: <BarChartOutlined /> },
  { key: 'feature5', icon: <TeamOutlined /> },
  { key: 'feature6', icon: <DashboardOutlined /> },
  { key: 'feature7', icon: <GlobalOutlined /> },
  { key: 'feature8', icon: <SafetyCertificateOutlined /> },
];

const STAT_KEYS = ['stat1', 'stat2', 'stat3', 'stat4'] as const;
const STEP_KEYS = ['step1', 'step2', 'step3'] as const;
const PLAN_FEATURE_KEYS = ['planFeat1', 'planFeat2', 'planFeat3', 'planFeat4'] as const;
const FAQ_COUNT = 7;

/**
 * Tariflar — ZAXIRA ro'yxati. Sahifa ochilganda ommaviy GET /public/plans
 * (superadmin boshqaradigan faol tariflar) so'raladi va shu ro'yxat o'rniga
 * qo'yiladi. So'rov muvaffaqiyatsiz bo'lsa yoki tarif bo'lmasa — quyidagi
 * statik nusxa ko'rsatiladi (sahifa hech qachon bo'sh ko'rinmaydi).
 */
interface PlanTier {
  code: 'monthly' | 'semiannual' | 'yearly';
  price: number;
  months: number;
  savePercent: number;
  nameKey: string;
  periodKey: string;
  highlighted?: boolean;
}

const PLAN_TIERS: PlanTier[] = [
  {
    code: 'monthly',
    price: 290000,
    months: 1,
    savePercent: 0,
    nameKey: 'planMonthlyName',
    periodKey: 'planMonthlyPeriod',
  },
  {
    code: 'semiannual',
    price: 1490000,
    months: 6,
    savePercent: 14,
    nameKey: 'planSemiName',
    periodKey: 'planSemiPeriod',
  },
  {
    code: 'yearly',
    price: 2490000,
    months: 12,
    savePercent: 28,
    nameKey: 'planYearName',
    periodKey: 'planYearPeriod',
    highlighted: true,
  },
];

/** Tarif kartasi — jonli (API) yoki zaxira (PLAN_TIERS) uchun yagona ko'rinish shakli */
interface PlanCard {
  key: string;
  name: string;
  periodLabel: string;
  price: number;
  months: number;
  savePercent: number;
  highlighted: boolean;
}

const TESTIMONIALS = [
  { k: 't1', color: gold.base },
  { k: 't2', color: emerald.bright },
  { k: 't3', color: semantic.info },
  { k: 't4', color: gold.dim },
] as const;

/* ------------------------------------------------ Dekorativ SVG soqqalar */

interface FloatingBallSpec {
  num: number;
  color: string;
  left: string;
  top: string;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
  hideSm?: boolean;
}

const HERO_BALLS: FloatingBallSpec[] = [
  { num: 1, color: gold.base, left: '5%', top: '14%', size: 34, delay: 0, duration: 12, opacity: 0.5 },
  { num: 3, color: semantic.error, left: '88%', top: '10%', size: 26, delay: 1.2, duration: 14, opacity: 0.4, hideSm: true },
  { num: 2, color: semantic.info, left: '72%', top: '80%', size: 30, delay: 0.6, duration: 11, opacity: 0.35, hideSm: true },
  { num: 6, color: emerald.bright, left: '30%', top: '84%', size: 24, delay: 2, duration: 13, opacity: 0.4 },
  { num: 9, color: gold.hover, left: '58%', top: '6%', size: 22, delay: 1.6, duration: 15.5, opacity: 0.35 },
];

/** Billiard soqqasi SVG motivi (raqamli, yumshoq soya bilan) */
const BallSvg = ({ num, color, size }: { num: number; color: string; size: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`lp-ball-${num}`} cx="0.32" cy="0.28" r="0.9">
        {/* Yaltiroq nuqta va soya — neytral oq/qora (palitra rangi emas) */}
        <stop offset="0%" stopColor="rgb(255, 255, 255)" stopOpacity="0.9" />
        <stop offset="30%" stopColor={color} />
        <stop offset="80%" stopColor={color} />
        <stop offset="100%" stopColor="rgb(0, 0, 0)" stopOpacity="0.55" />
      </radialGradient>
    </defs>
    <circle cx="20" cy="20" r="19" fill={`url(#lp-ball-${num})`} />
    <circle cx="20" cy="20" r="7.5" fill="rgb(255, 255, 255)" fillOpacity="0.92" />
    <text
      x="20"
      y="23.2"
      textAnchor="middle"
      fontSize="9"
      fontWeight="700"
      fill="rgb(0, 0, 0)"
      fillOpacity="0.8"
    >
      {num}
    </text>
  </svg>
);

/** Hero fonida suzib yuruvchi soqqa — faqat transform (y/x) animatsiyasi.
    Uzun davomiylik + turli fazadagi yon siljish suzishni yumshoq qiladi. */
const FloatingBall = ({ ball }: { ball: FloatingBallSpec }) => (
  <motion.div
    aria-hidden
    className={ball.hideSm ? 'lp-hide-sm' : undefined}
    animate={{ y: [0, -14, 0], x: [0, 6, 0] }}
    transition={{
      y: { duration: ball.duration, repeat: Infinity, ease: 'easeInOut', delay: ball.delay },
      x: { duration: ball.duration * 1.4, repeat: Infinity, ease: 'easeInOut', delay: ball.delay },
    }}
    style={{
      position: 'absolute',
      left: ball.left,
      top: ball.top,
      width: ball.size,
      height: ball.size,
      opacity: ball.opacity,
      pointerEvents: 'none',
      willChange: 'transform',
    }}
  >
    <BallSvg num={ball.num} color={ball.color} size={ball.size} />
  </motion.div>
);

/* ------------------------------------------------- Bo'lim ajratuvchi qatlam */

/** Bo'limlar orasidagi yumshoq gradient o'tish (zumrad → shaffof) —
    sahifa tekis qora plitalar to'plami bo'lib ko'rinmasligi uchun */
const SectionDivider = () => (
  <div
    aria-hidden
    style={{
      height: 80,
      background: `linear-gradient(180deg, ${emerald.deepest} 0%, ${hexToRgba(emerald.deepest, 0)} 100%)`,
      pointerEvents: 'none',
    }}
  />
);

/* ------------------------------------------------------- Bo'lim sarlavhasi */

const SectionHeading = ({
  overline,
  title,
  subtitle,
}: {
  overline: string;
  title: string;
  subtitle?: string;
}) => (
  <motion.div
    variants={fadeUp}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.3 }}
    style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 52px' }}
  >
    <div
      style={{
        color: gold.base,
        letterSpacing: 3,
        fontSize: 13,
        fontWeight: 700,
        textTransform: 'uppercase',
      }}
    >
      {overline}
    </div>
    <h2
      style={{
        fontSize: 'clamp(26px, 3.5vw, 38px)',
        color: text.primary,
        fontWeight: 800,
        margin: '12px 0 14px',
        lineHeight: 1.2,
      }}
    >
      {title}
    </h2>
    {subtitle ? (
      <p style={{ color: text.secondary, fontSize: 16, lineHeight: 1.65, margin: 0 }}>{subtitle}</p>
    ) : null}
  </motion.div>
);

/* ------------------------------------------------------------------ Sahifa */

const Landing = () => {
  const { t } = useTranslation();
  const { lang, setLang } = useAppSettings();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const reduceMotion = useReducedMotion();

  /* Skroll qiymati — navbar zichligi va hero parallaksi uchun.
     MotionValue to'g'ridan-to'g'ri transformga yoziladi: layout o'qilmaydi,
     state faqat 40px chegara kesilganda almashadi (React o'zi bail out qiladi). */
  const { scrollY } = useScroll();
  const heroBallsY = useTransform(scrollY, [0, 640], [0, 80]);
  useMotionValueEvent(scrollY, 'change', (y) => setNavScrolled(y > 40));

  useDocumentHead('landing.metaTitle', 'landing.metaDescription');

  /* Ommaviy tariflar — superadmin boshqaradigan faol tariflar (GET /public/plans).
     So'rov muvaffaqiyatsiz bo'lsa yoki bo'sh bo'lsa PLAN_TIERS zaxirasi ishlaydi. */
  const [livePlans, setLivePlans] = useState<Plan[] | null>(null);
  useEffect(() => {
    let alive = true;
    publicApi
      .plans()
      .then((res) => {
        if (alive) setLivePlans(res.data);
      })
      .catch(() => {
        /* zaxira ro'yxati ishlatiladi */
      });
    return () => {
      alive = false;
    };
  }, []);

  const planCards = useMemo<PlanCard[]>(() => {
    if (livePlans && livePlans.length > 0) {
      const sorted = [...livePlans].sort((a, b) => a.durationDays - b.durationDays);
      const base = sorted[0];
      const perDayBase = base.price / Math.max(1, base.durationDays);
      // Faqat bitta karta ajratiladi — eng uzoq muddatlisi (teng bo'lsa oxirgisi)
      return sorted.map((p, i) => ({
        key: p.code,
        name: lang === 'ru' ? p.nameRu : p.nameUz,
        periodLabel: `${p.durationDays} ${t('common.days')}`,
        price: p.price,
        months: Math.max(1, Math.round(p.durationDays / 30)),
        savePercent: perDayBase
          ? Math.max(
              0,
              Math.round((1 - p.price / Math.max(1, p.durationDays) / perDayBase) * 100),
            )
          : 0,
        highlighted: sorted.length > 1 && i === sorted.length - 1,
      }));
    }
    return PLAN_TIERS.map((p) => ({
      key: p.code,
      name: t(`landing.${p.nameKey}`),
      periodLabel: t(`landing.${p.periodKey}`),
      price: p.price,
      months: p.months,
      savePercent: p.savePercent,
      highlighted: Boolean(p.highlighted),
    }));
  }, [livePlans, lang, t]);

  const telegramHandle = SUPPORT_TELEGRAM.replace(/^https?:\/\/t\.me\//, '@');

  const langSwitcher = (size: 'small' | 'middle' = 'small') => (
    <Segmented
      size={size}
      value={lang}
      onChange={(value) => setLang(value as 'uz' | 'ru')}
      options={[
        { label: 'UZ', value: 'uz' },
        { label: 'RU', value: 'ru' },
      ]}
    />
  );

  const contactCards = [
    {
      key: 'telegram',
      icon: <SendOutlined />,
      titleKey: 'contactTelegramTitle',
      descKey: 'contactTelegramDesc',
      ctaKey: 'contactTelegramCta',
      value: telegramHandle,
      href: SUPPORT_TELEGRAM,
      external: true,
      show: true,
    },
    {
      key: 'phone',
      icon: <PhoneOutlined />,
      titleKey: 'contactPhoneTitle',
      descKey: 'contactPhoneDesc',
      ctaKey: 'contactPhoneCta',
      value: SUPPORT_PHONE,
      href: `tel:${SUPPORT_PHONE.replace(/[^\d+]/g, '')}`,
      external: false,
      show: Boolean(SUPPORT_PHONE),
    },
    {
      key: 'email',
      icon: <MailOutlined />,
      titleKey: 'contactEmailTitle',
      descKey: 'contactEmailDesc',
      ctaKey: 'contactEmailCta',
      value: SUPPORT_EMAIL,
      href: `mailto:${SUPPORT_EMAIL}`,
      external: false,
      show: true,
    },
  ].filter((c) => c.show);

  const faqItems = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    key: String(i + 1),
    label: t(`landing.faq${i + 1}Q`),
    children: (
      <p style={{ color: text.secondary, margin: 0, lineHeight: 1.7, fontSize: 14.5 }}>
        {t(`landing.faq${i + 1}A`)}
      </p>
    ),
  }));

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="lp-root"
        style={{
          minHeight: '100vh',
          background: `linear-gradient(165deg, ${bg.bg0} 0%, ${emerald.deepest} 48%, ${emerald.deep} 100%)`,
          color: text.primary,
          overflowX: 'hidden',
        }}
      >
        <style>{`
          html { scroll-behavior: smooth; }
          .lp-root a { text-decoration: none; }
          .lp-root section[id] { scroll-margin-top: 84px; }
          .lp-nav-link { color: var(--text-secondary); font-size: 14.5px; font-weight: 500; padding: 6px 4px; transition: color 0.2s ease; }
          .lp-nav-link:hover { color: var(--gold); }
          .lp-nav-desktop { display: flex; align-items: center; gap: 20px; }
          .lp-nav-mobile { display: none; align-items: center; gap: 10px; }
          .lp-brand-min { display: none; }
          @media (max-width: 991px) {
            .lp-nav-desktop { display: none; }
            .lp-nav-mobile { display: flex; }
          }
          @media (max-width: 430px) {
            .lp-brand-full { display: none; }
            .lp-brand-min { display: inline-flex; }
          }
          @media (max-width: 640px) {
            .lp-hide-sm { display: none !important; }
          }
          .lp-drawer-link { display: block; padding: 13px 2px; font-size: 16px; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid var(--border-subtle); }
          .lp-drawer-link:hover { color: var(--gold); }
          .lp-faq .ant-collapse-item { border: 1px solid var(--border-base) !important; border-radius: 12px !important; margin-bottom: 12px; background: var(--bg1); overflow: hidden; }
          .lp-faq .ant-collapse-header { font-weight: 600; font-size: 15.5px; color: var(--text-primary) !important; padding: 16px 20px !important; align-items: center !important; }
          .lp-faq .ant-collapse-content { background: transparent !important; border-top: 1px solid var(--border-subtle) !important; }
          .lp-faq .ant-collapse-content-box { padding: 16px 20px !important; }
          /* Tanlangan tarif — sekin oltin chegara jilosi. Faqat background-position
             drift (1-2px lik ramka maydonida arzon repaint); mask ichki qismni ochiq
             qoldiradi, shimmer faqat chegarada yuradi. */
          .lp-plan-glow::before {
            content: '';
            position: absolute;
            inset: -1px;
            border-radius: ${TOKENS.radius.xl + 1}px;
            padding: 2px;
            background: linear-gradient(115deg, ${gold.line} 0%, ${gold.hover} 25%, ${gold.line} 50%, ${gold.hover} 75%, ${gold.line} 100%);
            background-size: 200% 100%;
            -webkit-mask: linear-gradient(rgba(0, 0, 0, 1) 0 0) content-box, linear-gradient(rgba(0, 0, 0, 1) 0 0);
            -webkit-mask-composite: xor;
            mask: linear-gradient(rgba(0, 0, 0, 1) 0 0) content-box, linear-gradient(rgba(0, 0, 0, 1) 0 0);
            mask-composite: exclude;
            animation: lp-gold-drift 8s linear infinite;
            pointer-events: none;
          }
          @keyframes lp-gold-drift {
            from { background-position: 0% 50%; }
            to { background-position: 200% 50%; }
          }
          /* CTA tugmasi — jonli oltin gradient sekin oqadi (e'tiborni tortish uchun).
             .ant-btn xususiyligini yengish uchun !important; faqat background-position
             animatsiya qilinadi (arzon repaint). */
          .lp-cta-btn.ant-btn {
            border: none !important;
            color: ${gold.contrast} !important;
            font-weight: 700 !important;
            background-image: linear-gradient(100deg, ${gold.active} 0%, ${gold.hover} 22%, ${gold.base} 45%, ${gold.hover} 68%, ${gold.active} 100%) !important;
            background-size: 220% 100% !important;
            box-shadow: 0 6px 22px ${gold.glow};
            animation: lp-cta-slide 4.5s linear infinite;
          }
          .lp-cta-btn.ant-btn:hover { filter: brightness(1.07); }
          .lp-cta-btn.ant-btn:active { filter: brightness(0.95); }
          @keyframes lp-cta-slide {
            from { background-position: 0% 50%; }
            to { background-position: 220% 50%; }
          }
          /* Konturli tugma — "ghost" o'rniga: hoverdan oldin ham aniq ko'rinadi */
          .lp-outline-btn.ant-btn {
            color: ${gold.base} !important;
            border: 1px solid ${gold.line} !important;
            background: ${gold.subtle} !important;
            font-weight: 600 !important;
          }
          .lp-outline-btn.ant-btn:hover {
            color: ${gold.hover} !important;
            border-color: ${gold.base} !important;
            background: rgba(212, 175, 55, 0.18) !important;
          }
          @media (prefers-reduced-motion: reduce) {
            .lp-plan-glow::before { animation: none; }
            .lp-cta-btn.ant-btn { animation: none; }
          }
        `}</style>

        {/* ------------------------------------------------ Yopishqoq navbar */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            /* Skrollda shisha fon biroz zichlashadi — kontent ustida o'qilishi yaxshilanadi */
            background: navScrolled ? NAV_BG_SCROLLED : NAV_BG,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${border.subtle}`,
            boxShadow: navScrolled ? TOKENS.shadow.level1 : 'none',
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
          }}
        >
          <div
            style={{
              ...container,
              height: 68,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Link to="/" aria-label="Billiard Club">
              <span className="lp-brand-full">
                <BrandLogo size={34} withWordmark />
              </span>
              <span className="lp-brand-min">
                <BrandLogo size={34} />
              </span>
            </Link>

            <nav className="lp-nav-desktop" aria-label={t('landing.navMenu')}>
              {NAV_LINKS.map((link) => (
                <a key={link.id} className="lp-nav-link" href={`#${link.id}`}>
                  {t(`landing.${link.key}`)}
                </a>
              ))}
              {langSwitcher()}
              <Button className="lp-outline-btn" onClick={() => navigate('/login')}>
                {t('landing.navLogin')}
              </Button>
              <Button type="primary" className="lp-cta-btn" onClick={() => navigate('/register')}>
                {t('landing.navCta')}
              </Button>
            </nav>

            <div className="lp-nav-mobile">
              {langSwitcher()}
              <Button
                type="text"
                icon={<MenuOutlined style={{ fontSize: 20 }} />}
                aria-label={t('landing.navMenu')}
                onClick={() => setMenuOpen(true)}
              />
            </div>
          </div>
        </header>

        {/* Mobil menyu */}
        <Drawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          placement="right"
          width={300}
          title={<BrandLogo size={28} withWordmark />}
          styles={{ body: { padding: 20, display: 'flex', flexDirection: 'column' } }}
        >
          <nav aria-label={t('landing.navMenu')}>
            {NAV_LINKS.map((link) => (
              <a
                key={link.id}
                className="lp-drawer-link"
                href={`#${link.id}`}
                onClick={() => setMenuOpen(false)}
              >
                {t(`landing.${link.key}`)}
              </a>
            ))}
          </nav>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Button
              block
              size="large"
              onClick={() => {
                setMenuOpen(false);
                navigate('/login');
              }}
            >
              {t('landing.navLogin')}
            </Button>
            <Button
              block
              size="large"
              type="primary"
              className="lp-cta-btn"
              onClick={() => {
                setMenuOpen(false);
                navigate('/register');
              }}
            >
              {t('landing.navCta')}
            </Button>
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 24, textAlign: 'center' }}>
            {langSwitcher('middle')}
          </div>
        </Drawer>

        <main>
          {/* -------------------------------------------------------- Hero */}
          <section style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate' }}>
            {/* Fon: jonli aurora nurlari + donadorlik — hero kontenti ORQASIDA suzadi */}
            <AnimatedBackground variant="aurora" withGrain />
            {/* Suzuvchi soqqalar qatlami — skrollda nozik parallaks (faqat transform) */}
            <motion.div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                y: reduceMotion ? 0 : heroBallsY,
              }}
            >
              {HERO_BALLS.map((ball) => (
                <FloatingBall key={ball.num} ball={ball} />
              ))}
            </motion.div>

            <div
              style={{
                ...container,
                position: 'relative',
                zIndex: 1,
                paddingTop: 'clamp(56px, 8vw, 104px)',
                paddingBottom: 'clamp(56px, 8vw, 96px)',
              }}
            >
              <Row gutter={[48, 48]} align="middle">
                <Col xs={24} lg={13}>
                  <motion.div initial="hidden" animate="visible" variants={stagger}>
                    <motion.div variants={fadeUp}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '6px 14px',
                          borderRadius: TOKENS.radius.pill,
                          border: `1px solid ${gold.line}`,
                          background: gold.subtle,
                          color: gold.base,
                          fontSize: 13,
                          fontWeight: 600,
                          letterSpacing: 0.4,
                        }}
                      >
                        {t('landing.heroBadge')}
                      </span>
                    </motion.div>
                    <motion.h1
                      variants={fadeUp}
                      style={{
                        fontSize: 'clamp(34px, 5vw, 56px)',
                        lineHeight: 1.12,
                        fontWeight: 800,
                        color: text.primary,
                        letterSpacing: -0.5,
                        margin: '22px 0 18px',
                      }}
                    >
                      {t('landing.heroTitle')}
                    </motion.h1>
                    <motion.p
                      variants={fadeUp}
                      style={{
                        fontSize: 18,
                        color: text.secondary,
                        maxWidth: 540,
                        lineHeight: 1.65,
                        margin: 0,
                      }}
                    >
                      {t('landing.heroSubtitle')}
                    </motion.p>
                    <motion.div
                      variants={fadeUp}
                      style={{ display: 'flex', gap: 14, marginTop: 34, flexWrap: 'wrap' }}
                    >
                      <Button
                        type="primary"
                        size="large"
                        className="lp-cta-btn"
                        style={{ height: 52, padding: '0 32px', fontSize: 16, fontWeight: 600 }}
                        onClick={() => navigate('/register')}
                      >
                        {t('landing.heroCta')} <ArrowRightOutlined />
                      </Button>
                      <Button
                        size="large"
                        className="lp-outline-btn"
                        style={{ height: 52, padding: '0 28px', fontSize: 16 }}
                        href="#features"
                      >
                        {t('landing.heroSecondary')}
                      </Button>
                    </motion.div>
                    <motion.div
                      variants={fadeUp}
                      style={{ marginTop: 18, fontSize: 13.5, color: text.secondary }}
                    >
                      {t('landing.heroNote')}
                    </motion.div>
                  </motion.div>
                </Col>
                <Col xs={24} lg={11}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: TOKENS.motion.easing.out, delay: 0.25 }}
                  >
                    <BilliardTable hint={t('landing.heroTableHint')} />
                  </motion.div>
                </Col>
              </Row>
            </div>
          </section>

          {/* --------------------------------- Ijtimoiy isbot — stat band */}
          <section
            style={{
              borderTop: `1px solid ${gold.line}`,
              borderBottom: `1px solid ${gold.line}`,
              background: SOFT_PANEL,
            }}
          >
            <div style={{ ...container, paddingTop: 44, paddingBottom: 44 }}>
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
              >
                <Row gutter={[32, 28]}>
                  {STAT_KEYS.map((key) => (
                    <Col xs={12} md={6} key={key}>
                      <motion.div variants={fadeUp} style={{ textAlign: 'center' }}>
                        <div
                          style={{ color: gold.base, fontSize: 22, fontWeight: 800, lineHeight: 1.3 }}
                        >
                          {t(`landing.${key}Value`)}
                        </div>
                        <div style={{ color: text.secondary, fontSize: 14, marginTop: 6 }}>
                          {t(`landing.${key}Label`)}
                        </div>
                      </motion.div>
                    </Col>
                  ))}
                </Row>
              </motion.div>
            </div>
          </section>

          <SectionDivider />

          {/* ------------------------------------------------ Imkoniyatlar */}
          <section id="features" style={sectionPad}>
            <div style={container}>
              <SectionHeading
                overline={t('landing.featuresOverline')}
                title={t('landing.featuresTitle')}
                subtitle={t('landing.featuresSubtitle')}
              />
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.05 }}
              >
                <Row gutter={[24, 24]}>
                  {FEATURE_ITEMS.map(({ key, icon }) => (
                    <Col xs={24} sm={12} lg={6} key={key}>
                      <motion.div
                        variants={fadeUp}
                        whileHover={{ y: -6 }}
                        transition={{
                          type: 'tween',
                          duration: TOKENS.motion.duration.base,
                          ease: TOKENS.motion.easing.out,
                        }}
                        style={{ height: '100%' }}
                      >
                        <GlassCard padding={24} style={{ height: '100%' }}>
                          <div
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: gold.subtle,
                              border: `1px solid ${gold.line}`,
                              color: gold.base,
                              fontSize: 20,
                            }}
                          >
                            {icon}
                          </div>
                          <h3
                            style={{
                              fontSize: 16,
                              fontWeight: 700,
                              color: text.primary,
                              margin: '18px 0 8px',
                              lineHeight: 1.35,
                            }}
                          >
                            {t(`landing.${key}Title`)}
                          </h3>
                          <p
                            style={{
                              color: text.secondary,
                              fontSize: 14,
                              lineHeight: 1.65,
                              margin: 0,
                            }}
                          >
                            {t(`landing.${key}Desc`)}
                          </p>
                        </GlassCard>
                      </motion.div>
                    </Col>
                  ))}
                </Row>
              </motion.div>
            </div>
          </section>

          <SectionDivider />

          {/* --------------------------------------------- Qanday ishlaydi */}
          <section id="how" style={{ ...sectionPad, background: SOFT_PANEL }}>
            <div style={container}>
              <SectionHeading overline={t('landing.howOverline')} title={t('landing.howTitle')} />
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
              >
                <Row gutter={[32, 40]}>
                  {STEP_KEYS.map((key, index) => (
                    <Col xs={24} md={8} key={key}>
                      <motion.div variants={fadeUp} style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: '50%',
                            border: `1px solid ${gold.line}`,
                            background: gold.subtle,
                            color: gold.base,
                            fontWeight: 700,
                            fontSize: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 18px',
                          }}
                        >
                          {index + 1}
                        </div>
                        <h3
                          style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: text.primary,
                            margin: '0 0 10px',
                          }}
                        >
                          {t(`landing.${key}Title`)}
                        </h3>
                        <p
                          style={{
                            color: text.secondary,
                            fontSize: 14.5,
                            lineHeight: 1.65,
                            margin: '0 auto',
                            maxWidth: 300,
                          }}
                        >
                          {t(`landing.${key}Desc`)}
                        </p>
                      </motion.div>
                    </Col>
                  ))}
                </Row>
                <motion.p
                  variants={fadeUp}
                  style={{
                    textAlign: 'center',
                    color: text.secondary,
                    fontSize: 15,
                    marginTop: 48,
                    marginBottom: 0,
                  }}
                >
                  {t('landing.howNote')}
                </motion.p>
              </motion.div>
            </div>
          </section>

          <SectionDivider />

          {/* ------------------------------------------------------ Tariflar */}
          <section id="pricing" style={sectionPad}>
            <div style={container}>
              <SectionHeading
                overline={t('landing.pricingOverline')}
                title={t('landing.pricingTitle')}
                subtitle={t('landing.pricingSubtitle')}
              />
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.1 }}
              >
                <Row gutter={[24, 32]} align="stretch">
                  {planCards.map((plan) => (
                    <Col xs={24} md={8} key={plan.key}>
                      <motion.div variants={fadeUp} style={{ height: '100%' }}>
                        <div
                          className={plan.highlighted ? 'lp-plan-glow' : undefined}
                          style={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                            borderRadius: TOKENS.radius.xl,
                            border: plan.highlighted
                              ? `1px solid ${gold.base}`
                              : `1px solid ${border.base}`,
                            background: plan.highlighted
                              ? `linear-gradient(170deg, ${gold.subtle}, ${CARD_TINT} 45%)`
                              : bg.bg1,
                            boxShadow: plan.highlighted
                              ? TOKENS.shadow.glowActive
                              : TOKENS.shadow.level1,
                            padding: '32px 28px 28px',
                          }}
                        >
                          {plan.highlighted && (
                            <span
                              style={{
                                position: 'absolute',
                                top: -13,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                padding: '4px 14px',
                                borderRadius: TOKENS.radius.pill,
                                background: gold.gradient,
                                color: gold.contrast,
                                fontSize: 12.5,
                                fontWeight: 700,
                                letterSpacing: 0.4,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {t('landing.bestValue')}
                            </span>
                          )}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                          >
                            <span style={{ fontSize: 17, fontWeight: 700, color: text.primary }}>
                              {plan.name}
                            </span>
                            {plan.savePercent > 0 && (
                              <span
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: TOKENS.radius.pill,
                                  background: emerald.deep,
                                  color: emerald.glow,
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {t('landing.save', { percent: plan.savePercent })}
                              </span>
                            )}
                          </div>
                          <div style={{ marginTop: 18 }}>
                            <span
                              className="tabular-nums"
                              style={{
                                fontSize: 34,
                                fontWeight: 800,
                                color: text.primary,
                                lineHeight: 1,
                              }}
                            >
                              {formatNumber(plan.price)}
                            </span>
                            <span style={{ fontSize: 15, color: text.secondary, fontWeight: 500 }}>
                              {' '}
                              {t('common.sum')} / {plan.periodLabel}
                            </span>
                          </div>
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 13.5,
                              color: plan.months > 1 ? gold.base : text.tertiary,
                              minHeight: 20,
                            }}
                          >
                            {plan.months > 1
                              ? t('landing.perMonth', {
                                  amount: formatNumber(Math.round(plan.price / plan.months)),
                                })
                              : ' '}
                          </div>
                          <div
                            style={{
                              borderTop: `1px solid ${border.subtle}`,
                              margin: '18px 0',
                            }}
                          />
                          <ul
                            style={{
                              listStyle: 'none',
                              margin: 0,
                              padding: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 12,
                              flex: 1,
                            }}
                          >
                            {PLAN_FEATURE_KEYS.map((featKey) => (
                              <li
                                key={featKey}
                                style={{
                                  display: 'flex',
                                  gap: 10,
                                  alignItems: 'flex-start',
                                  color: text.secondary,
                                  fontSize: 14,
                                  lineHeight: 1.5,
                                }}
                              >
                                <CheckCircleOutlined
                                  style={{ color: gold.base, fontSize: 15, marginTop: 3 }}
                                />
                                {t(`landing.${featKey}`)}
                              </li>
                            ))}
                          </ul>
                          <Button
                            block
                            size="large"
                            type={plan.highlighted ? 'primary' : 'default'}
                            className={plan.highlighted ? 'lp-cta-btn' : undefined}
                            style={{ marginTop: 24, height: 46, fontWeight: 600 }}
                            onClick={() => navigate('/register')}
                          >
                            {t('landing.planCta')}
                          </Button>
                        </div>
                      </motion.div>
                    </Col>
                  ))}
                </Row>
                <motion.p
                  variants={fadeUp}
                  style={{
                    textAlign: 'center',
                    color: text.tertiary,
                    fontSize: 13.5,
                    marginTop: 28,
                    marginBottom: 0,
                  }}
                >
                  {t('landing.pricingNote')}
                </motion.p>
              </motion.div>
            </div>
          </section>

          <SectionDivider />

          {/* ------------------------------------------------ Mijozlar fikri */}
          <section id="testimonials" style={{ ...sectionPad, background: SOFT_PANEL }}>
            <div style={container}>
              <SectionHeading
                overline={t('landing.testimonialsOverline')}
                title={t('landing.testimonialsTitle')}
              />
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.05 }}
              >
                <Row gutter={[24, 24]}>
                  {TESTIMONIALS.map(({ k, color }) => (
                    <Col xs={24} sm={12} xl={6} key={k}>
                      <motion.div variants={fadeUp} style={{ height: '100%' }}>
                        <div
                          style={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            background: bg.bg1,
                            border: `1px solid ${border.subtle}`,
                            borderRadius: TOKENS.radius.lg,
                            padding: 24,
                            boxShadow: TOKENS.shadow.level1,
                          }}
                        >
                          <div aria-hidden style={{ display: 'flex', gap: 3, marginBottom: 14 }}>
                            {Array.from({ length: 5 }, (_, i) => (
                              <StarFilled key={i} style={{ color: gold.base, fontSize: 14 }} />
                            ))}
                          </div>
                          <p
                            style={{
                              color: text.secondary,
                              fontSize: 14.5,
                              lineHeight: 1.7,
                              margin: '0 0 20px',
                              flex: 1,
                            }}
                          >
                            {t(`landing.${k}Quote`)}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Avatar
                              size={40}
                              style={{
                                background: color,
                                color: gold.contrast,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {t(`landing.${k}Name`).charAt(0)}
                            </Avatar>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{ color: text.primary, fontWeight: 600, fontSize: 14.5 }}
                              >
                                {t(`landing.${k}Name`)}
                              </div>
                              <div style={{ color: text.tertiary, fontSize: 13, marginTop: 2 }}>
                                {t(`landing.${k}Club`)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </Col>
                  ))}
                </Row>
              </motion.div>
            </div>
          </section>

          <SectionDivider />

          {/* --------------------------------------------------- Savol-javob */}
          <section id="faq" style={sectionPad}>
            <div style={{ ...container, maxWidth: 800 }}>
              <SectionHeading
                overline={t('landing.faqOverline')}
                title={t('landing.faqTitle')}
              />
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.05 }}
              >
                <Collapse
                  className="lp-faq"
                  accordion
                  ghost
                  expandIconPosition="end"
                  items={faqItems}
                />
              </motion.div>
            </div>
          </section>

          <SectionDivider />

          {/* --------------------------------------------------------- Aloqa */}
          <section id="contact" style={{ ...sectionPad, background: SOFT_PANEL }}>
            <div style={container}>
              <SectionHeading
                overline={t('landing.contactOverline')}
                title={t('landing.contactTitle')}
                subtitle={t('landing.contactSubtitle')}
              />
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.1 }}
              >
                <Row gutter={[24, 24]} justify="center">
                  {contactCards.map((card) => (
                    <Col xs={24} sm={12} md={8} key={card.key}>
                      <motion.div variants={fadeUp} style={{ height: '100%' }}>
                        <GlassCard padding={28} style={{ height: '100%', textAlign: 'center' }}>
                          <div
                            style={{
                              width: 52,
                              height: 52,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: gold.subtle,
                              border: `1px solid ${gold.line}`,
                              color: gold.base,
                              fontSize: 22,
                              margin: '0 auto',
                            }}
                          >
                            {card.icon}
                          </div>
                          <h3
                            style={{
                              fontSize: 17,
                              fontWeight: 700,
                              color: text.primary,
                              margin: '16px 0 6px',
                            }}
                          >
                            {t(`landing.${card.titleKey}`)}
                          </h3>
                          <p
                            style={{
                              color: text.secondary,
                              fontSize: 13.5,
                              lineHeight: 1.6,
                              margin: '0 0 10px',
                            }}
                          >
                            {t(`landing.${card.descKey}`)}
                          </p>
                          <div
                            style={{
                              color: text.primary,
                              fontWeight: 600,
                              fontSize: 14.5,
                              marginBottom: 18,
                              wordBreak: 'break-all',
                            }}
                          >
                            {card.value}
                          </div>
                          <Button
                            block
                            href={card.href}
                            {...(card.external
                              ? { target: '_blank', rel: 'noreferrer noopener' }
                              : {})}
                          >
                            {t(`landing.${card.ctaKey}`)}
                          </Button>
                        </GlassCard>
                      </motion.div>
                    </Col>
                  ))}
                </Row>
              </motion.div>
            </div>
          </section>
        </main>

        {/* ------------------------------------------------------------ Footer */}
        <footer style={{ borderTop: `1px solid ${border.subtle}` }}>
          <div style={{ ...container, paddingTop: 48, paddingBottom: 32 }}>
            <Row gutter={[32, 32]}>
              <Col xs={24} md={10}>
                <BrandLogo size={32} withWordmark />
                <p
                  style={{
                    color: text.secondary,
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    margin: '14px 0 0',
                    maxWidth: 320,
                  }}
                >
                  {t('landing.footerTagline')}
                </p>
              </Col>
              <Col xs={12} md={7}>
                <div
                  style={{
                    color: text.tertiary,
                    fontSize: 12.5,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: 14,
                  }}
                >
                  {t('landing.footerProduct')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {NAV_LINKS.map((link) => (
                    <a key={link.id} className="lp-nav-link" href={`#${link.id}`}>
                      {t(`landing.${link.key}`)}
                    </a>
                  ))}
                </div>
              </Col>
              <Col xs={12} md={7}>
                <div
                  style={{
                    color: text.tertiary,
                    fontSize: 12.5,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: 14,
                  }}
                >
                  {t('landing.footerAccount')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Link className="lp-nav-link" to="/login">
                    {t('landing.navLogin')}
                  </Link>
                  <Link className="lp-nav-link" to="/register">
                    {t('landing.navCta')}
                  </Link>
                </div>
              </Col>
            </Row>
            <div
              style={{
                borderTop: `1px solid ${border.subtle}`,
                marginTop: 36,
                paddingTop: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              <span style={{ color: text.tertiary, fontSize: 12.5 }}>
                {t('landing.footerLegal', { year: new Date().getFullYear() })}
              </span>
              {langSwitcher()}
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
};

export default Landing;
