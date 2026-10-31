import { useEffect, useState } from 'react';
import { Col, Collapse, Row, Segmented } from 'antd';
import { InstagramOutlined, MailOutlined, PhoneOutlined, SendOutlined, StarFilled } from '@ant-design/icons';
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
import { fadeUp, SectionHeading, stagger } from './landing/shared';
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
                  variants={stagger}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.05 }}
                >
                  <Row gutter={[20, 20]}>
                    {TESTIMONIALS.map((k) => (
                      <Col xs={24} sm={12} xl={6} key={k}>
                        <motion.figure variants={fadeUp} className="lp-testimonial" style={{ margin: 0 }}>
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
                <Row gutter={[32, 32]}>
                  <Col xs={24} md={10}>
                    <BrandLogo size={32} withWordmark />
                    <p className="lp-footer__tagline">{t('landing.footerTagline')}</p>
                    <div className="lp-footer__contacts">
                      <a className="lp-nav-link lp-footer-contact" href={SUPPORT_TELEGRAM} target="_blank" rel="noreferrer noopener">
                        <SendOutlined /> {telegramHandle}
                      </a>
                      <a className="lp-nav-link lp-footer-contact" href={SUPPORT_INSTAGRAM} target="_blank" rel="noreferrer noopener">
                        <InstagramOutlined /> {instagramHandle}
                      </a>
                      <a className="lp-nav-link lp-footer-contact" href={`tel:${SUPPORT_PHONE.replace(/[^\d+]/g, '')}`}>
                        <PhoneOutlined /> {SUPPORT_PHONE}
                      </a>
                      <a className="lp-nav-link lp-footer-contact" href={`mailto:${SUPPORT_EMAIL}`}>
                        <MailOutlined /> {SUPPORT_EMAIL}
                      </a>
                    </div>
                  </Col>
                  <Col xs={12} md={7}>
                    <div className="lp-footer-title">{t('landing.footerProduct')}</div>
                    <div className="lp-footer__links">
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
                    <div className="lp-footer__links">
                      <Link className="lp-nav-link" to="/login">
                        {t('landing.navLogin')}
                      </Link>
                      <Link className="lp-nav-link" to="/register">
                        {t('landing.navCta')}
                      </Link>
                    </div>
                  </Col>
                </Row>
                <div className="lp-footer__bottom">
                  <span>
                    {t('landing.footerLegal', { year: new Date().getFullYear() })}
                    {' · '}
                    {t('landing.footerBuiltBy')} —{' '}
                    <a className="lp-nav-link" href={SUPPORT_TELEGRAM} target="_blank" rel="noreferrer noopener" style={{ fontWeight: 600 }}>
                      {VENDOR_NAME}
                    </a>
                    {' · '}
                    <a
                      className="lp-nav-link"
                      href={LANDING_PATH.uz}
                      hrefLang="uz"
                      lang="uz"
                      onClick={(event) => {
                        event.preventDefault();
                        switchLang('uz');
                      }}
                    >
                      O'zbekcha
                    </a>
                    {' · '}
                    <a
                      className="lp-nav-link"
                      href={LANDING_PATH.ru}
                      hrefLang="ru"
                      lang="ru"
                      onClick={(event) => {
                        event.preventDefault();
                        switchLang('ru');
                      }}
                    >
                      Русский
                    </a>
                  </span>
                  <Segmented
                    size="small"
                    value={lang}
                    onChange={(value) => switchLang(value as 'uz' | 'ru')}
                    options={[
                      { label: 'UZ', value: 'uz' },
                      { label: 'RU', value: 'ru' },
                    ]}
                  />
                </div>
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
