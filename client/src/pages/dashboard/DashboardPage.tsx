import { useMemo } from 'react';
import { Alert, Button, Card, Col, Row, Typography } from 'antd';
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
import { useCurrency } from '../../context/AppSettingsContext';
import { TOKENS } from '../../theme/tokens';
import { formatClock, formatMoney } from '../../utils/format';
import ActiveSessionsList from './ActiveSessionsList';
import OnboardingChecklist from './OnboardingChecklist';
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
  const {
    stats,
    loading,
    error,
    refreshing,
    refreshError,
    lastUpdatedAt,
    clockOffset,
    refresh,
    retry,
  } = useDashboardStats();
  const reduceMotion = useReducedMotion();

  // Klub puli — belgi klub sozlamasidan (barcha bolalarga shu qiymat uzatiladi,
  // shunda bitta klubda ikki xil belgi ko'rinmaydi)
  const currency = useCurrency();

  // Bugungi tushum trendi — kechagi kunga nisbatan (last7Days dan)
  const todayTrend = useMemo(() => {
    const days = stats?.last7Days;
    if (!days || days.length < 2) return undefined;
    const today = days[days.length - 1].revenue;
    const yesterday = days[days.length - 2].revenue;
    if (yesterday <= 0) return undefined;
    return Math.round(((today - yesterday) / yesterday) * 1000) / 10;
  }, [stats?.last7Days]);

  // Haftalik trend — oxirgi 7 kun vs oldingi 7 kun (last30Days dan; eski server
  // last30Days bermasa jimgina o'tkazib yuboriladi)
  const weekTrend = useMemo(() => {
    const days = stats?.last30Days;
    if (!days || days.length < 14) return undefined;
    const last7 = days.slice(-7).reduce((s, d) => s + d.revenue, 0);
    const prev7 = days.slice(-14, -7).reduce((s, d) => s + d.revenue, 0);
    if (prev7 <= 0) return undefined;
    return Math.round(((last7 - prev7) / prev7) * 1000) / 10;
  }, [stats?.last30Days]);

  const header = (
    <PageHeader
      icon={<DashboardOutlined />}
      title={t('dashboard.title')}
      subtitle={t('dashboard.subtitle')}
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastUpdatedAt && (
            <Typography.Text type="secondary" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
              {t('dashboard.updatedAt', { time: formatClock(lastUpdatedAt) })}
            </Typography.Text>
          )}
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={refresh}
            aria-label={t('btn.refresh')}
          />
        </div>
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
      {/* Qo'lda "Yangilash" xato tugadi — ekrandagi raqamlar ESKI ekani
          aytiladi (aks holda bosish jim ketardi) */}
      {refreshError && stats && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={t('dashboard.refreshFailed')}
          description={
            lastUpdatedAt
              ? t('dashboard.lastUpdated', { time: formatClock(lastUpdatedAt) })
              : undefined
          }
          action={
            <Button size="small" onClick={refresh} loading={refreshing}>
              {t('dashboard.retry')}
            </Button>
          }
        />
      )}

      {/* Ishni boshlash checklist — yangi klub uchun (komponent o'zi qachon
          ko'rinishini hal qiladi: admin, birinchi o'yingacha, yopilmagan) */}
      <OnboardingChecklist stats={stats} />

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
                hint={t('dashboard.hintTodayRevenue')}
                value={formatMoney(stats?.dailyRevenue, currency)}
                valueTitle={formatMoney(stats?.dailyRevenue, currency)}
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
                hint={t('dashboard.hintWeekRevenue')}
                sublabel={t('dashboard.rangeLast7')}
                value={formatMoney(stats?.weekRevenue, currency)}
                valueTitle={formatMoney(stats?.weekRevenue, currency)}
                icon={<RiseOutlined />}
                accent={TOKENS.color.emerald.bright}
                trend={weekTrend}
                trendLabel={t('dashboard.vsLastWeek')}
              />
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <StatCard
                loading={loading}
                label={t('dashboard.monthRevenue')}
                hint={t('dashboard.hintMonthRevenue')}
                sublabel={t('dashboard.rangeThisMonth')}
                value={formatMoney(stats?.monthRevenue, currency)}
                valueTitle={formatMoney(stats?.monthRevenue, currency)}
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
                hint={t('dashboard.hintOccupancy')}
                value={`${stats?.occupancyPercent ?? 0}%`}
                meter={stats?.occupancyPercent ?? 0}
                icon={<PieChartOutlined />}
                accent={TOKENS.color.neonGreen}
              />
            </Col>
            <Col xs={12} sm={12} lg={6}>
              <StatCard
                loading={loading}
                label={t('dashboard.activeSessions')}
                hint={t('dashboard.hintActiveSessions')}
                value={stats?.activeSessions ?? 0}
                icon={<PlayCircleOutlined />}
                accent={TOKENS.color.emerald.glow}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <StatCard
                loading={loading}
                label={t('dashboard.openDebts')}
                hint={t('dashboard.hintOpenDebts')}
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
                hint={t('dashboard.hintTodayExpenses')}
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
