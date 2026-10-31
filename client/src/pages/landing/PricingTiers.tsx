import { useMemo, useState } from 'react';
import { Button, Col, Row, Segmented } from 'antd';
import { CheckCircleOutlined, MinusOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTiersConfigState } from '../../hooks/useEntitlements';
import { TOKENS } from '../../theme/tokens';
import type { Plan, TierCode } from '../../types';
import { formatNumber } from '../../utils/format';
import {
  CARD_FEATURES,
  DEFAULT_TIERS_CONFIG,
  DEFAULT_TIER_PRICES,
  DURATION_DAYS,
  DURATION_MONTHS,
  LIMIT_ORDER,
  TIER_ORDER,
  groupPlans,
  limitValue,
  type DurationMonths,
  tierName,
  tierTagline,
} from '../../utils/tiers';
import { fadeUp, SectionHeading, stagger } from './shared';

const { bg, border, emerald, gold, text } = TOKENS.color;
const CARD_TINT = 'rgba(255, 255, 255, 0.03)';

/** Hamma tariflarda bor asosiy imkoniyatlar (darajaga bog'liq emas) */
const BASE_FEATURE_KEYS = ['planFeat1', 'planFeat2', 'planFeat3', 'planFeat4'] as const;
const GUARANTEE_KEYS = ['guarantee1', 'guarantee2', 'guarantee3'] as const;

type PriceGrid = Record<TierCode, Partial<Record<DurationMonths, number>>>;

/**
 * Jonli narxlar (GET /public/plans) daraja × muddat jadvaliga; jonli ro'yxat
 * bo'lmasa yoki unda bironta ham daraja tarifi bo'lmasa — server standarti.
 */
export const pricesFrom = (plans: Plan[] | null): PriceGrid => {
  const live = plans?.length ? groupPlans(plans) : null;
  const hasLive = !!live && TIER_ORDER.some((code) => DURATION_MONTHS.some((m) => live[code][m]));
  const grid: PriceGrid = { standard: {}, pro: {}, vip: {} };
  for (const code of TIER_ORDER) {
    for (const m of DURATION_MONTHS) {
      const price = hasLive ? live[code][m]?.price : DEFAULT_TIER_PRICES[code][m];
      if (typeof price === 'number') grid[code][m] = price;
    }
  }
  return grid;
};

/**
 * TARIFLAR bo'limi: Standart / Pro / VIP kartalari va 1 / 3 / 6 / 12 oy tanlovi.
 * Har kartada narx, oyiga narx, 1 oylikka nisbatan tejash, cheklovlar va
 * imkoniyatlar — superadmin sozlamasidan (GET /public/tiers), kelmaguncha
 * server standartidan.
 */
