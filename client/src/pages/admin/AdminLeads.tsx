import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Grid,
  Input,
  Modal,
  Pagination,
  Select,
  Table,
  Tabs,
  Typography,
} from 'antd';
import { PhoneOutlined, ReloadOutlined, SolutionOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslation } from 'react-i18next';
import { adminLeadsApi, errorMessage } from '../../api';
import { EmptyState, PageHeader, PageTransition, StatusTag } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type { Lead, LeadStatus } from '../../types';
import './admin-workspace.css';

dayjs.extend(relativeTime);

const { Text, Paragraph } = Typography;

const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'converted', 'rejected'];

/** Ariza holati -> StatusTag semantik kaliti */
const LEAD_TAG: Record<LeadStatus, string> = {
  new: 'unread',
  contacted: 'info',
  converted: 'success',
  rejected: 'default',
};

type TabKey = 'all' | LeadStatus;

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/**
 * Landing arizalari (superadmin) — "bepul konsultatsiya" formasidan kelgan
 * potensial mijozlar: holat bo'yicha tablar, qidiruv, tezkor qo'ng'iroq,
 * holatni o'zgartirish va ichki izoh. Telefonda jadval o'rniga kartalar.
 */
const AdminLeads = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const compact = screens.md === false;

  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<Lead[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [detail, setDetail] = useState<Lead | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  // `t` yuklash callbackining bog'liqligi EMAS — til almashganda ro'yxat qayta yuklanmasin
  const tRef = useRef(t);
  tRef.current = t;

  const fetchList = useCallback(
    async (params: { page: number; pageSize: number; tab: TabKey; search: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminLeadsApi.list({
          status: params.tab === 'all' ? undefined : params.tab,
          search: params.search.trim() || undefined,
          page: params.page,
          limit: params.pageSize,
        });
        setList(res.data);
        setTotal(res.pagination?.total ?? res.data.length);
        setTotals(res.totals ?? {});
      } catch (err) {
        setError(errorMessage(err, tRef.current('common.error')));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchList({ page: 1, pageSize: 20, tab: 'all', search: '' });
  }, [fetchList]);

  const reload = (overrides?: Partial<{ page: number; pageSize: number; tab: TabKey; search: string }>) =>
    void fetchList({ page, pageSize, tab, search, ...overrides });

  const update = async (lead: Lead, body: { status?: LeadStatus; note?: string }) => {
    setSavingId(lead.id);
    try {
      const res = await adminLeadsApi.update(lead.id, body);
      setList((prev) => prev.map((row) => (row.id === lead.id ? res.data : row)));
      setDetail((prev) => (prev && prev.id === lead.id ? res.data : prev));
      message.success(t('admin.leads.saved'));
      // Holat o'zgarsa tab hisoblagichlari ham yangilansin
      if (body.status && body.status !== lead.status) reload();
      return true;
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const openDetail = (lead: Lead) => {
    setDetail(lead);
    setNoteDraft(lead.note ?? '');
  };

  const statusSelect = (lead: Lead, width: number | string = 170) => (
    <Select<LeadStatus>
      size="middle"
      value={lead.status}
      style={{ width }}
      loading={savingId === lead.id}
      disabled={savingId === lead.id}
      onChange={(status) => void update(lead, { status })}
      onClick={(e) => e.stopPropagation()}
      options={LEAD_STATUSES.map((s) => ({
        value: s,
        label: <StatusTag status={LEAD_TAG[s]} label={t(`admin.leads.status_${s}`)} />,
      }))}
    />
  );

  const clubLine = (lead: Lead) =>
    [lead.clubName, lead.tablesCount ? t('admin.leads.tables', { n: lead.tablesCount }) : null]
      .filter(Boolean)
      .join(' · ');

  const columns: ColumnsType<Lead> = [
    {
      title: t('admin.leads.colDate'),
      dataIndex: 'createdAt',
      width: 150,
      render: (v: string) => (
        <div>
          <div>{dayjs(v).format('DD.MM.YYYY HH:mm')}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(v).fromNow()}
          </Text>
        </div>
      ),
    },
    {
      title: t('admin.leads.colName'),
      dataIndex: 'name',
      render: (_: string, lead) => (
        <div style={{ minWidth: 0 }}>
          <Text strong>{lead.name}</Text>
          {lead.lang && (
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              {lead.lang.toUpperCase()}
            </Text>
          )}
          {clubLine(lead) && (
            <div>
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                {clubLine(lead)}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('admin.leads.colPhone'),
      dataIndex: 'phone',
      width: 190,
      render: (phone: string) => (
        <a href={telHref(phone)} onClick={(e) => e.stopPropagation()} className="tabular-nums">
          <PhoneOutlined style={{ marginRight: 6 }} />
          {phone}
        </a>
      ),
    },
    {
      title: t('admin.leads.colMessage'),
      dataIndex: 'message',
      ellipsis: true,
      render: (_: string | null, lead) => (
        <Text type={lead.message ? undefined : 'secondary'}>{lead.message || lead.note || '—'}</Text>
      ),
    },
    {
      title: t('admin.leads.colStatus'),
      dataIndex: 'status',
      width: 190,
      render: (_: LeadStatus, lead) => statusSelect(lead),
    },
  ];

  const tabItems = (['all', ...LEAD_STATUSES] as TabKey[]).map((key) => ({
    key,
    label: `${key === 'all' ? t('admin.leads.tab_all') : t(`admin.leads.status_${key}`)} (${totals[key] ?? 0})`,
  }));

  return (
    <PageTransition>
      <PageHeader
        icon={<SolutionOutlined />}
        title={t('admin.leads.title')}
        subtitle={t('admin.leads.subtitle')}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
            {t('btn.refresh')}
          </Button>
        }
      />

      <Card styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          activeKey={tab}
          items={tabItems}
          onChange={(key) => {
            const next = key as TabKey;
            setTab(next);
            setPage(1);
            reload({ tab: next, page: 1 });
          }}
        />
        <Input.Search
          allowClear
          placeholder={t('admin.leads.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(value) => {
            setPage(1);
            reload({ search: value, page: 1 });
          }}
          style={{ maxWidth: 420, marginBottom: 16 }}
        />

        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" onClick={() => reload()}>
                {t('admin.retry')}
              </Button>
            }
          />
        )}

        {!loading && list.length === 0 && !error ? (
          <EmptyState
            icon={<SolutionOutlined />}
            title={t('admin.leads.empty')}
            hint={t('admin.leads.emptyHint')}
          />
        ) : compact ? (
          /* Telefonda — kartalar: qo'ng'iroq tugmasi barmoq ostida */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {list.map((lead) => (
              <div
                key={lead.id}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(lead)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openDetail(lead);
                }}
                style={{
                  border: `1px solid ${TOKENS.color.border.base}`,
                  borderLeft: `3px solid ${lead.status === 'new' ? TOKENS.color.gold.base : TOKENS.color.border.strong}`,
                  borderRadius: 12,
                  padding: 14,
                  background: TOKENS.color.bg.bg1,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Text strong>{lead.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {dayjs(lead.createdAt).fromNow()}
                  </Text>
                </div>
                {clubLine(lead) && (
                  <Text type="secondary" style={{ fontSize: 12.5 }}>
                    {clubLine(lead)}
                  </Text>
                )}
                {lead.message && (
                  <Paragraph ellipsis={{ rows: 2 }} style={{ margin: '8px 0 0', fontSize: 13 }}>
                    {lead.message}
                  </Paragraph>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                  <Button type="primary" icon={<PhoneOutlined />} href={telHref(lead.phone)} style={{ flex: 1 }}>
                    {lead.phone}
                  </Button>
                  {statusSelect(lead, '46%')}
                </div>
              </div>
            ))}
            {total > pageSize && (
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                size="small"
                onChange={(p, size) => {
                  setPage(p);
                  setPageSize(size);
                  reload({ page: p, pageSize: size });
                }}
                style={{ textAlign: 'center' }}
              />
            )}
          </div>
        ) : (
          <Table<Lead>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={list}
            onRow={(lead) => ({ onClick: () => openDetail(lead), style: { cursor: 'pointer' } })}
            rowClassName={(lead) => (lead.status === 'new' ? 'lead-row-new' : '')}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              onChange: (p, size) => {
                setPage(p);
                setPageSize(size);
                reload({ page: p, pageSize: size });
              },
            }}
          />
        )}
      </Card>

      <Modal
        open={!!detail}
        title={detail?.name}
        onCancel={() => setDetail(null)}
        destroyOnClose
        footer={[
          <Button key="call" icon={<PhoneOutlined />} href={detail ? telHref(detail.phone) : undefined}>
            {t('admin.leads.call')}
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={!!detail && savingId === detail.id}
            onClick={async () => {
              if (detail && (await update(detail, { note: noteDraft }))) setDetail(null);
            }}
          >
            {t('admin.leads.save')}
          </Button>,
        ]}
      >
        {detail && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label={t('admin.leads.colPhone')}>
                <a href={telHref(detail.phone)}>{detail.phone}</a>
              </Descriptions.Item>
              {clubLine(detail) && (
                <Descriptions.Item label={t('admin.leads.colClub')}>{clubLine(detail)}</Descriptions.Item>
              )}
              {detail.lang && (
                <Descriptions.Item label={t('admin.leads.lang')}>{detail.lang.toUpperCase()}</Descriptions.Item>
              )}
              <Descriptions.Item label={t('admin.leads.received')}>
                {dayjs(detail.createdAt).format('DD.MM.YYYY HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label={t('admin.leads.colStatus')}>{statusSelect(detail)}</Descriptions.Item>
            </Descriptions>
            {detail.message && (
              <Paragraph
                style={{
                  background: TOKENS.color.bg.bg1,
                  border: `1px solid ${TOKENS.color.border.base}`,
                  borderRadius: 10,
                  padding: 12,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {detail.message}
              </Paragraph>
            )}
            <Text strong>{t('admin.leads.note')}</Text>{' '}
            <Text type="secondary" style={{ fontSize: 12 }}>
              ({t('admin.leads.noteHint')})
            </Text>
            <Input.TextArea
              rows={4}
              maxLength={2000}
              showCount
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={t('admin.leads.notePh')}
              style={{ marginTop: 8 }}
            />
          </>
        )}
      </Modal>
    </PageTransition>
  );
};

export default AdminLeads;
