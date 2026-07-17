import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Popconfirm,
  Progress,
  Skeleton,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CalendarOutlined,
  CrownOutlined,
  ReloadOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, subscriptionApi } from '../api';
import SubscriptionPlans from '../components/subscription/SubscriptionPlans';
import {
  EmptyState,
  GlassCard,
  MoneyText,
  PageHeader,
  PageTransition,
  StatusTag,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme/tokens';
import type { Invoice, InvoiceStatus, Plan, SubscriptionStatus } from '../types';
import { formatNumber } from '../utils/format';

const { Text, Title } = Typography;
const { gold, emerald, semantic, text, bg } = TOKENS.color;

const INVOICES_PAGE_SIZE = 10;

/** Faktura holati -> StatusTag semantik kaliti */
const INVOICE_TAG: Record<InvoiceStatus, string> = {
  pending: 'busy', // oltin, jonli nuqta — "kutilmoqda"
  paid: 'paid',
  cancelled: 'cancelled',
  expired: 'error',
};

/** Sinov davri odatda 7 kun — halqa foizini shu bazadan hisoblaymiz */
const TRIAL_DAYS = 7;

const Subscription = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { message } = App.useApp();
  const lang = i18n.language;

  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState(false);

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plansError, setPlansError] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState(false);
  const [invPage, setInvPage] = useState(1);
  const [invTotal, setInvTotal] = useState(0);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const isAdmin = user?.role === 'admin';

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(false);
    try {
      const res = await subscriptionApi.status();
      setStatus(res.data);
    } catch {
      setStatusError(true);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const fetchPlans = useCallback(async () => {
    setPlansError(false);
    setPlans(null);
    try {
      const res = await subscriptionApi.plans();
      setPlans(res.data);
    } catch {
      setPlansError(true);
    }
  }, []);

  const fetchInvoices = useCallback(async (page: number) => {
    setInvLoading(true);
    setInvError(false);
    try {
      const res = await subscriptionApi.invoices({ page, limit: INVOICES_PAGE_SIZE });
      setInvoices(res.data);
      setInvTotal(res.pagination?.total ?? res.data.length);
      setInvPage(page);
    } catch {
      setInvError(true);
    } finally {
      setInvLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void fetchStatus();
    void fetchPlans();
    void fetchInvoices(1);
  }, [isAdmin, fetchStatus, fetchPlans, fetchInvoices]);

  /** Xarid/bekor qilishdan keyin holat va tarix yangilanadi */
  const handleChanged = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchInvoices(1)]);
  }, [fetchStatus, fetchInvoices]);

  const handleCancelInvoice = async (invoice: Invoice) => {
    setCancellingId(invoice.id);
    try {
      const res = await subscriptionApi.cancelInvoice(invoice.id);
      if (res.message) message.success(res.message);
      await handleChanged();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setCancellingId(null);
    }
  };

  // Superadmin (klubni ko'rish rejimida) yoki boshqa rollar uchun himoya:
  // server endpointlari @Roles(ADMIN) — sahifa ham shunga mos yopiladi
  if (!isAdmin) {
    return (
      <PageTransition>
        <PageHeader
          icon={<CrownOutlined />}
          title={t('subscription.pageTitle')}
          subtitle={t('subscription.pageSubtitle')}
        />
        <Card>
          <EmptyState icon={<StopOutlined />} title={t('subscription.adminOnly')} />
        </Card>
      </PageTransition>
    );
  }

  const renderHero = () => {
    if (statusError) {
      return (
        <GlassCard style={{ marginBottom: TOKENS.spacing.lg }}>
          <EmptyState
            icon={<WarningOutlined />}
            title={t('subscription.statusLoadError')}
            action={
              <Button icon={<ReloadOutlined />} onClick={() => void fetchStatus()}>
                {t('subscription.retry')}
              </Button>
            }
            style={{ padding: '24px 16px' }}
          />
        </GlassCard>
      );
    }

    if (statusLoading || !status) {
      return (
        <GlassCard style={{ marginBottom: TOKENS.spacing.lg }}>
          <Skeleton active avatar={{ size: 120, shape: 'circle' }} paragraph={{ rows: 3 }} />
        </GlassCard>
      );
    }

    const { club, activePlan } = status;
    const daysLeft = club.daysLeft;
    const totalDays =
      activePlan?.durationDays ?? (club.status === 'trial' ? TRIAL_DAYS : 30);
    const percent =
      daysLeft === null ? 100 : Math.max(0, Math.min(100, (daysLeft / totalDays) * 100));
    const ringColor =
      daysLeft === null || percent > 50
        ? emerald.bright
        : percent > 20
          ? gold.base
          : semantic.error;
    const planLabel = activePlan
      ? lang === 'ru'
        ? activePlan.nameRu
        : activePlan.nameUz
      : t('subscription.trialPlan');

    return (
      <GlassCard style={{ marginBottom: TOKENS.spacing.lg }}>
        <div
          style={{
            display: 'flex',
            gap: TOKENS.spacing.xl,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Progress
            type="dashboard"
            size={132}
            percent={percent}
            strokeColor={ringColor}
            trailColor={bg.bg3}
            strokeWidth={9}
            format={() => (
              <div>
                <div
                  className="tabular-nums"
                  style={{ fontSize: 26, fontWeight: 700, color: text.primary, lineHeight: 1.1 }}
                >
                  {daysLeft === null ? '∞' : daysLeft}
                </div>
                <div style={{ fontSize: 12, color: text.tertiary, marginTop: 2 }}>
                  {daysLeft === null ? t('subscription.unlimited') : t('common.days')}
                </div>
              </div>
            )}
          />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Title level={4} style={{ margin: 0 }}>
                {club.name}
              </Title>
              <StatusTag status={club.status} label={t(`club.${club.status}`)} />
            </div>
            <div
              style={{
                marginTop: 12,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <Text type="secondary" style={{ fontSize: 12.5, display: 'block' }}>
                  {t('subscription.activePlan')}
                </Text>
                <Text strong style={{ fontSize: 15 }}>
                  <CrownOutlined style={{ color: gold.base, marginRight: 6 }} />
                  {planLabel}
                </Text>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12.5, display: 'block' }}>
                  {t('subscription.endsAt')}
                </Text>
                <Text strong style={{ fontSize: 15 }} className="tabular-nums">
                  <CalendarOutlined style={{ color: emerald.bright, marginRight: 6 }} />
                  {club.effectiveEndsAt
                    ? dayjs(club.effectiveEndsAt).format('DD.MM.YYYY')
                    : t('subscription.unlimited')}
                </Text>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12.5, display: 'block' }}>
                  {t('subscription.daysLeft')}
                </Text>
                <Text strong style={{ fontSize: 15 }} className="tabular-nums">
                  {daysLeft === null
                    ? t('subscription.unlimited')
                    : t('subscription.daysValue', { days: daysLeft })}
                </Text>
              </div>
            </div>
            {club.isExpired && (
              <Text
                style={{ display: 'block', marginTop: 12, color: semantic.warning, fontSize: 13 }}
              >
                <WarningOutlined style={{ marginRight: 6 }} />
                {t('subscription.expiredNote')}
              </Text>
            )}
          </div>
        </div>
      </GlassCard>
    );
  };

  const invoiceColumns: ColumnsType<Invoice> = [
    {
      title: t('subscription.colNumber'),
      dataIndex: 'number',
      key: 'number',
      render: (num: string) => (
        <span className="tabular-nums" style={{ fontWeight: 600 }}>
          {num}
        </span>
      ),
    },
    {
      title: t('subscription.colPlan'),
      key: 'plan',
      render: (_, inv) =>
        inv.plan ? (lang === 'ru' ? inv.plan.nameRu : inv.plan.nameUz) : '—',
    },
    {
      title: t('subscription.colAmount'),
      key: 'amount',
      align: 'right',
      render: (_, inv) => (
        <div>
          <MoneyText amount={inv.amount} currency={t('common.sum')} />
          {inv.discountAmount > 0 && (
            <div className="tabular-nums" style={{ fontSize: 12, color: semantic.success }}>
              {t('subscription.discountLabel')}: −{formatNumber(inv.discountAmount)}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('subscription.colStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (s: InvoiceStatus) => (
        <StatusTag status={INVOICE_TAG[s]} label={t(`subscription.status.${s}`)} />
      ),
    },
    {
      title: t('subscription.colCreated'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => (
        <span className="tabular-nums">{dayjs(d).format('DD.MM.YYYY HH:mm')}</span>
      ),
    },
    {
      title: t('subscription.colPaid'),
      key: 'paid',
      render: (_, inv) =>
        inv.status === 'paid' && inv.paidAt ? (
          <span className="tabular-nums">
            {dayjs(inv.paidAt).format('DD.MM.YYYY')}
            {inv.paymentMethod ? ` · ${inv.paymentMethod}` : ''}
          </span>
        ) : (
          '—'
        ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      align: 'right',
      render: (_, inv) =>
        inv.status === 'pending' ? (
          <Popconfirm
            title={t('subscription.cancelConfirm')}
            okText={t('common.yes')}
            cancelText={t('common.no')}
            onConfirm={() => void handleCancelInvoice(inv)}
          >
            <Button size="small" danger loading={cancellingId === inv.id}>
              {t('subscription.cancelRequest')}
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<CrownOutlined />}
        title={t('subscription.pageTitle')}
        subtitle={t('subscription.pageSubtitle')}
      />

      {renderHero()}

      <SubscriptionPlans
        plans={plans}
        plansError={plansError}
        onRetry={() => void fetchPlans()}
        pendingInvoice={status?.currentInvoice ?? null}
        activePlanCode={status?.activePlan?.code ?? null}
        onChanged={handleChanged}
      />

      <Card
        title={t('subscription.invoicesTitle')}
        style={{ marginTop: TOKENS.spacing.lg }}
        styles={{ body: { paddingTop: 8 } }}
      >
        {invError ? (
          <EmptyState
            icon={<WarningOutlined />}
            title={t('subscription.invoicesLoadError')}
            action={
              <Button icon={<ReloadOutlined />} onClick={() => void fetchInvoices(invPage)}>
                {t('subscription.retry')}
              </Button>
            }
          />
        ) : (
          <Table<Invoice>
            rowKey="id"
            columns={invoiceColumns}
            dataSource={invoices}
            loading={invLoading}
            scroll={{ x: 820 }}
            locale={{
              emptyText: (
                <EmptyState
                  title={t('subscription.invoicesEmpty')}
                  hint={t('subscription.invoicesEmptyHint')}
                  style={{ padding: '24px 16px' }}
                />
              ),
            }}
            pagination={{
              current: invPage,
              pageSize: INVOICES_PAGE_SIZE,
              total: invTotal,
              showSizeChanger: false,
              onChange: (page) => void fetchInvoices(page),
            }}
          />
        )}
      </Card>
    </PageTransition>
  );
};

export default Subscription;
