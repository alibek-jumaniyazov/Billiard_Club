import { useMemo } from 'react';
import { Button, Card, Col, Row } from 'antd';
import {
  CalendarOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  DollarOutlined,
  PieChartOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { EmptyState, PageHeader, PageTransition, StatCard } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import { formatMoney } from '../../utils/format';
import ActiveSessionsList from './ActiveSessionsList';
import PeakHoursChart from './PeakHoursChart';
import RecentPaymentsList from './RecentPaymentsList';
import RevenueChart from './RevenueChart';
import TopCustomersList from './TopCustomersList';
import TopTablesChart from './TopTablesChart';
import { useDashboardStats } from './useDashboardStats';

/** Bo'limlar kaskadi — FAQAT birinchi yuklashda (mount) o'ynaydi */
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: TOKENS.motion.duration.base, ease: TOKENS.motion.easing.out },
  },
};

/**
 * Bosh sahifa — jonli analitika paneli.
 *
 * Renderlash tartibi: sahifa ildizida useNow YO'Q — sekundlik tik faqat
 * ActiveSessionsList ichidagi barg komponentlarda. Grafiklar memo qilingan,
 * 30 soniyalik jim poll kelgandagina qayta chiziladi.
 */
const DashboardPage = () => {
  const { t } = useTranslation();
  const { stats, loading, error, refreshing, clockOffset, refresh, retry } = useDashboardStats();
  const reduceMotion = useReducedMotion();

  const currency = t('common.sum');

  // Bugungi tushum trendi — kechagi kunga nisbatan (last7Days dan)
  const todayTrend = useMemo(() => {
    const days = stats?.last7Days;
    if (!days || days.length < 2) return undefined;
    const today = days[days.length - 1].revenue;
    const yesterday = days[days.length - 2].revenue;
    if (yesterday <= 0) return undefined;
    return Math.round(((today - yesterday) / yesterday) * 1000) / 10;
  }, [stats?.last7Days]);

  const header = (
    <PageHeader
      icon={<DashboardOutlined />}
      title={t('dashboard.title')}
      subtitle={t('dashboard.subtitle')}
      extra={
        <Button
          icon={<ReloadOutlined spin={refreshing} />}
          onClick={refresh}
          aria-label={t('btn.refresh')}
        />
      }
    />
  );

  // Birinchi yuklash muvaffaqiyatsiz — aniq xato paneli (bo'sh holat EMAS)
  if (error && !stats) {
    return (
      <PageTransition>
        {header}
        <Card>
          <EmptyState
            icon={<WarningOutlined />}
            title={t('dashboard.errorTitle')}
            hint={t('dashboard.errorHint')}
            action={
              <Button type="primary" onClick={retry}>
                {t('dashboard.retry')}
              </Button>
            }
          />
        </Card>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      {header}
      <motion.div
        variants={containerVariants}
        initial={reduceMotion ? false : 'hidden'}
        animate="visible"
      >
        {/* --- Tushum KPI qatori --- */}
        <motion.div variants={itemVariants}>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} lg={8}>
              <StatCard
                loading={loading}
                label={t('dashboard.todayRevenue')}
                value={formatMoney(stats?.dailyRevenue, currency)}
                icon={<DollarOutlined />}
                accent={TOKENS.color.gold.base}
                trend={todayTrend}
                trendLabel={t('dashboard.vsYesterday')}
              />
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <StatCard
                loading={loading}
                label={t('dashboard.weekRevenue')}
                value={formatMoney(stats?.weekRevenue, currency)}
                icon={<RiseOutlined />}
                accent={TOKENS.color.emerald.bright}
              />
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <StatCard
                loading={loading}
                label={t('dashboard.monthRevenue')}
                value={formatMoney(stats?.monthRevenue, currency)}
                icon={<CalendarOutlined />}
                accent={TOKENS.color.semantic.info}
              />
            </Col>
          </Row>
        </motion.div>

        {/* --- Operatsion KPI qatori --- */}
        <motion.div variants={itemVariants}>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={12} lg={6}>
              <StatCard
                loading={loading}
                label={t('dashboard.occupancy')}
                value={`${stats?.occupancyPercent ?? 0}%`}
                icon={<PieChartOutlined />}
                accent={TOKENS.color.neonGreen}
              />
            </Col>
            <Col xs={12} sm={12} lg={6}>
              <StatCard
                loading={loading}
                label={t('dashboard.activeSessions')}
                value={stats?.activeSessions ?? 0}
                icon={<PlayCircleOutlined />}
                accent={TOKENS.color.emerald.glow}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard
                loading={loading}
                label={t('dashboard.openDebts')}
                value={
                  stats?.openDebtsTotal === undefined
                    ? '—'
                    : formatMoney(stats.openDebtsTotal, currency)
                }
                icon={<CreditCardOutlined />}
                accent={TOKENS.color.semantic.error}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard
                loading={loading}
                label={t('dashboard.todayExpenses')}
                value={formatMoney(stats?.expenses.today, currency)}
                icon={<WalletOutlined />}
                accent={TOKENS.color.semantic.warning}
              />
            </Col>
          </Row>
        </motion.div>

        {/* --- Grafiklar --- */}
        <motion.div variants={itemVariants}>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={14} xl={16}>
              <RevenueChart
                days7={stats?.last7Days ?? []}
                days30={stats?.last30Days}
                currency={currency}
                loading={loading}
              />
            </Col>
            <Col xs={24} lg={10} xl={8}>
              <PeakHoursChart peakHours={stats?.peakHours ?? []} loading={loading} />
            </Col>
          </Row>
        </motion.div>

        {/* --- Jonli sessiyalar + stollar reytingi --- */}
        <motion.div variants={itemVariants}>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={14}>
              <ActiveSessionsList
                sessions={stats?.activeSessionsData ?? []}
                currency={currency}
                loading={loading}
                clockOffset={clockOffset}
              />
            </Col>
            <Col xs={24} lg={10}>
              <TopTablesChart
                mostUsedTables={stats?.mostUsedTables ?? []}
                currency={currency}
                loading={loading}
              />
            </Col>
          </Row>
        </motion.div>

        {/* --- Mijozlar reytingi + to'lovlar lentasi --- */}
        <motion.div variants={itemVariants}>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={10}>
              <TopCustomersList
                topCustomers={stats?.topCustomers ?? []}
                currency={currency}
                loading={loading}
              />
            </Col>
            <Col xs={24} lg={14}>
              <RecentPaymentsList
                payments={stats?.recentPayments ?? []}
                currency={currency}
                loading={loading}
              />
            </Col>
          </Row>
        </motion.div>
      </motion.div>
    </PageTransition>
  );
};

export default DashboardPage;
