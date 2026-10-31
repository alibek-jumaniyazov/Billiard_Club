import { useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Input,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Skeleton,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CheckOutlined,
  ClockCircleOutlined,
  CrownOutlined,
  MinusOutlined,
  ReloadOutlined,
  TagOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { errorMessage, subscriptionApi } from '../../api';
import { planPeriodKey } from '../../constants';
import { useTiersConfigState } from '../../hooks/useEntitlements';
import { TOKENS } from '../../theme/tokens';
import type { Invoice, LimitKey, Plan, TierCode } from '../../types';
import { formatNumber } from '../../utils/format';
import {
  DURATION_MONTHS,
  FEATURE_ORDER,
  LIMIT_ORDER,
  TIER_ORDER,
  durationSlot,
  groupPlans,
  priceInfo,
  tierLabel,
  tierName,
  tierTagline,
} from '../../utils/tiers';
import { EmptyState, GlassCard, MoneyText } from '../ui';

const { Text, Title } = Typography;
const { gold, emerald, text, semantic, bg, border } = TOKENS.color;

interface SubscriptionPlansProps {
  /** null — hali yuklanmoqda (skelet ko'rsatiladi) */
  plans: Plan[] | null;
  /** Tariflarni yuklashda xato bo'ldi */
  plansError?: boolean;
  /** Xatoda "qayta urinish" tugmasi shu funksiyani chaqiradi */
  onRetry?: () => void;
  /** Tasdiqlanishi kutilayotgan faktura (bo'lsa banner ko'rsatiladi) */
  pendingInvoice?: Invoice | null;
  /** Faol tarif kodi — kartada "Joriy" belgisi uchun */
  activePlanCode?: string | null;
  /** Klubning amaldagi darajasi (muddati tugagan bo'lsa null) — "Joriy tarif" va pasaytirish ogohlantirishi */
  currentTier?: TierCode | null;
  /** Hozir band: stollar va hisoblar — tarif cheklovidan oshsa kartada aytiladi */
  usage?: Partial<Record<LimitKey, number>> | null;
  /** Xarid yoki bekor qilishdan keyin ota komponent ma'lumotni yangilaydi */
  onChanged: () => void | Promise<void>;
}

/** Tarif nomi/tavsifi — joriy tilga mos maydon */
const planName = (plan: Plan, lang: string) => (lang === 'ru' ? plan.nameRu : plan.nameUz);
const planDesc = (plan: Plan, lang: string) =>
  lang === 'ru' ? plan.descriptionRu : plan.descriptionUz;

/** features jsonb dan joriy til ro'yxatini xavfsiz ajratib olish */
const planFeatures = (plan: Plan, lang: string): string[] => {
  const raw = plan.features?.[lang === 'ru' ? 'ru' : 'uz'];
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
};

/** Daraja belgisi rangi: Standart — kumush, Pro — och oltin, VIP — oltin */
const TIER_ACCENT: Record<TierCode, string> = {
  standard: text.secondary,
  pro: gold.hover,
  vip: gold.base,
};

/** Muddat bo'yicha har bir darajadagi tejash foizi (1 oylikka nisbatan) */
const savingsPercents = (grouped: ReturnType<typeof groupPlans>, m: number): number[] =>
  m === 1
    ? []
    : TIER_ORDER.flatMap((code) => {
        const plan = grouped[code][m];
        const monthly = grouped[code][1];
        if (!plan || !monthly || monthly.price <= 0) return [];
        return [Math.round((priceInfo(plan, monthly).savings / (monthly.price * m)) * 100)];
      });

/**
 * Tariflar + xarid oqimi (kupon bilan) + kutilayotgan faktura banneri.
 *
 * Standart / Pro / VIP kartalari va 1 / 3 / 6 / 12 oy tanlovi: har kartada
 * narx, oyiga narx, 1 oylikka nisbatan tejash, cheklovlar va imkoniyatlar.
 * Shu muddatlarga tushmaydigan tariflar (maxsus muddat, aksiya) pastda
 * "Boshqa takliflar" bo'lib chiqadi. Obuna sahifasi VA blok (Locked) ekrani
 * bitta shu komponentdan foydalanadi — endpointlar serverda @SkipSubscription.
 */
const SubscriptionPlans = ({
  plans,
  plansError = false,
  onRetry,
  pendingInvoice = null,
  activePlanCode = null,
  currentTier = null,
  usage = null,
  onChanged,
}: SubscriptionPlansProps) => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const reduceMotion = useReducedMotion();
  const lang = i18n.language;
  const { config: tiers, loading: tiersLoading } = useTiersConfigState();

  // PLATFORMA hisob-kitobi: Plan.price global qator, hamma klub uchun bir xil
  // va valyuta ustuni yo'q. Shuning uchun bu yerda klub sozlamasidagi
  // useCurrency() ISHLATILMAYDI — faqat tilga bog'liq t('common.sum')
  const platformCurrency = t('common.sum');
  const money = (amount: number) => `${formatNumber(amount)} ${platformCurrency}`;

  const [selected, setSelected] = useState<Plan | null>(null);
  const [coupon, setCoupon] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pickedMonths, setPickedMonths] = useState<number | null>(null);

  // ---------- Daraja × muddat jadvali ----------
  const grouped = useMemo(() => (plans ? groupPlans(plans) : null), [plans]);
  const months = useMemo<number[]>(
    () => (grouped ? DURATION_MONTHS.filter((m) => TIER_ORDER.some((code) => grouped[code][m])) : []),
    [grouped],
  );
  const tiered = months.length > 0;
  /** Hech bir muddatda sotilmaydigan daraja kartasi ko'rsatilmaydi */
  const visibleTiers = useMemo(
    () => (grouped ? TIER_ORDER.filter((code) => months.some((m) => grouped[code][m])) : []),
    [grouped, months],
  );

  /** Jadvalga tushmagan faol tariflar — oddiy kartada */
  const legacyPlans = useMemo(() => {
    if (!plans) return [];
    if (!grouped || !tiered) return plans;
    const used = new Set<number>();
    for (const code of TIER_ORDER) {
      for (const plan of Object.values(grouped[code])) if (plan) used.add(plan.id);
    }
    return plans.filter((p) => p.isActive && !used.has(p.id));
  }, [plans, grouped, tiered]);

  // Boshlang'ich muddat: joriy tarifniki (bo'lsa), aks holda eng qisqasi
  const activeSlot = useMemo(() => {
    const active = plans?.find((p) => p.code === activePlanCode);
    return active ? durationSlot(active.durationDays) : null;
  }, [plans, activePlanCode]);
  const shownMonths =
    pickedMonths !== null && months.includes(pickedMonths)
      ? pickedMonths
      : activeSlot !== null && months.includes(activeSlot)
        ? activeSlot
        : (months[0] ?? 1);

  /** Tanlov tugmasidagi "−17%" (darajalarda har xil bo'lsa — "−17% gacha") */
  const percentLabel = (m: number): string | null => {
    const all = grouped ? savingsPercents(grouped, m) : [];
    const positive = all.filter((p) => p > 0);
    if (!positive.length) return null;
    const max = Math.max(...positive);
    return all.every((p) => p === max) ? `−${max}%` : t('tiers.upToPercent', { percent: max });
  };
  /** Eng katta tejamkorlik — "Eng yaxshi taklif" */
  const bestMonths = useMemo(() => {
    if (!grouped) return null;
    let best: number | null = null;
    let bestPct = 0;
    for (const m of months) {
      const pct = Math.max(0, ...savingsPercents(grouped, m));
      if (pct > 0 && pct >= bestPct) {
        best = m;
        bestPct = pct;
      }
    }
    return best;
  }, [months, grouped]);

  // ---------- Oddiy kartalar (jadvaldan tashqari tariflar) ----------
  /** Eng qimmat kunlik narx — tejamkorlik foizi shu bazaga nisbatan */
  const basePerDay = useMemo(() => {
    if (!legacyPlans.length) return 0;
    return Math.max(...legacyPlans.map((p) => (p.durationDays > 0 ? p.price / p.durationDays : 0)));
  }, [legacyPlans]);

  const savingsFor = (plan: Plan): number => {
    if (basePerDay <= 0 || plan.durationDays <= 0) return 0;
    return Math.round((1 - plan.price / plan.durationDays / basePerDay) * 100);
  };

  /** Eng katta tejamkorlikka ega tarif — "Eng foydali" belgisi uchun */
  const bestValueId = useMemo(() => {
    if (legacyPlans.length < 2 || basePerDay <= 0) return null;
    let bestId: number | null = null;
    let bestSave = 0;
    for (const p of legacyPlans) {
      if (p.durationDays <= 0) continue;
      const s = Math.round((1 - p.price / p.durationDays / basePerDay) * 100);
      if (s > bestSave) {
        bestSave = s;
        bestId = p.id;
      }
    }
    return bestId;
  }, [legacyPlans, basePerDay]);

  const openPurchase = (plan: Plan) => {
    setSelected(plan);
    setCoupon('');
    setCouponError(null);
  };

  const handlePurchase = async () => {
    if (!selected) return;
    setSubmitting(true);
    setCouponError(null);
    try {
      const res = await subscriptionApi.purchase({
        planId: selected.id,
        couponCode: coupon.trim() || undefined,
      });
      if (res.message) message.success(res.message);
      setSelected(null);
      await onChanged();
    } catch (err) {
      const msg = errorMessage(err, t('common.error'));
      const status = (err as { response?: { status?: number } })?.response?.status;
      // Kupon kiritilgan 400 — katta ehtimol kupon xatosi: maydon ostida ko'rsatamiz
      if (coupon.trim() && status === 400) setCouponError(msg);
      else message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPending = async () => {
    if (!pendingInvoice) return;
    setCancelling(true);
    try {
      const res = await subscriptionApi.cancelInvoice(pendingInvoice.id);
      if (res.message) message.success(res.message);
      await onChanged();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setCancelling(false);
    }
  };

  const tierTitle = (code: TierCode) => (tiers ? tierName(tiers[code], lang) : tierLabel(code, lang));
  const levelOf = (code: TierCode | null) => (code ? TIER_ORDER.indexOf(code) : -1);

  const renderPendingBanner = () => {
    if (!pendingInvoice) return null;
    const plan = pendingInvoice.plan;
    return (
      <GlassCard
        padding={TOKENS.spacing.lg}
        style={{ marginBottom: TOKENS.spacing.lg }}
      >
        <div
          style={{
            display: 'flex',
            gap: TOKENS.spacing.md,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: TOKENS.radius.md,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 21,
              color: gold.base,
              background: gold.subtle,
              border: `1px solid ${gold.line}`,
            }}
          >
            <ClockCircleOutlined />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Title level={5} style={{ margin: 0, color: gold.hover }}>
              {t('subscription.pendingTitle')}
            </Title>
            <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
              {t('subscription.invoiceLabel')}:{' '}
              <span className="tabular-nums" style={{ color: text.primary }}>
                {pendingInvoice.number}
              </span>
              {plan ? ` · ${planName(plan, lang)}` : ''}
              {' · '}
              {dayjs(pendingInvoice.createdAt).format('DD.MM.YYYY HH:mm')}
            </Text>
            <div style={{ marginTop: 6, display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <MoneyText amount={pendingInvoice.amount} currency={platformCurrency} size="lg" />
              {pendingInvoice.discountAmount > 0 && (
                <Text style={{ color: semantic.success, fontSize: 13 }} className="tabular-nums">
                  {t('subscription.discountLabel')}: −{formatNumber(pendingInvoice.discountAmount)}
                </Text>
              )}
            </div>
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
              {t('subscription.pendingExplainer')}
            </Text>
          </div>
          <Popconfirm
            title={t('subscription.cancelConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={handleCancelPending}
          >
            <Button danger loading={cancelling}>
              {t('subscription.cancelRequest')}
            </Button>
          </Popconfirm>
        </div>
      </GlassCard>
    );
  };

  /** Kutilayotgan faktura bo'lsa yangi xarid yopiq — sababi tugma ustida */
  const withPendingHint = (button: ReactNode) =>
    pendingInvoice ? (
      <Tooltip title={t('subscription.pendingBlocksNew')}>
        <span style={{ display: 'block' }}>{button}</span>
      </Tooltip>
    ) : (
      button
    );

  const savingsTagStyle = {
    margin: 0,
    background: `color-mix(in srgb, ${semantic.success} 12%, transparent)`,
    borderColor: `color-mix(in srgb, ${semantic.success} 30%, transparent)`,
    color: semantic.success,
  };

  // ---------- Daraja kartasi ----------
  const renderTierCard = (code: TierCode) => {
    if (!grouped) return null;
    const plan = grouped[code][shownMonths];
    const def = tiers?.[code];
    const tagline = def ? tierTagline(def, lang) : '';
    const isCurrent = currentTier === code;
    const recommended = code === 'pro' && visibleTiers.length > 1;
    const info = plan ? priceInfo(plan, grouped[code][1]) : null;
    const higher = levelOf(code) > levelOf(currentTier) && levelOf(currentTier) >= 0;

    const actionLabel = isCurrent ? t('tiers.renew') : higher ? t('tiers.lockedCta') : t('tiers.choose');
    const button = (
      <Button
        type={recommended || isCurrent ? 'primary' : 'default'}
        block
        size="large"
        icon={<CrownOutlined />}
        disabled={!plan || !!pendingInvoice}
        onClick={() => plan && openPurchase(plan)}
      >
        {actionLabel}
      </Button>
    );

    return (
      <Col xs={24} md={visibleTiers.length >= 3 ? 8 : 12} key={code}>
        <motion.div
          style={{ height: '100%' }}
          whileHover={reduceMotion ? undefined : { y: -4 }}
          transition={{ duration: TOKENS.motion.duration.fast }}
        >
          <Card
            style={{
              height: '100%',
              borderColor: recommended ? gold.line : isCurrent ? emerald.felt : border.subtle,
              background: recommended ? `linear-gradient(165deg, ${bg.bg2} 0%, ${bg.bg1} 60%)` : bg.bg1,
              position: 'relative',
              overflow: 'hidden',
            }}
            styles={{ body: { padding: 24, display: 'flex', flexDirection: 'column', height: '100%' } }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 24, marginBottom: 10 }}>
              {recommended && (
                <Tag style={{ margin: 0, background: gold.subtle, borderColor: gold.line, color: gold.hover }}>
                  {t('tiers.recommended')}
                </Tag>
              )}
              {isCurrent && (
                <Tag style={{ margin: 0, background: emerald.deep, borderColor: emerald.felt, color: emerald.glow }}>
                  {t('tiers.current')}
                </Tag>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CrownOutlined style={{ fontSize: 20, color: TIER_ACCENT[code] }} />
              <Title level={4} style={{ margin: 0 }}>
                {tierTitle(code)}
              </Title>
            </div>
            {tagline && (
              <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
                {tagline}
              </Text>
            )}

            {plan && info ? (
              <div style={{ marginTop: 16 }}>
                <MoneyText amount={plan.price} currency={platformCurrency} size="xl" color={gold.hover} />
                <Text type="secondary" style={{ display: 'block', fontSize: 12.5 }}>
                  {t('tiers.forDuration', { duration: t(`tiers.durationShort_${shownMonths}`) })}
                </Text>
                {info.months > 1 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Text className="tabular-nums" style={{ fontSize: 13, color: text.primary }}>
                      {t(plan.price % info.months === 0 ? 'tiers.perMonth' : 'tiers.perMonthApprox', {
                        price: money(info.perMonth),
                      })}
                    </Text>
                    {info.savings > 0 && (
                      <Tag style={savingsTagStyle} className="tabular-nums">
                        {t('tiers.save', { amount: money(info.savings) })}
                      </Tag>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 13 }}>
                {t('tiers.notOnSale')}
              </Text>
            )}

            {def && (
              <>
                <div style={{ height: 1, background: border.subtle, margin: '18px 0 14px' }} />
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {LIMIT_ORDER.map((key) => {
                    const max = def.limits[key];
                    const used = usage?.[key];
                    const over = max !== null && typeof used === 'number' && used > max;
                    return (
                      <li key={key} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            {t(`tiers.limit_${key}`)}
                          </Text>
                          <Text strong className="tabular-nums" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                            {max === null ? t('tiers.unlimited') : t('tiers.upTo', { count: max })}
                          </Text>
                        </div>
                        {over && (
                          <Text style={{ display: 'block', fontSize: 12, color: semantic.warning }}>
                            {t('tiers.overLimit', { used, max })}
                          </Text>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                  {FEATURE_ORDER.map((key) => {
                    const on = def.features[key];
                    return (
                      <li
                        key={key}
                        style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6, opacity: on ? 1 : 0.42 }}
                      >
                        {on ? (
                          <CheckOutlined
                            aria-label={t('tiers.included')}
                            style={{ color: emerald.bright, fontSize: 12 }}
                          />
                        ) : (
                          <MinusOutlined
                            aria-label={t('tiers.notIncluded')}
                            style={{ color: text.tertiary, fontSize: 12 }}
                          />
                        )}
                        <Text style={{ fontSize: 13 }}>{t(`tiers.feature_${key}`)}</Text>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 18 }}>{withPendingHint(button)}</div>
          </Card>
        </motion.div>
      </Col>
    );
  };

  // ---------- Oddiy karta ----------
  const renderPlanCard = (plan: Plan) => {
    const savings = savingsFor(plan);
    const periodKey = planPeriodKey(plan.durationDays);
    const isCurrent = !!activePlanCode && plan.code === activePlanCode;
    const isBest = plan.id === bestValueId;
    const features = planFeatures(plan, lang);
    const desc = planDesc(plan, lang);
    const perDay = plan.durationDays > 0 ? plan.price / plan.durationDays : 0;

    const selectBtn = (
      <Button
        type={isBest ? 'primary' : 'default'}
        block
        size="large"
        icon={<CrownOutlined />}
        disabled={!!pendingInvoice}
        onClick={() => openPurchase(plan)}
      >
        {t('subscription.select')}
      </Button>
    );

    return (
      <Col xs={24} sm={12} lg={8} key={plan.id}>
        <motion.div
          style={{ height: '100%' }}
          whileHover={reduceMotion ? undefined : { y: -4 }}
          transition={{ duration: TOKENS.motion.duration.fast }}
        >
          <Card
            style={{
              height: '100%',
              borderColor: isBest ? gold.line : isCurrent ? emerald.felt : border.subtle,
              background: isBest
                ? `linear-gradient(165deg, ${bg.bg2} 0%, ${bg.bg1} 60%)`
                : bg.bg1,
              position: 'relative',
              overflow: 'hidden',
            }}
            styles={{ body: { padding: 24, display: 'flex', flexDirection: 'column', height: '100%' } }}
          >
            {/* Yuqori badge qatori */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 24, marginBottom: 8 }}>
              {isBest && (
                <Tag style={{ margin: 0, background: gold.subtle, borderColor: gold.line, color: gold.hover }}>
                  {t('subscription.bestValue')}
                </Tag>
              )}
              {savings > 0 && (
                <Tag style={savingsTagStyle}>
                  {t('subscription.save', { percent: savings })}
                </Tag>
              )}
              {isCurrent && (
                <Tag style={{ margin: 0, background: emerald.deep, borderColor: emerald.felt, color: emerald.glow }}>
                  {t('subscription.current')}
                </Tag>
              )}
            </div>

            <Title level={4} style={{ margin: 0 }}>
              {planName(plan, lang)}
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {t(`subscription.period.${periodKey}`)} ·{' '}
              {t('subscription.durationDays', { days: plan.durationDays })}
            </Text>

            <div style={{ margin: '14px 0 2px' }}>
              <MoneyText
                amount={plan.price}
                currency={platformCurrency}
                size="xl"
                color={gold.hover}
              />
            </div>
            <Text type="secondary" className="tabular-nums" style={{ fontSize: 12.5 }}>
              {t('subscription.perDay', { amount: formatNumber(perDay) })}
            </Text>

            {desc && (
              <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 13 }}>
                {desc}
              </Text>
            )}

            {features.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
                {features.map((f) => (
                  <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
                    <CheckOutlined style={{ color: emerald.bright, fontSize: 12 }} />
                    <Text style={{ fontSize: 13 }}>{f}</Text>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 18 }}>{withPendingHint(selectBtn)}</div>
          </Card>
        </motion.div>
      </Col>
    );
  };

  const skeletonRow = (
    <Row gutter={[16, 16]}>
      {[0, 1, 2].map((i) => (
        <Col xs={24} md={8} key={i}>
          <Card style={{ borderColor: border.subtle }}>
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
        </Col>
      ))}
    </Row>
  );

  const renderTiered = () => (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: TOKENS.spacing.md,
        }}
      >
        <Segmented
          size="large"
          aria-label={t('tiers.durationLabel')}
          value={shownMonths}
          onChange={(value) => setPickedMonths(Number(value))}
          options={months.map((m) => {
            const pct = percentLabel(m);
            return {
              value: m,
              label: (
                <div style={{ padding: '2px 4px', lineHeight: 1.25 }}>
                  <div>{t(`tiers.durationShort_${m}`)}</div>
                  {pct && (
                    <div className="tabular-nums" style={{ fontSize: 11, color: semantic.success }}>
                      {pct}
                    </div>
                  )}
                </div>
              ),
            };
          })}
        />
        {bestMonths !== null && (
          <Tag
            style={{ margin: 0, background: gold.subtle, borderColor: gold.line, color: gold.hover, cursor: 'pointer' }}
            onClick={() => setPickedMonths(bestMonths)}
          >
            {t('tiers.bestOffer')}: {t(`tiers.duration_${bestMonths}`)}
          </Tag>
        )}
      </div>
      {tiersLoading ? skeletonRow : <Row gutter={[16, 16]}>{visibleTiers.map(renderTierCard)}</Row>}

      {legacyPlans.length > 0 && (
        <>
          <Title level={5} style={{ margin: `${TOKENS.spacing.lg}px 0 ${TOKENS.spacing.md}px` }}>
            {t('tiers.otherPlans')}
          </Title>
          <Row gutter={[16, 16]}>{legacyPlans.map(renderPlanCard)}</Row>
        </>
      )}
    </>
  );

  const renderPlansBody = () => {
    if (plansError) {
      return (
        <EmptyState
          icon={<WarningOutlined />}
          title={t('subscription.plansLoadError')}
          action={
            onRetry && (
              <Button icon={<ReloadOutlined />} onClick={onRetry}>
                {t('subscription.retry')}
              </Button>
            )
          }
        />
      );
    }
    if (plans === null) return skeletonRow;
    if (plans.length === 0) {
      return (
        <EmptyState
          icon={<CrownOutlined />}
          title={t('subscription.noPlans')}
          hint={t('subscription.noPlansHint')}
        />
      );
    }
    if (tiered) return renderTiered();
    return <Row gutter={[16, 16]}>{legacyPlans.map(renderPlanCard)}</Row>;
  };

  // Xarid oynasidagi tafsilotlar
  const selectedInfo = selected ? priceInfo(selected, grouped?.[selected.tier]?.[1] ?? null) : null;
  const selectedLevel = selected ? levelOf(selected.tier) : -1;
  const currentLevel = levelOf(currentTier);

  return (
    <div>
      {renderPendingBanner()}

      <div style={{ marginBottom: TOKENS.spacing.md }}>
        <Title level={4} style={{ margin: 0 }}>
          {t('subscription.plansTitle')}
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {t('subscription.plansSubtitle')}
        </Text>
      </div>

      {renderPlansBody()}

      {/* Xarid oynasi — kupon kodi bilan to'lov so'rovi */}
      <Modal
        open={!!selected}
        title={t('subscription.purchaseTitle')}
        okText={t('subscription.submitPurchase')}
        cancelText={t('btn.cancel')}
        onOk={handlePurchase}
        onCancel={() => (submitting ? undefined : setSelected(null))}
        okButtonProps={{ loading: submitting, icon: <CrownOutlined /> }}
        destroyOnHidden
      >
        {selected && selectedInfo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '12px 16px',
                borderRadius: TOKENS.radius.md,
                background: bg.bg1,
                border: `1px solid ${border.subtle}`,
              }}
            >
              <div>
                <Text strong style={{ display: 'block' }}>
                  {planName(selected, lang)}
                </Text>
                <Text type="secondary" style={{ fontSize: 12.5 }}>
                  {t(`subscription.period.${planPeriodKey(selected.durationDays)}`)} ·{' '}
                  {t('subscription.durationDays', { days: selected.durationDays })}
                </Text>
                {selectedInfo.months > 1 && (
                  <Text type="secondary" className="tabular-nums" style={{ display: 'block', fontSize: 12.5 }}>
                    {t(selected.price % selectedInfo.months === 0 ? 'tiers.perMonth' : 'tiers.perMonthApprox', {
                      price: money(selectedInfo.perMonth),
                    })}
                    {selectedInfo.savings > 0 && (
                      <span style={{ color: semantic.success }}>
                        {' · '}
                        {t('tiers.save', { amount: money(selectedInfo.savings) })}
                      </span>
                    )}
                  </Text>
                )}
              </div>
              <MoneyText
                amount={selected.price}
                currency={platformCurrency}
                size="lg"
                color={gold.hover}
              />
            </div>

            {currentLevel >= 0 && selectedLevel >= 0 && selectedLevel < currentLevel && (
              <Alert type="warning" showIcon message={t('tiers.downgradeWarn', { tier: tierTitle(selected.tier) })} />
            )}
            {currentLevel >= 0 && selectedLevel > currentLevel && (
              <Alert type="info" showIcon message={t('tiers.upgradeHint')} />
            )}

            <div>
              <Text style={{ display: 'block', marginBottom: 6 }}>
                {t('subscription.couponLabel')}{' '}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({t('subscription.couponOptional')})
                </Text>
              </Text>
              <Input
                prefix={<TagOutlined style={{ color: text.tertiary }} />}
                placeholder={t('subscription.couponPlaceholder')}
                value={coupon}
                maxLength={50}
                status={couponError ? 'error' : undefined}
                onChange={(e) => {
                  setCoupon(e.target.value);
                  if (couponError) setCouponError(null);
                }}
                onPressEnter={handlePurchase}
              />
              {couponError && (
                <Text style={{ color: semantic.error, fontSize: 12.5, display: 'block', marginTop: 4 }}>
                  {couponError}
                </Text>
              )}
            </div>

            <Text type="secondary" style={{ fontSize: 13 }}>
              {t('subscription.purchaseHint')}
            </Text>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SubscriptionPlans;
