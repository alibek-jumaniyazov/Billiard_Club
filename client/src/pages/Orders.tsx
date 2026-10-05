import { useCallback, useEffect, useRef, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Grid,
  Pagination,
  Popconfirm,
  Row,
  Select,
  Skeleton,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  CloseCircleOutlined,
  CoffeeOutlined,
  DollarOutlined,
  ReloadOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, ordersApi } from '../api';
import {
  EmptyState,
  MoneyText,
  PageHeader,
  PageTransition,
  StatCard,
  StatusTag,
} from '../components/ui';
import { useCurrency } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { TOKENS } from '../theme/tokens';
import type { Order, OrderStatus } from '../types';
import '../styles/records-mobile.css';

const { Text } = Typography;

/** Buyurtma holati -> StatusTag semantik kaliti */
const ORDER_STATUS_KEYS: Record<OrderStatus, string> = {
  open: 'active',
  closed: 'success',
  cancelled: 'cancelled',
};

interface TodayStats {
  todayAmount: number;
  todayCount: number;
}

const Orders = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { hasRole } = useAuth();
  const currency = useCurrency();
  const screens = Grid.useBreakpoint();
  const mobile = screens.md === false;
  // Server bilan bir xil: bekor qilish kassir/admin/superadmin uchun
  const canCancel = hasRole('superadmin', 'admin', 'kassir');

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const [stats, setStats] = useState<TodayStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const ordersRequest = useRef(0);
  const statsRequest = useRef(0);

  const fetchOrders = useCallback(async () => {
    const request = ++ordersRequest.current;
    const isCurrent = () => request === ordersRequest.current;
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: pageSize };
      if (status !== 'all') params.status = status;
      const res = await ordersApi.list(params);
      if (!isCurrent()) return;
      setOrders(res.data);
      setTotal(res.pagination?.total ?? 0);
    } catch (err) {
      if (!isCurrent()) return;
      message.error(errorMessage(err, t('common.error')));
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [message, t, page, pageSize, status]);

  // Bugungi statistika — server to'liq ma'lumotdan hisoblaydi
  const fetchStats = useCallback(async () => {
    const request = ++statsRequest.current;
    const isCurrent = () => request === statsRequest.current;
    setStatsLoading(true);
    try {
      const res = await ordersApi.todayStats();
      if (!isCurrent()) return;
      setStats(res.data);
    } catch (err) {
      if (!isCurrent()) return;
      message.error(errorMessage(err, t('common.error')));
    } finally {
      if (isCurrent()) setStatsLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    void fetchOrders();
    // Also invalidate when filters change or the page unmounts.
    return () => { ordersRequest.current += 1; };
  }, [fetchOrders]);

  useEffect(() => {
    void fetchStats();
    return () => { statsRequest.current += 1; };
  }, [fetchStats]);

  const handleRefresh = () => {
    void fetchOrders();
    void fetchStats();
  };

  // Ochiq buyurtmani bekor qilish — ombor qaytadi, sessiya bar summasi kamayadi
  const handleCancel = async (order: Order) => {
    setCancellingId(order.id);
    try {
      const res = await ordersApi.cancel(order.id);
      message.success(res.message);
      void fetchOrders();
      void fetchStats();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setCancellingId(null);
    }
  };

  const changePage = (nextPage: number, nextSize: number) => {
    setPage(nextSize !== pageSize ? 1 : nextPage);
    setPageSize(nextSize);
  };
  const cancelAction = (order: Order) => canCancel && order.status === 'open' ? (
    <Popconfirm title={t('orders.cancelConfirmTitle')} description={t('orders.cancelConfirmDesc')}
      okText={t('common.yes')} cancelText={t('common.no')} okButtonProps={{ danger: true }}
      onConfirm={() => void handleCancel(order)}>
      <Button size="small" danger icon={<CloseCircleOutlined />} loading={cancellingId === order.id}>
        {t('orders.cancelOrder')}
      </Button>
    </Popconfirm>
  ) : null;
  const emptyOrders = <EmptyState icon={<CoffeeOutlined />} title={t('orders.emptyTitle')} hint={t('orders.emptyHint')} />;

  const columns: ColumnsType<Order> = [
    {
      title: t('orders.orderId'),
      dataIndex: 'id',
      width: 80,
      render: (id: number) => <Text type="secondary">#{id}</Text>,
    },
    {
      title: t('common.table'),
      key: 'table',
      width: 140,
      render: (_, order) => (order.table ? <Text strong>{order.table.name}</Text> : '—'),
    },
    {
      title: t('orders.items'),
      key: 'items',
      render: (_, order) =>
        order.items && order.items.length > 0 ? (
          <Space size={4} wrap>
            {order.items.map((item) => (
              <Tag key={item.id}>
                {item.product?.name ?? `#${item.productId}`} × {item.quantity}
              </Tag>
            ))}
          </Space>
        ) : (
          '—'
        ),
    },
    {
      title: t('orders.totalAmount'),
      dataIndex: 'totalAmount',
      width: 150,
      align: 'right',
      render: (amount: number) => <MoneyText amount={amount} currency={currency} />,
    },
    {
      title: t('orders.status'),
      dataIndex: 'status',
      width: 130,
      render: (s: OrderStatus) => (
        <StatusTag status={ORDER_STATUS_KEYS[s]} label={t(`status.${s}`)} />
      ),
    },
    {
      title: t('common.date'),
      dataIndex: 'createdAt',
      width: 160,
      render: (createdAt: string) => dayjs(createdAt).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: t('orders.enteredBy'),
      key: 'user',
      width: 150,
      render: (_, order) => order.user?.name ?? '—',
    },
  ];

  if (canCancel) {
    columns.push({
      title: t('common.actions'),
      key: 'actions',
      width: 140,
      render: (_, order) => cancelAction(order),
    });
  }

  return (
    <PageTransition>
      <PageHeader
        icon={<CoffeeOutlined />}
        title={t('orders.title')}
        subtitle={t('orders.subtitle')}
        extra={
          <>
            <Select<OrderStatus | 'all'>
              aria-label={t('orders.status')}
              value={status}
              style={{ width: 170 }}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'open', label: t('status.open') },
                { value: 'closed', label: t('status.closed') },
                { value: 'cancelled', label: t('status.cancelled') },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
              {t('btn.refresh')}
            </Button>
          </>
        }
        stats={
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <StatCard
                label={t('orders.todayAmount')}
                value={
                  <MoneyText
                    amount={stats?.todayAmount}
                    currency={currency}
                    style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
                  />
                }
                icon={<DollarOutlined />}
                loading={statsLoading}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard
                label={t('orders.todayCount')}
                value={stats?.todayCount ?? 0}
                icon={<ShoppingCartOutlined />}
                accent={TOKENS.color.emerald.bright}
                loading={statsLoading}
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
          {mobile ? <div className="records-mobile" aria-busy={loading}>
            <Spin spinning={loading}>
              {orders.length === 0 ? emptyOrders : <div className="records-mobile__list" role="list">
                {orders.map((order) => <article key={order.id} className="record-card" role="listitem">
                  <header className="record-card__header">
                    <div><span className="record-card__eyebrow">{t('orders.orderId')} {order.id}</span>
                      <h2>{order.table?.name ?? '—'}</h2></div>
                    <StatusTag status={ORDER_STATUS_KEYS[order.status]} label={t(`status.${order.status}`)} />
                  </header>
                  <div className="record-card__total"><span>{t('orders.totalAmount')}</span>
                    <MoneyText amount={order.totalAmount} currency={currency} size="lg" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }} /></div>
                  <dl className="record-card__metadata">
                    <div><dt>{t('common.date')}</dt><dd>{dayjs(order.createdAt).format('DD.MM.YYYY HH:mm')}</dd></div>
                    <div><dt>{t('orders.enteredBy')}</dt><dd>{order.user?.name ?? '—'}</dd></div>
                  </dl>
                  <div className="record-card__items"><span className="record-card__label">{t('orders.items')}</span>
                    {order.items?.length ? <ul>{order.items.map((item) => <li key={item.id}>
                      <span>{item.product?.name ?? `#${item.productId}`}</span><strong>× {item.quantity}</strong>
                    </li>)}</ul> : <span>—</span>}
                  </div>
                  {canCancel && order.status === 'open' && <div className="record-card__actions">{cancelAction(order)}</div>}
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
            dataSource={orders}
            loading={loading}
            scroll={{ x: 960 }}
            locale={{
              emptyText: emptyOrders,
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
    </PageTransition>
  );
};

export default Orders;
