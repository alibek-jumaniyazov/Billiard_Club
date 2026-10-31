import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Col, Input, InputNumber, Row, Skeleton, Space, Switch, Table, Tag, Typography } from 'antd';
import { CrownOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { adminBillingApi, errorMessage } from '../../api';
import { TOKENS } from '../../theme/tokens';
import type { FeatureKey, LimitKey, Plan, TierCode, TiersConfig } from '../../types';
import { formatNumber } from '../../utils/format';
import {
  DURATION_MONTHS,
  FEATURE_ORDER,
  LIMIT_ORDER,
  TIER_ORDER,
  durationSlot,
  priceInfo,
  setLimit,
  tierName,
  toggleFeature,
} from '../../utils/tiers';

const { Text, Title } = Typography;
const { gold, text } = TOKENS.color;

const moneyFormatter = (v: string | number | undefined) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const moneyParser = (v: string | undefined) => (v ?? '').replace(/\s/g, '') as unknown as number;

type PriceDraft = Record<number, { price: number; isActive: boolean }>;

/** Admin uchun: daraja × oy → tarif qatori (faol bo'lmaganlari ham — yoqib qo'yish uchun) */
const planGrid = (plans: Plan[]) => {
  const grid: Record<TierCode, Partial<Record<number, Plan>>> = { standard: {}, pro: {}, vip: {} };
  for (const plan of plans) {
    if (!TIER_ORDER.includes(plan.tier)) continue;
    const months = durationSlot(plan.durationDays);
    if (months === null) continue;
    const current = grid[plan.tier][months];
    // Kanonik kod (standard_3m) ustun, aks holda faoli
    const canonical = plan.code === `${plan.tier}_${months}m`;
    if (!current || canonical || (!current.isActive && plan.isActive)) grid[plan.tier][months] = plan;
  }
  return grid;
};

/**
 * TARIF DARAJALARI — superadmin har bir tarif nima qila olishini va narxlarini
 * shu yerda belgilaydi. Katak almashtirilganda qoida (yuqori tarif quyisidan
 * kam emas) avtomatik saqlanadi — server ham qoidaga zid sozlamani rad etadi.
 */
const TierSettings = ({ onSaved, plansVersion = 0 }: { onSaved?: () => void; plansVersion?: number }) => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const lang = i18n.language;
  const [config, setConfig] = useState<TiersConfig | null>(null);
  const [draft, setDraft] = useState<TiersConfig | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [prices, setPrices] = useState<PriceDraft>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [tiersRes, plansRes] = await Promise.all([adminBillingApi.tiers(), adminBillingApi.plans()]);
      setConfig(tiersRes.data);
      setDraft(tiersRes.data);
      setPlans(plansRes.data ?? []);
      setPrices(Object.fromEntries((plansRes.data ?? []).map((p) => [p.id, { price: p.price, isActive: p.isActive }])));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // «Tarif qatorlari» tabida tarif o'zgarsa — narxlar jadvali yangilanadi.
  // Saqlanmagan o'zgarish bo'lsa tegilmaydi (saqlanganda baribir qayta yuklanadi)
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (plansVersion > 0 && !dirtyRef.current) void load();
  }, [plansVersion, load]);

  const grid = useMemo(() => planGrid(plans), [plans]);
  const tiersDirty = !!draft && JSON.stringify(draft) !== JSON.stringify(config);
  const changedPlans = plans.filter((p) => prices[p.id] && (prices[p.id].price !== p.price || prices[p.id].isActive !== p.isActive));
  const dirty = tiersDirty || changedPlans.length > 0;
  dirtyRef.current = dirty;

  const reset = () => {
    setDraft(config);
    setPrices(Object.fromEntries(plans.map((p) => [p.id, { price: p.price, isActive: p.isActive }])));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      if (tiersDirty) await adminBillingApi.updateTiers(draft);
      await Promise.all(changedPlans.map((p) => adminBillingApi.updatePlan(p.id, prices[p.id])));
      message.success(t('tiers.adminSaved'));
      await load();
      onSaved?.();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !draft) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (failed || !draft) {
    return (
      <Alert
        type="error"
        showIcon
        message={t('common.error')}
        action={<Button onClick={() => void load()}>{t('btn.refresh')}</Button>}
      />
    );
  }

  const tierColumns = TIER_ORDER.map((code) => ({
    title: (
      <Space size={6}>
        <CrownOutlined style={{ color: code === 'vip' ? gold.base : code === 'pro' ? gold.hover : text.tertiary }} />
        <span>{tierName(draft[code], lang)}</span>
      </Space>
    ),
    key: code,
    align: 'center' as const,
    width: 170,
    render: (_: unknown, row: { kind: 'feature'; key: FeatureKey } | { kind: 'limit'; key: LimitKey }) => {
      if (row.kind === 'feature') {
        return (
          <Switch
            checked={draft[code].features[row.key]}
            onChange={(on) => setDraft((d) => (d ? toggleFeature(d, code, row.key, on) : d))}
            aria-label={`${tierName(draft[code], lang)}: ${t(`tiers.feature_${row.key}`)}`}
          />
        );
      }
      // Xodim qo'shish o'chiq — son amal qilmaydi, klubda faqat egasi
      if (row.key === 'staff' && !draft[code].features.staff) {
        return <Text type="secondary">{t('tiers.ownerOnly')}</Text>;
      }
      const value = draft[code].limits[row.key];
      return (
        <Space direction="vertical" size={4} style={{ alignItems: 'center' }}>
          <InputNumber
            min={0}
            max={1000}
            precision={0}
            value={value ?? undefined}
            disabled={value === null}
            placeholder={t('tiers.unlimited')}
            style={{ width: 110 }}
            onChange={(v) => setDraft((d) => (d ? setLimit(d, code, row.key, typeof v === 'number' ? v : 0) : d))}
          />
          <Checkbox
            checked={value === null}
            onChange={(e) => setDraft((d) => (d ? setLimit(d, code, row.key, e.target.checked ? null : 0) : d))}
          >
            {t('tiers.unlimited')}
          </Checkbox>
        </Space>
      );
    },
  }));

  const matrixRows = [
    ...FEATURE_ORDER.map((key) => ({ kind: 'feature' as const, key, rowKey: `f-${key}` })),
    ...LIMIT_ORDER.map((key) => ({ kind: 'limit' as const, key, rowKey: `l-${key}` })),
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert type="info" showIcon message={t('tiers.adminIntro')} />

      <Card title={<Title level={5} style={{ margin: 0 }}>{t('tiers.adminFeatures')} · {t('tiers.adminLimits')}</Title>}>
        <Table
          size="middle"
          pagination={false}
          rowKey="rowKey"
          scroll={{ x: 680 }}
          dataSource={matrixRows}
          columns={[
            {
              title: '',
              key: 'label',
              render: (_: unknown, row: (typeof matrixRows)[number]) => {
                const hintKey = row.kind === 'feature' ? `tiers.featureHint_${row.key}` : null;
                return (
                  <div>
                    <Text strong={row.kind === 'limit'}>
                      {row.kind === 'feature' ? t(`tiers.feature_${row.key}`) : t(`tiers.limit_${row.key}`)}
                    </Text>
                    {hintKey && i18n.exists(hintKey) && (
                      <Text type="secondary" style={{ display: 'block', fontSize: 12, lineHeight: 1.4 }}>
                        {t(hintKey)}
                      </Text>
                    )}
                  </div>
                );
              },
            },
            ...tierColumns,
          ]}
        />
      </Card>

      <Card title={<Title level={5} style={{ margin: 0 }}>{t('tiers.adminNames')}</Title>}>
        <Row gutter={[16, 16]}>
          {TIER_ORDER.map((code) => (
            <Col key={code} xs={24} md={8}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Tag color={code === 'vip' ? 'gold' : code === 'pro' ? 'orange' : 'default'}>{code.toUpperCase()}</Tag>
                {(['nameUz', 'nameRu', 'taglineUz', 'taglineRu'] as const).map((field) => (
                  <Input
                    key={field}
                    addonBefore={field.startsWith('name') ? field.slice(-2).toLowerCase() : undefined}
                    maxLength={field.startsWith('name') ? 40 : 120}
                    placeholder={t(`tiers.admin${field.charAt(0).toUpperCase()}${field.slice(1)}`)}
                    value={draft[code][field]}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, [code]: { ...d[code], [field]: e.target.value } } : d))
                    }
                  />
                ))}
              </Space>
            </Col>
          ))}
        </Row>
      </Card>

      <Card
        title={<Title level={5} style={{ margin: 0 }}>{t('tiers.adminPrices')}</Title>}
        extra={<Text type="secondary" style={{ fontSize: 12 }}>{t('tiers.adminPricesHint')}</Text>}
      >
        <Table
          size="middle"
          pagination={false}
          rowKey={(row) => row}
          scroll={{ x: 820 }}
          dataSource={TIER_ORDER}
          columns={[
            {
              title: t('tiers.adminTier'),
              key: 'tier',
              width: 120,
              render: (code: TierCode) => <Text strong>{tierName(draft[code], lang)}</Text>,
            },
            ...DURATION_MONTHS.map((months) => ({
              title: t(`tiers.duration_${months}`),
              key: `m${months}`,
              render: (_: unknown, code: TierCode) => {
                const plan = grid[code][months];
                if (!plan) return <Text type="secondary">—</Text>;
                const current = prices[plan.id] ?? { price: plan.price, isActive: plan.isActive };
                const monthly = grid[code][1];
                const monthlyPrice = monthly ? (prices[monthly.id]?.price ?? monthly.price) : null;
                const info = priceInfo({ price: current.price, durationDays: plan.durationDays }, monthlyPrice !== null ? { price: monthlyPrice } : null);
                return (
                  <Space direction="vertical" size={4}>
                    <InputNumber
                      min={0}
                      step={1000}
                      value={current.price}
                      formatter={moneyFormatter}
                      parser={moneyParser}
                      style={{ width: 150 }}
                      onChange={(v) =>
                        setPrices((p) => ({ ...p, [plan.id]: { ...current, price: typeof v === 'number' ? v : 0 } }))
                      }
                    />
                    {months > 1 && (
                      <Text type="secondary" style={{ fontSize: 12 }} className="tabular-nums">
                        {t('tiers.perMonth', { price: formatNumber(info.perMonth) })}
                        {info.savings > 0 && <> · {t('tiers.save', { amount: formatNumber(info.savings) })}</>}
                      </Text>
                    )}
                    <Space size={6}>
                      <Switch
                        size="small"
                        checked={current.isActive}
                        onChange={(on) => setPrices((p) => ({ ...p, [plan.id]: { ...current, isActive: on } }))}
                      />
                      <Text style={{ fontSize: 12 }}>{t('tiers.adminOnSale')}</Text>
                    </Space>
                  </Space>
                );
              },
            })),
          ]}
        />
      </Card>

      <div
        style={{
          position: 'sticky',
          bottom: 12,
          zIndex: 5,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 12,
          padding: '12px 16px',
          borderRadius: TOKENS.radius.lg,
          border: `1px solid ${dirty ? gold.line : 'transparent'}`,
          background: dirty ? 'rgba(16, 21, 19, 0.96)' : 'transparent',
          boxShadow: dirty ? TOKENS.shadow.level2 : 'none',
        }}
      >
        {dirty && <Text style={{ color: gold.base, marginRight: 'auto' }}>{t('tiers.adminDirty')}</Text>}
        <Button icon={<UndoOutlined />} disabled={!dirty || saving} onClick={reset}>
          {t('tiers.adminReset')}
        </Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={() => void save()}>
          {t('tiers.adminSave')}
        </Button>
      </div>
    </Space>
  );
};

export default TierSettings;
