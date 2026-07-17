import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Card,
  Col,
  Descriptions,
  Drawer,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, sessionsApi } from '../api';
import { SESSION_STATUS_COLORS } from '../constants';
import type { OrderItem, Session, SessionStatus } from '../types';
import { formatDuration, formatMoney, formatNumber } from '../utils/format';
import { sessionElapsedMs } from '../utils/session';

const { Title, Text } = Typography;

const STATUS_OPTIONS: SessionStatus[] = ['active', 'paused', 'completed', 'cancelled'];
const DEFAULT_PAGE_SIZE = 10;

interface FetchParams {
  page: number;
  pageSize: number;
  status: SessionStatus | 'all';
  search: string;
}

/** Faqat o'qish uchun sahifa — o'yin yakunlash Stollar sahifasida */
const Sessions = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [status, setStatus] = useState<SessionStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<Session | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
      } finally {
        setLoading(false);
      }
    },
    [message, t],
  );

  useEffect(() => {
    void fetchSessions({ page: 1, pageSize: DEFAULT_PAGE_SIZE, status: 'all', search: '' });
  }, [fetchSessions]);

  // Faol o'yinlar davomiyligi jonli ko'rinishi uchun yengil tik
  const hasLive = sessions.some((s) => s.status === 'active' || s.status === 'paused');
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasLive) return;
    const id = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, [hasLive]);

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

  const openDetail = async (record: Session) => {
    setDrawerOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await sessionsApi.detail(record.id);
      setDetail(res.data);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setDetailLoading(false);
    }
  };

  const durationText = (s: Session): string => {
    if (s.status === 'active' || s.status === 'paused') {
      const minutes = Math.floor(sessionElapsedMs(s) / 60_000);
      return formatDuration(minutes, t('common.hours'), t('common.minutes'));
    }
    if (s.durationMinutes == null) return '—';
    return formatDuration(s.durationMinutes, t('common.hours'), t('common.minutes'));
  };

  const columns: ColumnsType<Session> = [
    {
      title: t('common.table'),
      key: 'table',
      render: (_, s) => (
        <Space direction="vertical" size={0}>
          <Text strong>{s.table?.name ?? '—'}</Text>
          {s.table && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              №{s.table.number}
            </Text>
          )}
        </Space>
      ),
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
      width: 160,
      render: (_, s) =>
        s.status === 'active' || s.status === 'paused' ? (
          <Tag color={SESSION_STATUS_COLORS[s.status]}>{durationText(s)}</Tag>
        ) : (
          durationText(s)
        ),
    },
    {
      title: t('sessions.amount'),
      key: 'amount',
      width: 200,
      render: (_, s) => (
        <Space direction="vertical" size={0}>
          <Text strong>{formatMoney(s.totalAmount, t('common.sum'))}</Text>
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
      width: 130,
      render: (s: SessionStatus) => (
        <Tag color={SESSION_STATUS_COLORS[s]}>{t(`status.${s}`)}</Tag>
      ),
    },
    {
      title: t('sessions.payState'),
      key: 'payState',
      width: 120,
      render: (_, s) => {
        if (s.status !== 'completed') return '—';
        return (
          <Tag color={s.isPaid ? 'green' : 'red'}>
            {s.isPaid ? t('status.paid') : t('status.debt')}
          </Tag>
        );
      },
    },
  ];

  const orderItems: OrderItem[] = (detail?.orders ?? []).flatMap((o) => o.items ?? []);

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
      render: (v: number) => formatNumber(v),
    },
    {
      title: t('common.total'),
      dataIndex: 'subtotal',
      width: 110,
      align: 'right',
      render: (v: number) => formatNumber(v),
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
            <HistoryOutlined /> {t('sessions.title')}
          </Title>
          <Text type="secondary">{t('sessions.subtitle')}</Text>
        </div>
      </div>

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

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={sessions}
          loading={loading}
          onRow={(record) => ({
            onClick: () => void openDetail(record),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
              void fetchSessions({ page: p, pageSize: ps, status, search });
            },
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* Tafsilotlar draweri */}
      <Drawer
        title={
          detail ? (
            <Space>
              <span>
                {t('sessions.detailTitle')} #{detail.id}
              </span>
              <Tag color={SESSION_STATUS_COLORS[detail.status]}>{t(`status.${detail.status}`)}</Tag>
            </Space>
          ) : (
            t('sessions.detailTitle')
          )
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        loading={detailLoading}
      >
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('common.table')}>
                {detail.table ? `${detail.table.name} · №${detail.table.number}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.customer')}>
                {detail.customerName || t('sessions.anonymous')}
              </Descriptions.Item>
              {detail.customerPhone && (
                <Descriptions.Item label={t('common.phone')}>
                  {detail.customerPhone}
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t('sessions.startTime')}>
                {dayjs(detail.startTime).format('DD.MM.YYYY HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label={t('sessions.endTime')}>
                {detail.endTime ? (
                  dayjs(detail.endTime).format('DD.MM.YYYY HH:mm')
                ) : (
                  <Tag color={SESSION_STATUS_COLORS[detail.status]}>
                    {t(`status.${detail.status}`)}
                  </Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.duration')}>
                {durationText(detail)}
              </Descriptions.Item>
              <Descriptions.Item label={t('sessions.tableAmount')}>
                {formatMoney(detail.tableAmount, t('common.sum'))}
              </Descriptions.Item>
              <Descriptions.Item label={t('sessions.barAmount')}>
                {formatMoney(detail.barAmount, t('common.sum'))}
              </Descriptions.Item>
              <Descriptions.Item label={t('sessions.totalAmount')}>
                <Text strong>{formatMoney(detail.totalAmount, t('common.sum'))}</Text>
              </Descriptions.Item>
              {detail.paymentMethod && (
                <Descriptions.Item label={t('payment.method')}>
                  <Tag color="blue">{t(`payment.${detail.paymentMethod}`)}</Tag>
                </Descriptions.Item>
              )}
              {detail.status === 'completed' && (
                <Descriptions.Item label={t('sessions.payState')}>
                  <Tag color={detail.isPaid ? 'green' : 'red'}>
                    {detail.isPaid ? t('status.paid') : t('status.debt')}
                  </Tag>
                </Descriptions.Item>
              )}
              {detail.notes && (
                <Descriptions.Item label={t('common.notes')}>{detail.notes}</Descriptions.Item>
              )}
            </Descriptions>

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
    </div>
  );
};

export default Sessions;
