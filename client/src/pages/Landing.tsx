import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Col, Collapse, Drawer, Row, Segmented } from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  AndroidFilled,
  GlobalOutlined,
  InstagramOutlined,
  MailOutlined,
  MenuOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  StarFilled,
  WindowsFilled,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  motion,
  MotionConfig,
  useMotionValueEvent,
  useScroll,
} from 'framer-motion';
import { useAppSettings } from '../context/AppSettingsContext';
import {
  SUPPORT_EMAIL,
  SUPPORT_INSTAGRAM,
  SUPPORT_PHONE,
  SUPPORT_TELEGRAM,
  VENDOR_NAME,
} from '../constants';
import { TOKENS } from '../theme/tokens';
import { BrandLogo } from '../components/ui';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { formatNumber } from '../utils/format';
import { publicApi } from '../api';
import { setTrialDays } from '../i18n';
import type { Plan } from '../types';
import { fadeUp, hexToRgba, SectionHeading, stagger } from './landing/shared';
import PainPoints from './landing/PainPoints';
import ProductShowcase from './landing/ProductShowcase';
import Highlights from './landing/Highlights';
import LiveScenes from './landing/LiveScenes';
import RoiCalculator from './landing/RoiCalculator';
import Comparison from './landing/Comparison';
import LeadForm from './landing/LeadForm';
import { FinalCta, StickyCta } from './landing/FinalCta';
import FeatureBento from './landing/FeatureBento';
import HeroStage from './landing/HeroStage';
import CapabilityStrip from './landing/CapabilityStrip';
import HowItWorks from './landing/HowItWorks';
import './landing/landing.css';

const { bg, border, emerald, gold, text, semantic } = TOKENS.color;

/* Neytral shaffof qatlamlar (brend ranglari EMAS — alfa-overlay) */
const NAV_BG = hexToRgba(bg.bg0, 0.82);
/** 40px dan pastga aylantirilganda navbar foni biroz zichlashadi */
const NAV_BG_SCROLLED = hexToRgba(bg.bg0, 0.94);
const CARD_TINT = 'rgba(255, 255, 255, 0.03)';

/**
 * Navigatsiya havolalari. `secondary` — 1200px dan tor ekranda yuqori
 * menyudan yashiriladi (mobil menyu va footerda doim bor), `drawerOnly` —
 * faqat mobil menyu va footerda.
 */
const NAV_LINKS: { id: string; key: string; secondary?: boolean; drawerOnly?: boolean }[] = [
  { id: 'features', key: 'navFeatures' },
  { id: 'demo', key: 'navDemo' },
  { id: 'calculator', key: 'navCalculator', secondary: true },
  { id: 'pricing', key: 'navPricing' },
  { id: 'faq', key: 'navFaq' },
  { id: 'contact', key: 'navContact', drawerOnly: true },
];

const PLAN_FEATURE_KEYS = ['planFeat1', 'planFeat2', 'planFeat3', 'planFeat4'] as const;
const HERO_TRUST_KEYS = ['heroTrust1', 'heroTrust2', 'heroTrust3'] as const;
const GUARANTEE_KEYS = ['guarantee1', 'guarantee2', 'guarantee3'] as const;
/** MUHIM: index.html dagi FAQPage JSON-LD bilan sinxron (uz matnlar) */
const FAQ_COUNT = 11;

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
  days: number;
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
    days: 30,
    savePercent: 0,
    nameKey: 'planMonthlyName',
    periodKey: 'planMonthlyPeriod',
  },
  {
    code: 'semiannual',
    price: 1490000,
    months: 6,
    days: 180,
    savePercent: 14,
    nameKey: 'planSemiName',
    periodKey: 'planSemiPeriod',
  },
  {
    code: 'yearly',
    price: 2490000,
    months: 12,
    days: 365,
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
  days: number;
  savePercent: number;
  highlighted: boolean;
}

const TESTIMONIALS = [
  { k: 't1', color: gold.base },
  { k: 't2', color: emerald.bright },
  { k: 't3', color: semantic.info },
  { k: 't4', color: gold.dim },
] as const;

/* ------------------------------------------------- Bo'lim ajratuvchi qatlam */

/** Bo'limlar orasidagi ingichka ajratuvchi chiziq (minimalizm) */
const SectionDivider = () => <div aria-hidden className="lp-divider" />;

/* ------------------------------------------------------------------ Sahifa */

