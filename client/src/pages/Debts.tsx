import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CloudUploadOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  DollarOutlined,
  HistoryOutlined,
  ReloadOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage, debtsApi, errorMessage, isNetworkError } from '../api';
import {
  EmptyState,
  MoneyText,
  PageHeader,
  PageTransition,
  StatCard,
  StatusTag,
} from '../components/ui';
import { PAYMENT_METHODS } from '../constants';
import { useCurrency } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import {
  applyDebtPayments,
  countOps,
  depKeys,
  hasQueuedDeps,
  newOpKey,
  offlineDebtPayments,
  opNow,
  pendingDebtPaymentsTotal,
  queueDebtPayment,
  type DebtView,
} from '../offline/ops';
import { TOKENS } from '../theme/tokens';
import type { Debt, DebtPayment, PaymentMethod } from '../types';
import { formatMoney } from '../utils/format';
import { isFormValidationError } from '../utils/formErrors';
import '../styles/records-mobile.css';

const { Text } = Typography;

/**
 * 'written_off' — hisobdan chiqarilgan qarzlar ALOHIDA ko'rsatiladi.
 * Ular ham `isPaid = true` bo'ladi, lekin pul OLINMAGAN — "To'langan"
 * ro'yxatiga qo'shilsa yig'indi klub egasini chalg'itardi.
 */
type StatusFilter = 'unpaid' | 'paid' | 'written_off' | 'all';

interface FetchParams {
  page: number;
  limit: number;
  search: string;
  status: StatusFilter;
}

