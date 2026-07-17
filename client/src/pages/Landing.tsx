import type { CSSProperties, ReactNode } from 'react';
import { Button, Card, Col, ConfigProvider, Row, Segmented, theme as antTheme } from 'antd';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CoffeeOutlined,
  CreditCardOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, type Variants } from 'framer-motion';
import { useAppSettings } from '../context/AppSettingsContext';
import { SUPPORT_TELEGRAM } from '../constants';

/* Sahifa mustaqil uslubda — ilova temasidan qat'i nazar doim premium to'q yashil */
const GOLD = '#faad14';
const TEXT = '#eef4ef';
const MUTED = 'rgba(238, 244, 239, 0.62)';
const LINE = 'rgba(250, 173, 20, 0.14)';
const CARD_BG = 'rgba(255, 255, 255, 0.03)';
const PAGE_BG = 'linear-gradient(165deg, #0a1c14 0%, #0f291e 48%, #133526 100%)';
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const container: CSSProperties = { maxWidth: 1180, margin: '0 auto', padding: '0 24px' };
const section: CSSProperties = { padding: 'clamp(56px, 9vw, 96px) 0' };

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const FEATURE_ITEMS: { key: string; icon: ReactNode }[] = [
  { key: 'feature1', icon: <ClockCircleOutlined /> },
  { key: 'feature2', icon: <CoffeeOutlined /> },
  { key: 'feature3', icon: <CreditCardOutlined /> },
  { key: 'feature4', icon: <BarChartOutlined /> },
  { key: 'feature5', icon: <TeamOutlined /> },
  { key: 'feature6', icon: <SafetyCertificateOutlined /> },
];

const STAT_KEYS = ['stat1', 'stat2', 'stat3', 'stat4'] as const;
const STEP_KEYS = ['step1', 'step2', 'step3'] as const;
const PRICING_POINTS = ['pricingPoint1', 'pricingPoint2', 'pricingPoint3'] as const;

/* Dekorativ soqqalar — sof CSS, tashqi rasm yo'q */
const BALLS = [
  { color: '#f0ede4', left: '16%', top: '56%', size: 36, delay: 0 },
  { color: '#cf1322', left: '52%', top: '28%', size: 30, delay: 1.1 },
  { color: '#faad14', left: '64%', top: '58%', size: 30, delay: 2.2 },
  { color: '#1554ad', left: '79%', top: '34%', size: 30, delay: 0.6 },
];

const POCKETS: CSSProperties[] = [
  { left: 10, top: 10 },
  { right: 10, top: 10 },
  { left: 10, bottom: 10 },
  { right: 10, bottom: 10 },
  { left: '50%', top: 6, transform: 'translateX(-50%)' },
  { left: '50%', bottom: 6, transform: 'translateX(-50%)' },
];

const BrandMark = ({ size = 38 }: { size?: number }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #faad14, #d48806)',
      color: '#141414',
      fontSize: size * 0.52,
      flexShrink: 0,
    }}
  >
    <TrophyOutlined />
  </div>
);

const Wordmark = () => (
  <span
    className="lp-wordmark"
    style={{ fontSize: 17, fontWeight: 800, letterSpacing: 2, color: TEXT, whiteSpace: 'nowrap' }}
  >
    PRIME <span style={{ color: GOLD }}>BILLIARD</span>
  </span>
);

const BilliardTable = () => (
  <div
    style={{
      borderRadius: 26,
      padding: 'clamp(10px, 2vw, 16px)',
      background: 'linear-gradient(140deg, #4a3714, #6b5322 50%, #33260c)',
      border: '1px solid rgba(250, 173, 20, 0.5)',
      boxShadow: '0 40px 90px rgba(0, 0, 0, 0.55)',
    }}
  >
    <div
      style={{
        position: 'relative',
        borderRadius: 16,
        aspectRatio: '16 / 10',
        overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 32%, #1d6a2d 0%, #144d20 55%, #0d3a17 100%)',
        boxShadow: 'inset 0 0 70px rgba(0, 0, 0, 0.55)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '26%',
          top: 0,
          bottom: 0,
          width: 1,
          background: 'rgba(255, 255, 255, 0.1)',
        }}
      />
      {POCKETS.map((pos, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 35%, #1a1a1a, #000)',
            ...pos,
          }}
        />
      ))}
      {BALLS.map((ball, i) => (
        <motion.span
          key={i}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: ball.delay }}
          style={{
            position: 'absolute',
            left: ball.left,
            top: ball.top,
            width: ball.size,
            height: ball.size,
            borderRadius: '50%',
            background: `radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.92) 0%, ${ball.color} 38%, ${ball.color} 68%, rgba(0, 0, 0, 0.45) 115%)`,
            boxShadow: '0 8px 14px rgba(0, 0, 0, 0.45)',
          }}
        />
      ))}
    </div>
  </div>
);

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
    viewport={{ once: true, amount: 0.4 }}
    style={{ textAlign: 'center', maxWidth: 660, margin: '0 auto 56px' }}
  >
    <div
      style={{
        color: GOLD,
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
        color: TEXT,
        fontWeight: 800,
        margin: '12px 0 14px',
        lineHeight: 1.2,
      }}
    >
      {title}
    </h2>
    {subtitle ? (
      <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.65, margin: 0 }}>{subtitle}</p>
    ) : null}
  </motion.div>
);

