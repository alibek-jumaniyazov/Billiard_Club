import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Col, List, Row, Table, Tag, theme } from 'antd';
import {
  CheckCircleOutlined,
  ArrowRightOutlined,
  CreditCardOutlined,
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
import { clubDetailUrl, clubListUrl } from './adminWorkspace';
import './admin-workspace.css';

/** 'YYYY-MM' -> 'MM.YY' (grafik o'qi yorlig'i) */
const monthLabel = (month: string): string => dayjs(`${month}-01`).format('MM.YY');

/**
 * Superadmin bosh paneli — platforma statistikasi: klublar holati,
 * o'sish/daromad grafiklari, sinov konversiyasi, tugayotgan obunalar.
 */
const AdminDashboard = () => {
  const { t, i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  const copy = (uz: string, russian: string) => ru ? russian : uz;
  const { token } = theme.useToken();
  const navigate = useNavigate();

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchAll = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    const [statsRes, overviewRes] = await Promise.allSettled([platformApi.stats(), adminApi.overview()]);
    if (id !== requestId.current) return;
    const errors: string[] = [];
    if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
    else errors.push(`${t('admin.dash.title')}: ${errorMessage(statsRes.reason, t('common.error'))}`);
    if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value.data);
    else errors.push(`${t('adminClubs.overviewTitle')}: ${errorMessage(overviewRes.reason, t('common.error'))}`);
    setError(errors.length ? errors.join(' · ') : null);
    if (!errors.length) setUpdatedAt(new Date().toISOString());
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void fetchAll();
    return () => { requestId.current += 1; };
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
      render: (_, c) => <Button type="link" style={{ padding: 0 }} onClick={() => navigate(clubDetailUrl(c.clubId, c.club?.name ?? '', 'contracts'))}>{c.club?.name ?? `#${c.clubId}`}</Button>,
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
            loading={loading}
            onClick={() => void fetchAll()}
          >{t('btn.refresh')}</Button>
        }
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          description={copy('Ko‘rsatilgan ma’lumotlar eskirgan bo‘lishi mumkin. Qayta yuklab ko‘ring.', 'Данные могут быть устаревшими. Попробуйте обновить.')}
          action={
            <Button size="small" onClick={() => void fetchAll()}>
              {t('admin.retry')}
            </Button>
          }
          style={{ marginBottom: TOKENS.spacing.md }}
        />
      )}

      <div className="admin-workspace" style={{ marginBottom: 20 }}>
        <section className="admin-workspace__hero">
          <div>
            <span className="admin-workspace__eyebrow">Billiard Club / {copy('Platforma', 'Платформа')}</span>
            <h2>{copy('Har bir klub — e’tiborda.', 'Каждый клуб — под контролем.')}</h2>
            <p>{copy('Obunalar, mijozlar va to‘lovlar. Bugungi muhim ishlarni bir joydan boshqaring.', 'Подписки, клиенты и платежи. Управляйте важными задачами из одного места.')}</p>
            <div className="admin-workspace__meta"><span><ClockCircleOutlined /> {loading ? copy('Yangilanmoqda…', 'Обновление…') : updatedAt ? `${copy('Yangilandi', 'Обновлено')} ${dayjs(updatedAt).format('HH:mm')}` : copy('Ma’lumot hali olinmadi', 'Данные ещё не получены')}</span></div>
          </div>
          <div className="admin-workspace__hero-actions">
            <Button type="primary" size="large" icon={<ShopOutlined />} onClick={() => navigate('/admin/clubs')}>{copy('Klublar', 'Клубы')}</Button>
            <Button size="large" icon={<CreditCardOutlined />} onClick={() => navigate('/admin/billing')}>{copy('To‘lovlar', 'Платежи')}</Button>
          </div>
        </section>
        <div className="admin-workspace__tasks">
          <button className="admin-workspace__task" onClick={() => document.getElementById('admin-renewals')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}>
            <span className="admin-workspace__task-heading">{copy('Yaqin 7 kunda', 'Ближайшие 7 дней')} <ClockCircleOutlined /></span>
            <span className="admin-workspace__task-value">{overview ? formatNumber(overview.expiringSoon.length) : '—'}</span>
            <p>{copy('Obunasi tugayotgan klublar', 'Клубы с истекающей подпиской')}</p>
            <span className="admin-workspace__task-link">{copy('Uzaytirishlarni ko‘rish', 'Открыть продления')} <ArrowRightOutlined /></span>
          </button>
          <button className="admin-workspace__task" onClick={() => navigate(clubListUrl('', 'expired'))}>
            <span className="admin-workspace__task-heading">{copy('Qayta bog‘lanish', 'Связаться с клиентами')} <WarningOutlined /></span>
            <span className="admin-workspace__task-value">{overview ? formatNumber(overview.clubs.expired) : '—'}</span>
            <p>{copy('Obunasi tugagan klublar', 'Клубы с завершённой подпиской')}</p>
            <span className="admin-workspace__task-link">{copy('Klublarni ochish', 'Открыть клубы')} <ArrowRightOutlined /></span>
          </button>
          <button className="admin-workspace__task" onClick={() => navigate('/admin/billing')}>
            <span className="admin-workspace__task-heading">{copy('To‘lov nazorati', 'Контроль платежей')} <CreditCardOutlined /></span>
            <span className="admin-workspace__task-value"><FileTextOutlined /></span>
            <p>{copy('Hisob-fakturalar, tariflar va kuponlar', 'Счета, тарифы и купоны')}</p>
            <span className="admin-workspace__task-link">{copy('Hisob-fakturalarni tekshirish', 'Проверить счета')} <ArrowRightOutlined /></span>
          </button>
        </div>
        <div className="admin-workspace__statuses" aria-label={t('adminClubs.statusFilter')}>
          {(['trial', 'active', 'expired', 'blocked'] as const).map(status => <Button key={status} onClick={() => navigate(clubListUrl('', status))}>{t(`club.${status}`)} <strong>{stats ? formatNumber(clubsByStatus[status]) : '—'}</strong><ArrowRightOutlined /></Button>)}
        </div>
      </div>

      {/* Klublar holati */}
      <Row gutter={[16, 16]} style={{ marginBottom: TOKENS.spacing.md }}>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('admin.dash.totalClubs')}
            value={stats ? formatNumber(totalClubs) : '—'}
            icon={<ShopOutlined />}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('club.trial')}
            value={stats ? formatNumber(clubsByStatus.trial) : '—'}
            icon={<ExperimentOutlined />}
            accent={TOKENS.color.semantic.info}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('club.active')}
            value={stats ? formatNumber(clubsByStatus.active) : '—'}
            icon={<CheckCircleOutlined />}
            accent={TOKENS.color.semantic.success}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('club.expired')}
            value={stats ? formatNumber(clubsByStatus.expired) : '—'}
            icon={<WarningOutlined />}
            accent={TOKENS.color.semantic.warning}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('club.blocked')}
            value={stats ? formatNumber(clubsByStatus.blocked) : '—'}
            icon={<StopOutlined />}
            accent={TOKENS.color.semantic.error}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <StatCard
            loading={loading}
            label={t('admin.dash.conversion')}
            value={stats ? `${stats.conversion.ratePercent}%` : '—'}
            icon={<RiseOutlined />}
            accent={TOKENS.color.emerald.bright}
            hint={
              stats
                ? t('admin.dash.conversionHint', {
                    converted: stats.conversion.convertedClubs,
                    total: stats.conversion.totalClubs,
                  })
                : undefined
            }
            meter={stats?.conversion.ratePercent}
          />
        </Col>
      </Row>

      {/* Daromad va sessiyalar */}
      <Row gutter={[16, 16]} style={{ marginBottom: TOKENS.spacing.md }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            loading={loading}
            label={t('adminClubs.incomeTotal')}
            value={overview ? formatMoney(overview.income.total, t('common.sum')) : '—'}
            icon={<DollarOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            loading={loading}
            label={t('adminClubs.incomeMonth')}
            value={overview ? formatMoney(overview.income.thisMonth, t('common.sum')) : '—'}
            icon={<DollarOutlined />}
            accent={TOKENS.color.emerald.bright}
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard
            loading={loading}
            label={t('admin.dash.activeSessions')}
            value={stats ? formatNumber(stats.sessions.activeNow) : '—'}
            icon={<PlayCircleOutlined />}
            accent={TOKENS.color.neonGreen}
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard
            loading={loading}
            label={t('admin.dash.startedToday')}
            value={stats ? formatNumber(stats.sessions.startedToday) : '—'}
            icon={<ClockCircleOutlined />}
            accent={TOKENS.color.semantic.info}
          />
        </Col>
      </Row>

      {/* Grafiklar */}
      <Row gutter={[16, 16]} style={{ marginBottom: TOKENS.spacing.md }}>
        <Col xs={24} lg={12}>
          <Card title={t('admin.dash.revenueChart')} loading={loading}>
            {stats ? <ResponsiveContainer width="100%" height={260}>
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
            </ResponsiveContainer> : <EmptyState title={copy('Ma’lumot hali olinmadi', 'Данные ещё не получены')} />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={t('admin.dash.newClubsChart')} loading={loading}>
            {stats ? <ResponsiveContainer width="100%" height={260}>
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
            </ResponsiveContainer> : <EmptyState title={copy('Ma’lumot hali olinmadi', 'Данные ещё не получены')} />}
          </Card>
        </Col>
      </Row>

      {/* Tugayotgan obunalar + so'nggi shartnomalar */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            id="admin-renewals"
            style={{ scrollMarginTop: 90 }}
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
                      title={overview ? t('adminClubs.expiringEmpty') : copy('Ma’lumot hali olinmadi', 'Данные ещё не получены')}
                      style={{ padding: '24px 12px' }}
                    />
                  ),
                }}
                renderItem={(club) => (
                  <List.Item
                    style={{ paddingInline: 0, flexWrap: 'wrap', gap: 10 }}
                    extra={
                      <Tag color={(club.daysLeft ?? 99) <= 3 ? 'red' : 'orange'}>
                        {club.daysLeft} {t('adminClubs.daysLeft')}
                      </Tag>
                    }
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Button type="link" style={{ padding: 0, whiteSpace: 'normal', textAlign: 'left', height: 'auto' }} onClick={() => navigate(clubDetailUrl(club.id, club.name))}>{club.name}</Button>
                      <div style={{ fontSize: 12, color: token.colorTextSecondary }}>{club.effectiveEndsAt ? dayjs(club.effectiveEndsAt).format('DD.MM.YYYY') : '—'}</div>
                      <Button size="small" icon={<FileTextOutlined />} style={{ marginTop: 8, minHeight: 36 }} onClick={() => navigate(clubDetailUrl(club.id, club.name, 'contracts'))}>{t('adminClubs.contractBtn')}</Button>
                    </div>
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
            <div className="admin-workspace__contracts-desktop"><Table
              rowKey="id"
              size="small"
              sticky
              columns={recentContractColumns}
              dataSource={overview?.recentContracts ?? []}
              pagination={false}
              scroll={{ x: 640 }}
              locale={{
                emptyText: (
                  <EmptyState title={overview ? t('common.noData') : copy('Ma’lumot hali olinmadi', 'Данные ещё не получены')} style={{ padding: '24px 12px' }} />
                ),
              }}
            /></div>
            <div className="admin-workspace__contracts-mobile">
              {!overview?.recentContracts.length ? <EmptyState title={overview ? t('common.noData') : copy('Ma’lumot hali olinmadi', 'Данные ещё не получены')} /> : overview.recentContracts.map(c => <article className="admin-workspace__contract" key={c.id}>
                <div><Button type="link" style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => navigate(clubDetailUrl(c.clubId, c.club?.name ?? '', 'contracts'))}>{c.club?.name ?? `#${c.clubId}`}</Button><strong className="tabular-nums">{formatMoney(c.amount, t('common.sum'))}</strong></div>
                <div><span>{contractTypeLabel(c.type)}</span><time>{dayjs(c.createdAt).format('DD.MM.YYYY HH:mm')}</time></div>
              </article>)}
            </div>
          </Card>
        </Col>
      </Row>
    </PageTransition>
  );
};

export default AdminDashboard;
