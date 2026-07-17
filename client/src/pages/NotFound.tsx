import type { CSSProperties } from 'react';
import { Button, Typography } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme/tokens';

const { Text, Title } = Typography;

const { bg, border, emerald, gold, text } = TOKENS.color;

/** 8-raqamli billiard soqqasi — 404 dagi "0" o'rnida */
const EightBall = ({ size = 120 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden focusable="false">
    <defs>
      <radialGradient id="nf-ball" cx="0.35" cy="0.28" r="1">
        <stop offset="0%" stopColor={bg.bg3} />
        <stop offset="55%" stopColor={bg.bg1} />
        <stop offset="100%" stopColor={bg.bg0} />
      </radialGradient>
    </defs>
    {/* Soqqa tanasi */}
    <circle cx="60" cy="60" r="56" fill="url(#nf-ball)" stroke={border.strong} strokeWidth="1.5" />
    {/* Yaltirash */}
    <ellipse cx="42" cy="30" rx="16" ry="9" fill={text.primary} opacity="0.16" />
    {/* Raqam doirasi */}
    <circle cx="60" cy="58" r="20" fill={text.primary} />
    <text
      x="60"
      y="67"
      textAnchor="middle"
      fontSize="27"
      fontWeight="800"
      fill={gold.contrast}
      fontFamily="inherit"
    >
      8
    </text>
  </svg>
);

const NotFound = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();

  const goHome = () => navigate(user?.role === 'superadmin' ? '/admin' : '/');

  const digitStyle: CSSProperties = {
    fontSize: 'clamp(64px, 16vw, 110px)',
    fontWeight: 800,
    lineHeight: 1,
    color: text.primary,
    letterSpacing: 2,
  };

  const ball = reduceMotion ? (
    <EightBall size={96} />
  ) : (
    <motion.span
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.15 }}
      style={{ display: 'inline-flex' }}
    >
      <EightBall size={96} />
    </motion.span>
  );

  const content = (
    <>
      {/* "4 ⓼ 4" — soqqa nol o'rnida */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(8px, 3vw, 20px)',
        }}
      >
        <span style={digitStyle}>4</span>
        {ball}
        <span style={digitStyle}>4</span>
      </div>

      <Title level={3} style={{ margin: '20px 0 0' }}>
        {t('error.notFoundTitle')}
      </Title>
      <Text type="secondary" style={{ display: 'block', marginTop: 6, maxWidth: 380 }}>
        {t('error.notFoundDesc')}
      </Text>

      <Button
        type="primary"
        size="large"
        icon={<HomeOutlined />}
        onClick={goHome}
        style={{ marginTop: 24 }}
      >
        {t('btn.back')}
      </Button>
    </>
  );

  return (
    <div
      style={{
        minHeight: '62vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 16px',
        // Zumrad mato tusidagi nozik fon nuri
        background: `radial-gradient(ellipse at 50% 38%, ${emerald.deepest} 0%, transparent 62%)`,
        borderRadius: TOKENS.radius.lg,
      }}
    >
      {reduceMotion ? (
        <div>{content}</div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: TOKENS.motion.duration.base, ease: TOKENS.motion.easing.out }}
        >
          {content}
        </motion.div>
      )}
    </div>
  );
};

export default NotFound;
