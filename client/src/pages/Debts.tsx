import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
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
import { debtsApi, errorMessage } from '../api';
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

  const canPay = hasRole('admin', 'kassir');
  const isAdmin = hasRole('admin');

  // `t` yuklash callbackining bog'liqligi EMAS: til almashganda ro'yxat
  // standart filtrlar bilan jimgina qayta yuklanib ketmasin
  const tRef = useRef(t);
  tRef.current = t;

  // Qiymatlar to'g'ridan-to'g'ri parametr sifatida uzatiladi (eski stale-closure xatosining oldini oladi)
  const fetchDebts = useCallback(
    async (params: FetchParams) => {
      setLoading(true);
      try {
        const res = await debtsApi.list({
          page: params.page,
          limit: params.limit,
          search: params.search || undefined,
          status: params.status,
        });
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
        message.error(errorMessage(err, tRef.current('common.error')));
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    },
    [message],
  );

  useEffect(() => {
    void fetchDebts({ page: 1, limit: 10, search: '', status: 'unpaid' });
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
      if (!isFormValidationError(err)) message.error(errorMessage(err, t('common.error')));
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
      message.error(errorMessage(err, t('common.error')));
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
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setDeleting(false);
    }
  };

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
      render: (isPaid: boolean, debt) =>
        debt.writtenOffAt ? (
          <Tooltip title={debt.writtenOffReason || t('debts.writeOffTitle')}>
            <Tag color="warning">{t('debts.writtenOff')}</Tag>
          </Tooltip>
        ) : isPaid ? (
          <StatusTag status="paid" label={t('status.paid')} />
        ) : (
          <StatusTag status="debt" label={t('status.unpaid')} />
        ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 220,
      render: (_, debt) => (
        <Space wrap size={4}>
          {canPay && !debt.isPaid && (
            <Button
              type="primary"
              size="small"
              icon={<DollarOutlined />}
              onClick={() => openPay(debt)}
            >
              {t('debts.pay')}
            </Button>
          )}
          <Button
            size="small"
            icon={<HistoryOutlined />}
            title={t('debts.historyTitle')}
            onClick={() => void openHistory(debt)}
          />
          {/* Yopilgan qarzni (to'langan yoki allaqachon hisobdan chiqarilgan)
              qayta chiqarib bo'lmaydi — server ham rad etadi. Tugmani ochiq
              qoldirish foydalanuvchini majburiy sabab yozib, so'ng xato olishga
              olib borardi */}
          {isAdmin && !debt.isPaid && (
            <Button
              size="small"
              danger
              type="text"
              icon={<DeleteOutlined />}
              aria-label={t('debts.writeOffTitle')}
              title={t('debts.writeOffTitle')}
              onClick={() => {
                setWriteOffReason('');
                setDeleteDebt(debt);
              }}
            />
          )}
        </Space>
      ),
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
            <Segmented
              options={[
                { label: t('status.unpaid'), value: 'unpaid' },
                { label: t('status.paid'), value: 'paid' },
                { label: t('debts.writtenOff'), value: 'written_off' },
                { label: t('common.all'), value: 'all' },
              ]}
              value={status}
              onChange={(value) => applyStatus(value as StatusFilter)}
            />
            <Button
              icon={<ReloadOutlined />}
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
        <Card>
          <Input.Search
            placeholder={t('debts.searchPlaceholder')}
            allowClear
            enterButton
            onSearch={applySearch}
            style={{ maxWidth: 380, marginBottom: 16 }}
          />
          <Table
            rowKey="id"
            size="middle"
            sticky
            columns={columns}
            dataSource={debts}
            loading={loading}
            scroll={{ x: 1000 }}
            locale={{
              emptyText: (
                <EmptyState
                  icon={<CreditCardOutlined />}
                  title={t('debts.emptyTitle')}
                  hint={t('debts.emptyHint')}
                />
              ),
            }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              position: ['bottomRight'],
              onChange: (p, ps) => {
                // pageSize o'zgarsa 1-sahifaga qaytamiz (boshqa sahifalar bilan bir xil)
                const nextPage = ps !== pageSize ? 1 : p;
                setPage(nextPage);
                setPageSize(ps);
                void fetchDebts({ page: nextPage, limit: ps, search, status });
              },
            }}
          />
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
