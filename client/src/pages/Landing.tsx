import { useEffect, useState } from 'react';
import { Col, Collapse, Row } from 'antd';
import { ArrowUpOutlined, InstagramOutlined, MailOutlined, PhoneOutlined, SendOutlined, StarFilled } from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, MotionConfig } from 'framer-motion';
import { useAppSettings } from '../context/AppSettingsContext';
import {
  SUPPORT_EMAIL,
  SUPPORT_INSTAGRAM,
  SUPPORT_PHONE,
  SUPPORT_TELEGRAM,
  VENDOR_NAME,
} from '../constants';
import { BrandLogo } from '../components/ui';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { LANDING_PATH, langFromPath } from '../seo/site';
import { publicApi } from '../api';
import { setTrialDays } from '../i18n';
import type { Plan } from '../types';
import { fadeUp, riseCard, SectionHeading, stagger, staggerCards } from './landing/shared';
import SiteHeader, { type HeaderLink } from './landing/SiteHeader';
import Hero from './landing/Hero';
import Statement from './landing/Statement';
import PainPoints from './landing/PainPoints';
import ProductShowcase from './landing/ProductShowcase';
import Highlights from './landing/Highlights';
import LiveScenes from './landing/LiveScenes';
import RoiCalculator from './landing/RoiCalculator';
import Comparison from './landing/Comparison';
import LeadForm from './landing/LeadForm';
import { FinalCta, StickyCta } from './landing/FinalCta';
import FeatureBento from './landing/FeatureBento';
import CapabilityStrip from './landing/CapabilityStrip';
import HowItWorks from './landing/HowItWorks';
import PricingTiers from './landing/PricingTiers';
import { DarkStage, LandingTheme } from './landing/theme';
import './landing/landing.css';
import './landing/tones.css';

/**
 * Navigatsiya havolalari. `secondary` — tor kompyuter ekranida yuqori
 * menyudan yashiriladi (telefon menyusi va footerda doim bor), `drawerOnly` —
 * faqat telefon menyusi va footerda.
 */
const NAV_LINKS: HeaderLink[] = [
  { id: 'demo', key: 'navDemo' },
  { id: 'features', key: 'navFeatures' },
  { id: 'calculator', key: 'navCalculator', secondary: true },
  { id: 'pricing', key: 'navPricing' },
  { id: 'faq', key: 'navFaq' },
  { id: 'contact', key: 'navContact', drawerOnly: true },
];

/** Footer ustunlari: mahsulot bo'limlari va yordam (savol-javob, aloqa) */
const HELP_IDS = ['faq', 'contact'];
const FOOTER_PRODUCT = NAV_LINKS.filter((link) => !HELP_IDS.includes(link.id));
const FOOTER_HELP = NAV_LINKS.filter((link) => HELP_IDS.includes(link.id));

/** MUHIM: index.html dagi FAQPage JSON-LD bilan sinxron (uz matnlar) */
const FAQ_COUNT = 11;

const TESTIMONIALS = ['t1', 't2', 't3', 't4'] as const;

/* ------------------------------------------------------------------ Sahifa */

