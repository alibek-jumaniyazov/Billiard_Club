import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { CoffeeOutlined, ReloadOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, ordersApi } from '../api';
import type { Order, OrderStatus } from '../types';
import { formatMoney } from '../utils/format';

const { Title, Text } = Typography;

const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  open: 'processing',
  closed: 'green',
  cancelled: 'default',
};

interface TodayStats {
  todayAmount: number;
  todayCount: number;
}

const Orders = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');

  const [stats, setStats] = useState<TodayStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: pageSize };
      if (status !== 'all') params.status = status;
      const res = await ordersApi.list(params);
      setOrders(res.data);
      setTotal(res.pagination?.total ?? 0);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [message, t, page, pageSize, status]);

  // Bugungi statistika — server to'liq ma'lumotdan hisoblaydi
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await ordersApi.todayStats();
      setStats(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setStatsLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    void fetchOrders();
    void fetchStats();
  };

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
              <Tag key={item.id} color="blue">
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
      render: (amount: number) => (
        <Text strong style={{ color: '#52c41a' }}>
          {formatMoney(amount, t('common.sum'))}
        </Text>
      ),
    },
    {
      title: t('orders.status'),
      dataIndex: 'status',
      width: 130,
      render: (s: OrderStatus) => <Tag color={ORDER_STATUS_COLORS[s]}>{t(`status.${s}`)}</Tag>,
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
            <ShoppingCartOutlined /> {t('orders.title')}
          </Title>
          <Text type="secondary">{t('orders.subtitle')}</Text>
        </div>
        <Space>
          <Select<OrderStatus | 'all'>
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
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card loading={statsLoading}>
            <Statistic
              title={t('orders.todayAmount')}
              value={formatMoney(stats?.todayAmount, t('common.sum'))}
              prefix={<CoffeeOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={statsLoading}>
            <Statistic
              title={t('orders.todayCount')}
              value={stats?.todayCount ?? 0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={orders}
          loading={loading}
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              // pageSize o'zgarsa 1-sahifaga qaytamiz
              setPage(ps !== pageSize ? 1 : p);
              setPageSize(ps);
            },
          }}
        />
      </Card>
    </div>
  );
};

export default Orders;
