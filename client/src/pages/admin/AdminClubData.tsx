import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Table, Tabs, Tag, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CloudSyncOutlined,
  DollarOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { errorMessage, platformApi } from '../../api';
import { EmptyState, PageHeader, PageTransition, StatCard, StatusTag } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type {
  AuditLog,
  ClubDataOverview,
  ClubStaffActivity,
  Debt,
  Order,
  Session,
} from '../../types';
import { formatMoney } from '../../utils/format';

const { Text } = Typography;

const PAGE_SIZE = 25;

/** `offline.replay` yozuvining meta tarkibi (server: offline-audit.interceptor.ts) */
interface OfflineMeta {
  queuedAt?: string | null;
  receivedAt?: string | null;
  driftMs?: number | null;
}

const fmtDate = (value: string | null | undefined, withTime = true): string =>
  value ? dayjs(value).format(withTime ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY') : '—';

/** Kechikishni odam o'qiydigan ko'rinishga: 10800000 -> "3 soat" */
const fmtDrift = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const abs = Math.abs(ms);
  const sign = ms < 0 ? '−' : '';
  if (abs < 60_000) return `${sign}${Math.round(abs / 1000)} s`;
  if (abs < 3_600_000) return `${sign}${Math.round(abs / 60_000)} daq`;
  return `${sign}${(abs / 3_600_000).toFixed(1)} soat`;
};

/**
 * SUPERADMIN — KLUB MA'LUMOTLARI KONSOLI (faqat o'qish).
 *
 * "Klubni ko'rish" (impersonatsiya) rejimidan farqi: bu yerda sessiya
 * konteksti o'zgarmaydi va klub nomidan HECH NARSA yozilmaydi — shuning
 * uchun bir necha klubni ketma-ket ko'rish jurnalni impersonatsiya
 * yozuvlari bilan to'ldirmaydi.
 *
 * "Faoliyat" ko'rinishida OFLAYN kiritilgan amallar alohida ajratilgan:
 * qachon navbatga qo'yilgani, qachon yetib kelgani va kechikish ko'rinadi.
 */
const AdminClubData = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const clubId = Number(id);

  const [overview, setOverview] = useState<ClubDataOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    if (!Number.isFinite(clubId)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await platformApi.clubOverview(clubId);
      setOverview(res.data);
    } catch (err) {
      setError(errorMessage(err, t('adminClubData.loadError')));
    } finally {
      setLoading(false);
    }
  }, [clubId, t]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  /* --------------------------------------------- Umumiy ko'rsatkichlar */

  const stats = useMemo(() => {
    if (!overview) return null;
    return (
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <StatCard
            label={t('adminClubData.revenueToday')}
            value={formatMoney(overview.revenueToday)}
            icon={<DollarOutlined />}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label={t('adminClubData.revenueTotal')}
            value={formatMoney(overview.revenueTotal)}
            icon={<WalletOutlined />}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label={t('adminClubData.activeSessions')}
            value={String(overview.activeSessions)}
            icon={<PlayCircleOutlined />}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label={t('adminClubData.staff')}
            value={String(overview.staffCount)}
            icon={<TeamOutlined />}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label={t('adminClubData.openDebts')}
            value={formatMoney(overview.openDebtAmount)}
            trendLabel={t('adminClubData.debtCount', { count: overview.openDebtCount })}
            icon={<WalletOutlined />}
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard
            label={t('adminClubData.sessionsToday')}
            value={String(overview.sessionsToday)}
            icon={<PlayCircleOutlined />}
          />
        </Col>
        <Col xs={24} md={12}>
          <StatCard
            label={t('adminClubData.lastActivity')}
            value={fmtDate(overview.lastActivityAt)}
            icon={<ClockCircleOutlined />}
          />
        </Col>
      </Row>
    );
  }, [overview, t]);

  if (!Number.isFinite(clubId)) {
    return <EmptyState title={t('adminClubData.badId')} />;
  }

  return (
    <PageTransition>
      <PageHeader
        title={overview?.club.name ?? t('adminClubData.title')}
        subtitle={t('adminClubData.subtitle')}
        extra={
          <Space>
            <Link to="/admin/clubs">
              <Button icon={<ArrowLeftOutlined />}>{t('adminClubData.back')}</Button>
            </Link>
            <Button icon={<ReloadOutlined />} onClick={() => void loadOverview()} loading={loading}>
              {t('btn.refresh')}
            </Button>
          </Space>
        }
      />

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      {overview && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap size={8}>
            <StatusTag status={overview.club.status} label={t(`club.${overview.club.status}`)} />
            <Text type="secondary">
              {t('adminClubData.subscriptionUntil', {
                date: fmtDate(overview.club.effectiveEndsAt, false),
              })}
            </Text>
            <Text type="secondary">
              {t('adminClubData.registered', { date: fmtDate(overview.club.createdAt, false) })}
            </Text>
          </Space>

          {stats}

          <Tabs
            items={[
              {
                key: 'sessions',
                label: t('adminClubData.tabSessions'),
                children: <SessionsTab clubId={clubId} />,
              },
              {
                key: 'orders',
                label: t('adminClubData.tabOrders'),
                children: <OrdersTab clubId={clubId} />,
              },
              {
                key: 'debts',
                label: t('adminClubData.tabDebts'),
                children: <DebtsTab clubId={clubId} />,
              },
              {
                key: 'staff',
                label: t('adminClubData.tabStaff'),
                children: <StaffTab clubId={clubId} />,
              },
              {
                key: 'activity',
                label: t('adminClubData.tabActivity'),
                children: <ActivityTab clubId={clubId} />,
              },
            ]}
          />
        </Space>
      )}
    </PageTransition>
  );
};

