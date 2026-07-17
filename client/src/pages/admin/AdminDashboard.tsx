import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, List, Row, Table, Tag, Typography, theme } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  DollarOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
  ShopOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { adminApi, errorMessage, platformApi } from '../../api';
import { EmptyState, PageHeader, PageTransition, StatCard } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type { Contract, ContractType, PlatformOverview, PlatformStats } from '../../types';
import { formatMoney, formatNumber } from '../../utils/format';

const { Text } = Typography;

/** 'YYYY-MM' -> 'MM.YY' (grafik o'qi yorlig'i) */
const monthLabel = (month: string): string => dayjs(`${month}-01`).format('MM.YY');

/**
 * Superadmin bosh paneli — platforma statistikasi: klublar holati,
 * o'sish/daromad grafiklari, sinov konversiyasi, tugayotgan obunalar.
 */
const AdminDashboard = () => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const navigate = useNavigate();

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, overviewRes] = await Promise.all([
        platformApi.stats(),
        adminApi.overview(),
      ]);
      setStats(statsRes.data);
      setOverview(overviewRes.data);
    } catch (err) {
      setError(errorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const clubsByStatus = stats?.clubsByStatus ?? { trial: 0, active: 0, expired: 0, blocked: 0 };
  const totalClubs =
    clubsByStatus.trial + clubsByStatus.active + clubsByStatus.expired + clubsByStatus.blocked;

  const newClubsData = (stats?.newClubsPerMonth ?? []).map((m) => ({
    label: monthLabel(m.month),
    value: m.count,
  }));
  const revenueData = (stats?.revenuePerMonth ?? []).map((m) => ({
    label: monthLabel(m.month),
    value: m.revenue,
  }));

  const contractTypeLabel = (type: ContractType): string => t(`adminClubs.ct_${type}`);

  const recentContractColumns: ColumnsType<Contract> = [
    {
      title: t('adminClubs.clubName'),
      key: 'club',
      render: (_, c) => <Text strong>{c.club?.name ?? '—'}</Text>,
    },
    {
      title: t('adminClubs.contractType'),
      dataIndex: 'type',
      width: 130,
      render: (type: ContractType) => <Tag color="gold">{contractTypeLabel(type)}</Tag>,
    },
    {
      title: t('adminClubs.contractAmount'),
      dataIndex: 'amount',
      width: 160,
      align: 'right',
      render: (amount: number) => (
        <span className="tabular-nums">{formatMoney(amount, t('common.sum'))}</span>
      ),
    },
    {
      title: t('common.date'),
      dataIndex: 'createdAt',
      width: 140,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm'),
    },
  ];

  const chartAxisProps = {
    tick: { fill: token.colorTextSecondary, fontSize: 12 },
    axisLine: { stroke: token.colorSplit },
    tickLine: false as const,
  };

  const chartTooltipProps = {
    cursor: { fill: token.colorFillTertiary },
    contentStyle: {
      background: token.colorBgElevated,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 8,
    },
    labelStyle: { color: token.colorText },
    itemStyle: { color: token.colorText },
  };

  return (
    <PageTransition>
      <PageHeader
        icon={<DashboardOutlined />}
        title={t('admin.dash.title')}
        subtitle={t('admin.dash.subtitle')}
        extra={
          <Button
            icon={<ReloadOutlined />}
            aria-label={t('btn.refresh')}
            onClick={() => void fetchAll()}
          />
        }
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={() => void fetchAll()}>
              {t('admin.retry')}
            </Button>
          }
          style={{ marginBottom: TOKENS.spacing.md }}
        />
      )}

      {/* Klublar holati */}
      <Row gutter={[16, 16]} style={{ marginBottom: TOKENS.spacing.md }}>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('admin.dash.totalClubs')}
            value={formatNumber(totalClubs)}
            icon={<ShopOutlined />}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('club.trial')}
            value={formatNumber(clubsByStatus.trial)}
            icon={<ExperimentOutlined />}
            accent={TOKENS.color.semantic.info}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('club.active')}
            value={formatNumber(clubsByStatus.active)}
            icon={<CheckCircleOutlined />}
            accent={TOKENS.color.semantic.success}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('club.expired')}
            value={formatNumber(clubsByStatus.expired)}
            icon={<WarningOutlined />}
            accent={TOKENS.color.semantic.warning}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('club.blocked')}
            value={formatNumber(clubsByStatus.blocked)}
            icon={<StopOutlined />}
            accent={TOKENS.color.semantic.error}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('admin.dash.conversion')}
            value={`${stats?.conversion.ratePercent ?? 0}%`}
            icon={<RiseOutlined />}
            accent={TOKENS.color.emerald.bright}
            trendLabel={
              stats
                ? t('admin.dash.conversionHint', {
                    converted: stats.conversion.convertedClubs,
                    total: stats.conversion.totalClubs,
                  })
                : undefined
            }
            trend={stats ? stats.conversion.ratePercent : undefined}
          />
        </Col>
      </Row>

      {/* Daromad va sessiyalar */}
      <Row gutter={[16, 16]} style={{ marginBottom: TOKENS.spacing.md }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            loading={loading}
            label={t('adminClubs.incomeTotal')}
            value={formatMoney(overview?.income.total ?? 0, t('common.sum'))}
            icon={<DollarOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            loading={loading}
            label={t('adminClubs.incomeMonth')}
            value={formatMoney(overview?.income.thisMonth ?? 0, t('common.sum'))}
            icon={<DollarOutlined />}
            accent={TOKENS.color.emerald.bright}
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard
            loading={loading}
            label={t('admin.dash.activeSessions')}
            value={formatNumber(stats?.sessions.activeNow ?? 0)}
            icon={<PlayCircleOutlined />}
            accent={TOKENS.color.neonGreen}
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard
            loading={loading}
            label={t('admin.dash.startedToday')}
            value={formatNumber(stats?.sessions.startedToday ?? 0)}
            icon={<ClockCircleOutlined />}
            accent={TOKENS.color.semantic.info}
          />
        </Col>
      </Row>

      {/* Grafiklar */}
      <Row gutter={[16, 16]} style={{ marginBottom: TOKENS.spacing.md }}>
        <Col xs={24} lg={12}>
          <Card title={t('admin.dash.revenueChart')} loading={loading}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenueData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={token.colorSplit} vertical={false} />
                <XAxis dataKey="label" {...chartAxisProps} />
                <YAxis
                  {...chartAxisProps}
                  axisLine={false}
                  tickFormatter={(v: number) => formatNumber(v)}
                  width={70}
                />
                <ChartTooltip
                  {...chartTooltipProps}
                  formatter={(value) => formatMoney(Number(value), t('common.sum'))}
                />
                <Bar
                  dataKey="value"
                  name={t('admin.dash.revenueSeries')}
                  fill={TOKENS.color.chart[0]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={t('admin.dash.newClubsChart')} loading={loading}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={newClubsData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={token.colorSplit} vertical={false} />
                <XAxis dataKey="label" {...chartAxisProps} />
                <YAxis
                  {...chartAxisProps}
                  axisLine={false}
                  allowDecimals={false}
                  width={40}
                />
                <ChartTooltip
                  {...chartTooltipProps}
                  formatter={(value) => formatNumber(Number(value))}
                />
                <Bar
                  dataKey="value"
                  name={t('admin.dash.clubsSeries')}
                  fill={TOKENS.color.chart[1]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* Tugayotgan obunalar + so'nggi shartnomalar */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            title={
              <span>
                <ClockCircleOutlined style={{ marginRight: 8 }} />
                {t('adminClubs.expiringTitle')}
              </span>
            }
            loading={loading}
          >
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              <List
                size="small"
                dataSource={overview?.expiringSoon ?? []}
                locale={{
                  emptyText: (
                    <EmptyState
                      icon={<CheckCircleOutlined />}
                      title={t('adminClubs.expiringEmpty')}
                      style={{ padding: '24px 12px' }}
                    />
                  ),
                }}
                renderItem={(club) => (
                  <List.Item
                    style={{ cursor: 'pointer', paddingInline: 0 }}
                    onClick={() =>
                      navigate(`/admin/clubs?search=${encodeURIComponent(club.name)}`)
                    }
                    extra={
                      <Tag color={(club.daysLeft ?? 99) <= 3 ? 'red' : 'orange'}>
                        {club.daysLeft} {t('adminClubs.daysLeft')}
                      </Tag>
                    }
                  >
                    <Text>{club.name}</Text>
                  </List.Item>
                )}
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card
            title={
              <span>
                <FileTextOutlined style={{ marginRight: 8 }} />
                {t('adminClubs.recentContracts')}
              </span>
            }
            loading={loading}
          >
            <Table
              rowKey="id"
              size="small"
              sticky
              columns={recentContractColumns}
              dataSource={overview?.recentContracts ?? []}
              pagination={false}
              scroll={{ x: 640 }}
              locale={{
                emptyText: (
                  <EmptyState title={t('common.noData')} style={{ padding: '24px 12px' }} />
                ),
              }}
            />
          </Card>
        </Col>
      </Row>
    </PageTransition>
  );
};

export default AdminDashboard;