const Landing = () => {
  const { t } = useTranslation();
  const { lang, setLang } = useAppSettings();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  /* Til = manzil: `/` o'zbekcha, `/ru/` ruscha (qidiruv tizimlari ikkalasini
     alohida indekslaydi). Til almashtirilsa manzil ham almashadi. */
  const switchLang = (next: 'uz' | 'ru') => {
    setLang(next);
    navigate({ pathname: LANDING_PATH[next], search });
  };
  useEffect(() => {
    const routeLang = langFromPath(pathname) ?? 'uz';
    if (routeLang !== lang) setLang(routeLang);
    // Faqat manzil o'zgarganda (tilni tugma o'zi manzil bilan birga almashtiradi)
  }, [pathname]);

  useDocumentHead('landing.metaTitle', 'landing.metaDescription');

  /* Ommaviy tariflar — superadmin boshqaradigan faol tariflar (GET /public/plans).
     So'rov muvaffaqiyatsiz bo'lsa yoki bo'sh bo'lsa server standarti (utils/tiers.ts) ishlaydi. */
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
   * (i18n `{{days}}`). `trialDays` holati ataylab saqlanadi: u render'da
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

  const goRegister = () => navigate('/register');
  const goLogin = () => navigate('/login');

  const telegramHandle = SUPPORT_TELEGRAM.replace(/^https?:\/\/t\.me\//, '@');
  const instagramHandle = SUPPORT_INSTAGRAM.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '');

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
      <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>{t(`landing.faq${i + 1}A`)}</p>
    ),
  }));

  return (
    <MotionConfig reducedMotion="user">
      <LandingTheme>
        <div className="lp-root" style={{ minHeight: '100vh', overflowX: 'clip' }}>
          <SiteHeader
            links={NAV_LINKS}
            lang={lang === 'ru' ? 'ru' : 'uz'}
            onLang={switchLang}
            onLogin={goLogin}
            onStart={goRegister}
          />

          <main>
            {/* ------------------------------------------------- Och: hero */}
            <Hero onStart={goRegister} />

            {/* --------------------------------- Platformalar va imkoniyatlar */}
            <CapabilityStrip />

            {/* ------------------------------- Bayonot (so'zma-so'z yorishadi) */}
            <Statement />

            {/* -------------------------------------------- Muammo -> yechim */}
            <PainPoints />

            {/* ------------- To'q sahna: avval jonli demo (tizim ichidan), keyin imkoniyatlar */}
            <DarkStage>
              <ProductShowcase />
              <LiveScenes />
              <FeatureBento />
            </DarkStage>

            {/* --------------------------- Chiroq, oflayn rejim, qurilmalar */}
            <Highlights />

            {/* -------------------------------------------------- Kalkulyator */}
            <RoiCalculator plans={livePlans} onCta={goRegister} />

            {/* ----------------------------------------------- Qanday ishlaydi */}
            <HowItWorks />

            {/* ---------------------------------------------------- Taqqoslash */}
            <Comparison />

            {/* -------------------------------------------------------- Tariflar */}
            <PricingTiers plans={livePlans} onCta={goRegister} />

            {/* -------------------------------------------------- Mijozlar fikri */}
            <section id="testimonials" className="lp-section">
              <div className="lp-container">
                <SectionHeading overline={t('landing.testimonialsOverline')} title={t('landing.testimonialsTitle')} />
                <motion.div
                  variants={staggerCards}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.05 }}
                >
                  <Row gutter={[20, 20]}>
                    {TESTIMONIALS.map((k) => (
                      <Col xs={24} sm={12} xl={6} key={k}>
                        <motion.figure variants={riseCard} className="lp-testimonial" style={{ margin: 0 }}>
                          <div className="lp-testimonial__stars" aria-hidden>
                            {Array.from({ length: 5 }, (_, i) => (
                              <StarFilled key={i} />
                            ))}
                          </div>
                          <blockquote>{t(`landing.${k}Quote`)}</blockquote>
                          <figcaption className="lp-testimonial__who">
                            <span className="lp-testimonial__avatar" aria-hidden>
                              {t(`landing.${k}Name`).charAt(0)}
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <strong>{t(`landing.${k}Name`)}</strong>
                              <span>{t(`landing.${k}Club`)}</span>
                            </span>
                          </figcaption>
                        </motion.figure>
                      </Col>
                    ))}
                  </Row>
                </motion.div>
              </div>
            </section>

            {/* ----------------------------------------------------- Savol-javob */}
            <section id="faq" className="lp-section">
              <div className="lp-container" style={{ maxWidth: 880 }}>
                <SectionHeading overline={t('landing.faqOverline')} title={t('landing.faqTitle')} />
                <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.05 }}>
                  <Collapse className="lp-faq" accordion ghost expandIconPosition="end" items={faqItems} />
                </motion.div>
              </div>
            </section>

            {/* -------------------------------------------------- Aloqa + ariza */}
            <section id="contact" className="lp-section">
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
                          {...(card.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
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
          </main>

          {/* ----------------------------------- To'q sahna: yakuniy CTA va footer */}
          <DarkStage>
            <FinalCta onStart={goRegister} />

            <footer className="lp-footer">
              <div className="lp-container lp-footer__inner">
                <div className="lp-footer__grid">
                  <div className="lp-footer__brand">
                    <Link to="/" className="lp-footer__logo" aria-label="Billiard Club">
                      <BrandLogo size={36} withWordmark />
                    </Link>
                    <p className="lp-footer__tagline">{t('landing.footerTagline')}</p>
                    <ul className="lp-footer__contacts">
                      <li>
                        <a href={SUPPORT_TELEGRAM} target="_blank" rel="noreferrer noopener">
                          <SendOutlined aria-hidden /> {telegramHandle}
                        </a>
                      </li>
                      <li>
                        <a href={SUPPORT_INSTAGRAM} target="_blank" rel="noreferrer noopener">
                          <InstagramOutlined aria-hidden /> {instagramHandle}
                        </a>
                      </li>
                      <li>
                        <a href={`tel:${SUPPORT_PHONE.replace(/[^\d+]/g, '')}`}>
                          <PhoneOutlined aria-hidden /> {SUPPORT_PHONE}
                        </a>
                      </li>
                      <li>
                        <a href={`mailto:${SUPPORT_EMAIL}`}>
                          <MailOutlined aria-hidden /> {SUPPORT_EMAIL}
                        </a>
                      </li>
                    </ul>
                  </div>

                  <nav className="lp-footer__col" aria-label={t('landing.footerProduct')}>
                    <div className="lp-footer__title">{t('landing.footerProduct')}</div>
                    <ul>
                      {FOOTER_PRODUCT.map((link) => (
                        <li key={link.id}>
                          <a href={`#${link.id}`}>{t(`landing.${link.key}`)}</a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                  <nav className="lp-footer__col" aria-label={t('landing.footerHelp')}>
                    <div className="lp-footer__title">{t('landing.footerHelp')}</div>
                    <ul>
                      {FOOTER_HELP.map((link) => (
                        <li key={link.id}>
                          <a href={`#${link.id}`}>{t(`landing.${link.key}`)}</a>
                        </li>
                      ))}
                      <li>
                        <Link to="/download">{t('landing.navDownload')}</Link>
                      </li>
                    </ul>
                  </nav>
                  <nav className="lp-footer__col" aria-label={t('landing.footerAccount')}>
                    <div className="lp-footer__title">{t('landing.footerAccount')}</div>
                    <ul>
                      <li>
                        <Link to="/login">{t('landing.navLogin')}</Link>
                      </li>
                      <li>
                        <Link to="/register">{t('landing.navCta')}</Link>
                      </li>
                    </ul>
                  </nav>
                </div>

                <div className="lp-footer__bottom">
                  <p className="lp-footer__legal">
                    {t('landing.footerLegal', { year: new Date().getFullYear() })}
                    <span className="lp-footer__dot" aria-hidden>
                      ·
                    </span>
                    {t('landing.footerBuiltBy')}{' '}
                    <a href={SUPPORT_TELEGRAM} target="_blank" rel="noreferrer noopener">
                      {VENDOR_NAME}
                    </a>
                  </p>
                  <div className="lp-footer__tools">
                    {/* Oddiy havolalar (hreflang) — qidiruv botlari ikkinchi tildagi sahifani topadi */}
                    <div className="lp-footer__lang" role="group" aria-label="Til / Язык">
                      {(['uz', 'ru'] as const).map((code) => (
                        <a
                          key={code}
                          href={LANDING_PATH[code]}
                          hrefLang={code}
                          lang={code}
                          aria-current={lang === code ? 'true' : undefined}
                          onClick={(event) => {
                            event.preventDefault();
                            switchLang(code);
                          }}
                        >
                          {code === 'uz' ? "O'zbekcha" : 'Русский'}
                        </a>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="lp-footer__top"
                      onClick={() =>
                        window.scrollTo({
                          top: 0,
                          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                        })
                      }
                    >
                      {t('landing.footerTop')} <ArrowUpOutlined aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
              {/* Pastdagi yirik, xira brend yozuvi — sahifaga "imzo" */}
              <div className="lp-footer__mark" aria-hidden>
                Billiard Club
              </div>
            </footer>
          </DarkStage>

          {/* Telefonda pastki CTA paneli / kompyuterda Telegram tugmasi */}
          <StickyCta onStart={goRegister} />
        </div>
      </LandingTheme>
    </MotionConfig>
  );
};

export default Landing;