const Landing = () => {
  const { t } = useTranslation();
  const { lang, setLang } = useAppSettings();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);

  /* Skroll qiymati — navbar zichligi uchun.
     MotionValue to'g'ridan-to'g'ri transformga yoziladi: layout o'qilmaydi,
     state faqat 40px chegara kesilganda almashadi (React o'zi bail out qiladi). */
  const { scrollY, scrollYProgress } = useScroll();
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

  /**
   * BEPUL SINOV MUDDATI — superadmin sozlamasidan (GET /public/config).
   *
   * Sahifadagi barcha "N kun bepul" matnlari shu qiymatdan yig'iladi
   * (i18n `{{days}}`). Ilgari ular qat'iy "7 kun" edi va superadmin
   * muddatni o'zgartirsa sayt YOLG'ON va'da berib qolardi.
   *
   * `trialDays` holati ataylab saqlanadi: u to'g'ridan-to'g'ri render'da
   * ishlatilmasa ham, o'zgarishi qayta render'ni keltiradi va shundagina
   * `t()` yangi qiymat bilan interpolatsiya qiladi.
   */
  const [, setTrialDaysState] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    publicApi
      .config()
      .then((res) => {
        if (!alive || typeof res.data?.trialDays !== 'number') return;
        setTrialDays(res.data.trialDays);
        setTrialDaysState(res.data.trialDays);
      })
      .catch(() => {
        /* standart qiymat (7) qoladi — sahifa baribir to'g'ri ko'rinadi */
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
        days: Math.max(1, p.durationDays),
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
      days: p.days,
      savePercent: p.savePercent,
      highlighted: Boolean(p.highlighted),
    }));
  }, [livePlans, lang, t]);

  /** Kalkulyator uchun eng qisqa tarifning bir oylik narxi */
  const monthlyPrice = useMemo(() => {
    const first = planCards[0];
    return first ? Math.round(first.price / Math.max(1, first.months)) : PLAN_TIERS[0].price;
  }, [planCards]);

  const goRegister = () => navigate('/register');

  const telegramHandle = SUPPORT_TELEGRAM.replace(/^https?:\/\/t\.me\//, '@');
  const instagramHandle = SUPPORT_INSTAGRAM.replace(
    /^https?:\/\/(www\.)?instagram\.com\//,
    '@',
  ).replace(/\/$/, '');

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
      value: SUPPORT_PHONE,
      href: `tel:${SUPPORT_PHONE.replace(/[^\d+]/g, '')}`,
      external: false,
      show: Boolean(SUPPORT_PHONE),
    },
    {
      key: 'instagram',
      icon: <InstagramOutlined />,
      titleKey: 'contactInstagramTitle',
      descKey: 'contactInstagramDesc',
      value: instagramHandle,
      href: SUPPORT_INSTAGRAM,
      external: true,
      show: true,
    },
    {
      key: 'email',
      icon: <MailOutlined />,
      titleKey: 'contactEmailTitle',
      descKey: 'contactEmailDesc',
      value: SUPPORT_EMAIL,
      href: `mailto:${SUPPORT_EMAIL}`,
      external: false,
      show: true,
    },
  ].filter((c) => c.show);

  /* Savol-javob — qidiruv tizimlari uchun FAQPage tuzilmali ma'lumoti (Google
     natijalarida kengaytirilgan ko'rinish). Til almashganda yangilanadi. */
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.landingFaq = '';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: lang,
      mainEntity: Array.from({ length: FAQ_COUNT }, (_, i) => ({
        '@type': 'Question',
        name: t(`landing.faq${i + 1}Q`),
        acceptedAnswer: { '@type': 'Answer', text: t(`landing.faq${i + 1}A`) },
      })),
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, [lang, t]);

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
          background: bg.bg0,
          color: text.primary,
          overflowX: 'hidden',
        }}
      >
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
          <motion.div aria-hidden className="lp-progress" style={{ scaleX: scrollYProgress }} />
          <div
            className="lp-container"
            style={{
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
              {NAV_LINKS.filter((link) => !link.drawerOnly).map((link) => (
                <a
                  key={link.id}
                  className={`lp-nav-link${link.secondary ? ' lp-nav-link--secondary' : ''}`}
                  href={`#${link.id}`}
                >
                  {t(`landing.${link.key}`)}
                </a>
              ))}
              <Link className="lp-nav-link lp-nav-link--secondary" to="/download">
                {t('landing.navDownload')}
              </Link>
              {langSwitcher()}
              <Button className="lp-outline-btn" onClick={() => navigate('/login')}>
                {t('landing.navLogin')}
              </Button>
              <Button type="primary" className="lp-cta-btn" onClick={goRegister}>
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
            <Link className="lp-drawer-link" to="/download" onClick={() => setMenuOpen(false)}>
              {t('landing.navDownload')}
            </Link>
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
                goRegister();
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
          <section className="lp-hero" style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate' }}>
            {/* Minimal fon: qorong'i zal va stol ustidagi chiroq nuri (aurora/soqqalar yo'q) */}
            <div className="lp-hero-lamp" aria-hidden />

            <div
              className="lp-container"
              style={{
                position: 'relative',
                zIndex: 1,
                paddingTop: 'clamp(48px, 8vw, 104px)',
                paddingBottom: 'clamp(56px, 8vw, 96px)',
              }}
            >
              <Row gutter={[{ xs: 16, lg: 48 }, 40]} align="middle">
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
                    <motion.h1 variants={fadeUp} className="lp-hero-title">
                      {t('landing.heroTitle')}
                    </motion.h1>
                    <motion.p
                      variants={fadeUp}
                      style={{
                        fontSize: 'clamp(16px, 1.6vw, 18px)',
                        color: text.secondary,
                        maxWidth: 560,
                        lineHeight: 1.65,
                        margin: 0,
                      }}
                    >
                      {t('landing.heroSubtitle')}
                    </motion.p>
                    <motion.div
                      variants={fadeUp}
                      className="lp-hero-actions"
                      style={{ display: 'flex', gap: 14, marginTop: 34, flexWrap: 'wrap' }}
                    >
                      <Button
                        type="primary"
                        size="large"
                        className="lp-cta-btn"
                        style={{ height: 52, padding: '0 32px', fontSize: 16, fontWeight: 600 }}
                        onClick={goRegister}
                      >
                        {t('landing.heroCta')} <ArrowRightOutlined />
                      </Button>
                      <Button
                        size="large"
                        className="lp-outline-btn"
                        style={{ height: 52, padding: '0 28px', fontSize: 16 }}
                        href="#demo"
                      >
                        {t('landing.heroSecondary')}
                      </Button>
                    </motion.div>
                    <motion.ul variants={fadeUp} className="lp-hero-trust">
                      {HERO_TRUST_KEYS.map((key) => (
                        <li key={key}>
                          <CheckCircleFilled aria-hidden /> {t(`landing.${key}`)}
                        </li>
                      ))}
                    </motion.ul>
                    {/* Platformalar — ClubTime kabi: dastur qayerda ishlashi birinchi ekranda */}
                    <motion.div variants={fadeUp} className="lp-platforms">
                      <Link to="/download#windows" className="lp-platform">
                        <WindowsFilled aria-hidden /> Windows
                      </Link>
                      <Link to="/download#android" className="lp-platform">
                        <AndroidFilled aria-hidden /> Android
                      </Link>
                      <Link to="/login" className="lp-platform">
                        <GlobalOutlined aria-hidden /> {t('landing.platformWeb')}
                      </Link>
                    </motion.div>
                  </motion.div>
                </Col>
                <Col xs={24} lg={11}>
                  <HeroStage />
                </Col>
              </Row>
            </div>
          </section>

          {/* ------------------------- Platformalar va imkoniyatlar lentasi */}
          <CapabilityStrip />

          {/* ------------------------------------------ Muammo -> yechim */}
          <PainPoints />

          <SectionDivider />

          {/* ------------------------------------------------ Imkoniyatlar */}
          <FeatureBento />

          {/* ------------------------------------- Jonli sahnalar (rasmli) */}
          <LiveScenes />

          {/* ------------------------------------------------- Jonli demo */}
          <ProductShowcase />

          {/* ------------------------- Chiroq, oflayn rejim, qurilmalar */}
          <Highlights />

          {/* ------------------------------------------------ Kalkulyator */}
          <RoiCalculator monthlyPrice={monthlyPrice} onCta={goRegister} />

          {/* --------------------------------------------- Qanday ishlaydi */}
          <HowItWorks />

          {/* -------------------------------------------------- Taqqoslash */}
          <Comparison />

          <SectionDivider />

          {/* ------------------------------------------------------ Tariflar */}
          <section id="pricing" className="lp-section">
            <div className="lp-container">
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
                              : ' '}
                          </div>
                          {/* Kunlik narx — "bir soatlik o'yindan arzon" hissi */}
                          <span className="lp-plan-perday" style={{ alignSelf: 'flex-start' }}>
                            {t('landing.planPerDay', {
                              amount: formatNumber(Math.round(plan.price / plan.days / 100) * 100),
                            })}
                          </span>
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
                            onClick={goRegister}
                          >
                            {t('landing.planCta')}
                          </Button>
                        </div>
                      </motion.div>
                    </Col>
                  ))}
                </Row>
                <motion.ul variants={fadeUp} className="lp-guarantees">
                  {GUARANTEE_KEYS.map((key) => (
                    <li key={key}>
                      <SafetyCertificateOutlined aria-hidden /> {t(`landing.${key}`)}
                    </li>
                  ))}
                </motion.ul>
                <motion.p
                  variants={fadeUp}
                  style={{
                    textAlign: 'center',
                    color: text.tertiary,
                    fontSize: 13.5,
                    marginTop: 18,
                    marginBottom: 0,
                  }}
                >
                  {t('landing.pricingNote')}
                </motion.p>
              </motion.div>
            </div>
          </section>

          {/* ------------------------------------------------ Mijozlar fikri */}
          <section id="testimonials" className="lp-section lp-section--panel">
            <div className="lp-container">
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
                <Row gutter={[20, 20]}>
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

          {/* --------------------------------------------------- Savol-javob */}
          <section id="faq" className="lp-section">
            <div className="lp-container" style={{ maxWidth: 820 }}>
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

          {/* ------------------------------------------------ Aloqa + ariza */}
          <section id="contact" className="lp-section lp-section--panel">
            <div className="lp-container">
              <SectionHeading
                overline={t('landing.contactOverline')}
                title={t('landing.contactTitle')}
                subtitle={t('landing.contactSubtitle')}
              />
              <motion.div
                className="lp-contact-grid"
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.1 }}
              >
                <motion.div variants={fadeUp}>
                  <LeadForm />
                </motion.div>
                <motion.div variants={fadeUp} className="lp-contact-aside">
                  <h3>{t('landing.contactAsideTitle')}</h3>
                  <p>{t('landing.contactAsideDesc')}</p>
                  <div className="lp-contact-cards">
                    {contactCards.map((card) => (
                      <a
                        key={card.key}
                        className="lp-contact-card"
                        href={card.href}
                        {...(card.external
                          ? { target: '_blank', rel: 'noreferrer noopener' }
                          : {})}
                      >
                        <span className="lp-contact-card__icon" aria-hidden>
                          {card.icon}
                        </span>
                        <strong>{t(`landing.${card.titleKey}`)}</strong>
                        <span>{t(`landing.${card.descKey}`)}</span>
                        <em>{card.value}</em>
                      </a>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </section>

          {/* ------------------------------------------------ Yakuniy CTA */}
          <FinalCta onStart={goRegister} />
        </main>

        {/* ------------------------------------------------------------ Footer */}
        <footer style={{ borderTop: `1px solid ${border.subtle}` }}>
          <div className="lp-container" style={{ paddingTop: 48, paddingBottom: 32 }}>
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
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    marginTop: 20,
                    alignItems: 'flex-start',
                  }}
                >
                  <a
                    className="lp-nav-link lp-footer-contact"
                    href={SUPPORT_TELEGRAM}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <SendOutlined /> {telegramHandle}
                  </a>
                  <a
                    className="lp-nav-link lp-footer-contact"
                    href={SUPPORT_INSTAGRAM}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <InstagramOutlined /> {instagramHandle}
                  </a>
                  <a
                    className="lp-nav-link lp-footer-contact"
                    href={`tel:${SUPPORT_PHONE.replace(/[^\d+]/g, '')}`}
                  >
                    <PhoneOutlined /> {SUPPORT_PHONE}
                  </a>
                  <a className="lp-nav-link lp-footer-contact" href={`mailto:${SUPPORT_EMAIL}`}>
                    <MailOutlined /> {SUPPORT_EMAIL}
                  </a>
                </div>
              </Col>
              <Col xs={12} md={7}>
                <div className="lp-footer-title">{t('landing.footerProduct')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                  {NAV_LINKS.map((link) => (
                    <a key={link.id} className="lp-nav-link" href={`#${link.id}`}>
                      {t(`landing.${link.key}`)}
                    </a>
                  ))}
                  <Link className="lp-nav-link" to="/download">
                    {t('landing.navDownload')}
                  </Link>
                </div>
              </Col>
              <Col xs={12} md={7}>
                <div className="lp-footer-title">{t('landing.footerAccount')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
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
                {' · '}
                {t('landing.footerBuiltBy')} —{' '}
                <a
                  className="lp-nav-link"
                  href={SUPPORT_TELEGRAM}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ fontWeight: 600 }}
                >
                  {VENDOR_NAME}
                </a>
              </span>
              {langSwitcher()}
            </div>
          </div>
        </footer>

        {/* Telefonda pastki CTA paneli / kompyuterda Telegram tugmasi */}
        <StickyCta onStart={goRegister} />
      </div>
    </MotionConfig>
  );
};

export default Landing;
