import { useCallback, useEffect, useRef, useState } from 'react';
import {
  App,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  InboxOutlined,
  MessageOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { adminFeedbackApi, errorMessage } from '../../api';
import AttachmentThumbs from '../../components/ui/AttachmentThumbs';
import { EmptyState, PageHeader, PageTransition, StatusTag } from '../../components/ui';
import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from '../../constants';
import { TOKENS } from '../../theme/tokens';
import type { Feedback, FeedbackPriority, FeedbackStatus, FeedbackType } from '../../types';
import { formatNumber } from '../../utils/format';
import ClubSelect from './ClubSelect';

const { Text, Paragraph } = Typography;

/** Fikr holati -> StatusTag semantik kaliti */
const FEEDBACK_TAG_STATUS: Record<FeedbackStatus, string> = {
  unread: 'error',
  read: 'info',
  resolved: 'success',
  rejected: 'default',
};

/** Fikr turi -> StatusTag semantik kaliti */
const FEEDBACK_TYPE_TAG: Record<FeedbackType, string> = {
  suggestion: 'info',
  complaint: 'warning',
  bug: 'error',
  feature: 'success',
};

const PRIORITY_TAG: Record<FeedbackPriority, string> = {
  low: 'default',
  medium: 'warning',
  high: 'error',
};

type StatusTabKey = 'all' | FeedbackStatus;

/**
 * Fikr-mulohaza markazi (superadmin) — kiruvchi taklif/shikoyat/xatolik
 * xabarlari: holat filtri tablari, batafsil drawer (xabar + biriktirmalar),
 * holat o'zgartirish va javob yozish.
 */
const AdminFeedback = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [statusTab, setStatusTab] = useState<StatusTabKey>('all');
  const [typeFilter, setTypeFilter] = useState<FeedbackType | undefined>(undefined);
  const [clubFilter, setClubFilter] = useState<number | undefined>(undefined);
  const [list, setList] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [unreadCount, setUnreadCount] = useState(0);

  const [detail, setDetail] = useState<Feedback | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySaving, setReplySaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  // Hozir ochiq yozuv IDsi — kech kelgan javob boshqa yozuvni bosib ketmasin
  const activeIdRef = useRef<number | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await adminFeedbackApi.list({ status: 'unread', limit: 1 });
      setUnreadCount(res.pagination?.total ?? 0);
    } catch {
      // Hisoblagich ikkilamchi — xatoda jim qolamiz
    }
  }, []);

  const fetchList = useCallback(
    async (params: {
      page: number;
      pageSize: number;
      status: StatusTabKey;
      type?: FeedbackType;
      clubId?: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminFeedbackApi.list({
          status: params.status === 'all' ? undefined : params.status,
          type: params.type,
          clubId: params.clubId,
          page: params.page,
          limit: params.pageSize,
        });
        setList(res.data);
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
    void fetchList({ page: 1, pageSize: 20, status: 'all' });
    void fetchUnreadCount();
  }, [fetchList, fetchUnreadCount]);

  const refresh = useCallback(() => {
    void fetchList({ page, pageSize, status: statusTab, type: typeFilter, clubId: clubFilter });
    void fetchUnreadCount();
  }, [fetchList, fetchUnreadCount, page, pageSize, statusTab, typeFilter, clubFilter]);

  const openDetail = async (row: Feedback) => {
    const id = row.id;
    activeIdRef.current = id;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setReplyText('');
    try {
      // Ochilganda server unread -> read ga avtomatik o'tkazadi
      const res = await adminFeedbackApi.detail(id);
      // Bu orada boshqa yozuv ochilgan (yoki drawer yopilgan) bo'lsa — eskirgan javob
      if (activeIdRef.current !== id) return;
      setDetail(res.data);
      if (row.status === 'unread') refresh();
    } catch (err) {
      if (activeIdRef.current !== id) return;
      message.error(errorMessage(err, t('common.error')));
      setDetailOpen(false);
    } finally {
      if (activeIdRef.current === id) setDetailLoading(false);
    }
  };

  const handleStatusChange = async (status: FeedbackStatus) => {
    if (!detail) return;
    setStatusSaving(true);
    try {
      const res = await adminFeedbackApi.updateStatus(detail.id, status);
      message.success(res.message);
      setDetail(res.data);
      refresh();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setStatusSaving(false);
    }
  };

  const handleReply = async () => {
    if (!detail || !replyText.trim()) return;
    setReplySaving(true);
    try {
      const res = await adminFeedbackApi.reply(detail.id, replyText.trim());
      message.success(res.message);
      setDetail(res.data);
      setReplyText('');
      refresh();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setReplySaving(false);
    }
  };

  const columns: ColumnsType<Feedback> = [
    {
      title: t('admin.feedback.subject'),
      dataIndex: 'subject',
      ellipsis: true,
      render: (subject: string, row) => (
        <Space direction="vertical" size={0} style={{ maxWidth: '100%' }}>
          <Text strong={row.status === 'unread'} ellipsis style={{ maxWidth: 320 }}>
            {subject}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {row.club?.name ?? `#${row.clubId}`}
            {row.user?.name ? ` · ${row.user.name}` : ''}
          </Text>
        </Space>
      ),
    },
    {
      title: t('admin.feedback.type'),
      dataIndex: 'type',
      width: 130,
      render: (type: FeedbackType) => (
        <StatusTag status={FEEDBACK_TYPE_TAG[type]} label={t(`admin.feedback.type_${type}`)} />
      ),
    },
    {
      title: t('admin.feedback.priority'),
      dataIndex: 'priority',
      width: 110,
      responsive: ['md'],
      render: (p: FeedbackPriority) => (
        <StatusTag status={PRIORITY_TAG[p]} label={t(`admin.feedback.pr_${p}`)} />
      ),
    },
    {
      title: t('admin.feedback.status'),
      dataIndex: 'status',
      width: 130,
      render: (s: FeedbackStatus, row) => (
        <Space size={6}>
          <StatusTag
            status={FEEDBACK_TAG_STATUS[s]}
            label={t(`admin.feedback.st_${s}`)}
            dot={s === 'unread'}
          />
          {(row.attachments?.length ?? 0) > 0 && (
            <PaperClipOutlined style={{ color: TOKENS.color.text.tertiary }} />
          )}
        </Space>
      ),
    },
    {
      title: t('common.date'),
      dataIndex: 'createdAt',
      width: 140,
      render: (d: string) => dayjs(d).format('DD.MM.YYYY HH:mm'),
    },
  ];

  const tabItems = [
    {
      key: 'all',
      label: t('admin.feedback.tabAll'),
    },
    ...FEEDBACK_STATUSES.map((s) => ({
      key: s,
      label:
        s === 'unread' ? (
          <Badge count={unreadCount} size="small" offset={[8, -2]}>
            {t(`admin.feedback.st_${s}`)}
          </Badge>
        ) : (
          t(`admin.feedback.st_${s}`)
        ),
    })),
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<InboxOutlined />}
        title={t('admin.feedback.title')}
        subtitle={t('admin.feedback.subtitle')}
        extra={
          <Button icon={<ReloadOutlined />} aria-label={t('btn.refresh')} onClick={refresh} />
        }
      />

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
        <Tabs
          activeKey={statusTab}
          onChange={(key) => {
            const next = key as StatusTabKey;
            setStatusTab(next);
            setPage(1);
            void fetchList({
              page: 1,
              pageSize,
              status: next,
              type: typeFilter,
              clubId: clubFilter,
            });
          }}
          items={tabItems}
        />

        <Space wrap style={{ marginBottom: TOKENS.spacing.md }}>
          <Select
            allowClear
            placeholder={t('admin.feedback.typeFilter')}
            value={typeFilter}
            style={{ width: 180 }}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
              void fetchList({ page: 1, pageSize, status: statusTab, type: v, clubId: clubFilter });
            }}
            options={FEEDBACK_TYPES.map((type) => ({
              value: type,
              label: t(`admin.feedback.type_${type}`),
            }))}
          />
          <ClubSelect
            value={clubFilter}
            placeholder={t('admin.feedback.clubFilter')}
            style={{ width: 220 }}
            onChange={(v) => {
              setClubFilter(v);
              setPage(1);
              void fetchList({ page: 1, pageSize, status: statusTab, type: typeFilter, clubId: v });
            }}
          />
        </Space>

        <Table
          rowKey="id"
          size="small"
          sticky
          columns={columns}
          dataSource={list}
          loading={loading}
          onRow={(row) => ({
            onClick: () => void openDetail(row),
            style: { cursor: 'pointer' },
          })}
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
              void fetchList({
                page: nextPage,
                pageSize: ps,
                status: statusTab,
                type: typeFilter,
                clubId: clubFilter,
              });
            },
          }}
          scroll={{ x: 860 }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<InboxOutlined />}
                title={t('admin.feedback.empty')}
                hint={t('admin.feedback.emptyHint')}
              />
            ),
          }}
        />
      </Card>

      {/* Batafsil drawer */}
      <Drawer
        title={
          detail && (
            <Space size={10} wrap>
              <span>{detail.subject}</span>
              <StatusTag
                status={FEEDBACK_TAG_STATUS[detail.status]}
                label={t(`admin.feedback.st_${detail.status}`)}
              />
            </Space>
          )
        }
        open={detailOpen}
        onClose={() => {
          activeIdRef.current = null;
          setDetailOpen(false);
          setDetail(null);
        }}
        width="min(640px, 100vw)"
        loading={detailLoading}
      >
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap size={8}>
              <StatusTag
                status={FEEDBACK_TYPE_TAG[detail.type]}
                label={t(`admin.feedback.type_${detail.type}`)}
              />
              <StatusTag
                status={PRIORITY_TAG[detail.priority]}
                label={t(`admin.feedback.pr_${detail.priority}`)}
              />
              {detail.category && <Tag>{detail.category}</Tag>}
            </Space>

            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                {detail.club?.name ?? `#${detail.clubId}`}
                {detail.user?.name ? ` · ${detail.user.name}` : ''} ·{' '}
                {dayjs(detail.createdAt).format('DD.MM.YYYY HH:mm')}
              </Text>
            </div>

            <Card size="small" title={t('admin.feedback.message')}>
              <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                {detail.message}
              </Paragraph>
            </Card>

            {(detail.attachments?.length ?? 0) > 0 && (
              <Card size="small" title={t('admin.feedback.attachments')}>
                <Space wrap size={8}>
                  <AttachmentThumbs
                    ownerId={detail.id}
                    count={detail.attachments!.length}
                    fetcher={(index) => adminFeedbackApi.attachment(detail.id, index)}
                    alt={t('admin.feedback.attachments')}
                    size={96}
                  />
                </Space>
              </Card>
            )}

            <div>
              <Text type="secondary" style={{ fontSize: 13, marginRight: 8 }}>
                {t('admin.feedback.status')}:
              </Text>
              <Select
                value={detail.status}
                style={{ width: 200 }}
                loading={statusSaving}
                onChange={(v) => void handleStatusChange(v)}
                options={FEEDBACK_STATUSES.map((s) => ({
                  value: s,
                  label: t(`admin.feedback.st_${s}`),
                }))}
              />
            </div>

            <Divider style={{ margin: '4px 0' }} />

            {detail.reply && (
              <Card
                size="small"
                title={
                  <Space size={8}>
                    <MessageOutlined style={{ color: TOKENS.color.gold.base }} />
                    {t('admin.feedback.existingReply')}
                  </Space>
                }
              >
                <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 4 }}>
                  {detail.reply}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {detail.repliedBy?.name ?? t('role.superadmin')}
                  {detail.repliedAt
                    ? ` · ${dayjs(detail.repliedAt).format('DD.MM.YYYY HH:mm')}`
                    : ''}
                </Text>
              </Card>
            )}

            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                {t('admin.feedback.reply')}
              </Text>
              <Input.TextArea
                rows={3}
                maxLength={5000}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={t('admin.feedback.replyPlaceholder')}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={replySaving}
                disabled={!replyText.trim()}
                onClick={() => void handleReply()}
                style={{ marginTop: 10 }}
              >
                {t('admin.feedback.sendReply')}
              </Button>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 6 }}>
                {t('admin.feedback.replyHint')}
              </Text>
            </div>
          </Space>
        )}
      </Drawer>
    </PageTransition>
  );
};

export default AdminFeedback;
