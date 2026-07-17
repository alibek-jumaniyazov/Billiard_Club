import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  BookOutlined,
  DeleteOutlined,
  DollarOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { debtsApi, errorMessage } from '../api';
import { PAYMENT_METHODS } from '../constants';
import { useAuth } from '../context/AuthContext';
import type { Debt, DebtPayment, PaymentMethod } from '../types';
import { formatMoney } from '../utils/format';

const { Title, Text } = Typography;

type StatusFilter = 'unpaid' | 'paid' | 'all';

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

  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
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

  const canPay = hasRole('admin', 'kassir');
  const isAdmin = hasRole('admin');

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
        message.error(errorMessage(err, t('common.error')));
      } finally {
        setLoading(false);
      }
    },
    [message, t],
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
    const values = await payForm.validateFields();
    setPaying(true);
    try {
      const res = await debtsApi.pay(payDebt.id, values.amount, values.paymentMethod);
      message.success(res.message);
      setPayDebt(null);
      payForm.resetFields();
      void fetchDebts({ page, limit: pageSize, search, status });
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
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

  // ---------- O'chirish (server to'lovi bor qarzni bloklaydi) ----------
  const handleDelete = async (debt: Debt) => {
    try {
      const res = await debtsApi.remove(debt.id);
      message.success(res.message);
      void fetchDebts({ page, limit: pageSize, search, status });
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
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
      render: (value: number) => formatMoney(value, t('common.sum')),
    },
    {
      title: t('debts.paidAmountCol'),
      dataIndex: 'paidAmount',
      width: 140,
      render: (value: number) => <Text type="success">{formatMoney(value, t('common.sum'))}</Text>,
    },
    {
      title: t('debts.remainingCol'),
      dataIndex: 'remainingDebt',
      width: 150,
      render: (value: number) => (
        <Text strong style={{ color: '#faad14' }}>
          {formatMoney(value, t('common.sum'))}
        </Text>
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
      width: 120,
      render: (isPaid: boolean) =>
        isPaid ? (
          <Tag color="green">{t('status.paid')}</Tag>
        ) : (
          <Tag color="red">{t('status.unpaid')}</Tag>
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
          {isAdmin && (
            <Popconfirm
              title={t('common.confirmDelete')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              onConfirm={() => void handleDelete(debt)}
            >
              <Button size="small" danger type="text" icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const paymentColumns: ColumnsType<DebtPayment> = [
    {
      title: t('debts.amount'),
      dataIndex: 'amount',
      render: (value: number) => <Text strong>{formatMoney(value, t('common.sum'))}</Text>,
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
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={3} style={{ marginBottom: 0 }}>
            <BookOutlined /> {t('debts.title')}
          </Title>
          <Text type="secondary">{t('debts.subtitle')}</Text>
        </div>
        <Space>
          <Segmented
            options={[
              { label: t('status.unpaid'), value: 'unpaid' },
              { label: t('status.paid'), value: 'paid' },
              { label: t('common.all'), value: 'all' },
            ]}
            value={status}
            onChange={(value) => applyStatus(value as StatusFilter)}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void fetchDebts({ page, limit: pageSize, search, status })}
          />
        </Space>
      </div>

      {/* Serverdan kelgan TO'LIQ filtr bo'yicha yig'indilar (faqat joriy sahifa emas) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title={t('debts.statRemaining')}
              value={formatMoney(totals?.totalRemaining, t('common.sum'))}
              valueStyle={{ color: (totals?.totalRemaining ?? 0) > 0 ? '#faad14' : undefined }}
              loading={loading && totals === null}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title={t('debts.statTotal')}
              value={formatMoney(totals?.totalDebt, t('common.sum'))}
              loading={loading && totals === null}
            />
          </Card>
        </Col>
      </Row>

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
          columns={columns}
          dataSource={debts}
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
              void fetchDebts({ page: p, limit: ps, search, status });
            },
          }}
        />
      </Card>

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
        <Card size="small" style={{ marginBottom: 16 }}>
          <Statistic
            title={t('debts.remainingLabel')}
            value={formatMoney(payDebt?.remainingDebt, t('common.sum'))}
            valueStyle={{ color: '#faad14' }}
          />
        </Card>
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
              addonAfter={t('common.sum')}
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

      {/* To'lovlar tarixi */}
      <Drawer
        title={`${t('debts.historyTitle')} — ${historyDebt?.customerName ?? ''}`}
        open={!!historyDebt}
        onClose={() => setHistoryDebt(null)}
        width={520}
      >
        <Table
          rowKey="id"
          size="small"
          columns={paymentColumns}
          dataSource={payments}
          loading={paymentsLoading}
          pagination={false}
        />
      </Drawer>
    </div>
  );
};

export default Debts;
