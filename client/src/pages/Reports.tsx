import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Segmented,
  Skeleton,
  Table,
  Tabs,
  Typography,
} from 'antd';
import {
  BarChartOutlined,
  CoffeeOutlined,
  DollarOutlined,
  DownloadOutlined,
  FieldTimeOutlined,
  HistoryOutlined,
  MinusCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
  TableOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, reportsApi } from '../api';
import {
  EmptyState,
  MoneyText,
  PageHeader,
  PageTransition,
  StatCard,
  StatusTag,
} from '../components/ui';
import { PAYMENT_METHODS } from '../constants';
import { TOKENS } from '../theme/tokens';
import type { ProductSalesRow, ProductsReport, Report, Session } from '../types';
import { formatDuration, formatElapsed, formatNumber } from '../utils/format';

const { Text } = Typography;
const { RangePicker } = DatePicker;

type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom';

const Reports = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [reportType, setReportType] = useState<ReportType>('daily');
  const [dailyDate, setDailyDate] = useState<Dayjs>(dayjs());
  const [monthDate, setMonthDate] = useState<Dayjs>(dayjs());
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Sessiyalar ro'yxati endi serverda sahifalanadi
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [activeTab, setActiveTab] = useState<'sessions' | 'products'>('sessions');
  const [productsReport, setProductsReport] = useState<ProductsReport | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);

  // Tanlangan davr uchun so'rov parametrlari; custom davr tanlanmagan bo'lsa null
  const currentParams = useMemo((): Record<string, string> | null => {
    switch (reportType) {
      case 'daily':
        return { date: dailyDate.format('YYYY-MM-DD') };
      case 'weekly':
        return {};
      case 'monthly':
        return { month: String(monthDate.month() + 1), year: String(monthDate.year()) };
      case 'custom':
        if (!customRange) return null;
        return {
          from: customRange[0].format('YYYY-MM-DD'),
          to: customRange[1].format('YYYY-MM-DD'),
        };
    }
  }, [reportType, dailyDate, monthDate, customRange]);

  const paramsKey = currentParams ? `${reportType}|${JSON.stringify(currentParams)}` : null;

  const fetchReport = useCallback(
    async (p: number, ps: number) => {
      if (!currentParams) return;
      setLoading(true);
      try {
        const res = await reportsApi.get(reportType, { ...currentParams, page: p, limit: ps });
        setReport(res.data);
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    },
    [reportType, currentParams, message, t],
  );

  // Davr o'zgarsa 1-sahifaga qaytamiz; aks holda joriy sahifani yuklaymiz
  const prevParamsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!paramsKey) return;
    if (prevParamsRef.current !== paramsKey) {
      prevParamsRef.current = paramsKey;
      if (page !== 1) {
        setPage(1);
        return; // effekt page=1 bilan qayta ishga tushadi
      }
    }
    void fetchReport(page, pageSize);
  }, [paramsKey, page, pageSize, fetchReport]);

  // Bar savdosi hisoboti — faqat tab ochiq bo'lganda yuklanadi
  const fetchProducts = useCallback(async () => {
    if (!currentParams) return;
    setProductsLoading(true);
    try {
      const res = await reportsApi.products(reportType, currentParams);
      setProductsReport(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setProductsLoading(false);
    }
  }, [reportType, currentParams, message, t]);

  useEffect(() => {
    if (activeTab === 'products') void fetchProducts();
  }, [activeTab, fetchProducts]);

  const handleRefresh = () => {
    void fetchReport(page, pageSize);
    if (activeTab === 'products') void fetchProducts();
  };

  const handleExport = async () => {
    if (!currentParams) return;
    setExporting(true);
    try {
      await reportsApi.exportExcel(reportType, currentParams);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setExporting(false);
    }
  };

  const summary = report?.summary;

  /** Yakunlangan sessiya davomiyligi — sekundlik aniqlikda (HH:MM:SS) */
  const durationDisplay = (s: Session): string =>
    s.durationSeconds != null
      ? formatElapsed(s.durationSeconds * 1000)
      : formatDuration(s.durationMinutes, t('common.hours'), t('common.minutes'));

  const columns: ColumnsType<Session> = [
    {
      title: t('common.table'),
      key: 'table',
      render: (_, s) => (
        <Text strong>{s.table?.name ?? (s.table?.number != null ? `#${s.table.number}` : '—')}</Text>
      ),
    },
    {
      title: t('common.customer'),
      dataIndex: 'customerName',
      render: (name: string | null) => name || '—',
    },
    {
      title: t('reports.endedAt'),
      dataIndex: 'endTime',
      width: 150,
      render: (v: string | null) => (v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '—'),
    },
    {
      title: t('common.duration'),
      key: 'duration',
      width: 130,
      render: (_, s) => (
        <span className="timer-display" style={{ fontSize: 13 }}>
          {durationDisplay(s)}
        </span>
      ),
    },
    {
      title: t('reports.tableAmount'),
      dataIndex: 'tableAmount',
      align: 'right',
      render: (v: number) => (
        <MoneyText amount={v} currency={t('common.sum')} color={TOKENS.color.gold.base} />
      ),
    },
    {
      title: t('reports.barAmount'),
      dataIndex: 'barAmount',
      align: 'right',
      render: (v: number) => (
        <MoneyText amount={v} currency={t('common.sum')} color={TOKENS.color.emerald.bright} />
      ),
    },
    {
      title: t('common.total'),
      dataIndex: 'totalAmount',
      align: 'right',
      render: (v: number) => <MoneyText amount={v} currency={t('common.sum')} />,
    },
    {
      title: t('payment.method'),
      dataIndex: 'paymentMethod',
      width: 120,
      render: (m: Session['paymentMethod']) => (m ? t(`payment.${m}`) : '—'),
    },
    {
      title: t('reports.paymentStatus'),
      dataIndex: 'isPaid',
      width: 130,
      render: (isPaid: boolean) =>
        isPaid ? (
          <StatusTag status="paid" label={t('status.paid')} />
        ) : (
          <StatusTag status="debt" label={t('status.unpaid')} />
        ),
    },
  ];

  const productColumns: ColumnsType<ProductSalesRow> = [
    {
      title: t('reports.productCol'),
      dataIndex: 'productName',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: t('reports.categoryCol'),
      dataIndex: 'categoryName',
      width: 180,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: t('reports.quantitySold'),
      dataIndex: 'quantity',
      width: 150,
      align: 'right',
      render: (v: number) => <span className="tabular-nums">{formatNumber(v)}</span>,
    },
    {
      title: t('reports.revenueCol'),
      dataIndex: 'revenue',
      width: 180,
      align: 'right',
      render: (v: number) => <MoneyText amount={v} currency={t('common.sum')} />,
    },
  ];

  /** StatCard ichida yagona o'lchamdagi pul matni */
  const money = (amount: number | undefined, color?: string) => (
    <MoneyText
      amount={amount}
      currency={t('common.sum')}
      color={color}
      style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
    />
  );

  return (
    <PageTransition>
      <PageHeader
        icon={<BarChartOutlined />}
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        extra={
          <>
            <Segmented<ReportType>
              options={[
                { label: t('reports.daily'), value: 'daily' },
                { label: t('reports.weekly'), value: 'weekly' },
                { label: t('reports.monthly'), value: 'monthly' },
                { label: t('reports.custom'), value: 'custom' },
              ]}
              value={reportType}
              onChange={setReportType}
            />
            {reportType === 'daily' && (
              <DatePicker
                value={dailyDate}
                allowClear={false}
                format="DD.MM.YYYY"
                onChange={(d) => {
                  if (d) setDailyDate(d);
                }}
              />
            )}
            {reportType === 'monthly' && (
              <DatePicker
                picker="month"
                value={monthDate}
                allowClear={false}
                format="MM.YYYY"
                onChange={(d) => {
                  if (d) setMonthDate(d);
                }}
              />
            )}
            {reportType === 'custom' && (
              <RangePicker
                format="DD.MM.YYYY"
                onChange={(dates) => {
                  // Tozalashda null keladi — himoya shart
                  if (!dates || !dates[0] || !dates[1]) {
                    setCustomRange(null);
                    return;
                  }
                  setCustomRange([dates[0], dates[1]]);
                }}
              />
            )}
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} />
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={exporting}
              disabled={!currentParams}
              onClick={() => void handleExport()}
            >
              {t('reports.exportExcel')}
            </Button>
          </>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label={t('reports.collectedRevenue')}
            value={money(summary?.collectedRevenue)}
            icon={<DollarOutlined />}
            accent={TOKENS.color.semantic.success}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label={t('reports.billedRevenue')}
            value={money(summary?.billedRevenue)}
            icon={<BarChartOutlined />}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label={t('reports.tableRevenue')}
            value={money(summary?.tableRevenue)}
            icon={<TableOutlined />}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label={t('reports.barRevenue')}
            value={money(summary?.barRevenue)}
            icon={<CoffeeOutlined />}
            accent={TOKENS.color.emerald.bright}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label={t('reports.expensesTotal')}
            value={money(summary?.expensesTotal)}
            icon={<MinusCircleOutlined />}
            accent={TOKENS.color.semantic.warning}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label={t('reports.profit')}
            value={money(
              summary?.profit,
              (summary?.profit ?? 0) >= 0
                ? TOKENS.color.semantic.success
                : TOKENS.color.semantic.error,
            )}
            icon={<RiseOutlined />}
            accent={
              (summary?.profit ?? 0) >= 0
                ? TOKENS.color.semantic.success
                : TOKENS.color.semantic.error
            }
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label={t('reports.totalSessions')}
            value={summary?.totalSessions ?? 0}
            icon={<PlayCircleOutlined />}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label={t('reports.avgDuration')}
            value={formatDuration(
              summary?.avgSessionDuration,
              t('common.hours'),
              t('common.minutes'),
            )}
            icon={<FieldTimeOutlined />}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label={t('reports.debtsCreated')}
            value={money(
              summary?.debtsCreated,
              (summary?.debtsCreated ?? 0) > 0 ? TOKENS.color.semantic.error : undefined,
            )}
            icon={<WalletOutlined />}
            accent={TOKENS.color.semantic.error}
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label={t('reports.debtsCollected')}
            value={money(summary?.debtsCollected)}
            icon={<WalletOutlined />}
            accent={TOKENS.color.semantic.success}
            loading={loading}
          />
        </Col>
      </Row>

      <Card title={t('reports.paymentBreakdown')} style={{ marginBottom: 20 }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 1 }} title={false} />
        ) : (
          <Row gutter={[16, 16]}>
            {PAYMENT_METHODS.map((m) => (
              <Col xs={24} sm={8} key={m}>
                <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
                  {t(`payment.${m}`)}
                </Text>
                <MoneyText
                  amount={summary?.paymentBreakdown?.[m]}
                  currency={t('common.sum')}
                  size="lg"
                />
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'sessions' | 'products')}
        items={[
          {
            key: 'sessions',
            label: (
              <span>
                <HistoryOutlined /> {t('reports.tabSessions')}
              </span>
            ),
            children: !loaded ? (
              <Card>
                <Skeleton active paragraph={{ rows: 6 }} />
              </Card>
            ) : (
              <Card>
                <Table
                  rowKey="id"
                  size="middle"
                  sticky
                  columns={columns}
                  dataSource={report?.sessions ?? []}
                  loading={loading}
                  locale={{
                    emptyText: (
                      <EmptyState
                        icon={<HistoryOutlined />}
                        title={t('reports.emptySessions')}
                      />
                    ),
                  }}
                  pagination={{
                    current: page,
                    pageSize,
                    total: report?.pagination?.total ?? 0,
                    showSizeChanger: true,
                    position: ['bottomRight'],
                    onChange: (p, ps) => {
                      setPage(ps !== pageSize ? 1 : p);
                      setPageSize(ps);
                    },
                  }}
                  scroll={{ x: 1100 }}
                />
              </Card>
            ),
          },
          {
            key: 'products',
            label: (
              <span>
                <CoffeeOutlined /> {t('reports.tabProducts')}
              </span>
            ),
            children: (
              <>
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col xs={24} sm={12} lg={6}>
                    <StatCard
                      label={t('reports.totalQuantity')}
                      value={formatNumber(productsReport?.totals.quantity)}
                      icon={<CoffeeOutlined />}
                      accent={TOKENS.color.emerald.bright}
                      loading={productsLoading}
                    />
                  </Col>
                  <Col xs={24} sm={12} lg={6}>
                    <StatCard
                      label={t('reports.totalRevenue')}
                      value={money(productsReport?.totals.revenue)}
                      icon={<DollarOutlined />}
                      loading={productsLoading}
                    />
                  </Col>
                </Row>
                <Card>
                  <Table
                    rowKey="productId"
                    size="middle"
                    sticky
                    columns={productColumns}
                    dataSource={productsReport?.products ?? []}
                    loading={productsLoading}
                    locale={{
                      emptyText: (
                        <EmptyState
                          icon={<CoffeeOutlined />}
                          title={t('reports.emptyProducts')}
                        />
                      ),
                    }}
                    pagination={false}
                    scroll={{ x: 700 }}
                  />
                </Card>
              </>
            ),
          },
        ]}
      />
    </PageTransition>
  );
};

export default Reports;