/* ------------------------------------------------------ Umumiy jadval hook */

/**
 * Sahifalangan ro'yxatlar uchun umumiy yuklovchi.
 *
 * Har bir tab uchun bir xil kod takrorlanmasin — barchasi bir xil
 * `{ data, pagination }` shaklini qaytaradi.
 */
const usePagedList = <T,>(
  fetcher: (params: { page: number; limit: number }) => Promise<{ data: T[]; pagination?: { total: number } }>,
  deps: unknown[],
) => {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetcher({ page, limit: PAGE_SIZE })
      .then((res) => {
        // Sahifa tez almashtirilganda eski javob yangisini bosib ketmasin
        if (cancelled) return;
        setRows(res.data ?? []);
        setTotal(res.pagination?.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ...deps]);

  return { rows, total, page, setPage, loading };
};

const pagination = (total: number, page: number, setPage: (p: number) => void) => ({
  current: page,
  pageSize: PAGE_SIZE,
  total,
  showSizeChanger: false,
  onChange: setPage,
});

/* ------------------------------------------------------------------ Tablar */

const SessionsTab = ({ clubId }: { clubId: number }) => {
  const { t } = useTranslation();
  const { rows, total, page, setPage, loading } = usePagedList<Session>(
    (p) => platformApi.clubSessions(clubId, p).then((r) => ({ data: r.data, pagination: r.pagination })),
    [clubId],
  );

  const columns: ColumnsType<Session> = [
    { title: t('adminClubData.colTable'), render: (_, r) => r.table?.name ?? `#${r.tableId}` },
    { title: t('adminClubData.colStaff'), render: (_, r) => r.user?.name ?? '—' },
    { title: t('adminClubData.colStart'), render: (_, r) => fmtDate(r.startTime) },
    { title: t('adminClubData.colEnd'), render: (_, r) => fmtDate(r.endTime) },
    {
      title: t('adminClubData.colAmount'),
      align: 'right',
      render: (_, r) => formatMoney(r.totalAmount),
    },
    {
      title: t('adminClubData.colStatus'),
      render: (_, r) => <StatusTag status={r.status} label={t(`status.${r.status}`)} />,
    },
  ];

  return (
    <Table
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={rows}
      columns={columns}
      scroll={{ x: 'max-content' }}
      pagination={pagination(total, page, setPage)}
    />
  );
};

const OrdersTab = ({ clubId }: { clubId: number }) => {
  const { t } = useTranslation();
  const { rows, total, page, setPage, loading } = usePagedList<Order>(
    (p) => platformApi.clubOrders(clubId, p).then((r) => ({ data: r.data, pagination: r.pagination })),
    [clubId],
  );

  const columns: ColumnsType<Order> = [
    { title: t('adminClubData.colDate'), render: (_, r) => fmtDate(r.createdAt) },
    { title: t('adminClubData.colStaff'), render: (_, r) => r.user?.name ?? '—' },
    {
      title: t('adminClubData.colItems'),
      render: (_, r) => t('adminClubData.itemsCount', { count: r.items?.length ?? 0 }),
    },
    {
      title: t('adminClubData.colAmount'),
      align: 'right',
      render: (_, r) => formatMoney(r.totalAmount),
    },
  ];

  return (
    <Table
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={rows}
      columns={columns}
      scroll={{ x: 'max-content' }}
      pagination={pagination(total, page, setPage)}
    />
  );
};

const DebtsTab = ({ clubId }: { clubId: number }) => {
  const { t } = useTranslation();
  const { rows, total, page, setPage, loading } = usePagedList<Debt>(
    (p) => platformApi.clubDebts(clubId, p).then((r) => ({ data: r.data, pagination: r.pagination })),
    [clubId],
  );

  const columns: ColumnsType<Debt> = [
    { title: t('adminClubData.colDate'), render: (_, r) => fmtDate(r.createdAt) },
    { title: t('adminClubData.colCustomer'), render: (_, r) => r.customerName },
    {
      title: t('adminClubData.colTotal'),
      align: 'right',
      render: (_, r) => formatMoney(r.totalDebt),
    },
    {
      title: t('adminClubData.colRemaining'),
      align: 'right',
      render: (_, r) => formatMoney(r.remainingDebt),
    },
    {
      title: t('adminClubData.colStatus'),
      render: (_, r) =>
        r.writtenOffAt ? (
          <Tag>{t('adminClubData.writtenOff')}</Tag>
        ) : r.isPaid ? (
          <Tag color="green">{t('adminClubData.paid')}</Tag>
        ) : (
          <Tag color="orange">{t('adminClubData.open')}</Tag>
        ),
    },
  ];

  return (
    <Table
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={rows}
      columns={columns}
      scroll={{ x: 'max-content' }}
      pagination={pagination(total, page, setPage)}
    />
  );
};

const StaffTab = ({ clubId }: { clubId: number }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ClubStaffActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void platformApi
      .clubStaff(clubId)
      .then((r) => !cancelled && setRows(r.data ?? []))
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const columns: ColumnsType<ClubStaffActivity> = [
    { title: t('adminClubData.colName'), dataIndex: 'name' },
    { title: t('adminClubData.colUsername'), dataIndex: 'username' },
    { title: t('adminClubData.colRole'), render: (_, r) => t(`role.${r.role}`) },
    { title: t('adminClubData.colLastLogin'), render: (_, r) => fmtDate(r.lastLogin) },
    { title: t('adminClubData.colSessions30d'), align: 'right', dataIndex: 'sessions30d' },
    {
      title: t('adminClubData.colRevenue30d'),
      align: 'right',
      render: (_, r) => formatMoney(r.revenue30d),
    },
    {
      title: t('adminClubData.colActive'),
      render: (_, r) =>
        r.isActive ? (
          <Tag color="green">{t('common.yes')}</Tag>
        ) : (
          <Tag color="red">{t('common.no')}</Tag>
        ),
    },
  ];

  return (
    <Table
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={rows}
      columns={columns}
      scroll={{ x: 'max-content' }}
      pagination={false}
    />
  );
};

const ActivityTab = ({ clubId }: { clubId: number }) => {
  const { t } = useTranslation();
  const [onlyOffline, setOnlyOffline] = useState(false);
  const { rows, total, page, setPage, loading } = usePagedList<AuditLog>(
    (p) =>
      platformApi
        .clubActivity(clubId, { ...p, ...(onlyOffline ? { action: 'offline.replay' } : {}) })
        .then((r) => ({ data: r.data, pagination: r.pagination })),
    [clubId, onlyOffline],
  );

  const columns: ColumnsType<AuditLog> = [
    { title: t('adminClubData.colWhen'), render: (_, r) => fmtDate(r.createdAt) },
    {
      title: t('adminClubData.colAction'),
      render: (_, r) => (
        <Space size={6}>
          <Text code style={{ fontSize: 12 }}>
            {r.action}
          </Text>
          {r.action === 'offline.replay' && (
            <Tag color="blue" icon={<CloudSyncOutlined />}>
              {t('adminClubData.offline')}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('adminClubData.colWho'),
      render: (_, r) => (r.actorRole ? `${t(`role.${r.actorRole}`)} #${r.userId ?? '—'}` : '—'),
    },
    { title: t('adminClubData.colPath'), render: (_, r) => r.path ?? '—' },
    {
      // Oflayn yozuvlar uchun eng muhim ustun: amal QACHON kiritilgan va
      // serverga QANCHA kechikib yetib kelgan
      title: t('adminClubData.colOfflineDelay'),
      render: (_, r) => {
        if (r.action !== 'offline.replay') return '—';
        const meta = (r.meta ?? {}) as OfflineMeta;
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 12 }}>{fmtDate(meta.queuedAt)}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('adminClubData.delay', { value: fmtDrift(meta.driftMs) })}
            </Text>
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Card size="small" style={{ background: TOKENS.color.bg.bg1 }}>
        <Space wrap>
          <Button
            size="small"
            type={onlyOffline ? 'primary' : 'default'}
            icon={<CloudSyncOutlined />}
            onClick={() => {
              setOnlyOffline((v) => !v);
              setPage(1);
            }}
          >
            {t('adminClubData.onlyOffline')}
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('adminClubData.activityHint')}
          </Text>
        </Space>
      </Card>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 'max-content' }}
        pagination={pagination(total, page, setPage)}
      />
    </Space>
  );
};

export default AdminClubData;
