import { useEffect, useState } from 'react';
import { Button, Space, Typography } from 'antd';
import {
  CloudSyncOutlined,
  DisconnectOutlined,
  ExclamationCircleOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useConnection } from '../../context/ConnectionContext';
import { applyUpdate, onUpdateReady } from '../../offline/register-sw';
import { TOKENS } from '../../theme/tokens';
import OfflineQueueDrawer from './OfflineQueueDrawer';

const { Text } = Typography;

/** HH:MM — oxirgi sinxronizatsiya vaqti */
const hhmm = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

type Tone = 'offline' | 'sync' | 'failed' | 'update';

const TONE: Record<Tone, { fg: string; bg: string; line: string }> = {
  offline: {
    fg: TOKENS.color.semantic.warning,
    bg: 'rgba(217, 161, 61, 0.10)',
    line: 'rgba(217, 161, 61, 0.28)',
  },
  sync: {
    fg: TOKENS.color.semantic.info,
    bg: 'rgba(95, 147, 184, 0.10)',
    line: 'rgba(95, 147, 184, 0.28)',
  },
  failed: {
    fg: TOKENS.color.semantic.error,
    bg: 'rgba(217, 84, 77, 0.12)',
    line: 'rgba(217, 84, 77, 0.32)',
  },
  update: {
    fg: TOKENS.color.gold.base,
    bg: TOKENS.color.gold.subtle,
    line: TOKENS.color.gold.line,
  },
};

/**
 * ULANISH CHIZIG'I — sarlavha ostidagi yagona holat qatori.
 *
 * Nega bitta chiziq: kassir ekranda bir vaqtning o'zida bir nechta ogohlantirish
 * ko'rsa, ularning hech biri o'qilmaydi. Shuning uchun MUHIMLIK tartibi bo'yicha
 * FAQAT BITTASI ko'rsatiladi:
 *   1) yuborilmagan xato amallar (pul bilan bog'liq — eng muhimi)
 *   2) internet yo'q
 *   3) navbat yuborilmoqda
 *   4) ilova yangilanishi tayyor
 *
 * Hech biri bo'lmasa chiziq umuman ko'rinmaydi — normal ish holatida ekran toza.
 */
const ConnectionBanner = () => {
  const { t } = useTranslation();
  const { online, pending, failed, lastSync, sync } = useConnection();
  const { restoredOffline } = useAuth();
  const [updateReady, setUpdateReady] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => onUpdateReady(() => setUpdateReady(true)), []);

  let tone: Tone | null = null;
  if (failed > 0) tone = 'failed';
  else if (!online) tone = 'offline';
  else if (pending > 0) tone = 'sync';
  else if (updateReady) tone = 'update';

  const content = (() => {
    switch (tone) {
      case 'failed':
        return {
          icon: <ExclamationCircleOutlined />,
          title: t('offline.failedTitle', { count: failed }),
          desc: t('offline.failedDesc'),
          action: (
            <Button size="small" danger onClick={() => setQueueOpen(true)}>
              {t('offline.review')}
            </Button>
          ),
        };
      case 'offline':
        return {
          icon: <DisconnectOutlined />,
          title: t('offline.offlineTitle'),
          // Sessiya lokal suratdan tiklangan bo'lsa buni ochiq aytamiz —
          // kassir ekrandagi ma'lumot qayerdan kelganini bilishi kerak
          desc: restoredOffline
            ? t('offline.offlineDescRestored')
            : lastSync
              ? t('offline.offlineDesc', { time: hhmm(lastSync) })
              : t('offline.offlineDescNoData'),
          action:
            pending > 0 ? (
              <Button size="small" onClick={() => setQueueOpen(true)}>
                {t('offline.queuePending')}: {pending}
              </Button>
            ) : null,
        };
      case 'sync':
        return {
          icon: <CloudSyncOutlined spin />,
          title: t('offline.syncing', { count: pending }),
          desc: '',
          action: (
            <Button size="small" onClick={() => void sync()}>
              {t('offline.syncNow')}
            </Button>
          ),
        };
      case 'update':
        return {
          icon: <RocketOutlined />,
          title: t('offline.updateTitle'),
          desc: t('offline.updateDesc'),
          action: (
            <Button size="small" type="primary" onClick={applyUpdate}>
              {t('offline.updateNow')}
            </Button>
          ),
        };
      default:
        return null;
    }
  })();

  return (
    <>
      <AnimatePresence initial={false}>
        {tone && content && (
          <motion.div
            key={tone}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{ overflow: 'hidden', position: 'relative', zIndex: 2 }}
            role="status"
            aria-live="polite"
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '8px 16px',
                background: TONE[tone].bg,
                borderBottom: `1px solid ${TONE[tone].line}`,
                backdropFilter: 'blur(8px)',
              }}
            >
              <span style={{ color: TONE[tone].fg, fontSize: 16, lineHeight: 1 }}>
                {content.icon}
              </span>
              <Space size={8} wrap style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ color: TONE[tone].fg }}>
                  {content.title}
                </Text>
                {content.desc && (
                  <Text style={{ color: TOKENS.color.text.secondary, fontSize: 13 }}>
                    {content.desc}
                  </Text>
                )}
              </Space>
              {content.action}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <OfflineQueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
    </>
  );
};

export default ConnectionBanner;
