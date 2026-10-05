import { useCallback, useEffect, useRef, useState } from 'react';
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
  CreditCardOutlined,
  DeleteOutlined,
  DollarOutlined,
  HistoryOutlined,
  ReloadOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage, debtsApi, errorMessage } from '../api';
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
import { TOKENS } from '../theme/tokens';
import type { Debt, DebtPayment, PaymentMethod } from '../types';
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

  const [payDebt, setPayDebt] = useState<Debt | null>(null);
  const [payForm] = Form.useForm<{ amount: number; paymentMethod: PaymentMethod }>();
  const [paying, setPaying] = useState(false);

  const [historyDebt, setHistoryDebt] = useState<Debt | null>(null);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

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
        message.error(errorMessage(err, tRef.current('common.error')));
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
  const openPay = (debt: Debt) => {
    payForm.setFieldsValue({ amount: debt.remainingDebt, paymentMethod: 'cash' });
    setPayDebt(debt);
  };

  const handlePay = async () => {
    if (!payDebt) return;
    try {
      // Validatsiya try ICHIDA — rad javob "unhandled rejection" bo'lib qolmasin
      const values = await payForm.validateFields();
      setPaying(true);
      const res = await debtsApi.pay(payDebt.id, values.amount, values.paymentMethod);
      message.success(res.message);
      setPayDebt(null);
      payForm.resetFields();
      void fetchDebts({ page, limit: pageSize, search, status });
    } catch (err) {
      // Forma xatolari maydon ostida ko'rinadi — toast shart emas
      if (!isFormValidationError(err)) message.error(apiErrorMessage(err, t));
    } finally {
      setPaying(false);
    }
  };

  // ---------- To'lovlar tarixi ----------
  const openHistory = async (debt: Debt) => {
    setHistoryDebt(debt);
    setPayments([]);
    setPaymentsLoading(true);
    try {
      const res = await debtsApi.payments(debt.id);
      setPayments(res.data);
    } catch (err) {
      message.error(apiErrorMessage(err, t));
    } finally {
      setPaymentsLoading(false);
    }
  };

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
  const debtStatus = (debt: Debt) => debt.writtenOffAt ? (
    <Tooltip title={debt.writtenOffReason || t('debts.writeOffTitle')}><Tag color="warning">{t('debts.writtenOff')}</Tag></Tooltip>
  ) : <StatusTag status={debt.isPaid ? 'paid' : 'debt'} label={t(debt.isPaid ? 'status.paid' : 'status.unpaid')} />;
  const debtActions = (debt: Debt) => <Space wrap size={4}>
    {canPay && !debt.isPaid && <Button type="primary" size="small" icon={<DollarOutlined />} onClick={() => openPay(debt)}>{t('debts.pay')}</Button>}
    <Button size="small" icon={<HistoryOutlined />} aria-label={t('debts.historyTitle')} title={t('debts.historyTitle')} onClick={() => void openHistory(debt)}>
      {mobile ? t('debts.historyTitle') : null}
    </Button>
    {canWriteOff && !debt.isPaid && <Button size="small" danger type="text" icon={<DeleteOutlined />}
      aria-label={t('debts.writeOffTitle')} title={t('debts.writeOffTitle')}
      onClick={() => { setWriteOffReason(''); setDeleteDebt(debt); }} />}
  </Space>;
  const emptyDebts = <EmptyState icon={<CreditCardOutlined />} title={t('debts.emptyTitle')} hint={t('debts.emptyHint')} />;

  const columns: ColumnsType<Debt> = [
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
                    amount={totals?.totalRemaining}
                    currency={currency}
                    color={(totals?.totalRemaining ?? 0) > 0 ? TOKENS.color.gold.base : undefined}
                    style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
                  />
                }
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
              {debts.length === 0 ? emptyDebts : <div className="records-mobile__list" role="list">
                {debts.map((debt) => <article className="record-card" role="listitem" key={debt.id}>
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
            dataSource={debts}
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
