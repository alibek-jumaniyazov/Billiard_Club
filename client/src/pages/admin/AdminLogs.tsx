import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, platformApi } from '../../api';
import { EmptyState, PageHeader, PageTransition, StatCard, StatusTag } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type { AuditLog, PlatformHealth } from '../../types';
import { formatNumber } from '../../utils/format';
import ClubSelect from './ClubSelect';

const { Text } = Typography;

type DateRange = [Dayjs | null, Dayjs | null] | null;

/**
 * Superadmin — audit jurnali (kim, qachon, nima qilgani) va
 * platforma texnik holati (DB, uptime, versiya, xotira).
 */
const AdminLogs = () => {
  const { t } = useTranslation();

  // ---------- Texnik holat ----------
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await platformApi.health();
      setHealth(res.data);
    } catch {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // ---------- Jurnal ----------
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [actionFilter, setActionFilter] = useState('');
  const [clubFilter, setClubFilter] = useState<number | undefined>(undefined);
  const [dateRange, setDateRange] = useState<DateRange>(null);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(
    async (params: {
      page: number;
      pageSize: number;
      action: string;
      clubId?: number;
      range: DateRange;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const [from, to] = params.range ?? [null, null];
        const res = await platformApi.auditLogs({
          action: params.action.trim() || undefined,
          clubId: params.clubId,
          from: from ? from.format('YYYY-MM-DD') : undefined,
          to: to ? to.format('YYYY-MM-DD') : undefined,
          page: params.page,
          limit: params.pageSize,
        });
        setLogs(res.data);
        setTotal(res.pagination?.total ?? res.data.length);
      } catch (err) {
        setError(errorMessage(err, t('common.error')));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void fetchHealth();
    void fetchLogs({ page: 1, pageSize: 50, action: '', range: null });
    return () => {
      if (actionTimer.current) clearTimeout(actionTimer.current);
    };
  }, [fetchHealth, fetchLogs]);

  const refresh = useCallback(() => {
    void fetchHealth();
    void fetchLogs({ page, pageSize, action: actionFilter, clubId: clubFilter, range: dateRange });
  }, [fetchHealth, fetchLogs, page, pageSize, actionFilter, clubFilter, dateRange]);

  const formatUptime = (seconds: number): string => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d} ${t('common.days')}`);
    if (h > 0) parts.push(`${h} ${t('common.hours')}`);
    parts.push(`${m} ${t('common.minutes')}`);
    return parts.join(' ');
  };

  const columns: ColumnsType<AuditLog> = [
    {
      title: t('admin.logs.time'),
      dataIndex: 'createdAt',
      width: 150,
      render: (d: string) => (
        <span className="tabular-nums">{dayjs(d).format('DD.MM.YY HH:mm:ss')}</span>
      ),
    },
    {
      title: t('admin.logs.action'),
      dataIndex: 'action',
      width: 170,
      render: (action: string) => <Tag color="gold">{action}</Tag>,
    },
    {
      title: t('admin.logs.actor'),
      key: 'actor',
      width: 140,
      render: (_, log) => (
        <Space direction="vertical" size={0}>
          <Text>{log.actorRole ? t(`role.${log.actorRole}`, { defaultValue: log.actorRole }) : '—'}</Text>
          {log.userId != null && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              ID {log.userId}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('admin.logs.club'),
      key: 'club',
      width: 170,
      render: (_, log) => log.club?.name ?? (log.clubId != null ? `#${log.clubId}` : '—'),
    },
    {
      title: t('admin.logs.entity'),
      key: 'entity',
      width: 130,
      responsive: ['md'],
      render: (_, log) =>
        log.entity ? (
          <Text type="secondary">
            {log.entity}
            {log.entityId != null ? `#${log.entityId}` : ''}
          </Text>
        ) : (
          '—'
        ),
    },
    {
      title: t('admin.logs.request'),
      key: 'request',
      ellipsis: true,
      responsive: ['lg'],
      render: (_, log) =>
        log.method || log.path ? (
          <Text code style={{ fontSize: 12 }}>
            {log.method ?? ''} {log.path ?? ''}
          </Text>
        ) : (
          '—'
        ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 130,
      responsive: ['xl'],
      render: (ip: string | null) => ip ?? '—',
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<FileSearchOutlined />}
        title={t('admin.logs.title')}
        subtitle={t('admin.logs.subtitle')}
        extra={
          <Button icon={<ReloadOutlined />} aria-label={t('btn.refresh')} onClick={refresh} />
        }
      />

      {/* Texnik holat */}
      <Row gutter={[16, 16]} style={{ marginBottom: TOKENS.spacing.md }}>
        <Col xs={12} sm={12} lg={6}>
          <StatCard
            loading={healthLoading}
            label={t('admin.logs.healthTitle')}
            icon={<CloudServerOutlined />}
            accent={
              health?.status === 'ok'
                ? TOKENS.color.semantic.success
                : TOKENS.color.semantic.error
            }
            value={
              health ? (
                <StatusTag
                  status={health.status === 'ok' ? 'success' : 'error'}
                  label={
                    health.status === 'ok'
                      ? t('admin.logs.statusOk')
                      : t('admin.logs.statusDegraded')
                  }
                  dot
                />
              ) : (
                '—'
              )
            }
          />
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <StatCard
            loading={healthLoading}
            label={t('admin.logs.db')}
            icon={<DatabaseOutlined />}
            accent={
              health?.db.status === 'up'
                ? TOKENS.color.semantic.success
                : TOKENS.color.semantic.error
            }
            value={
              health
                ? health.db.status === 'up'
                  ? `${t('admin.logs.dbUp')} · ${health.db.latencyMs ?? 0} ms`
                  : t('admin.logs.dbDown')
                : '—'
            }
          />
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <StatCard
            loading={healthLoading}
            label={t('admin.logs.uptime')}
            icon={<ClockCircleOutlined />}
            value={health ? formatUptime(health.uptimeSeconds) : '—'}
          />
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <StatCard
            loading={healthLoading}
            label={`${t('admin.logs.memory')} · v${health?.version ?? '—'}`}
            icon={<ApiOutlined />}
            accent={TOKENS.color.semantic.info}
            value={health ? `${health.memory.rssMb} MB` : '—'}
          />
        </Col>
      </Row>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={refresh}>
              {t('admin.retry')}
            </Button>
          }
          style={{ marginBottom: TOKENS.spacing.md }}
        />
      )}

      <Card>
        <Space wrap style={{ marginBottom: TOKENS.spacing.md }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: TOKENS.color.text.tertiary }} />}
            placeholder={t('admin.logs.actionFilter')}
            value={actionFilter}
            style={{ width: 220 }}
            onChange={(e) => {
              const value = e.target.value;
              setActionFilter(value);
              if (actionTimer.current) clearTimeout(actionTimer.current);
              actionTimer.current = setTimeout(() => {
                setPage(1);
                void fetchLogs({
                  page: 1,
                  pageSize,
                  action: value,
                  clubId: clubFilter,
                  range: dateRange,
                });
              }, 400);
            }}
          />
          <ClubSelect
            value={clubFilter}
            placeholder={t('admin.logs.clubFilter')}
            style={{ width: 220 }}
            onChange={(v) => {
              setClubFilter(v);
              setPage(1);
              void fetchLogs({
                page: 1,
                pageSize,
                action: actionFilter,
                clubId: v,
                range: dateRange,
              });
            }}
          />
          <DatePicker.RangePicker
            value={dateRange}
            format="DD.MM.YYYY"
            allowEmpty={[true, true]}
            onChange={(range) => {
              setDateRange(range);
              setPage(1);
              void fetchLogs({
                page: 1,
                pageSize,
                action: actionFilter,
                clubId: clubFilter,
                range,
              });
            }}
          />
        </Space>

        <Table
          rowKey="id"
          size="small"
          sticky
          columns={columns}
          dataSource={logs}
          loading={loading}
          expandable={{
            rowExpandable: (log) => !!log.meta || !!log.userAgent,
            expandedRowRender: (log) => (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {log.userAgent && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {log.userAgent}
                  </Text>
                )}
                {log.meta && (
                  <pre
                    style={{
                      margin: 0,
                      padding: 12,
                      fontSize: 12,
                      borderRadius: TOKENS.radius.sm,
                      background: TOKENS.color.bg.bg2,
                      border: `1px solid ${TOKENS.color.border.subtle}`,
                      overflowX: 'auto',
                    }}
                  >
                    {JSON.stringify(log.meta, null, 2)}
                  </pre>
                )}
              </Space>
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (n) => `${t('common.total')}: ${formatNumber(n)}`,
            onChange: (p, ps) => {
              const nextPage = ps !== pageSize ? 1 : p;
              setPage(nextPage);
              setPageSize(ps);
              void fetchLogs({
                page: nextPage,
                pageSize: ps,
                action: actionFilter,
                clubId: clubFilter,
                range: dateRange,
              });
            },
          }}
          scroll={{ x: 1000 }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<FileSearchOutlined />}
                title={t('admin.logs.empty')}
                hint={t('admin.logs.emptyHint')}
              />
            ),
          }}
        />
      </Card>
    </PageTransition>
  );
};

export default AdminLogs;
