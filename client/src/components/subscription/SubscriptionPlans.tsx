import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Modal,
  Popconfirm,
  Row,
  Skeleton,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CheckOutlined,
  ClockCircleOutlined,
  CrownOutlined,
  ReloadOutlined,
  TagOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { errorMessage, subscriptionApi } from '../../api';
import { planPeriodKey } from '../../constants';
import { TOKENS } from '../../theme/tokens';
import type { Invoice, Plan } from '../../types';
import { formatNumber } from '../../utils/format';
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

/**
 * Tariflar to'ri + xarid oqimi (kupon bilan) + kutilayotgan faktura banneri.
 * Obuna sahifasi VA blok (Locked) ekrani bitta shu komponentdan foydalanadi —
 * barcha endpointlar serverda @SkipSubscription, ya'ni muddati tugagan klub
 * egasi ham sotib olishi mumkin.
 */
const SubscriptionPlans = ({
  plans,
  plansError = false,
  onRetry,
  pendingInvoice = null,
  activePlanCode = null,
  onChanged,
}: SubscriptionPlansProps) => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const reduceMotion = useReducedMotion();
  const lang = i18n.language;

  const [selected, setSelected] = useState<Plan | null>(null);
  const [coupon, setCoupon] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  /** Eng qimmat kunlik narx — tejamkorlik foizi shu bazaga nisbatan */
  const basePerDay = useMemo(() => {
    if (!plans?.length) return 0;
    return Math.max(...plans.map((p) => (p.durationDays > 0 ? p.price / p.durationDays : 0)));
  }, [plans]);

  const savingsFor = (plan: Plan): number => {
    if (basePerDay <= 0 || plan.durationDays <= 0) return 0;
    return Math.round((1 - plan.price / plan.durationDays / basePerDay) * 100);
  };

  /** Eng katta tejamkorlikka ega tarif — "Eng foydali" belgisi uchun */
  const bestValueId = useMemo(() => {
    if (!plans?.length || basePerDay <= 0) return null;
    let bestId: number | null = null;
    let bestSave = 0;
    for (const p of plans) {
      if (p.durationDays <= 0) continue;
      const s = Math.round((1 - p.price / p.durationDays / basePerDay) * 100);
      if (s > bestSave) {
        bestSave = s;
        bestId = p.id;
      }
    }
    return bestId;
  }, [plans, basePerDay]);

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
              <MoneyText amount={pendingInvoice.amount} currency={t('common.sum')} size="lg" />
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
                <Tag style={{ margin: 0, background: `color-mix(in srgb, ${semantic.success} 12%, transparent)`, borderColor: `color-mix(in srgb, ${semantic.success} 30%, transparent)`, color: semantic.success }}>
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
              <MoneyText amount={plan.price} currency={t('common.sum')} size="xl" color={gold.hover} />
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

            <div style={{ marginTop: 'auto', paddingTop: 18 }}>
              {pendingInvoice ? (
                <Tooltip title={t('subscription.pendingBlocksNew')}>
                  <span style={{ display: 'block' }}>{selectBtn}</span>
                </Tooltip>
              ) : (
                selectBtn
              )}
            </div>
          </Card>
        </motion.div>
      </Col>
    );
  };

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
    if (plans === null) {
      return (
        <Row gutter={[16, 16]}>
          {[0, 1, 2].map((i) => (
            <Col xs={24} sm={12} lg={8} key={i}>
              <Card style={{ borderColor: border.subtle }}>
                <Skeleton active paragraph={{ rows: 4 }} />
              </Card>
            </Col>
          ))}
        </Row>
      );
    }
    if (plans.length === 0) {
      return (
        <EmptyState
          icon={<CrownOutlined />}
          title={t('subscription.noPlans')}
          hint={t('subscription.noPlansHint')}
        />
      );
    }
    return <Row gutter={[16, 16]}>{plans.map(renderPlanCard)}</Row>;
  };

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
        {selected && (
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
              </div>
              <MoneyText amount={selected.price} currency={t('common.sum')} size="lg" color={gold.hover} />
            </div>

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
