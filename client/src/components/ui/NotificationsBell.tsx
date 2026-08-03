import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Dropdown, Spin, Typography } from 'antd';
import { BellOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { notificationsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { NOTIFICATION_TAG_KEY } from '../../constants';
import { TOKENS } from '../../theme/tokens';
import type { ClubNotification, ClubNotificationType } from '../../types';
import { normalizeMessageBody } from '../../utils/format';
import StatusTag from './StatusTag';

dayjs.extend(relativeTime);

const { Text } = Typography;

/** Dropdown da ko'rsatiladigan so'nggi xabarlar soni */
const PREVIEW_LIMIT = 5;

const KNOWN_TYPES = new Set<string>(['info', 'warning', 'promo', 'maintenance']);

/**
 * Header uchun xabarnoma qo'ng'irog'i: o'qilmaganlar soni badge da,
 * dropdown da so'nggi 5 ta xabar va sahifaga havola.
 *
 * O'qilmaganlar soni NotificationsContext dan olinadi — sahifada qilingan
 * o'zgarish shu zahoti badge'da ko'rinadi. Server endpointi faqat klub egasi
 * (admin) uchun, shu sababli boshqa rollarda umuman render qilinmaydi.
 */
const NotificationsBell = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { unreadCount, syncUnread, bump, version } = useNotifications();
  const navigate = useNavigate();

  const [items, setItems] = useState<ClubNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const isAdmin = user?.role === 'admin';

  const loadPreview = useCallback(async (withSpinner = false) => {
    if (withSpinner) setLoading(true);
    try {
      const res = await notificationsApi.list({ page: 1, limit: PREVIEW_LIMIT });
      setItems(res.data);
    } catch {
      // Fon so'rovi — xato jimgina o'tkaziladi (keyingi tsiklda qayta uriniladi)
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  // Kontekst polling tsikli `version` ni oshiradi — ro'yxat shunga ergashadi
  useEffect(() => {
    if (!isAdmin) return;
    void loadPreview();
  }, [isAdmin, loadPreview, version]);

  if (!isAdmin) return null;

  const goToPage = (id?: number) => {
    setOpen(false);
    navigate(id ? `/notifications?id=${id}` : '/notifications');
  };

  const handleItemClick = (item: ClubNotification) => {
    if (!item.readAt) {
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      syncUnread(Math.max(0, unreadCount - 1));
      // Sahifaga o'tishni kutmasdan belgilab qo'yamiz; xato — keyingi poll tuzatadi
      notificationsApi
        .read(item.id)
        .then((res) => {
          syncUnread(res.unreadCount);
          bump();
        })
        .catch(() => undefined);
    }
    // Chuqur havola: xabar birinchi sahifada bo'lmasa ham sahifa uni ochadi
    goToPage(item.id);
  };

  const popup = (
    <div
      style={{
        width: 340,
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
          gap: 8,
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
            const typeKey = KNOWN_TYPES.has(item.type) ? item.type : 'info';
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
                  background: unread ? TOKENS.color.bg.bg3 : 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${TOKENS.color.border.subtle}`,
                  borderInlineStart: unread
                    ? `3px solid ${TOKENS.color.gold.base}`
                    : '3px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Text strong={unread} ellipsis style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                    {item.title}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {dayjs(item.createdAt).fromNow()}
                  </Text>
                </span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 4,
                    minWidth: 0,
                  }}
                >
                  <StatusTag
                    status={NOTIFICATION_TAG_KEY[typeKey as ClubNotificationType]}
                    label={t(`notifications.type.${typeKey}`)}
                    dot={false}
                    style={{ fontSize: 11, padding: '0 7px', lineHeight: '17px' }}
                  />
                  <Text
                    type="secondary"
                    ellipsis
                    style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}
                  >
                    {normalizeMessageBody(item.body).replace(/\n+/g, ' ')}
                  </Text>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Button
        type="text"
        block
        onClick={() => goToPage()}
        style={{ borderRadius: 0, color: TOKENS.color.gold.base }}
      >
        {t('notifications.bellViewAll')} <RightOutlined style={{ fontSize: 11 }} />
      </Button>
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadPreview(true);
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
