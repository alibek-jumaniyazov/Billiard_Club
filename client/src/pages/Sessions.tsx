import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  App,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Input,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import { HistoryOutlined, SwapOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, sessionsApi } from '../api';
import {
  ElapsedTime,
  EmptyState,
  MoneyText,
  PageHeader,
  PageTransition,
  StatusTag,
} from '../components/ui';
import { TOKENS } from '../theme/tokens';
import type {
  OrderItem,
  PaymentMethod,
  Session,
  SessionReceipt,
  SessionSegment,
  SessionStatus,
} from '../types';
import { formatDuration, formatElapsed, formatNumber } from '../utils/format';
import { clockOffsetMs, sessionElapsedMs } from '../utils/session';

const { Text, Title } = Typography;

const STATUS_OPTIONS: SessionStatus[] = ['active', 'paused', 'completed', 'cancelled'];
const DEFAULT_PAGE_SIZE = 10;

interface FetchParams {
  page: number;
  pageSize: number;
  status: SessionStatus | 'all';
  search: string;
}

const isLive = (s: Pick<Session, 'status'>): boolean =>
  s.status === 'active' || s.status === 'paused';

/** Segmentning faol (pauzasiz) davomiyligi, ms */
const segmentActiveMs = (seg: SessionSegment, session: Session): number => {
  const endMs = seg.endedAt
    ? new Date(seg.endedAt).getTime()
    : session.endTime
      ? new Date(session.endTime).getTime()
      : Date.now();
  return Math.max(0, endMs - new Date(seg.startedAt).getTime() - (seg.pausedMs || 0));
};

