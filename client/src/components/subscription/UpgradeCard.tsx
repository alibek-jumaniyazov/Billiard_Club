import { Button, Typography } from 'antd';
import { CheckOutlined, CrownOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useEntitlements, useTiersConfig } from '../../hooks/useEntitlements';
import { FONT_FAMILY_DISPLAY, TOKENS } from '../../theme/tokens';
import type { FeatureKey } from '../../types';
import { FEATURE_ORDER, minTierFor, tierName } from '../../utils/tiers';

const { Text } = Typography;
const { gold, text } = TOKENS.color;

/**
 * Tarifda yo'q bo'lim o'rnida: nima uchun yopiq, qaysi tarifda bor va o'sha
 * tarifga o'tsa yana nimalar ochiladi. Klub egasi — "Tarifni oshirish"
 * tugmasi, kassir/operator — egasiga murojaat qilish haqida izoh.
 */
const UpgradeCard = ({ feature }: { feature: FeatureKey }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { tier: currentTier, entitlements } = useEntitlements();
  const config = useTiersConfig();
  const lang = i18n.language;

  const required = config ? minTierFor(config, feature) : null;
  const requiredName = config && required ? tierName(config[required], lang) : '';
  const currentName = config && currentTier ? tierName(config[currentTier], lang) : (currentTier ?? '');
  // Yuqori tarifga o'tsa qo'shimcha ochiladigan bo'limlar
  const perks =
    config && required
      ? FEATURE_ORDER.filter((key) => config[required].features[key] && !entitlements?.features[key])
      : [feature];

  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 'clamp(24px, 6vw, 72px) 16px' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          textAlign: 'center',
          padding: 'clamp(24px, 5vw, 40px)',
          borderRadius: TOKENS.radius.lg,
          border: `1px solid ${gold.line}`,
          background:
            `radial-gradient(ellipse 80% 60% at 50% 0%, ${gold.subtle}, transparent 70%), ${TOKENS.color.bg.bg1}`,
          boxShadow: TOKENS.shadow.level2,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 68,
            height: 68,
            margin: '0 auto 18px',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            border: `1px solid ${gold.line}`,
            background: gold.subtle,
            color: gold.base,
            fontSize: 28,
            boxShadow: `0 0 36px ${gold.glow}`,
          }}
        >
          <LockOutlined />
        </div>
        <h2
          style={{
            margin: '0 0 10px',
            fontFamily: FONT_FAMILY_DISPLAY,
            fontSize: 'clamp(19px, 2.4vw, 24px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: text.primary,
          }}
        >
          {t('tiers.lockedTitle', { feature: t(`tiers.feature_${feature}`), tier: requiredName || '…' })}
        </h2>
        <p style={{ margin: '0 auto 20px', maxWidth: 440, color: text.secondary, lineHeight: 1.6 }}>
          {t('tiers.lockedDesc', { current: currentName || '—', tier: requiredName || '…' })}
        </p>

        {perks.length > 0 && (
          <ul
            style={{
              listStyle: 'none',
              margin: '0 auto 24px',
              padding: 0,
              display: 'grid',
              gap: 8,
              maxWidth: 360,
              textAlign: 'left',
            }}
          >
            {perks.map((key) => (
              <li key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, color: text.primary }}>
                <CheckOutlined style={{ color: gold.base }} />
                {t(`tiers.feature_${key}`)}
              </li>
            ))}
          </ul>
        )}

        {hasRole('admin') ? (
          <Button type="primary" size="large" icon={<CrownOutlined />} onClick={() => navigate('/subscription')}>
            {t('tiers.lockedCta')}
          </Button>
        ) : (
          <Text type="secondary">{t('tiers.lockedAskOwner')}</Text>
        )}
      </div>
    </div>
  );
};

export default UpgradeCard;
