import { useCallback, useEffect, useState } from 'react';
import { Alert, App, Badge, Button, Card, List, Tooltip, Typography } from 'antd';
import { BellOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { errorMessage, notificationsApi } from '../api';
import { EmptyState, PageHeader, PageTransition, StatusTag } from '../components/ui';
import { TOKENS } from '../theme/tokens';
import type { ClubNotification } from '../types';

dayjs.extend(relativeTime);

const { Text, Paragraph } = Typography;

/** Xabarnoma turi -> StatusTag palitra kaliti ('busy' = oltin, nuqtasiz) */
const TYPE_TAG_KEY: Record<string, string> = {
  info: 'info',
  warning: 'warning',
  promo: 'busy',
  maintenance: 'error',
};

const KNOWN_TYPES = new Set(['info', 'warning', 'promo', 'maintenance']);

const Notifications = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const reduceMotion = useReducedMotion();

  const [items, setItems] = useState<ClubNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [readingAll, setReadingAll] = useState(false);
  const pageSize = 15;

  const fetchList = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await notificationsApi.list({ page: nextPage, limit: pageSize });
        setItems(res.data);
        setUnreadCount(res.unreadCount ?? 0);
        setTotal(res.pagination?.total ?? 0);
      } catch (err) {
        setLoadError(true);
        message.error(errorMessage(err, t('common.error')));
      } finally {
        setLoading(false);
      }
    },
    [message, t],
  );

  useEffect(() => {
    void fetchList(1);
  }, [fetchList]);

  /** Bosilganda o'qilgan deb belgilash (optimistik yangilash) */
  const markRead = async (notification: ClubNotification) => {
    if (notification.readAt) return;
    const readAt = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => (item.id === notification.id ? { ...item, readAt } : item)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await notificationsApi.read(notification.id);
    } catch (err) {
      // Optimistik holatni qaytaramiz
      setItems((prev) =>
        prev.map((item) => (item.id === notification.id ? { ...item, readAt: null } : item)),
      );
      setUnreadCount((prev) => prev + 1);
      message.error(errorMessage(err, t('common.error')));
    }
  };

  const readAll = async () => {
    setReadingAll(true);
    try {
      const res = await notificationsApi.readAll();
      message.success(res.message);
      void fetchList(page);
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setReadingAll(false);
    }
  };

  return (
    <PageTransition>
      <PageHeader
        icon={<BellOutlined />}
        title={
          <span>
            {t('notifications.title')}
            {unreadCount > 0 && (
              <Badge
                count={unreadCount}
                style={{ marginInlineStart: 10, backgroundColor: TOKENS.color.gold.base, color: TOKENS.color.gold.contrast }}
              />
            )}
          </span>
        }
        subtitle={t('notifications.subtitle')}
        extra={
          <>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void fetchList(page)}
              aria-label={t('btn.refresh')}
            />
            <Button
              icon={<CheckOutlined />}
              disabled={unreadCount === 0}
              loading={readingAll}
              onClick={() => void readAll()}
            >
              {t('notifications.readAll')}
            </Button>
          </>
        }
      />

      {loadError && !loading && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: TOKENS.spacing.md }}
          message={t('common.error')}
          action={
            <Button size="small" onClick={() => void fetchList(page)}>
              {t('btn.refresh')}
            </Button>
          }
        />
      )}

      <Card>
        <List
          loading={loading}
          dataSource={items}
          locale={{
            emptyText: (
              <EmptyState
                icon={<BellOutlined />}
                title={t('notifications.emptyTitle')}
                hint={t('notifications.emptyHint')}
              />
            ),
          }}
          pagination={
            total > pageSize
              ? {
                  current: page,
                  pageSize,
                  total,
                  onChange: (p) => {
                    setPage(p);
                    void fetchList(p);
                  },
                }
              : false
          }
          renderItem={(item, index) => {
            const unread = !item.readAt;
            const typeKey = KNOWN_TYPES.has(item.type) ? item.type : 'info';
            return (
              <List.Item key={item.id} style={{ padding: 0, border: 'none', marginBottom: TOKENS.spacing.xs }}>
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: TOKENS.motion.duration.base,
                    ease: TOKENS.motion.easing.out,
                    delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.3),
                  }}
                  style={{ width: '100%' }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void markRead(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') void markRead(item);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: TOKENS.radius.sm,
                      cursor: unread ? 'pointer' : 'default',
                      background: unread ? TOKENS.color.bg.bg2 : 'transparent',
                      border: `1px solid ${unread ? TOKENS.color.gold.line : TOKENS.color.border.subtle}`,
                      borderInlineStart: unread
                        ? `3px solid ${TOKENS.color.gold.base}`
                        : `1px solid ${TOKENS.color.border.subtle}`,
                      transition: `background ${TOKENS.motion.duration.fast}s ${TOKENS.motion.easing.cssOut}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: TOKENS.spacing.xs,
                      }}
                    >
                      <Text strong={unread} style={{ flex: '1 1 auto', minWidth: 0 }}>
                        {item.title}
                      </Text>
                      {unread && (
                        <StatusTag status="warning" label={t('notifications.newBadge')} dot />
                      )}
                      <StatusTag
                        status={TYPE_TAG_KEY[typeKey]}
                        label={t(`notifications.type.${typeKey}`)}
                        dot={false}
                      />
                      <Tooltip title={dayjs(item.createdAt).format('DD.MM.YYYY HH:mm')}>
                        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {dayjs(item.createdAt).fromNow()}
                        </Text>
                      </Tooltip>
                    </div>
                    <Paragraph
                      type={unread ? undefined : 'secondary'}
                      style={{ margin: '6px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}
                      ellipsis={{ rows: 3, expandable: true, symbol: '…' }}
                    >
                      {item.body}
                    </Paragraph>
                  </div>
                </motion.div>
              </List.Item>
            );
          }}
        />
      </Card>
    </PageTransition>
  );
};

export default Notifications;