const PricingTiers = ({ plans, onCta }: { plans: Plan[] | null; onCta: () => void }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { config } = useTiersConfigState();
  const tiers = config ?? DEFAULT_TIERS_CONFIG;
  const prices = useMemo(() => pricesFrom(plans), [plans]);
  const sum = t('common.sum');

  const months = DURATION_MONTHS.filter((m) => TIER_ORDER.some((code) => prices[code][m] !== undefined));
  const visibleTiers = TIER_ORDER.filter((code) => months.some((m) => prices[code][m] !== undefined));
  const [picked, setPicked] = useState<DurationMonths>(1);
  const shown: DurationMonths = months.includes(picked) ? picked : (months[0] ?? 1);

  /** Muddat bo'yicha tejash foizlari (darajalar kesimida) */
  const percents = (m: DurationMonths): number[] =>
    m === 1
      ? []
      : visibleTiers.flatMap((code) => {
          const price = prices[code][m];
          const monthly = prices[code][1];
          return price !== undefined && monthly ? [Math.round((1 - price / (monthly * m)) * 100)] : [];
        });
  const percentLabel = (m: DurationMonths): string | null => {
    const all = percents(m);
    const max = Math.max(0, ...all);
    if (max <= 0) return null;
    return all.every((p) => p === max) ? `−${max}%` : t('tiers.upToPercent', { percent: max });
  };
  const bestMonths = months.reduce<DurationMonths | null>((best, m) => {
    const pct = Math.max(0, ...percents(m));
    return pct > 0 && (best === null || pct >= Math.max(0, ...percents(best))) ? m : best;
  }, null);

  const renderCard = (code: TierCode) => {
    const def = tiers[code];
    const price = prices[code][shown];
    const monthly = prices[code][1];
    const recommended = code === 'pro' && visibleTiers.length > 1;
    const perMonth = price !== undefined ? Math.round(price / shown) : 0;
    const savings = price !== undefined && monthly && shown > 1 ? Math.max(0, monthly * shown - price) : 0;

    return (
      <Col xs={24} md={visibleTiers.length >= 3 ? 8 : 12} key={code}>
        <motion.div variants={fadeUp} style={{ height: '100%' }}>
          <div
            className={recommended ? 'lp-plan-glow' : undefined}
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              borderRadius: TOKENS.radius.xl,
              border: recommended ? `1px solid ${gold.base}` : `1px solid ${border.base}`,
              background: recommended ? `linear-gradient(170deg, ${gold.subtle}, ${CARD_TINT} 45%)` : bg.bg1,
              boxShadow: recommended ? TOKENS.shadow.glowActive : TOKENS.shadow.level1,
              padding: '32px 28px 28px',
            }}
          >
            {recommended && (
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
                {t('tiers.recommended')}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: text.primary }}>{tierName(def, lang)}</h3>
              {savings > 0 && (
                <span
                  className="tabular-nums"
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
                  {t('tiers.save', { amount: `${formatNumber(savings)} ${sum}` })}
                </span>
              )}
            </div>
            <p style={{ margin: '6px 0 0', color: text.secondary, fontSize: 13.5, lineHeight: 1.5, minHeight: 40 }}>
              {tierTagline(def, lang)}
            </p>

            {price !== undefined ? (
              <>
                <div style={{ marginTop: 16 }}>
                  <span
                    className="tabular-nums"
                    style={{ fontSize: 34, fontWeight: 800, color: text.primary, lineHeight: 1 }}
                  >
                    {formatNumber(price)}
                  </span>
                  <span style={{ fontSize: 15, color: text.secondary, fontWeight: 500 }}>
                    {' '}
                    {sum} / {t(`tiers.durationShort_${shown}`)}
                  </span>
                </div>
                <div
                  className="tabular-nums"
                  style={{ marginTop: 8, fontSize: 13.5, color: shown > 1 ? gold.base : text.tertiary, minHeight: 20 }}
                >
                  {shown > 1
                    ? t(price % shown === 0 ? 'tiers.perMonth' : 'tiers.perMonthApprox', {
                        price: `${formatNumber(perMonth)} ${sum}`,
                      })
                    : ' '}
                </div>
                {/* Kunlik narx — "bir soatlik o'yindan arzon" hissi */}
                <span className="lp-plan-perday" style={{ alignSelf: 'flex-start' }}>
                  {t('landing.planPerDay', {
                    amount: formatNumber(Math.round(price / DURATION_DAYS[shown] / 100) * 100),
                  })}
                </span>
              </>
            ) : (
              <p style={{ margin: '16px 0 0', color: text.tertiary, fontSize: 14 }}>{t('tiers.notOnSale')}</p>
            )}

            <div style={{ borderTop: `1px solid ${border.subtle}`, margin: '18px 0 14px' }} />
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {LIMIT_ORDER.map((key) => {
                const value = limitValue(def, key);
                return (
                  <li
                    key={key}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginBottom: 8 }}
                  >
                    <span style={{ color: text.secondary }}>{t(`tiers.limit_${key}`)}</span>
                    <strong className="tabular-nums" style={{ color: text.primary, whiteSpace: 'nowrap' }}>
                      {value === 'owner'
                        ? t('tiers.ownerOnly')
                        : value === null
                          ? t('tiers.unlimited')
                          : t('tiers.upTo', { count: value })}
                    </strong>
                  </li>
                );
              })}
            </ul>
            <ul
              style={{
                listStyle: 'none',
                margin: '6px 0 0',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                flex: 1,
              }}
            >
              {CARD_FEATURES.map((key) => {
                const on = def.features[key];
                return (
                  <li
                    key={key}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      color: on ? text.secondary : text.tertiary,
                      fontSize: 14,
                      lineHeight: 1.5,
                      opacity: on ? 1 : 0.55,
                    }}
                  >
                    {on ? (
                      <CheckCircleOutlined
                        aria-label={t('tiers.included')}
                        style={{ color: gold.base, fontSize: 15, marginTop: 3 }}
                      />
                    ) : (
                      <MinusOutlined
                        aria-label={t('tiers.notIncluded')}
                        style={{ color: text.tertiary, fontSize: 13, marginTop: 4 }}
                      />
                    )}
                    {t(`tiers.feature_${key}`)}
                  </li>
                );
              })}
            </ul>
            <Button
              block
              size="large"
              type={recommended ? 'primary' : 'default'}
              className={recommended ? 'lp-cta-btn' : undefined}
              style={{ marginTop: 24, height: 46, fontWeight: 600 }}
              onClick={onCta}
            >
              {t('landing.planCta')}
            </Button>
          </div>
        </motion.div>
      </Col>
    );
  };

  return (
    <section id="pricing" className="lp-section">
      <div className="lp-container">
        <SectionHeading
          overline={t('landing.pricingOverline')}
          title={t('landing.pricingTitle')}
          subtitle={t('landing.pricingSubtitle')}
        />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            margin: '0 0 36px',
          }}
        >
          <Segmented
            size="large"
            aria-label={t('tiers.durationLabel')}
            value={shown}
            onChange={(value) => setPicked(Number(value) as DurationMonths)}
            options={months.map((m) => {
              const pct = percentLabel(m);
              return {
                value: m,
                label: (
                  <div style={{ padding: '2px 6px', lineHeight: 1.25 }}>
                    <div>{t(`tiers.durationShort_${m}`)}</div>
                    {pct && (
                      <div className="tabular-nums" style={{ fontSize: 11, color: emerald.glow }}>
                        {pct}
                      </div>
                    )}
                  </div>
                ),
              };
            })}
          />
          {bestMonths !== null && (
            <button
              type="button"
              onClick={() => setPicked(bestMonths)}
              style={{
                padding: '4px 12px',
                borderRadius: TOKENS.radius.pill,
                border: `1px solid ${gold.line}`,
                background: gold.subtle,
                color: gold.hover,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('tiers.bestOffer')}: {t(`tiers.duration_${bestMonths}`)}
            </button>
          )}
        </div>
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }}>
          <Row gutter={[24, 32]} align="stretch">
            {visibleTiers.map(renderCard)}
          </Row>

          {/* Darajaga bog'liq bo'lmagan asos — hamma tariflarda */}
          <motion.div variants={fadeUp} style={{ marginTop: 32, textAlign: 'center' }}>
            <div style={{ color: text.primary, fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
              {t('landing.planBaseTitle')}
            </div>
            <ul className="lp-guarantees" style={{ marginTop: 0 }}>
              {BASE_FEATURE_KEYS.map((key) => (
                <li key={key}>
                  <CheckCircleOutlined aria-hidden /> {t(`landing.${key}`)}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.ul variants={fadeUp} className="lp-guarantees">
            {GUARANTEE_KEYS.map((key) => (
              <li key={key}>
                <SafetyCertificateOutlined aria-hidden /> {t(`landing.${key}`)}
              </li>
            ))}
          </motion.ul>
          <motion.p
            variants={fadeUp}
            style={{ textAlign: 'center', color: text.tertiary, fontSize: 13.5, marginTop: 18, marginBottom: 0 }}
          >
            {t('landing.pricingNote')}
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
};

export default PricingTiers;