const Landing = () => {
  const { t } = useTranslation();
  const { lang, setLang } = useAppSettings();
  const navigate = useNavigate();

  return (
    <ConfigProvider
      theme={{
        algorithm: antTheme.darkAlgorithm,
        token: {
          colorPrimary: GOLD,
          borderRadius: 10,
          fontFamily: FONT,
          colorBgContainer: '#133526',
          colorBgElevated: '#1a4230',
        },
        components: { Button: { primaryShadow: 'none' } },
      }}
    >
      <div
        className="lp-root"
        style={{
          minHeight: '100vh',
          background: PAGE_BG,
          color: TEXT,
          fontFamily: FONT,
          overflowX: 'hidden',
        }}
      >
        <style>{`
          .lp-root a { text-decoration: none; }
          @media (max-width: 640px) { .lp-hide-sm { display: none !important; } }
          @media (max-width: 430px) { .lp-wordmark { display: none !important; } }
        `}</style>

        {/* Navigatsiya */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            backdropFilter: 'blur(12px)',
            background: 'rgba(10, 28, 20, 0.85)',
            borderBottom: `1px solid ${LINE}`,
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
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BrandMark />
              <Wordmark />
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Segmented
                size="small"
                value={lang}
                onChange={(value) => setLang(value as 'uz' | 'ru')}
                options={[
                  { label: 'UZ', value: 'uz' },
                  { label: 'RU', value: 'ru' },
                ]}
              />
              <Button ghost className="lp-hide-sm" onClick={() => navigate('/login')}>
                {t('landing.navLogin')}
              </Button>
              <Button type="primary" onClick={() => navigate('/register')}>
                {t('landing.navCta')}
              </Button>
            </div>
          </div>
        </header>

        <main>
          {/* Hero */}
          <section style={{ position: 'relative', overflow: 'hidden' }}>
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: -180,
                right: -120,
                width: 520,
                height: 520,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(250, 173, 20, 0.10), transparent 65%)',
                pointerEvents: 'none',
              }}
            />
            <div
              aria-hidden
              style={{
                position: 'absolute',
                bottom: -220,
                left: -160,
                width: 600,
                height: 600,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(27, 94, 32, 0.35), transparent 65%)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ ...container, paddingTop: 'clamp(56px, 8vw, 104px)', paddingBottom: 'clamp(56px, 8vw, 96px)' }}>
              <Row gutter={[48, 48]} align="middle">
                <Col xs={24} lg={13}>
                  <motion.div initial="hidden" animate="visible" variants={stagger}>
                    <motion.div variants={fadeUp}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '6px 14px',
                          borderRadius: 999,
                          border: `1px solid ${LINE}`,
                          background: 'rgba(250, 173, 20, 0.08)',
                          color: GOLD,
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
                        color: TEXT,
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
                        color: MUTED,
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
                        style={{ height: 52, padding: '0 32px', fontSize: 16, fontWeight: 600 }}
                        onClick={() => navigate('/register')}
                      >
                        {t('landing.heroCta')} <ArrowRightOutlined />
                      </Button>
                      <Button
                        ghost
                        size="large"
                        style={{ height: 52, padding: '0 28px', fontSize: 16 }}
                        onClick={() => navigate('/login')}
                      >
                        {t('landing.heroLogin')}
                      </Button>
                    </motion.div>
                    <motion.div
                      variants={fadeUp}
                      style={{ marginTop: 18, fontSize: 13.5, color: MUTED }}
                    >
                      {t('landing.heroNote')}
                    </motion.div>
                  </motion.div>
                </Col>
                <Col xs={24} lg={11}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.25 }}
                  >
                    <BilliardTable />
                  </motion.div>
                </Col>
              </Row>
            </div>
          </section>

          {/* Qiymat ko'rsatkichlari */}
          <section
            style={{
              borderTop: `1px solid ${LINE}`,
              borderBottom: `1px solid ${LINE}`,
              background: 'rgba(255, 255, 255, 0.02)',
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
                        <div style={{ color: GOLD, fontSize: 22, fontWeight: 800, lineHeight: 1.3 }}>
                          {t(`landing.${key}Value`)}
                        </div>
                        <div style={{ color: MUTED, fontSize: 14, marginTop: 6 }}>
                          {t(`landing.${key}Label`)}
                        </div>
                      </motion.div>
                    </Col>
                  ))}
                </Row>
              </motion.div>
            </div>
          </section>

          {/* Imkoniyatlar */}
          <section style={section}>
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
                viewport={{ once: true, amount: 0.1 }}
              >
                <Row gutter={[24, 24]}>
                  {FEATURE_ITEMS.map(({ key, icon }) => (
                    <Col xs={24} sm={12} lg={8} key={key}>
                      <motion.div
                        variants={fadeUp}
                        whileHover={{ y: -6 }}
                        transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
                        style={{ height: '100%' }}
                      >
                        <Card
                          style={{
                            height: '100%',
                            background: CARD_BG,
                            border: `1px solid ${LINE}`,
                            borderRadius: 16,
                          }}
                          styles={{ body: { padding: 28 } }}
                        >
                          <div
                            style={{
                              width: 52,
                              height: 52,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(250, 173, 20, 0.12)',
                              border: '1px solid rgba(250, 173, 20, 0.3)',
                              color: GOLD,
                              fontSize: 22,
                            }}
                          >
                            {icon}
                          </div>
                          <h3
                            style={{
                              fontSize: 17,
                              fontWeight: 700,
                              color: TEXT,
                              margin: '20px 0 10px',
                              lineHeight: 1.35,
                            }}
                          >
                            {t(`landing.${key}Title`)}
                          </h3>
                          <p style={{ color: MUTED, fontSize: 14.5, lineHeight: 1.65, margin: 0 }}>
                            {t(`landing.${key}Desc`)}
                          </p>
                        </Card>
                      </motion.div>
                    </Col>
                  ))}
                </Row>
              </motion.div>
            </div>
          </section>

          {/* Qanday ishlaydi */}
          <section style={{ ...section, background: 'rgba(255, 255, 255, 0.02)' }}>
            <div style={container}>
              <SectionHeading
                overline={t('landing.howOverline')}
                title={t('landing.howTitle')}
              />
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
                            border: '1px solid rgba(250, 173, 20, 0.45)',
                            background: 'rgba(250, 173, 20, 0.08)',
                            color: GOLD,
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
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: '0 0 10px' }}>
                          {t(`landing.${key}Title`)}
                        </h3>
                        <p
                          style={{
                            color: MUTED,
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
                    color: MUTED,
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

          {/* Narx / sinov muddati */}
          <section style={section}>
            <div style={container}>
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                style={{
                  borderRadius: 24,
                  border: '1px solid rgba(250, 173, 20, 0.35)',
                  background:
                    'linear-gradient(150deg, rgba(250, 173, 20, 0.10), rgba(250, 173, 20, 0.02) 40%, rgba(255, 255, 255, 0.02))',
                  padding: 'clamp(32px, 6vw, 64px)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    color: GOLD,
                    letterSpacing: 3,
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {t('landing.pricingOverline')}
                </div>
                <h2
                  style={{
                    fontSize: 'clamp(28px, 4vw, 44px)',
                    color: TEXT,
                    fontWeight: 800,
                    margin: '14px 0 14px',
                    lineHeight: 1.15,
                  }}
                >
                  {t('landing.pricingTitle')}
                </h2>
                <p
                  style={{
                    color: MUTED,
                    fontSize: 16,
                    lineHeight: 1.65,
                    maxWidth: 580,
                    margin: '0 auto',
                  }}
                >
                  {t('landing.pricingSubtitle')}
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    gap: '14px 28px',
                    margin: '30px 0 34px',
                  }}
                >
                  {PRICING_POINTS.map((key) => (
                    <span
                      key={key}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        color: TEXT,
                        fontSize: 14.5,
                      }}
                    >
                      <CheckCircleOutlined style={{ color: GOLD }} />
                      {t(`landing.${key}`)}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <Button
                    type="primary"
                    size="large"
                    style={{ height: 52, padding: '0 36px', fontSize: 16, fontWeight: 600 }}
                    onClick={() => navigate('/register')}
                  >
                    {t('landing.pricingCta')} <ArrowRightOutlined />
                  </Button>
                  <Button
                    ghost
                    size="large"
                    icon={<SendOutlined />}
                    style={{ height: 52, padding: '0 28px', fontSize: 16 }}
                    href={SUPPORT_TELEGRAM}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('landing.pricingTelegram')}
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer style={{ borderTop: `1px solid ${LINE}` }}>
          <div style={{ ...container, paddingTop: 44, paddingBottom: 36 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: 24,
              }}
            >
              <div style={{ maxWidth: 360 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <BrandMark size={32} />
                  <Wordmark />
                </div>
                <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.6, margin: '14px 0 0' }}>
                  {t('landing.footerTagline')}
                </p>
              </div>
              <a
                href={SUPPORT_TELEGRAM}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  color: GOLD,
                  fontWeight: 600,
                  fontSize: 14.5,
                }}
              >
                <SendOutlined />
                {t('landing.footerTelegram')}
              </a>
            </div>
            <div
              style={{
                borderTop: 'rgba(255, 255, 255, 0.06) 1px solid',
                marginTop: 32,
                paddingTop: 20,
                textAlign: 'center',
                color: MUTED,
                fontSize: 12.5,
              }}
            >
              {t('landing.footerCopyright')}
            </div>
          </div>
        </footer>
      </div>
    </ConfigProvider>
  );
};

export default Landing;
