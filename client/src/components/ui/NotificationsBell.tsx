import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Dropdown, Spin, Typography } from 'antd';
import { BellOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { notificationsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { TOKENS } from '../../theme/tokens';
import type { ClubNotification } from '../../types';

dayjs.extend(relativeTime);

const { Text } = Typography;

/** Yangi xabarlarni tekshirish oralig'i (ms) */
const POLL_INTERVAL_MS = 60_000;
/** Dropdown da ko'rsatiladigan so'nggi xabarlar soni */
const PREVIEW_LIMIT = 5;

/**
 * Header uchun xabarnoma qo'ng'irog'i: o'qilmaganlar soni badge da,
 * dropdown da so'nggi 5 ta xabar va sahifaga havola. Server endpointi
 * faqat klub egasi (admin) uchun — boshqa rollarda render qilinmaydi.
 */
const NotificationsBell = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<ClubNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const isAdmin = user?.role === 'admin';

  const poll = useCallback(async (withSpinner = false) => {
    if (withSpinner) setLoading(true);
    try {
      const res = await notificationsApi.list({ page: 1, limit: PREVIEW_LIMIT });
      setItems(res.data);
      setUnreadCount(res.unreadCount ?? 0);
    } catch {
      // Fon so'rovi — xato jimgina o'tkaziladi (keyingi tsiklda qayta uriniladi)
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void poll();
    const interval = setInterval(() => {
      // Yashirin varaqda tarmoqni band qilmaymiz
      if (document.visibilityState === 'visible') void poll();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAdmin, poll]);

  if (!isAdmin) return null;

  const goToPage = () => {
    setOpen(false);
    navigate('/notifications');
  };

  const handleItemClick = (item: ClubNotification) => {
    if (!item.readAt) {
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      // Sahifaga o'tishni kutmasdan belgilab qo'yamiz; xato — keyingi poll tuzatadi
      notificationsApi.read(item.id).catch(() => undefined);
    }
    goToPage();
  };

  const popup = (
    <div
      style={{
        width: 320,
        maxWidth: 'calc(100vw - 24px)',
        background: TOKENS.color.bg.bg2,
        border: `1px solid ${TOKENS.color.border.base}`,
        borderRadius: TOKENS.radius.md,
        boxShadow: TOKENS.shadow.level2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${TOKENS.color.border.subtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text strong>{t('notifications.bellTitle')}</Text>
        {unreadCount > 0 && (
          <Text style={{ color: TOKENS.color.gold.base, fontSize: 12.5, fontWeight: 600 }}>
            {t('notifications.unreadCount')}: <span className="tabular-nums">{unreadCount}</span>
          </Text>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: '20px 14px', textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t('notifications.bellEmpty')}
          </Text>
        </div>
      ) : (
        <div>
          {items.map((item) => {
            const unread = !item.readAt;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'start',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${TOKENS.color.border.subtle}`,
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {unread && (
                    <span
                      aria-hidden
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: TOKENS.color.gold.base,
                        boxShadow: `0 0 6px ${TOKENS.color.gold.base}`,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <Text
                    strong={unread}
                    ellipsis
                    style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}
                  >
                    {item.title}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {dayjs(item.createdAt).fromNow()}
                  </Text>
                </span>
                <Text
                  type="secondary"
                  ellipsis
                  style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}
                >
                  {item.body}
                </Text>
              </button>
            );
          })}
        </div>
      )}

      <Button type="text" block onClick={goToPage} style={{ borderRadius: 0, color: TOKENS.color.gold.base }}>
        {t('notifications.bellViewAll')} <RightOutlined style={{ fontSize: 11 }} />
      </Button>
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void poll(true);
      }}
      trigger={['click']}
      placement="bottomRight"
      popupRender={() => popup}
    >
      <Badge
        count={unreadCount}
        size="small"
        offset={[-4, 4]}
        style={{ backgroundColor: TOKENS.color.gold.base, color: TOKENS.color.gold.contrast }}
      >
        <Button type="text" icon={<BellOutlined />} aria-label={t('notifications.bellTitle')} />
      </Badge>
    </Dropdown>
  );
};

export default NotificationsBell;