/** Faqat o'qish uchun sahifa — o'yin yakunlash Stollar sahifasida */
const Sessions = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [status, setStatus] = useState<SessionStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  // Tafsilotlar keshi (segmentlar/to'lovlar ro'yxatda kelmaydi — detal so'raladi)
  const [details, setDetails] = useState<Record<number, Session>>({});
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [liveReceipt, setLiveReceipt] = useState<SessionReceipt | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  // Server soat siljishi: jonli taymerlar Date.now() + offsetMs bilan yuritiladi
  const [offsetMs, setOffsetMs] = useState(0);

  // Filtr qiymatlari to'g'ridan-to'g'ri uzatiladi (eski stale-closure xatosi takrorlanmasin)
  const fetchSessions = useCallback(
    async ({ page: p, pageSize: ps, status: st, search: q }: FetchParams) => {
      setLoading(true);
      try {
        const params: { page: number; limit: number; status?: SessionStatus; search?: string } = {
          page: p,
          limit: ps,
        };
        if (st !== 'all') params.status = st;
        if (q) params.search = q;
        const res = await sessionsApi.list(params);
        setSessions(res.data);
        setTotal(res.pagination?.total ?? 0);
        if (res.serverNow) setOffsetMs(clockOffsetMs(res.serverNow));
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    },
    [message, t],
  );

  useEffect(() => {
    void fetchSessions({ page: 1, pageSize: DEFAULT_PAGE_SIZE, status: 'all', search: '' });
  }, [fetchSessions]);

  const handleSearch = (value: string) => {
    const q = value.trim();
    setSearch(q);
    setPage(1);
    void fetchSessions({ page: 1, pageSize, status, search: q });
  };

  const handleStatusChange = (value: SessionStatus | 'all') => {
    setStatus(value);
    setPage(1);
    void fetchSessions({ page: 1, pageSize, status: value, search });
  };

  /** Detalni yuklab keshlaydi (kengaytirish va chek draweri uchun) */
  const ensureDetail = useCallback(
    async (record: Session) => {
      // Kesh faqat holati o'zgarmagan bo'lsa yaroqli — boshqa terminalda
      // yakunlangan sessiya jonli (nol chek bilan) ko'rinib qolmasin
      if (details[record.id] && details[record.id].status === record.status) return;
      try {
        const res = await sessionsApi.detail(record.id);
        if (res.data.serverNow) setOffsetMs(clockOffsetMs(res.data.serverNow));
        setDetails((prev) => ({ ...prev, [record.id]: res.data }));
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
      }
    },
    [details, message, t],
  );

  const openDrawer = (record: Session) => {
    setDrawerId(record.id);
    void ensureDetail(record);
    // Jonli sessiya uchun serverdan sekundlik chek olamiz
    if (isLive(record)) {
      setReceiptLoading(true);
      setLiveReceipt(null);
      sessionsApi
        .receipt(record.id)
        .then((res) => {
          setOffsetMs(clockOffsetMs(res.data.serverNow));
          setLiveReceipt(res.data);
        })
        .catch((err) => message.error(errorMessage(err, t('common.error'))))
        .finally(() => setReceiptLoading(false));
    } else {
      setLiveReceipt(null);
    }
  };

  /** Yakunlangan sessiya davomiyligi — sekundlik aniqlikda */
  const completedDuration = (s: Session): string => {
    if (s.durationSeconds != null) return formatElapsed(s.durationSeconds * 1000);
    if (s.durationMinutes != null)
      return formatDuration(s.durationMinutes, t('common.hours'), t('common.minutes'));
    return '—';
  };

  const columns: ColumnsType<Session> = [
    {
      title: t('common.table'),
      key: 'table',
      render: (_, s) => {
        const segCount = details[s.id]?.segments?.length ?? 0;
        return (
          <Space size={8}>
            <Space direction="vertical" size={0}>
              <Text strong>{s.table?.name ?? '—'}</Text>
              {s.table && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  №{s.table.number}
                </Text>
              )}
            </Space>
            {segCount > 1 && (
              <Tooltip title={t('sessions.transferredTimes', { count: segCount - 1 })}>
                <SwapOutlined style={{ color: TOKENS.color.gold.base }} />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: t('common.customer'),
      key: 'customer',
      render: (_, s) => (
        <Space direction="vertical" size={0}>
          {s.customerName ? (
            <Text>{s.customerName}</Text>
          ) : (
            <Text type="secondary">{t('sessions.anonymous')}</Text>
          )}
          {s.customerPhone && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {s.customerPhone}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('sessions.startTime'),
      dataIndex: 'startTime',
      width: 150,
      render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: t('common.duration'),
      key: 'duration',
      width: 140,
      render: (_, s) =>
        isLive(s) ? (
          // Jonli sekundlik taymer — faqat shu katak har soniyada qayta render bo'ladi
          <ElapsedTime
            from={s.startTime}
            computeMs={(now) => sessionElapsedMs(s, now + offsetMs)}
            paused={s.status === 'paused'}
            style={{
              fontSize: 13,
              color:
                s.status === 'paused'
                  ? TOKENS.color.semantic.warning
                  : TOKENS.color.neonGreen,
            }}
          />
        ) : (
          <span className="timer-display" style={{ fontSize: 13 }}>
            {completedDuration(s)}
          </span>
        ),
    },
    {
      title: t('sessions.amount'),
      key: 'amount',
      width: 200,
      render: (_, s) => (
        <Space direction="vertical" size={0}>
          <MoneyText amount={s.totalAmount} currency={t('common.sum')} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('common.table')}: {formatNumber(s.tableAmount)} · {t('common.bar')}:{' '}
            {formatNumber(s.barAmount)}
          </Text>
        </Space>
      ),
    },
    {
      title: t('sessions.status'),
      dataIndex: 'status',
      width: 140,
      render: (s: SessionStatus) => <StatusTag status={s} label={t(`status.${s}`)} />,
    },
    {
      title: t('sessions.payState'),
      key: 'payState',
      width: 130,
      render: (_, s) => {
        if (s.status !== 'completed') return '—';
        return s.isPaid ? (
          <StatusTag status="paid" label={t('status.paid')} />
        ) : (
          <StatusTag status="debt" label={t('status.debt')} />
        );
      },
    },
  ];

  // ---------- Segmentlar (stol ko'chirish tarixi) ----------
  const segmentColumns = (session: Session): ColumnsType<SessionSegment> => [
    {
      title: t('sessions.segmentTable'),
      key: 'table',
      render: (_, seg) => <Text strong>{seg.table?.name ?? `#${seg.tableId}`}</Text>,
    },
    {
      title: t('sessions.segmentPrice'),
      dataIndex: 'pricePerHour',
      width: 150,
      align: 'right',
      render: (v: number) => <MoneyText amount={v} currency={t('common.sum')} size="sm" />,
    },
    {
      title: t('sessions.segmentPeriod'),
      key: 'period',
      width: 180,
      render: (_, seg) => (
        <Text type="secondary" style={{ fontSize: 12.5 }} className="tabular-nums">
          {dayjs(seg.startedAt).format('HH:mm')} —{' '}
          {seg.endedAt
            ? dayjs(seg.endedAt).format('HH:mm')
            : session.endTime
              ? dayjs(session.endTime).format('HH:mm')
              : '…'}
        </Text>
      ),
    },
    {
      title: t('sessions.segmentDuration'),
      key: 'duration',
      width: 120,
      render: (_, seg) => (
        <span className="timer-display" style={{ fontSize: 12.5 }}>
          {formatElapsed(segmentActiveMs(seg, session))}
        </span>
      ),
    },
  ];

  const renderSegments = (record: Session) => {
    const detail = details[record.id];
    if (!detail) {
      return <Skeleton active title={false} paragraph={{ rows: 2 }} style={{ maxWidth: 480 }} />;
    }
    const segments = detail.segments ?? [];
    if (segments.length === 0) {
      return <Text type="secondary">{t('sessions.noTransfers')}</Text>;
    }
    return (
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Space size={10} wrap>
          <StatusTag
            status={segments.length > 1 ? 'busy' : 'default'}
            label={t('sessions.segmentsCount', { count: segments.length })}
          />
          {segments.length > 1 ? (
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              <SwapOutlined style={{ color: TOKENS.color.gold.base }} />{' '}
              {t('sessions.transferredTimes', { count: segments.length - 1 })}
            </Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {t('sessions.noTransfers')}
            </Text>
          )}
        </Space>
        <Table
          rowKey="id"
          size="small"
          columns={segmentColumns(detail)}
          dataSource={segments}
          pagination={false}
          scroll={{ x: 560 }}
        />
      </Space>
    );
  };

  // ---------- Chek draweri ----------
  const drawerDetail = drawerId != null ? (details[drawerId] ?? null) : null;
  const drawerLive = !!drawerDetail && isLive(drawerDetail);

  const orderItems: OrderItem[] = (drawerDetail?.orders ?? []).flatMap((o) => o.items ?? []);

  const itemColumns: ColumnsType<OrderItem> = [
    {
      title: t('common.name'),
      key: 'product',
      render: (_, item) => item.product?.name ?? '—',
    },
    {
      title: t('common.quantity'),
      dataIndex: 'quantity',
      width: 70,
      align: 'right',
    },
    {
      title: t('common.price'),
      dataIndex: 'price',
      width: 100,
      align: 'right',
      render: (v: number) => <span className="tabular-nums">{formatNumber(v)}</span>,
    },
    {
      title: t('common.total'),
      dataIndex: 'subtotal',
      width: 110,
      align: 'right',
      render: (v: number) => <span className="tabular-nums">{formatNumber(v)}</span>,
    },
  ];

  /** Chekdagi bitta qator: chapda yorliq, o'ngda qiymat */
  const receiptRow = (label: ReactNode, value: ReactNode, key?: string) => (
    <div
      key={key}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        padding: '3px 0',
      }}
    >
      <Text type="secondary" style={{ fontSize: 13 }}>
        {label}
      </Text>
      {value}
    </div>
  );

  const renderReceipt = (detail: Session) => {
    const sale = detail.sale;
    const payments = detail.payments ?? [];
    const fallbackPayments: Array<{ method: PaymentMethod; amount: number }> =
      payments.length === 0 && detail.paymentMethod
        ? [{ method: detail.paymentMethod, amount: sale?.totalAmount ?? detail.totalAmount }]
        : [];
    const paidNow = sale?.totalAmount ?? payments.reduce((sum, p) => sum + p.amount, 0);
    const debtAmount =
      detail.status === 'completed' && !detail.isPaid
        ? Math.max(0, detail.totalAmount - paidNow)
        : 0;

    const liveTable = liveReceipt?.tableAmount;
    const liveBar = liveReceipt?.barAmount ?? detail.barAmount;

    return (
      <div
        style={{
          background: TOKENS.color.bg.bg2,
          border: `1px dashed ${TOKENS.color.gold.line}`,
          borderRadius: TOKENS.radius.md,
          padding: '14px 16px',
        }}
      >
        {drawerLive && receiptLoading ? (
          <Skeleton active title={false} paragraph={{ rows: 3 }} />
        ) : (
          <>
            {receiptRow(
              t('sessions.tableAmount'),
              <MoneyText
                amount={drawerLive ? (liveTable ?? 0) : detail.tableAmount}
                currency={t('common.sum')}
              />,
            )}
            {receiptRow(
              t('sessions.barAmount'),
              <MoneyText
                amount={drawerLive ? liveBar : detail.barAmount}
                currency={t('common.sum')}
              />,
            )}
            {!drawerLive && (sale?.discount ?? 0) > 0 &&
              receiptRow(
                t('common.discount'),
                <MoneyText amount={-(sale?.discount ?? 0)} currency={t('common.sum')} signed />,
              )}
            {!drawerLive && detail.adjustmentAmount !== 0 && (
              <>
                {receiptRow(
                  t('sessions.adjustment'),
                  <MoneyText amount={detail.adjustmentAmount} currency={t('common.sum')} signed />,
                )}
                {detail.adjustmentReason && (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    {t('sessions.adjustmentReason')}: {detail.adjustmentReason}
                  </Text>
                )}
              </>
            )}

            <Divider style={{ margin: '10px 0' }} />

            {receiptRow(
              drawerLive ? t('sessions.grossAmount') : t('sessions.totalAmount'),
              <MoneyText
                amount={drawerLive ? (liveReceipt?.grossAmount ?? 0) : detail.totalAmount}
                currency={t('common.sum')}
                size="lg"
                color={TOKENS.color.gold.base}
              />,
            )}

            {/* Bo'lib to'lash taqsimoti — faqat yakunlangan sessiyada */}
            {!drawerLive && (payments.length > 0 || fallbackPayments.length > 0) && (
              <>
                <Divider style={{ margin: '10px 0' }} />
                <Text
                  type="secondary"
                  style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                >
                  {t('sessions.paymentsBreakdown')}
                </Text>
                {(payments.length > 0 ? payments : fallbackPayments).map((p, idx) =>
                  receiptRow(
                    t(`payment.${p.method}`),
                    <MoneyText amount={p.amount} currency={t('common.sum')} size="sm" />,
                    `pay-${idx}`,
                  ),
                )}
                {receiptRow(
                  t('sessions.paidNow'),
                  <MoneyText
                    amount={paidNow}
                    currency={t('common.sum')}
                    color={TOKENS.color.semantic.success}
                  />,
                )}
                {debtAmount > 0 &&
                  receiptRow(
                    t('sessions.debtAmount'),
                    <MoneyText
                      amount={debtAmount}
                      currency={t('common.sum')}
                      color={TOKENS.color.semantic.error}
                    />,
                  )}
              </>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <PageTransition>
      <PageHeader
        icon={<HistoryOutlined />}
        title={t('sessions.title')}
        subtitle={t('sessions.subtitle')}
      />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col flex="auto">
            <Input.Search
              placeholder={t('sessions.searchPlaceholder')}
              allowClear
              onSearch={handleSearch}
              style={{ maxWidth: 360 }}
            />
          </Col>
          <Col>
            <Select<SessionStatus | 'all'>
              value={status}
              onChange={handleStatusChange}
              style={{ width: 180 }}
              options={[
                { value: 'all', label: t('common.all') },
                ...STATUS_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) })),
              ]}
            />
          </Col>
        </Row>
      </Card>

      {!loaded ? (
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
            dataSource={sessions}
            loading={loading}
            onRow={(record) => ({
              onClick: () => openDrawer(record),
              style: { cursor: 'pointer' },
            })}
            expandable={{
              // Kengaytirilganda detal yuklanadi — segmentlar (transfer tarixi)
              onExpand: (expanded, record) => {
                if (expanded) void ensureDetail(record);
              },
              expandedRowRender: renderSegments,
            }}
            locale={{
              emptyText: (
                <EmptyState
                  icon={<HistoryOutlined />}
                  title={t('sessions.emptyTitle')}
                  hint={t('sessions.emptyHint')}
                />
              ),
            }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              position: ['bottomRight'],
              onChange: (p, ps) => {
                // pageSize o'zgarsa 1-sahifaga qaytamiz (boshqa sahifalar bilan bir xil)
                const nextPage = ps !== pageSize ? 1 : p;
                setPage(nextPage);
                setPageSize(ps);
                void fetchSessions({ page: nextPage, pageSize: ps, status, search });
              },
            }}
            scroll={{ x: 1000 }}
          />
        </Card>
      )}

      {/* Chek draweri */}
      <Drawer
        title={
          drawerDetail ? (
            <Space>
              <span>
                {t('sessions.receipt')} — #{drawerDetail.id}
              </span>
              <StatusTag
                status={drawerDetail.status}
                label={t(`status.${drawerDetail.status}`)}
              />
            </Space>
          ) : (
            t('sessions.detailTitle')
          )
        }
        open={drawerId != null}
        onClose={() => setDrawerId(null)}
        width="min(480px, 100vw)"
        loading={drawerId != null && !drawerDetail}
      >
        {drawerDetail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {drawerLive && <Alert type="info" showIcon message={t('sessions.liveNote')} />}

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('common.table')}>
                {drawerDetail.table
                  ? `${drawerDetail.table.name} · №${drawerDetail.table.number}`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.customer')}>
                {drawerDetail.customerName || t('sessions.anonymous')}
              </Descriptions.Item>
              {drawerDetail.customerPhone && (
                <Descriptions.Item label={t('common.phone')}>
                  {drawerDetail.customerPhone}
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t('sessions.startTime')}>
                {dayjs(drawerDetail.startTime).format('DD.MM.YYYY HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label={t('sessions.endTime')}>
                {drawerDetail.endTime ? (
                  dayjs(drawerDetail.endTime).format('DD.MM.YYYY HH:mm')
                ) : (
                  <StatusTag
                    status={drawerDetail.status}
                    label={t(`status.${drawerDetail.status}`)}
                  />
                )}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.duration')}>
                {drawerLive ? (
                  <ElapsedTime
                    from={drawerDetail.startTime}
                    computeMs={(now) => sessionElapsedMs(drawerDetail, now + offsetMs)}
                    paused={drawerDetail.status === 'paused'}
                    style={{ fontSize: 13, color: TOKENS.color.neonGreen }}
                  />
                ) : (
                  <span className="timer-display" style={{ fontSize: 13 }}>
                    {completedDuration(drawerDetail)}
                  </span>
                )}
              </Descriptions.Item>
              {drawerDetail.status === 'completed' && (
                <Descriptions.Item label={t('sessions.payState')}>
                  {drawerDetail.isPaid ? (
                    <StatusTag status="paid" label={t('status.paid')} />
                  ) : (
                    <StatusTag status="debt" label={t('status.debt')} />
                  )}
                </Descriptions.Item>
              )}
              {drawerDetail.notes && (
                <Descriptions.Item label={t('common.notes')}>
                  {drawerDetail.notes}
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Stol segmentlari — ko'chirishlar bo'lgandagina ko'rsatiladi */}
            {(drawerDetail.segments?.length ?? 0) > 1 && (
              <div>
                <Title level={5}>{t('sessions.segments')}</Title>
                {renderSegments(drawerDetail)}
              </div>
            )}

            {/* To'lov cheki */}
            {renderReceipt(drawerDetail)}

            <div>
              <Title level={5}>{t('sessions.barOrders')}</Title>
              {orderItems.length > 0 ? (
                <Table
                  rowKey="id"
                  columns={itemColumns}
                  dataSource={orderItems}
                  size="small"
                  pagination={false}
                />
              ) : (
                <Text type="secondary">{t('sessions.noBarOrders')}</Text>
              )}
            </div>
          </Space>
        )}
      </Drawer>
    </PageTransition>
  );
};

export default Sessions;