const Debts = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const { online, entries } = useConnection();
  const currency = useCurrency();
  const screens = Grid.useBreakpoint();
  const mobile = screens.md === false;

  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('unpaid');
  const [totals, setTotals] = useState<Record<string, number> | null>(null);

  const [payDebt, setPayDebt] = useState<DebtView | null>(null);
  const [payForm] = Form.useForm<{ amount: number; paymentMethod: PaymentMethod }>();
  const [paying, setPaying] = useState(false);

  const [historyDebt, setHistoryDebt] = useState<Debt | null>(null);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  /** Server tarixi internetsiz yuklanmadi — faqat navbatdagi to'lovlar ko'rinadi */
  const [paymentsOffline, setPaymentsOffline] = useState(false);

  // Hisobdan chiqarish — oddiy "rostdanmi?" o'rniga to'liq tasdiq oynasi
  const [deleteDebt, setDeleteDebt] = useState<Debt | null>(null);
  /** Hisobdan chiqarish sababi — serverga uzatiladi va audit jurnaliga tushadi */
  const [writeOffReason, setWriteOffReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  // 'superadmin' ATAYLAB kiritilgan: server pay/write-off endpointlari uni
  // @Roles(SUPERADMIN, ...) bilan ruxsat etadi va superadmin "klubni ko'rish"
  // rejimida /debts sahifasiga kira oladi (App.tsx Protected bypass). Uni
  // bu yerda tashlab ketilsa, superadminda tugmalar KO'RINMAY qolardi —
  // qolgan barcha sahifalar (Customers/Expenses/Orders/...) superadminni kiritadi.
  const canPay = hasRole('superadmin', 'admin', 'kassir');
  const canWriteOff = hasRole('superadmin', 'admin');

  // `t` yuklash callbackining bog'liqligi EMAS: til almashganda ro'yxat
  // standart filtrlar bilan jimgina qayta yuklanib ketmasin
  const tRef = useRef(t);
  tRef.current = t;
  const debtsRequest = useRef(0);

  // Qiymatlar to'g'ridan-to'g'ri parametr sifatida uzatiladi (eski stale-closure xatosining oldini oladi)
  const fetchDebts = useCallback(
    async (params: FetchParams) => {
      const request = ++debtsRequest.current;
      const isCurrent = () => request === debtsRequest.current;
      setLoading(true);
      try {
        const res = await debtsApi.list({
          page: params.page,
          limit: params.limit,
          search: params.search || undefined,
          status: params.status,
        });
        if (!isCurrent()) return;
        // Mutatsiyadan keyin joriy sahifa bo'shab qolsa — bitta orqaga qaytamiz
        // (masalan 2-sahifadagi yagona qarz to'liq to'landi)
        if (res.data.length === 0 && params.page > 1 && (res.pagination?.total ?? 0) > 0) {
          setPage(params.page - 1);
          return fetchDebts({ ...params, page: params.page - 1 });
        }
        setDebts(res.data);
        setTotal(res.pagination?.total ?? 0);
        setTotals(res.totals ?? null);
      } catch (err) {
        if (!isCurrent()) return;
        message.error(apiErrorMessage(err, tRef.current));
      } finally {
        // A corrective fetch for an empty page owns its own loading state.
        if (isCurrent()) {
          setLoading(false);
          setLoaded(true);
        }
      }
    },
    [message],
  );

  useEffect(() => {
    void fetchDebts({ page: 1, limit: 10, search: '', status: 'unpaid' });
    return () => { debtsRequest.current += 1; };
  }, [fetchDebts]);

  /**
   * OFLAYN TO'LOVLAR — navbatdagi (yuborilmagan) to'lovlar ro'yxat ustiga
   * qoplanadi: qoldiq darhol kamayadi va "Yuborilmagan" belgisi chiqadi.
   * Manba yagona — navbatning o'zi (offline/ops.ts), alohida holat yo'q.
   */
  const view = useMemo(() => applyDebtPayments(debts, entries), [debts, entries]);
  const pendingTotal = useMemo(
    () => pendingDebtPaymentsTotal(entries, { status, search }),
    [entries, status, search],
  );
  /** Server yig'indisidan yuborilmagan to'lovlar ayirilgan qoldiq */
  const shownRemaining = totals
    ? Math.max(0, Math.round((totals.totalRemaining - pendingTotal) * 100) / 100)
    : undefined;

  // Navbatdagi to'lov serverga yetib bordi (yoki voz kechildi) — ro'yxat
  // serverdan qayta olinadi, aks holda qoldiq eski holatda qolib ketardi
  const filtersRef = useRef<FetchParams>({ page, limit: pageSize, search, status });
  filtersRef.current = { page, limit: pageSize, search, status };
  const debtOps = useMemo(() => countOps(entries, ['debt.pay']), [entries]);
  const prevDebtOps = useRef(debtOps);
  useEffect(() => {
    if (debtOps < prevDebtOps.current && online) void fetchDebts(filtersRef.current);
    prevDebtOps.current = debtOps;
  }, [debtOps, online, fetchDebts]);

  const applyStatus = (value: StatusFilter) => {
    setStatus(value);
    setPage(1);
    void fetchDebts({ page: 1, limit: pageSize, search, status: value });
  };

  const applySearch = (value: string) => {
    setSearch(value);
    setPage(1);
    void fetchDebts({ page: 1, limit: pageSize, search: value, status });
  };

  // ---------- To'lov ----------
  const openPay = (debt: DebtView) => {
    payForm.setFieldsValue({ amount: debt.remainingDebt, paymentMethod: 'cash' });
    setPayDebt(debt);
  };

  const closePay = () => {
    setPayDebt(null);
    payForm.resetFields();
  };

  /**
   * To'lov: onlayn — darhol serverga; internet yo'q (yoki aynan shu so'rovda
   * uzilsa) — AYNAN SHU kalit va tugma bosilgan vaqt bilan navbatga. Server
   * bajargan-u javob yo'qolgan bo'lsa, navbatdagi takror ikkinchi to'lov
   * yozmaydi (idempotentlik). `payDebt` qoldig'i navbatdagi to'lovlar
   * ayirilgan qiymat — forma ortiqcha summani o'tkazmaydi.
   */
  const handlePay = async () => {
    if (!payDebt) return;
    let values: { amount: number; paymentMethod: PaymentMethod };
    try {
      // Validatsiya try ICHIDA — rad javob "unhandled rejection" bo'lib qolmasin
      values = await payForm.validateFields();
    } catch (err) {
      // Forma xatolari maydon ostida ko'rinadi — toast shart emas
      if (!isFormValidationError(err)) message.error(apiErrorMessage(err, t));
      return;
    }
    const debt = payDebt;
    const key = newOpKey();
    const at = opNow();
    // Shu mijozning oldingi to'lovi navbatda — yangisi ham uning ORTIDAN ketadi
    const behindQueue = hasQueuedDeps(entries, [depKeys.debt(debt)]);
    const saveOffline = async () => {
      await queueDebtPayment(debt, values, key, at);
      message.success(online && behindQueue ? t('debts.queuedBehind') : t('debts.offlineSaved'));
      closePay();
    };
    setPaying(true);
    try {
      if (!online || behindQueue) {
        await saveOffline();
        return;
      }
      const res = await debtsApi.pay(debt.id, values.amount, values.paymentMethod, key);
      message.success(res.message);
      closePay();
      void fetchDebts({ page, limit: pageSize, search, status });
    } catch (err) {
      // Aloqa aynan shu so'rovda uzildi — pul olingan, to'lov yo'qolmasin
      if (isNetworkError(err)) {
        try {
          await saveOffline();
        } catch (queueErr) {
          message.error(errorMessage(queueErr, t('common.error')));
        }
        return;
      }
      message.error(apiErrorMessage(err, t));
    } finally {
      setPaying(false);
    }
  };

  // ---------- To'lovlar tarixi ----------
  const openHistory = async (debt: Debt) => {
    setHistoryDebt(debt);
    setPayments([]);
    setPaymentsOffline(false);
    setPaymentsLoading(true);
    try {
      const res = await debtsApi.payments(debt.id);
      setPayments(res.data);
    } catch (err) {
      // Internetsiz server tarixi yo'q — navbatdagi to'lovlar baribir ko'rinadi
      if (isNetworkError(err)) setPaymentsOffline(true);
      else message.error(apiErrorMessage(err, t));
    } finally {
      setPaymentsLoading(false);
    }
  };
  const historyPending = useMemo(
    () => (historyDebt ? offlineDebtPayments(entries, historyDebt.id) : []),
    [entries, historyDebt],
  );

  // ---------- Hisobdan chiqarish (server to'lovi bor qarzni bloklaydi) ----------
  const handleDelete = async () => {
    if (!deleteDebt) return;
    const reason = writeOffReason.trim();
    if (!reason) {
      message.warning(t('debts.writeOffReasonRequired'));
      return;
    }
    setDeleting(true);
    try {
      const res = await debtsApi.remove(deleteDebt.id, reason);
      message.success(res.message);
      setDeleteDebt(null);
      void fetchDebts({ page, limit: pageSize, search, status });
    } catch (err) {
      message.error(apiErrorMessage(err, t));
    } finally {
      setDeleting(false);
    }
  };

  const changePage = (nextPage: number, nextSize: number) => {
    const targetPage = nextSize !== pageSize ? 1 : nextPage;
    setPage(targetPage);
    setPageSize(nextSize);
    void fetchDebts({ page: targetPage, limit: nextSize, search, status });
  };
  const statusOptions = [
    { label: t('status.unpaid'), value: 'unpaid' },
    { label: t('status.paid'), value: 'paid' },
    { label: t('debts.writtenOff'), value: 'written_off' },
    { label: t('common.all'), value: 'all' },
  ];
  /** Oflayn to'lov belgisi: kutayotgani — ko'k, server rad etgani — qizil */
  const offlineTags = (debt: DebtView) => <>
    {debt.offlinePaid ? <Tooltip title={t('debts.offlinePendingHint', { amount: formatMoney(debt.offlinePaid, currency) })}>
      <Tag color="processing" icon={<CloudUploadOutlined />}>{t('debts.offlinePending')}</Tag>
    </Tooltip> : null}
    {debt.offlineFailed ? <Tooltip title={t('debts.offlineFailedHint')}>
      <Tag color="error" icon={<ExclamationCircleOutlined />}>{t('debts.offlineFailed')}</Tag>
    </Tooltip> : null}
  </>;
  const debtStatus = (debt: DebtView) => <Space size={4} wrap>
    {debt.writtenOffAt ? (
      <Tooltip title={debt.writtenOffReason || t('debts.writeOffTitle')}><Tag color="warning">{t('debts.writtenOff')}</Tag></Tooltip>
    ) : <StatusTag status={debt.isPaid ? 'paid' : 'debt'} label={t(debt.isPaid ? 'status.paid' : 'status.unpaid')} />}
    {offlineTags(debt)}
  </Space>;
  /**
   * Hisobdan chiqarish INTERNET TALAB QILADI: pulni yo'q qiladigan admin amali,
   * server to'lov tarixini tekshiradi. Yuborilmagan to'lovi bor qarz ham
   * chiqarilmaydi — server uni baribir "to'lovi bor" deb rad etardi.
   */
  const writeOffBlock = (debt: DebtView): string | null =>
    !online ? t('debts.writeOffOffline') : debt.offlinePaid ? t('debts.writeOffPending') : null;
  const debtActions = (debt: DebtView) => <Space wrap size={4}>
    {canPay && !debt.isPaid && <Button type="primary" size="small" icon={<DollarOutlined />} onClick={() => openPay(debt)}>{t('debts.pay')}</Button>}
    <Button size="small" icon={<HistoryOutlined />} aria-label={t('debts.historyTitle')} title={t('debts.historyTitle')} onClick={() => void openHistory(debt)}>
      {mobile ? t('debts.historyTitle') : null}
    </Button>
    {canWriteOff && !debt.isPaid && <Tooltip title={writeOffBlock(debt) ?? t('debts.writeOffTitle')}>
      <span>
        <Button size="small" danger type="text" icon={<DeleteOutlined />}
          aria-label={t('debts.writeOffTitle')} disabled={writeOffBlock(debt) !== null}
          onClick={() => { setWriteOffReason(''); setDeleteDebt(debt); }} />
      </span>
    </Tooltip>}
  </Space>;
  const emptyDebts = <EmptyState icon={<CreditCardOutlined />} title={t('debts.emptyTitle')} hint={t('debts.emptyHint')} />;

  const columns: ColumnsType<DebtView> = [
    {
      title: t('common.customer'),
      key: 'customer',
      render: (_, debt) => (
        <Space direction="vertical" size={0}>
          <Text strong>{debt.customerName}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {debt.customerPhone ?? t('debts.noPhone')}
          </Text>
        </Space>
      ),
    },
    {
      title: t('common.table'),
      key: 'table',
      width: 110,
      render: (_, debt) =>
        debt.session?.table ? <Tag>{debt.session.table.name}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: t('debts.totalDebtCol'),
      dataIndex: 'totalDebt',
      width: 140,
      align: 'right',
      render: (value: number) => <MoneyText amount={value} currency={currency} />,
    },
    {
      title: t('debts.paidAmountCol'),
      dataIndex: 'paidAmount',
      width: 140,
      align: 'right',
      render: (value: number) => (
        <MoneyText
          amount={value}
          currency={currency}
          color={TOKENS.color.semantic.success}
        />
      ),
    },
    {
      title: t('debts.remainingCol'),
      dataIndex: 'remainingDebt',
      width: 150,
      align: 'right',
      render: (value: number) => (
        <MoneyText
          amount={value}
          currency={currency}
          color={value > 0 ? TOKENS.color.gold.base : undefined}
        />
      ),
    },
    {
      title: t('common.date'),
      dataIndex: 'createdAt',
      width: 140,
      render: (value: string) => dayjs(value).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: t('debts.status'),
      dataIndex: 'isPaid',
      width: 150,
      // Hisobdan chiqarilgan qarz ham `isPaid: true` bo'ladi, lekin u
      // TO'LANMAGAN — uni "To'langan" deb ko'rsatish klub egasini undirilmagan
      // pulni tushum deb o'ylashga olib kelardi. Shuning uchun alohida belgi.
      render: (_, debt) => debtStatus(debt),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 220,
      render: (_, debt) => debtActions(debt),
    },
  ];

  const paymentColumns: ColumnsType<DebtPayment> = [
    {
      title: t('debts.amount'),
      dataIndex: 'amount',
      render: (value: number) => <MoneyText amount={value} currency={currency} />,
    },
    {
      title: t('payment.method'),
      dataIndex: 'paymentMethod',
      width: 110,
      render: (method: PaymentMethod) => <Tag>{t(`payment.${method}`)}</Tag>,
    },
    {
      title: t('debts.receivedBy'),
      key: 'user',
      width: 130,
      render: (_, payment) => payment.user?.name ?? '—',
    },
    {
      title: t('common.date'),
      dataIndex: 'createdAt',
      width: 130,
      render: (value: string) => dayjs(value).format('DD.MM.YYYY HH:mm'),
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<CreditCardOutlined />}
        title={t('debts.title')}
        subtitle={t('debts.subtitle')}
        extra={
          <>
            {mobile ? <Select<StatusFilter> aria-label={t('debts.status')} value={status}
              options={statusOptions} onChange={applyStatus} style={{ flex: 1, minWidth: 180 }} /> : <Segmented
              options={statusOptions}
              value={status}
              onChange={(value) => applyStatus(value as StatusFilter)}
            />}
            <Button
              icon={<ReloadOutlined />}
              aria-label={t('btn.refresh')}
              onClick={() => void fetchDebts({ page, limit: pageSize, search, status })}
            />
          </>
        }
        stats={
          <Row gutter={[16, 16]}>
            {/* Serverdan kelgan TO'LIQ filtr bo'yicha yig'indilar (faqat joriy sahifa emas) */}
            <Col xs={24} sm={12} lg={6}>
              <StatCard
                label={t('debts.statRemaining')}
                value={
                  <MoneyText
                    amount={shownRemaining}
                    currency={currency}
                    color={(shownRemaining ?? 0) > 0 ? TOKENS.color.gold.base : undefined}
                    style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
                  />
                }
                footnote={pendingTotal > 0
                  ? t('debts.offlineTotalsHint', { amount: formatMoney(pendingTotal, currency) })
                  : undefined}
                icon={<DollarOutlined />}
                loading={loading && totals === null}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard
                label={t('debts.statTotal')}
                value={
                  <MoneyText
                    amount={totals?.totalDebt}
                    currency={currency}
                    style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
                  />
                }
                icon={<WalletOutlined />}
                accent={TOKENS.color.emerald.bright}
                loading={loading && totals === null}
              />
            </Col>
          </Row>
        }
      />

      {!loaded ? (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : (
        <Card className="records-container">
          <Input.Search
            aria-label={t('debts.searchPlaceholder')}
            placeholder={t('debts.searchPlaceholder')}
            allowClear
            enterButton
            onSearch={applySearch}
            style={{ maxWidth: 380, marginBottom: 16 }}
          />
          {mobile ? <div className="records-mobile" aria-busy={loading}>
            <Spin spinning={loading}>
              {view.length === 0 ? emptyDebts : <div className="records-mobile__list" role="list">
                {view.map((debt) => <article className="record-card" role="listitem" key={debt.id}>
                  <header className="record-card__header">
                    <div><h2>{debt.customerName}</h2><p>{debt.customerPhone ?? t('debts.noPhone')}</p></div>
                    {debtStatus(debt)}
                  </header>
                  <div className="record-card__total"><span>{t('debts.remainingCol')}</span>
                    <MoneyText amount={debt.remainingDebt} currency={currency} size="lg"
                      color={debt.remainingDebt > 0 ? TOKENS.color.gold.base : undefined}
                      style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }} /></div>
                  <dl className="record-card__metadata">
                    <div><dt>{t('debts.totalDebtCol')}</dt><dd><MoneyText amount={debt.totalDebt} currency={currency} size="sm" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }} /></dd></div>
                    <div><dt>{t('debts.paidAmountCol')}</dt><dd><MoneyText amount={debt.paidAmount} currency={currency} size="sm" color={TOKENS.color.semantic.success} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }} /></dd></div>
                    <div><dt>{t('common.table')}</dt><dd>{debt.session?.table?.name ?? '—'}</dd></div>
                    <div><dt>{t('common.date')}</dt><dd>{dayjs(debt.createdAt).format('DD.MM.YYYY HH:mm')}</dd></div>
                  </dl>
                  {debt.writtenOffAt && debt.writtenOffReason && <p className="record-card__note">{debt.writtenOffReason}</p>}
                  <div className="record-card__actions">{debtActions(debt)}</div>
                </article>)}
              </div>}
            </Spin>
            <Pagination className="records-mobile__pagination" size="small" responsive current={page}
              pageSize={pageSize} total={total} showSizeChanger onChange={changePage} />
          </div> : <Table
            rowKey="id"
            size="middle"
            sticky
            columns={columns}
            dataSource={view}
            loading={loading}
            scroll={{ x: 1000 }}
            locale={{
              emptyText: emptyDebts,
            }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              position: ['bottomRight'],
              onChange: changePage,
            }}
          />}
        </Card>
      )}

      {/* Qarzni uzish */}
      <Modal
        title={`${t('debts.payTitle')} — ${payDebt?.customerName ?? ''}`}
        open={!!payDebt}
        onCancel={() => {
          setPayDebt(null);
          payForm.resetFields();
        }}
        onOk={() => void handlePay()}
        okText={t('debts.acceptPayment')}
        cancelText={t('btn.cancel')}
        confirmLoading={paying}
      >
        <div
          style={{
            background: TOKENS.color.bg.bg2,
            border: `1px solid ${TOKENS.color.border.subtle}`,
            borderRadius: TOKENS.radius.md,
            padding: '12px 16px',
            marginBottom: 16,
          }}
        >
          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
            {t('debts.remainingLabel')}
          </Text>
          <MoneyText
            amount={payDebt?.remainingDebt}
            currency={currency}
            size="lg"
            color={TOKENS.color.gold.base}
          />
        </div>
        <Form form={payForm} layout="vertical">
          <Form.Item
            name="amount"
            label={t('debts.amountLabel')}
            rules={[
              { required: true, message: t('debts.amountRequired') },
              {
                // Server sharti bilan bir xil: 0 < amount <= qoldiq.
                // min=0 (min=1 emas): tozalangan maydon 1 so'mlik soxta
                // to'lovga aylanmaydi, kasr qoldiqlarni ham kiritish mumkin.
                validator: (_, value: number) =>
                  typeof value === 'number' &&
                  value > 0 &&
                  value <= (payDebt?.remainingDebt ?? 0) + 0.001
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('debts.amountInvalid'))),
              },
            ]}
          >
            <InputNumber<number>
              style={{ width: '100%' }}
              min={0}
              max={payDebt?.remainingDebt}
              addonAfter={currency}
              formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
              parser={(value) => Number((value ?? '').replace(/\s/g, ''))}
            />
          </Form.Item>
          <Button
            type="dashed"
            block
            style={{ marginBottom: 16 }}
            onClick={() => payForm.setFieldValue('amount', payDebt?.remainingDebt)}
          >
            {t('debts.payFull')}
          </Button>
          <Form.Item
            name="paymentMethod"
            label={t('payment.method')}
            rules={[{ required: true, message: t('debts.methodRequired') }]}
          >
            <Select
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`payment.${m}`) }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Hisobdan chiqarish — mijoz, qoldiq va qaytarib bo'lmasligi aniq ko'rsatiladi */}
      <Modal
        title={t('debts.writeOffTitle')}
        open={!!deleteDebt}
        onCancel={() => setDeleteDebt(null)}
        onOk={() => void handleDelete()}
        okText={t('debts.writeOffConfirm')}
        cancelText={t('btn.cancel')}
        okButtonProps={{ danger: true }}
        confirmLoading={deleting}
      >
        <div
          style={{
            background: TOKENS.color.bg.bg2,
            border: `1px solid ${TOKENS.color.border.subtle}`,
            borderRadius: TOKENS.radius.md,
            padding: '12px 16px',
            marginBottom: 16,
          }}
        >
          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
            {t('common.customer')}
          </Text>
          <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>
            {deleteDebt?.customerName}
          </Text>
          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
            {t('debts.remainingLabel')}
          </Text>
          <MoneyText
            amount={deleteDebt?.remainingDebt}
            currency={currency}
            size="lg"
            color={TOKENS.color.semantic.error}
          />
        </div>
        <Alert
          type="error"
          showIcon
          message={t('debts.writeOffWarning')}
          style={{ marginBottom: 16 }}
        />

        {/* Sabab MAJBURIY: bu pulni yo'q qiladigan amal — audit jurnalida
            "kim, qachon, nega" savoliga javob qolishi shart */}
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
          {t('debts.writeOffReasonLabel')}
        </Text>
        <Input.TextArea
          value={writeOffReason}
          onChange={(e) => setWriteOffReason(e.target.value)}
          placeholder={t('debts.writeOffReasonPlaceholder')}
          maxLength={200}
          showCount
          rows={2}
          status={writeOffReason.trim().length === 0 ? 'error' : undefined}
        />
      </Modal>

      {/* To'lovlar tarixi */}
      <Drawer
        title={`${t('debts.historyTitle')} — ${historyDebt?.customerName ?? ''}`}
        open={!!historyDebt}
        onClose={() => setHistoryDebt(null)}
        width="min(480px, 100vw)"
      >
        {paymentsOffline && (
          <Alert type="info" showIcon message={t('debts.offlineHistoryUnavailable')} style={{ marginBottom: 12 }} />
        )}
        {/* Shu kassada navbatda turgan (serverga hali yetmagan) to'lovlar */}
        {historyPending.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>{t('debts.offlineHistoryTitle')}</Text>
            {historyPending.map((p) => (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 0',
                borderBottom: `1px solid ${TOKENS.color.border.subtle}` }}>
                <MoneyText amount={p.amount} currency={currency} />
                <Tag>{t(`payment.${p.paymentMethod}`)}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(p.at).format('DD.MM.YYYY HH:mm')}</Text>
                {p.offlineMark === 'failed' ? (
                  <Tooltip title={p.offlineError ?? t('debts.offlineFailedHint')}>
                    <Tag color="error" icon={<ExclamationCircleOutlined />}>{t('debts.offlineFailed')}</Tag>
                  </Tooltip>
                ) : <Tag color="processing" icon={<CloudUploadOutlined />}>{t('debts.offlinePending')}</Tag>}
              </div>
            ))}
          </div>
        )}
        <Table
          rowKey="id"
          size="small"
          columns={paymentColumns}
          dataSource={payments}
          loading={paymentsLoading}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: (
              <EmptyState icon={<HistoryOutlined />} title={t('debts.historyEmpty')} />
            ),
          }}
          pagination={false}
        />
      </Drawer>
    </PageTransition>
  );
};

export default Debts;
