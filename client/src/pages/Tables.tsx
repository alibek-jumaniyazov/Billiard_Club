import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import {
  CaretRightOutlined,
  CloseCircleOutlined,
  CoffeeOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, ordersApi, productsApi, sessionsApi, tablesApi } from '../api';
import { PAYMENT_METHODS } from '../constants';
import { useAuth } from '../context/AuthContext';
import type { BilliardTable, PaymentMethod, Product, Session } from '../types';
import { formatElapsed, formatMoney } from '../utils/format';
import { sessionElapsedMs, sessionTableAmount } from '../utils/session';

const { Title, Text } = Typography;

interface StartValues {
  customerName?: string;
  customerPhone?: string;
}

interface OrderRow {
  productId?: number;
  quantity?: number;
}

interface OrderValues {
  items: OrderRow[];
}

interface EndValues {
  paymentMethod: PaymentMethod;
  discount?: number;
  isDebt?: boolean;
  isTableDebt?: boolean;
  isBarDebt?: boolean;
  customerName?: string;
  customerPhone?: string;
}

const Tables = () => {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const { hasRole } = useAuth();
  const canCheckout = hasRole('admin', 'kassir');

  const [tables, setTables] = useState<BilliardTable[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Jonli taymer uchun har sekund yangilanadigan vaqt
  const [now, setNow] = useState(() => Date.now());

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [startForm] = Form.useForm<StartValues>();
  const [orderForm] = Form.useForm<OrderValues>();
  const [endForm] = Form.useForm<EndValues>();

  const orderItems = Form.useWatch('items', orderForm);
  const isDebt = Form.useWatch('isDebt', endForm);
  const discount = Form.useWatch('discount', endForm);

  const sum = t('common.sum');

  const fetchTables = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await tablesApi.list();
        setTables(res.data);
      } catch (err) {
        if (!silent) message.error(errorMessage(err, t('common.error')));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [message, t],
  );

  const fetchProducts = useCallback(async () => {
    try {
      const res = await productsApi.list({ limit: 500 });
      setProducts(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  }, [message, t]);

  useEffect(() => {
    void fetchTables();
    void fetchProducts();
    // Stollarni 30 soniyada bir marta jimgina yangilaymiz
    const poll = setInterval(() => void fetchTables(true), 30_000);
    return () => clearInterval(poll);
  }, [fetchTables, fetchProducts]);

  useEffect(() => {
    // Taymerlar uchun mahalliy 1 soniyalik tik
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  const selectedTable = useMemo(
    () => tables.find((tbl) => tbl.id === selectedId) ?? null,
    [tables, selectedId],
  );
  const selectedSession = selectedTable?.sessions?.[0] ?? null;

  // ---------- Boshlash ----------
  const openStart = (table: BilliardTable) => {
    setSelectedId(table.id);
    startForm.resetFields();
    setStartOpen(true);
  };

  const handleStart = async () => {
    if (!selectedTable) return;
    const values = await startForm.validateFields();
    setSubmitting(true);
    try {
      const res = await sessionsApi.start({ tableId: selectedTable.id, ...values });
      message.success(res.message);
      setStartOpen(false);
      void fetchTables();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Pauza / Davom ----------
  const handlePauseResume = async (session: Session) => {
    try {
      const res =
        session.status === 'paused'
          ? await sessionsApi.resume(session.id)
          : await sessionsApi.pause(session.id);
      message.success(res.message);
      void fetchTables();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  // ---------- Bekor qilish (tarixga yozilmaydi) ----------
  const handleCancel = async (session: Session) => {
    try {
      const res = await sessionsApi.cancel(session.id);
      message.success(res.message);
      void fetchTables();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    }
  };

  // ---------- Bar buyurtmasi ----------
  const openOrder = (table: BilliardTable) => {
    setSelectedId(table.id);
    orderForm.resetFields();
    orderForm.setFieldsValue({ items: [{ productId: undefined, quantity: 1 }] });
    setOrderOpen(true);
  };

  const orderTotal = useMemo(() => {
    if (!orderItems) return 0;
    return orderItems.reduce((acc, row) => {
      if (!row?.productId || !row?.quantity) return acc;
      const product = products.find((p) => p.id === row.productId);
      return acc + (product ? product.price * row.quantity : 0);
    }, 0);
  }, [orderItems, products]);

  const handleOrder = async () => {
    if (!selectedSession) return;
    const values = await orderForm.validateFields();
    const items = (values.items ?? [])
      .filter((row): row is { productId: number; quantity: number } =>
        Boolean(row?.productId && row?.quantity),
      )
      .map((row) => ({ productId: row.productId, quantity: row.quantity }));
    if (items.length === 0) {
      message.warning(t('tables.noItems'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await ordersApi.create({ sessionId: selectedSession.id, items });
      message.success(res.message);
      setOrderOpen(false);
      void fetchTables();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Hisob-kitob ----------
  const openEnd = (table: BilliardTable) => {
    setSelectedId(table.id);
    const session = table.sessions?.[0];
    endForm.resetFields();
    endForm.setFieldsValue({
      paymentMethod: 'cash',
      discount: 0,
      isDebt: false,
      isTableDebt: true,
      isBarDebt: (session?.barAmount ?? 0) > 0,
      customerName: session?.customerName ?? '',
      customerPhone: session?.customerPhone ?? '',
    });
    setEndOpen(true);
  };

  const endTableAmount =
    selectedSession && selectedTable
      ? sessionTableAmount(
          selectedSession,
          selectedSession.pricePerHour ?? selectedTable.pricePerHour,
          now,
        )
      : 0;
  const endBarAmount = selectedSession?.barAmount ?? 0;
  const endGross = endTableAmount + endBarAmount;
  const endTotal = Math.max(0, endGross - (discount ?? 0));

  const handleEnd = async () => {
    if (!selectedSession) return;
    const values = await endForm.validateFields();
    setSubmitting(true);
    try {
      const res = await sessionsApi.end(selectedSession.id, values);
      message.success(res.message);
      setEndOpen(false);
      modal.success({
        title: t('tables.endedTitle'),
        content: (
          <Descriptions column={1} size="small" style={{ marginTop: 12 }}>
            <Descriptions.Item label={t('tables.paidNow')}>
              {formatMoney(res.data.paidNow, sum)}
            </Descriptions.Item>
            <Descriptions.Item label={t('tables.debtAmount')}>
              {formatMoney(res.data.totalDebt, sum)}
            </Descriptions.Item>
          </Descriptions>
        ),
      });
      void fetchTables();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  const productOptions = useMemo(
    () =>
      products
        .filter((p) => p.isActive)
        .map((p) => ({
          value: p.id,
          label: `${p.name} · ${formatMoney(p.price, sum)} · ${p.stock} ${p.unit}`,
        })),
    [products, sum],
  );

  const busyCount = tables.filter((tbl) => tbl.status === 'busy').length;
  const freeCount = tables.length - busyCount;

  const renderCard = (table: BilliardTable) => {
    const session = table.sessions?.[0];
    const isBusy = table.status === 'busy' && !!session;
    const isPaused = session?.status === 'paused';
    const todayCompleted = table.todayCompletedSessions ?? 0;

    const actions = isBusy
      ? [
          <Button
            key="pause"
            type="text"
            icon={isPaused ? <CaretRightOutlined /> : <PauseCircleOutlined />}
            onClick={() => void handlePauseResume(session)}
          >
            {isPaused ? t('tables.resume') : t('tables.pause')}
          </Button>,
          <Button
            key="order"
            type="text"
            icon={<CoffeeOutlined />}
            onClick={() => openOrder(table)}
          >
            {t('common.bar')}
          </Button>,
          canCheckout ? (
            <Button
              key="end"
              type="text"
              danger
              icon={<StopOutlined />}
              onClick={() => openEnd(table)}
            >
              {t('tables.end')}
            </Button>
          ) : null,
        ].filter(Boolean)
      : [
          <Button
            key="start"
            type="text"
            icon={<PlayCircleOutlined />}
            onClick={() => openStart(table)}
          >
            {t('tables.start')}
          </Button>,
        ];

    return (
      <Col xs={24} sm={12} md={8} lg={6} key={table.id}>
        <Card
          className={isBusy ? 'table-card-active' : undefined}
          actions={actions as React.ReactNode[]}
          extra={
            isBusy && canCheckout ? (
              <Popconfirm
                title={t('tables.cancelConfirmTitle')}
                description={t('tables.cancelConfirmDesc')}
                okText={t('common.yes')}
                cancelText={t('common.no')}
                okButtonProps={{ danger: true }}
                onConfirm={() => void handleCancel(session)}
              >
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<CloseCircleOutlined />}
                  title={t('tables.cancelTooltip')}
                />
              </Popconfirm>
            ) : undefined
          }
        >
          <div style={{ textAlign: 'center' }}>
            <Title level={4} style={{ margin: 0 }}>
              {t('common.table')} {table.number}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {table.name}
            </Text>

            {todayCompleted > 0 && (
              <div style={{ marginTop: 6 }}>
                <Tag color="blue" icon={<HistoryOutlined />}>
                  {t('tables.todayCompleted', { n: todayCompleted })}
                </Tag>
              </div>
            )}

            {isBusy ? (
              <div style={{ marginTop: 12 }}>
                {session.customerName && (
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>{session.customerName}</Text>
                  </div>
                )}
                <div
                  className={`timer-display${isPaused ? ' timer-paused' : ''}`}
                  style={{ fontSize: 30, fontWeight: 700 }}
                >
                  {isPaused && (
                    <Tag color="orange" style={{ marginRight: 8 }}>
                      {t('status.paused')}
                    </Tag>
                  )}
                  {formatElapsed(sessionElapsedMs(session, now))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text strong style={{ fontSize: 18 }}>
                    {formatMoney(
                      sessionTableAmount(session, table.pricePerHour, now) + session.barAmount,
                      sum,
                    )}
                  </Text>
                </div>
                {session.barAmount > 0 && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('common.bar')}: {formatMoney(session.barAmount, sum)}
                  </Text>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <Tag color="green">{t('status.free')}</Tag>
                <div style={{ marginTop: 8 }}>
                  <Text strong>
                    {formatMoney(table.pricePerHour, sum)} / {t('common.perHour')}
                  </Text>
                </div>
              </div>
            )}
          </div>
        </Card>
      </Col>
    );
  };

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
            {t('tables.title')}
          </Title>
          <Space size={8}>
            <Text type="secondary">{t('tables.subtitle')}</Text>
            <Tag color="green">
              {t('status.free')}: {freeCount}
            </Tag>
            <Tag color="orange">
              {t('status.busy')}: {busyCount}
            </Tag>
          </Space>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void fetchTables()}>
          {t('btn.refresh')}
        </Button>
      </div>

      {loading && tables.length === 0 ? (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Col xs={24} sm={12} md={8} lg={6} key={i}>
              <Card loading />
            </Col>
          ))}
        </Row>
      ) : tables.length === 0 ? (
        <Empty description={t('common.noData')} />
      ) : (
        <Row gutter={[16, 16]}>{tables.map(renderCard)}</Row>
      )}

      {/* O'yinni boshlash */}
      <Modal
        title={`${t('tables.startTitle')} — ${t('common.table')} ${selectedTable?.number ?? ''}`}
        open={startOpen}
        onCancel={() => setStartOpen(false)}
        onOk={() => void handleStart()}
        confirmLoading={submitting}
        okText={t('tables.start')}
        cancelText={t('btn.cancel')}
        destroyOnHidden
      >
        <Form form={startForm} layout="vertical">
          <Form.Item name="customerName" label={t('tables.customerNameOptional')}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="customerPhone" label={t('tables.customerPhoneOptional')}>
            <Input maxLength={20} placeholder="+998" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Bar buyurtmasi */}
      <Modal
        title={`${t('tables.orderTitle')} — ${t('common.table')} ${selectedTable?.number ?? ''}`}
        open={orderOpen}
        onCancel={() => setOrderOpen(false)}
        onOk={() => void handleOrder()}
        confirmLoading={submitting}
        okText={t('tables.submitOrder')}
        cancelText={t('btn.cancel')}
        width={600}
        destroyOnHidden
      >
        <Form form={orderForm} layout="vertical">
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <Row key={key} gutter={12} align="middle" style={{ marginBottom: 8 }}>
                    <Col span={14}>
                      <Form.Item
                        {...rest}
                        name={[name, 'productId']}
                        rules={[{ required: true, message: t('tables.productRequired') }]}
                        style={{ margin: 0 }}
                      >
                        <Select
                          showSearch
                          placeholder={t('tables.selectProduct')}
                          options={productOptions}
                          filterOption={(input, option) =>
                            String(option?.label ?? '')
                              .toLowerCase()
                              .includes(input.toLowerCase())
                          }
                        />
                      </Form.Item>
                    </Col>
                    <Col span={7}>
                      <Form.Item
                        {...rest}
                        name={[name, 'quantity']}
                        rules={[{ required: true, message: t('tables.quantityRequired') }]}
                        style={{ margin: 0 }}
                      >
                        <InputNumber
                          min={1}
                          style={{ width: '100%' }}
                          placeholder={t('common.quantity')}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      <Button danger block icon={<DeleteOutlined />} onClick={() => remove(name)} />
                    </Col>
                  </Row>
                ))}
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>
                    {t('tables.addRow')}
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
        <Divider />
        <div style={{ textAlign: 'right' }}>
          <Text type="secondary">{t('tables.orderTotal')}: </Text>
          <Text strong style={{ fontSize: 18 }}>
            {formatMoney(orderTotal, sum)}
          </Text>
        </div>
      </Modal>

      {/* Hisob-kitob */}
      <Modal
        title={`${t('tables.endTitle')} — ${t('common.table')} ${selectedTable?.number ?? ''}`}
        open={endOpen}
        onCancel={() => setEndOpen(false)}
        onOk={() => void handleEnd()}
        confirmLoading={submitting}
        okText={isDebt ? t('tables.endDebt') : t('tables.endPay')}
        okButtonProps={{ danger: !isDebt }}
        cancelText={t('btn.cancel')}
        width={520}
        destroyOnHidden
      >
        {/* Chek */}
        <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label={t('common.duration')}>
            {selectedSession ? formatElapsed(sessionElapsedMs(selectedSession, now)) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('tables.tableAmount')}>
            {formatMoney(endTableAmount, sum)}
          </Descriptions.Item>
          <Descriptions.Item label={t('tables.barAmount')}>
            {formatMoney(endBarAmount, sum)}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.total')}>
            <Text strong style={{ fontSize: 16 }}>
              {formatMoney(endTotal, sum)}
            </Text>
          </Descriptions.Item>
        </Descriptions>

        <Form form={endForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="paymentMethod"
                label={t('payment.method')}
                rules={[{ required: true, message: t('tables.paymentRequired') }]}
              >
                <Select
                  options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`payment.${m}`) }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="discount" label={t('common.discount')}>
                <InputNumber min={0} max={endGross} step={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {/* Qarzga yozish — Switch Form.Item ning YAGONA bevosita farzandi bo'lishi shart */}
          <Form.Item name="isDebt" valuePropName="checked" label={t('tables.debtQuestion')}>
            <Switch checkedChildren={t('status.debt')} unCheckedChildren={t('status.paid')} />
          </Form.Item>

          {isDebt && (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="isTableDebt" valuePropName="checked" label={t('tables.tableDebt')}>
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="isBarDebt" valuePropName="checked" label={t('tables.barDebt')}>
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                name="customerName"
                label={t('tables.customerName')}
                rules={[{ required: true, message: t('tables.nameRequired') }]}
              >
                <Input maxLength={100} />
              </Form.Item>
              <Form.Item name="customerPhone" label={t('common.phone')}>
                <Input maxLength={20} placeholder="+998" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default Tables;
