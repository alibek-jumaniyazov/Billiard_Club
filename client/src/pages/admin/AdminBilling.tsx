import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  CreditCardOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { adminBillingApi, errorMessage } from '../../api';
import { EmptyState, PageHeader, PageTransition, StatusTag } from '../../components/ui';
import { planPeriodKey } from '../../constants';
import { TOKENS } from '../../theme/tokens';
import type { Coupon, CouponType, Invoice, InvoiceStatus, Plan } from '../../types';
import { formatMoney, formatNumber } from '../../utils/format';
import ClubSelect from './ClubSelect';

const { Text } = Typography;

const INVOICE_STATUSES: InvoiceStatus[] = ['pending', 'paid', 'cancelled', 'expired'];

/** Faktura holati -> StatusTag semantik kaliti */
const INVOICE_TAG_STATUS: Record<InvoiceStatus, string> = {
  pending: 'warning',
  paid: 'paid',
  cancelled: 'cancelled',
  expired: 'error',
};

/** Ming ajratkichli InputNumber formatlash */
const moneyFormatter = (v: string | number | undefined) =>
  `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const moneyParser = (v: string | undefined) =>
  (v ?? '').replace(/\s/g, '') as unknown as number;

interface PlanFormValues {
  code: string;
  nameUz: string;
  nameRu: string;
  descriptionUz?: string;
  descriptionRu?: string;
  durationDays: number;
  price: number;
  sortOrder?: number;
  isActive?: boolean;
}

interface CouponFormValues {
  code: string;
  type: CouponType;
  value: number;
  maxUses?: number;
  validRange?: [Dayjs | null, Dayjs | null];
  planId?: number;
  isActive?: boolean;
}

/**
 * Superadmin savdo paneli:
 *  - Fakturalar: tasdiqlash kutayotgan navbat (confirm/reject) + barcha fakturalar;
 *  - Tariflar: CRUD (yumshoq o'chirish);
 *  - Kuponlar: CRUD (yumshoq o'chirish).
 */
const AdminBilling = () => {
  const { t, i18n } = useTranslation();
  const { message, modal } = App.useApp();

  const planName = useCallback(
    (plan: Plan | null | undefined): string =>
      plan ? (i18n.language === 'ru' ? plan.nameRu : plan.nameUz) : '—',
    [i18n.language],
  );

  const periodLabel = (days: number): string => {
    const key = planPeriodKey(days);
    return key === 'custom'
      ? `${formatNumber(days)} ${t('common.days')}`
      : t(`admin.billing.period_${key}`);
  };

  // ==================== Fakturalar ====================
  const [pending, setPending] = useState<Invoice[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [invTotal, setInvTotal] = useState(0);
  const [invPage, setInvPage] = useState(1);
  const [invPageSize, setInvPageSize] = useState(20);
  const [invStatus, setInvStatus] = useState<InvoiceStatus | undefined>(undefined);
  const [invClubId, setInvClubId] = useState<number | undefined>(undefined);

  const [confirmInvoice, setConfirmInvoice] = useState<Invoice | null>(null);
  const [confirmMethod, setConfirmMethod] = useState('');
  const [rejectInvoice, setRejectInvoice] = useState<Invoice | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [invoiceActing, setInvoiceActing] = useState(false);

  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await adminBillingApi.invoices({ status: 'pending', limit: 50 });
      setPending(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setPendingLoading(false);
    }
  }, [message, t]);

  const fetchInvoices = useCallback(
    async (params: {
      page: number;
      pageSize: number;
      status?: InvoiceStatus;
      clubId?: number;
    }) => {
      setInvoicesLoading(true);
      setInvoicesError(null);
      try {
        const res = await adminBillingApi.invoices({
          status: params.status,
          clubId: params.clubId,
          page: params.page,
          limit: params.pageSize,
        });
        setInvoices(res.data);
        setInvTotal(res.pagination?.total ?? res.data.length);
      } catch (err) {
        setInvoicesError(errorMessage(err, t('common.error')));
      } finally {
        setInvoicesLoading(false);
      }
    },
    [t],
  );

  const refreshInvoices = useCallback(() => {
    void fetchPending();
    void fetchInvoices({ page: invPage, pageSize: invPageSize, status: invStatus, clubId: invClubId });
  }, [fetchPending, fetchInvoices, invPage, invPageSize, invStatus, invClubId]);

  const handleConfirmInvoice = async () => {
    if (!confirmInvoice) return;
    setInvoiceActing(true);
    try {
      const res = await adminBillingApi.confirmInvoice(
        confirmInvoice.id,
        confirmMethod.trim() || undefined,
      );
      message.success(res.message);
      setConfirmInvoice(null);
      setConfirmMethod('');
      refreshInvoices();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setInvoiceActing(false);
    }
  };

  const handleRejectInvoice = async () => {
    if (!rejectInvoice) return;
    setInvoiceActing(true);
    try {
      const res = await adminBillingApi.rejectInvoice(
        rejectInvoice.id,
        rejectReason.trim() || undefined,
      );
      message.success(res.message);
      setRejectInvoice(null);
      setRejectReason('');
      refreshInvoices();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setInvoiceActing(false);
    }
  };

  // ==================== Tariflar ====================
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [planForm] = Form.useForm<PlanFormValues>();

  const fetchPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const res = await adminBillingApi.plans();
      setPlans(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setPlansLoading(false);
    }
  }, [message, t]);

  const openPlanModal = (plan: Plan | null) => {
    setEditingPlan(plan);
    if (plan) {
      planForm.setFieldsValue({
        code: plan.code,
        nameUz: plan.nameUz,
        nameRu: plan.nameRu,
        descriptionUz: plan.descriptionUz ?? undefined,
        descriptionRu: plan.descriptionRu ?? undefined,
        durationDays: plan.durationDays,
        price: plan.price,
        sortOrder: plan.sortOrder,
        isActive: plan.isActive,
      });
    } else {
      planForm.resetFields();
      planForm.setFieldsValue({ isActive: true, sortOrder: 0 });
    }
    setPlanModalOpen(true);
  };

  const handleSavePlan = async () => {
    const values = await planForm.validateFields();
    setPlanSaving(true);
    try {
      const body = {
        code: values.code,
        nameUz: values.nameUz,
        nameRu: values.nameRu,
        descriptionUz: values.descriptionUz || undefined,
        descriptionRu: values.descriptionRu || undefined,
        durationDays: values.durationDays,
        price: values.price,
        sortOrder: values.sortOrder ?? 0,
        isActive: values.isActive ?? true,
      };
      const res = editingPlan
        ? await adminBillingApi.updatePlan(editingPlan.id, body)
        : await adminBillingApi.createPlan(body);
      message.success(res.message);
      setPlanModalOpen(false);
      void fetchPlans();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setPlanSaving(false);
    }
  };

  const confirmDeactivatePlan = (plan: Plan) => {
    modal.confirm({
      title: t('admin.billing.deactivateConfirm'),
      okText: t('common.yes'),
      cancelText: t('common.no'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await adminBillingApi.deactivatePlan(plan.id);
          message.success(res.message);
          void fetchPlans();
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
        }
      },
    });
  };

  // ==================== Kuponlar ====================
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponForm] = Form.useForm<CouponFormValues>();
  const couponTypeValue: CouponType | undefined = Form.useWatch('type', couponForm);

  const fetchCoupons = useCallback(async () => {
    setCouponsLoading(true);
    try {
      const res = await adminBillingApi.coupons();
      setCoupons(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setCouponsLoading(false);
    }
  }, [message, t]);

  const openCouponModal = (coupon: Coupon | null) => {
    setEditingCoupon(coupon);
    if (coupon) {
      couponForm.setFieldsValue({
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        maxUses: coupon.maxUses ?? undefined,
        validRange:
          coupon.validFrom || coupon.validTo
            ? [
                coupon.validFrom ? dayjs(coupon.validFrom) : null,
                coupon.validTo ? dayjs(coupon.validTo) : null,
              ]
            : undefined,
        planId: coupon.planId ?? undefined,
        isActive: coupon.isActive,
      });
    } else {
      couponForm.resetFields();
      couponForm.setFieldsValue({ type: 'percent', isActive: true });
    }
    setCouponModalOpen(true);
  };

  const handleSaveCoupon = async () => {
    const values = await couponForm.validateFields();
    setCouponSaving(true);
    try {
      const [from, to] = values.validRange ?? [null, null];
      const body = {
        type: values.type,
        value: values.value,
        maxUses: values.maxUses ?? undefined,
        validFrom: from ? from.startOf('day').toISOString() : undefined,
        validTo: to ? to.endOf('day').toISOString() : undefined,
        planId: values.planId ?? undefined,
        isActive: values.isActive ?? true,
      };
      const res = editingCoupon
        ? await adminBillingApi.updateCoupon(editingCoupon.id, body)
        : await adminBillingApi.createCoupon({ ...body, code: values.code });
      message.success(res.message);
      setCouponModalOpen(false);
      void fetchCoupons();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setCouponSaving(false);
    }
  };

  const confirmDeactivateCoupon = (coupon: Coupon) => {
    modal.confirm({
      title: t('admin.billing.deactivateCouponConfirm'),
      okText: t('common.yes'),
      cancelText: t('common.no'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await adminBillingApi.deactivateCoupon(coupon.id);
          message.success(res.message);
          void fetchCoupons();
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
        }
      },
    });
  };

  // ==================== Boshlang'ich yuklash ====================
  useEffect(() => {
    void fetchPending();
    void fetchInvoices({ page: 1, pageSize: 20 });
    void fetchPlans();
    void fetchCoupons();
  }, [fetchPending, fetchInvoices, fetchPlans, fetchCoupons]);

  // ==================== Ustunlar ====================
  const invoiceBaseColumns: ColumnsType<Invoice> = [
    {
      title: t('admin.billing.invoiceNumber'),
      dataIndex: 'number',
      width: 160,
      render: (n: string) => <Text code>{n}</Text>,
    },
    {
      title: t('admin.billing.club'),
      key: 'club',
      render: (_, inv) => <Text strong>{inv.club?.name ?? `#${inv.clubId}`}</Text>,
    },
    {
      title: t('admin.billing.plan'),
      key: 'plan',
      width: 140,
      render: (_, inv) => planName(inv.plan),
    },
    {
      title: t('admin.billing.amount'),
      dataIndex: 'amount',
      width: 150,
      align: 'right',
      render: (amount: number, inv) => (
        <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
          <Text strong className="tabular-nums">
            {formatMoney(amount, t('common.sum'))}
          </Text>
          {inv.discountAmount > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }} className="tabular-nums">
              −{formatMoney(inv.discountAmount, t('common.sum'))}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('common.date'),
      dataIndex: 'createdAt',
      width: 130,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm'),
    },
  ];

  const pendingColumns: ColumnsType<Invoice> = [
    ...invoiceBaseColumns,
    {
      title: t('common.actions'),
      key: 'actions',
      width: 210,
      render: (_, inv) => (
        <Space size={6}>
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            onClick={() => {
              setConfirmMethod(inv.paymentMethod ?? '');
              setConfirmInvoice(inv);
            }}
          >
            {t('admin.billing.confirm')}
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseOutlined />}
            onClick={() => {
              setRejectReason('');
              setRejectInvoice(inv);
            }}
          >
            {t('admin.billing.reject')}
          </Button>
        </Space>
      ),
    },
  ];

  const allInvoiceColumns: ColumnsType<Invoice> = [
    ...invoiceBaseColumns,
    {
      title: t('admin.billing.status'),
      dataIndex: 'status',
      width: 130,
      render: (s: InvoiceStatus) => (
        <StatusTag status={INVOICE_TAG_STATUS[s]} label={t(`admin.billing.st_${s}`)} />
      ),
    },
    {
      title: t('admin.billing.method'),
      dataIndex: 'paymentMethod',
      width: 110,
      render: (m: string | null) => m || '—',
    },
    {
      title: t('admin.billing.paidAt'),
      dataIndex: 'paidAt',
      width: 130,
      render: (d: string | null) => (d ? dayjs(d).format('DD.MM.YYYY HH:mm') : '—'),
    },
  ];

  const planColumns: ColumnsType<Plan> = [
    {
      title: t('admin.billing.code'),
      dataIndex: 'code',
      width: 130,
      render: (code: string) => <Text code>{code}</Text>,
    },
    {
      title: t('common.name'),
      key: 'name',
      render: (_, plan) => (
        <Space direction="vertical" size={0}>
          <Text strong>{planName(plan)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {i18n.language === 'ru' ? plan.descriptionRu : plan.descriptionUz}
          </Text>
        </Space>
      ),
    },
    {
      title: t('admin.billing.duration'),
      dataIndex: 'durationDays',
      width: 140,
      render: (days: number) => (
        <Space size={6}>
          <Tag color="gold">{periodLabel(days)}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }} className="tabular-nums">
            {formatNumber(days)} {t('common.days')}
          </Text>
        </Space>
      ),
    },
    {
      title: t('common.price'),
      dataIndex: 'price',
      width: 150,
      align: 'right',
      render: (price: number) => (
        <Text strong className="tabular-nums">
          {formatMoney(price, t('common.sum'))}
        </Text>
      ),
    },
    {
      title: t('admin.billing.sortOrder'),
      dataIndex: 'sortOrder',
      width: 80,
      align: 'center',
      responsive: ['md'],
    },
    {
      title: t('adminClubs.status'),
      dataIndex: 'isActive',
      width: 110,
      render: (isActive: boolean) => (
        <StatusTag
          status={isActive ? 'success' : 'default'}
          label={isActive ? t('admin.billing.active') : t('admin.billing.inactive')}
        />
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 110,
      render: (_, plan) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            aria-label={t('btn.edit')}
            onClick={() => openPlanModal(plan)}
          />
          {plan.isActive && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              aria-label={t('admin.billing.deactivate')}
              onClick={() => confirmDeactivatePlan(plan)}
            />
          )}
        </Space>
      ),
    },
  ];

  const couponColumns: ColumnsType<Coupon> = [
    {
      title: t('admin.billing.couponCode'),
      dataIndex: 'code',
      width: 150,
      render: (code: string) => <Text code>{code}</Text>,
    },
    {
      title: t('admin.billing.value'),
      key: 'value',
      width: 140,
      render: (_, c) => (
        <Text strong className="tabular-nums">
          {c.type === 'percent' ? `${c.value}%` : formatMoney(c.value, t('common.sum'))}
        </Text>
      ),
    },
    {
      title: t('admin.billing.used'),
      key: 'uses',
      width: 110,
      align: 'center',
      render: (_, c) => (
        <span className="tabular-nums">
          {formatNumber(c.usedCount)} / {c.maxUses ? formatNumber(c.maxUses) : '∞'}
        </span>
      ),
    },
    {
      title: t('admin.billing.validity'),
      key: 'validity',
      width: 200,
      render: (_, c) => {
        if (!c.validFrom && !c.validTo) return '—';
        const from = c.validFrom ? dayjs(c.validFrom).format('DD.MM.YYYY') : '…';
        const to = c.validTo ? dayjs(c.validTo).format('DD.MM.YYYY') : '…';
        return (
          <span className="tabular-nums">
            {from} — {to}
          </span>
        );
      },
    },
    {
      title: t('admin.billing.plan'),
      key: 'plan',
      width: 150,
      responsive: ['md'],
      render: (_, c) => (c.planId ? planName(c.plan) : t('admin.billing.anyPlan')),
    },
    {
      title: t('adminClubs.status'),
      dataIndex: 'isActive',
      width: 110,
      render: (isActive: boolean) => (
        <StatusTag
          status={isActive ? 'success' : 'default'}
          label={isActive ? t('admin.billing.active') : t('admin.billing.inactive')}
        />
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 110,
      render: (_, coupon) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            aria-label={t('btn.edit')}
            onClick={() => openCouponModal(coupon)}
          />
          {coupon.isActive && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              aria-label={t('admin.billing.deactivate')}
              onClick={() => confirmDeactivateCoupon(coupon)}
            />
          )}
        </Space>
      ),
    },
  ];

  // ==================== Tab tarkiblari ====================
  const invoicesTab = (
    <div>
      <Card
        title={
          <Space size={8}>
            {t('admin.billing.pendingTitle')}
            {pending.length > 0 && <Tag color="gold">{pending.length}</Tag>}
          </Space>
        }
        style={{ marginBottom: TOKENS.spacing.md }}
      >
        <Table
          rowKey="id"
          size="small"
          sticky
          columns={pendingColumns}
          dataSource={pending}
          loading={pendingLoading}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<CheckOutlined />}
                title={t('admin.billing.pendingEmpty')}
                style={{ padding: '20px 12px' }}
              />
            ),
          }}
        />
      </Card>

      <Card title={t('admin.billing.allTitle')}>
        {invoicesError && (
          <Alert
            type="error"
            showIcon
            message={invoicesError}
            action={
              <Button size="small" onClick={refreshInvoices}>
                {t('admin.retry')}
              </Button>
            }
            style={{ marginBottom: TOKENS.spacing.md }}
          />
        )}
        <Space wrap style={{ marginBottom: TOKENS.spacing.md }}>
          <Select
            allowClear
            placeholder={t('admin.billing.statusFilter')}
            value={invStatus}
            style={{ width: 170 }}
            onChange={(v) => {
              setInvStatus(v);
              setInvPage(1);
              void fetchInvoices({ page: 1, pageSize: invPageSize, status: v, clubId: invClubId });
            }}
            options={INVOICE_STATUSES.map((s) => ({
              value: s,
              label: t(`admin.billing.st_${s}`),
            }))}
          />
          <ClubSelect
            value={invClubId}
            placeholder={t('admin.billing.clubFilter')}
            style={{ width: 220 }}
            onChange={(v) => {
              setInvClubId(v);
              setInvPage(1);
              void fetchInvoices({ page: 1, pageSize: invPageSize, status: invStatus, clubId: v });
            }}
          />
        </Space>
        <Table
          rowKey="id"
          size="small"
          sticky
          columns={allInvoiceColumns}
          dataSource={invoices}
          loading={invoicesLoading}
          pagination={{
            current: invPage,
            pageSize: invPageSize,
            total: invTotal,
            showSizeChanger: true,
            showTotal: (n) => `${t('common.total')}: ${formatNumber(n)}`,
            onChange: (p, ps) => {
              const nextPage = ps !== invPageSize ? 1 : p;
              setInvPage(nextPage);
              setInvPageSize(ps);
              void fetchInvoices({
                page: nextPage,
                pageSize: ps,
                status: invStatus,
                clubId: invClubId,
              });
            },
          }}
          scroll={{ x: 1050 }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<FileTextOutlined />}
                title={t('admin.billing.invoicesEmpty')}
                style={{ padding: '20px 12px' }}
              />
            ),
          }}
        />
      </Card>
    </div>
  );

  const plansTab = (
    <Card
      title={t('admin.billing.tabPlans')}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openPlanModal(null)}>
          {t('admin.billing.addPlan')}
        </Button>
      }
    >
      <Table
        rowKey="id"
        size="small"
        sticky
        columns={planColumns}
        dataSource={plans}
        loading={plansLoading}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{
          emptyText: (
            <EmptyState
              icon={<CreditCardOutlined />}
              title={t('admin.billing.plansEmpty')}
              hint={t('admin.billing.plansEmptyHint')}
              action={
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openPlanModal(null)}>
                  {t('admin.billing.addPlan')}
                </Button>
              }
            />
          ),
        }}
      />
    </Card>
  );

  const couponsTab = (
    <Card
      title={t('admin.billing.tabCoupons')}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openCouponModal(null)}>
          {t('admin.billing.addCoupon')}
        </Button>
      }
    >
      <Table
        rowKey="id"
        size="small"
        sticky
        columns={couponColumns}
        dataSource={coupons}
        loading={couponsLoading}
        pagination={false}
        scroll={{ x: 950 }}
        locale={{
          emptyText: (
            <EmptyState
              icon={<TagsOutlined />}
              title={t('admin.billing.couponsEmpty')}
              hint={t('admin.billing.couponsEmptyHint')}
              action={
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => openCouponModal(null)}
                >
                  {t('admin.billing.addCoupon')}
                </Button>
              }
            />
          ),
        }}
      />
    </Card>
  );

  return (
    <PageTransition>
      <PageHeader
        icon={<CreditCardOutlined />}
        title={t('admin.billing.title')}
        subtitle={t('admin.billing.subtitle')}
        extra={
          <Button
            icon={<ReloadOutlined />}
            aria-label={t('btn.refresh')}
            onClick={() => {
              refreshInvoices();
              void fetchPlans();
              void fetchCoupons();
            }}
          />
        }
      />

      <Tabs
        defaultActiveKey="invoices"
        items={[
          {
            key: 'invoices',
            label: (
              <Space size={6}>
                {t('admin.billing.tabInvoices')}
                {pending.length > 0 && <Tag color="gold">{pending.length}</Tag>}
              </Space>
            ),
            children: invoicesTab,
          },
          { key: 'plans', label: t('admin.billing.tabPlans'), children: plansTab },
          { key: 'coupons', label: t('admin.billing.tabCoupons'), children: couponsTab },
        ]}
      />

      {/* To'lovni tasdiqlash */}
      <Modal
        title={`${t('admin.billing.confirmTitle')} — ${confirmInvoice?.number ?? ''}`}
        open={!!confirmInvoice}
        onCancel={() => setConfirmInvoice(null)}
        onOk={() => void handleConfirmInvoice()}
        confirmLoading={invoiceActing}
        okText={t('admin.billing.confirm')}
        cancelText={t('btn.cancel')}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert type="info" showIcon message={t('admin.billing.confirmHint')} />
          {confirmInvoice && (
            <Text>
              {confirmInvoice.club?.name ?? `#${confirmInvoice.clubId}`} ·{' '}
              <Text strong className="tabular-nums">
                {formatMoney(confirmInvoice.amount, t('common.sum'))}
              </Text>
            </Text>
          )}
          <Form layout="vertical">
            <Form.Item label={t('admin.billing.paymentMethod')} style={{ marginBottom: 0 }}>
              <Input
                value={confirmMethod}
                onChange={(e) => setConfirmMethod(e.target.value)}
                placeholder={t('admin.billing.methodPlaceholder')}
                maxLength={30}
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      {/* To'lovni rad etish */}
      <Modal
        title={`${t('admin.billing.rejectTitle')} — ${rejectInvoice?.number ?? ''}`}
        open={!!rejectInvoice}
        onCancel={() => setRejectInvoice(null)}
        onOk={() => void handleRejectInvoice()}
        confirmLoading={invoiceActing}
        okText={t('admin.billing.reject')}
        okButtonProps={{ danger: true }}
        cancelText={t('btn.cancel')}
      >
        <Form layout="vertical">
          <Form.Item label={t('admin.billing.rejectReason')} style={{ marginBottom: 0 }}>
            <Input.TextArea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Tarif yaratish/tahrirlash */}
      <Modal
        title={editingPlan ? t('admin.billing.editPlan') : t('admin.billing.addPlan')}
        open={planModalOpen}
        onCancel={() => setPlanModalOpen(false)}
        onOk={() => void handleSavePlan()}
        confirmLoading={planSaving}
        okText={t('btn.save')}
        cancelText={t('btn.cancel')}
        destroyOnHidden
      >
        <Form form={planForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="code"
                label={t('admin.billing.code')}
                rules={[
                  { required: true, message: t('admin.billing.codeRequired') },
                  { pattern: /^[a-z0-9_-]+$/i, message: 'a-z, 0-9, _ -' },
                ]}
              >
                <Input maxLength={50} placeholder="monthly" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="durationDays"
                label={t('admin.billing.durationDays')}
                rules={[{ required: true, message: t('admin.billing.durationRequired') }]}
              >
                <InputNumber min={1} max={3650} style={{ width: '100%' }} placeholder="30" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="nameUz"
                label={t('admin.billing.nameUz')}
                rules={[{ required: true, message: t('admin.billing.nameRequired') }]}
              >
                <Input maxLength={100} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="nameRu"
                label={t('admin.billing.nameRu')}
                rules={[{ required: true, message: t('admin.billing.nameRequired') }]}
              >
                <Input maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="descriptionUz" label={t('admin.billing.descriptionUz')}>
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="descriptionRu" label={t('admin.billing.descriptionRu')}>
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="price"
                label={t('common.price')}
                rules={[{ required: true, message: t('admin.billing.priceRequired') }]}
              >
                <InputNumber<number>
                  style={{ width: '100%' }}
                  min={0}
                  step={50000}
                  formatter={moneyFormatter}
                  parser={moneyParser}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sortOrder" label={t('admin.billing.sortOrder')}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="isActive"
                label={t('admin.billing.active')}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Kupon yaratish/tahrirlash */}
      <Modal
        title={editingCoupon ? t('admin.billing.editCoupon') : t('admin.billing.addCoupon')}
        open={couponModalOpen}
        onCancel={() => setCouponModalOpen(false)}
        onOk={() => void handleSaveCoupon()}
        confirmLoading={couponSaving}
        okText={t('btn.save')}
        cancelText={t('btn.cancel')}
        destroyOnHidden
      >
        <Form form={couponForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="code"
                label={t('admin.billing.couponCode')}
                rules={[
                  { required: true, message: t('admin.billing.codeRequired') },
                  { pattern: /^[a-z0-9_-]+$/i, message: 'a-z, 0-9, _ -' },
                ]}
              >
                <Input maxLength={50} disabled={!!editingCoupon} placeholder="PROMO2026" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="type"
                label={t('admin.billing.type')}
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { value: 'percent', label: t('admin.billing.type_percent') },
                    { value: 'fixed', label: t('admin.billing.type_fixed') },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="value"
                label={t('admin.billing.value')}
                rules={[{ required: true, message: t('admin.billing.valueRequired') }]}
              >
                <InputNumber<number>
                  style={{ width: '100%' }}
                  min={0}
                  max={couponTypeValue === 'percent' ? 100 : undefined}
                  formatter={couponTypeValue === 'percent' ? undefined : moneyFormatter}
                  parser={couponTypeValue === 'percent' ? undefined : moneyParser}
                  addonAfter={couponTypeValue === 'percent' ? '%' : t('common.sum')}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="maxUses" label={t('admin.billing.maxUses')}>
                <InputNumber
                  min={1}
                  style={{ width: '100%' }}
                  placeholder={t('admin.billing.unlimited')}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="validRange" label={t('admin.billing.validity')}>
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              format="DD.MM.YYYY"
              allowEmpty={[true, true]}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name="planId" label={t('admin.billing.planOnly')}>
                <Select
                  allowClear
                  placeholder={t('admin.billing.anyPlan')}
                  options={plans.map((p) => ({ value: p.id, label: planName(p) }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="isActive"
                label={t('admin.billing.active')}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </PageTransition>
  );
};

export default AdminBilling;
