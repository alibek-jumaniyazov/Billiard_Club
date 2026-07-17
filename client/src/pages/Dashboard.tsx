import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  DashboardOutlined,
  DollarOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { dashboardApi, errorMessage } from '../api';
import { SESSION_STATUS_COLORS } from '../constants';
import type { DashboardStats, Session } from '../types';
import { formatElapsed, formatMoney, formatNumber } from '../utils/format';
import { sessionElapsedMs, sessionTableAmount } from '../utils/session';

const { Title, Text } = Typography;

// Ma'noga bog'langan ranglar: band = oltin, bo'sh = yashil
const BUSY_COLOR = '#faad14';
const FREE_COLOR = '#52c41a';

const Dashboard = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const fetchStats = useCallback(async () => {
    try {
      const res = await dashboardApi.stats();
      setStats(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  // Har 30 soniyada yangilash
  useEffect(() => {
    void fetchStats();
    const interval = setInterval(() => void fetchStats(), 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Jonli taymerlar uchun 1 soniyalik tik
  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  const occupancy =
    stats && stats.totalTables > 0
      ? Math.round((stats.busyTables / stats.totalTables) * 100)
      : 0;

  const chartData = (stats?.last7Days ?? []).map((d) => ({
    label: dayjs(d.date).format('DD.MM'),
    revenue: d.revenue,
  }));

  const activeColumns: ColumnsType<Session> = [
    {
      title: t('common.table'),
      key: 'table',
      render: (_, session) => (
        <Space direction="vertical" size={0}>
          <Text strong>{session.table?.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            №{session.table?.number}
          </Text>
        </Space>
      ),
    },
    {
      title: t('common.customer'),
      dataIndex: 'customerName',
      render: (name: string | null) =>
        name || <Text type="secondary">{t('dashboard.anonymous')}</Text>,
    },
    {
      title: t('dashboard.elapsed'),
      key: 'elapsed',
      width: 120,
      render: (_, session) => (
        <Text strong style={{ color: BUSY_COLOR, fontVariantNumeric: 'tabular-nums' }}>
          {formatElapsed(sessionElapsedMs(session, now))}
        </Text>
      ),
    },
    {
      title: t('dashboard.status'),
      dataIndex: 'status',
      width: 120,
      render: (status: Session['status']) => (
        <Tag color={SESSION_STATUS_COLORS[status]}>{t(`status.${status}`)}</Tag>
      ),
    },
    {
      title: t('dashboard.currentAmount'),
      key: 'amount',
      align: 'right',
      render: (_, session) => (
        <Text strong style={{ color: FREE_COLOR }}>
          {formatMoney(
            sessionTableAmount(session, session.table?.pricePerHour ?? 0, now),
            t('common.sum'),
          )}
        </Text>
      ),
    },
  ];

  const recentColumns: ColumnsType<Session> = [
    {
      title: t('common.table'),
      key: 'table',
      render: (_, session) => <Text strong>{session.table?.name}</Text>,
    },
    {
      title: t('dashboard.endedAt'),
      dataIndex: 'endTime',
      width: 80,
      render: (endTime: string | null) => (endTime ? dayjs(endTime).format('HH:mm') : '—'),
    },
    {
      title: t('dashboard.amount'),
      dataIndex: 'totalAmount',
      align: 'right',
      render: (amount: number) => <Text strong>{formatMoney(amount, t('common.sum'))}</Text>,
    },
    {
      title: t('dashboard.paidState'),
      key: 'paidState',
      width: 110,
      render: (_, session) => (
        <Tag color={session.isPaid ? 'success' : 'error'}>
          {session.isPaid ? t('status.paid') : t('status.debt')}
        </Tag>
      ),
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
            <DashboardOutlined /> {t('dashboard.title')}
          </Title>
          <Text type="secondary">{t('dashboard.subtitle')}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void fetchStats()} />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic
              title={t('dashboard.dailyRevenue')}
              value={formatMoney(stats?.dailyRevenue, t('common.sum'))}
              prefix={<DollarOutlined />}
              valueStyle={{ color: FREE_COLOR }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic
              title={t('dashboard.monthlyRevenue')}
              value={formatMoney(stats?.monthlyRevenue, t('common.sum'))}
              prefix={<RiseOutlined />}
              valueStyle={{ color: BUSY_COLOR }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic
              title={t('dashboard.totalCustomers')}
              value={stats?.totalCustomers ?? 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic
              title={t('dashboard.activeSessions')}
              value={stats?.activeSessions ?? 0}
              prefix={<PlayCircleOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card title={t('dashboard.weeklyRevenue')} loading={loading}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BUSY_COLOR} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={BUSY_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={token.colorSplit} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
                  axisLine={{ stroke: token.colorSplit }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
                  tickFormatter={(v: number) => formatNumber(v)}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <ChartTooltip
                  formatter={(value) => formatMoney(Number(value), t('common.sum'))}
                  contentStyle={{
                    background: token.colorBgElevated,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: token.colorText }}
                  itemStyle={{ color: token.colorText }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name={t('dashboard.revenue')}
                  stroke={BUSY_COLOR}
                  strokeWidth={2}
                  fill="url(#dashboardRevenue)"
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t('dashboard.occupancy')} loading={loading}>
            <Progress percent={occupancy} strokeColor={BUSY_COLOR} />
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={8}>
                <Statistic
                  title={t('status.busy')}
                  value={stats?.busyTables ?? 0}
                  valueStyle={{ color: BUSY_COLOR, fontSize: 20 }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={t('status.free')}
                  value={stats?.freeTables ?? 0}
                  valueStyle={{ color: FREE_COLOR, fontSize: 20 }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={t('common.total')}
                  value={stats?.totalTables ?? 0}
                  valueStyle={{ fontSize: 20 }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={t('dashboard.activeTitle')}>
            <Table
              rowKey="id"
              columns={activeColumns}
              dataSource={stats?.activeSessionsData ?? []}
              loading={loading}
              pagination={false}
              size="middle"
              scroll={{ x: 640 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={t('dashboard.recentTitle')}>
            <Table
              rowKey="id"
              columns={recentColumns}
              dataSource={stats?.recentSessions ?? []}
              loading={loading}
              pagination={false}
              size="small"
              scroll={{ x: 420 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
