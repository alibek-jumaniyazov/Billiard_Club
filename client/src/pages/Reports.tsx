import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  BarChartOutlined,
  CoffeeOutlined,
  DollarOutlined,
  DownloadOutlined,
  ReloadOutlined,
  TableOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, reportsApi } from '../api';
import { PAYMENT_METHODS } from '../constants';
import type { Report, Session } from '../types';
import { formatDuration, formatMoney } from '../utils/format';

const { Title, Text } = Typography;
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
  const [exporting, setExporting] = useState(false);

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

  const fetchReport = useCallback(async () => {
    if (!currentParams) return;
    setLoading(true);
    try {
      const res = await reportsApi.get(reportType, currentParams);
      setReport(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [reportType, currentParams, message, t]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

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
      dataIndex: 'durationMinutes',
      width: 130,
      render: (v: number | null) => (
        <Tag color="blue">{formatDuration(v, t('common.hours'), t('common.minutes'))}</Tag>
      ),
    },
    {
      title: t('reports.tableAmount'),
      dataIndex: 'tableAmount',
      align: 'right',
      render: (v: number) => <Text style={{ color: '#faad14' }}>{formatMoney(v, t('common.sum'))}</Text>,
    },
    {
      title: t('reports.barAmount'),
      dataIndex: 'barAmount',
      align: 'right',
      render: (v: number) => <Text style={{ color: '#1677ff' }}>{formatMoney(v, t('common.sum'))}</Text>,
    },
    {
      title: t('common.total'),
      dataIndex: 'totalAmount',
      align: 'right',
      render: (v: number) => (
        <Text strong style={{ color: '#52c41a' }}>{formatMoney(v, t('common.sum'))}</Text>
      ),
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
      render: (isPaid: boolean) => (
        <Tag color={isPaid ? 'green' : 'red'}>{isPaid ? t('status.paid') : t('status.unpaid')}</Tag>
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
            <BarChartOutlined /> {t('reports.title')}
          </Title>
          <Text type="secondary">{t('reports.subtitle')}</Text>
        </div>
        <Space wrap>
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
          <Button icon={<ReloadOutlined />} onClick={() => void fetchReport()} />
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            disabled={!currentParams}
            onClick={() => void handleExport()}
          >
            {t('reports.exportExcel')}
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title={t('reports.collectedRevenue')}
              value={formatMoney(summary?.collectedRevenue, t('common.sum'))}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#52c41a', fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title={t('reports.billedRevenue')}
              value={formatMoney(summary?.billedRevenue, t('common.sum'))}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title={t('reports.tableRevenue')}
              value={formatMoney(summary?.tableRevenue, t('common.sum'))}
              prefix={<TableOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title={t('reports.barRevenue')}
              value={formatMoney(summary?.barRevenue, t('common.sum'))}
              prefix={<CoffeeOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic title={t('reports.totalSessions')} value={summary?.totalSessions ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title={t('reports.avgDuration')}
              value={formatDuration(summary?.avgSessionDuration, t('common.hours'), t('common.minutes'))}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title={t('reports.debtsCreated')}
              value={formatMoney(summary?.debtsCreated, t('common.sum'))}
              valueStyle={{ color: (summary?.debtsCreated ?? 0) > 0 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title={t('reports.debtsCollected')}
              value={formatMoney(summary?.debtsCollected, t('common.sum'))}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t('reports.paymentBreakdown')} loading={loading} style={{ marginBottom: 20 }}>
        <Row gutter={[16, 16]}>
          {PAYMENT_METHODS.map((m) => (
            <Col xs={24} sm={8} key={m}>
              <Statistic
                title={t(`payment.${m}`)}
                value={formatMoney(summary?.paymentBreakdown?.[m], t('common.sum'))}
              />
            </Col>
          ))}
        </Row>
      </Card>

      <Card title={t('reports.sessionsTitle')}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={report?.sessions ?? []}
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: true }}
          scroll={{ x: 1100 }}
        />
      </Card>
    </div>
  );
};

export default Reports;
