import { useEffect, useState } from 'react';
import { Alert, App, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { desktopBridge, type DesktopUpdateStatus } from '../../offline/desktop';

/** Bir xil toast qayta-qayta yig'ilmasin — holatlar bitta xabarni almashtiradi */
const TOAST_KEY = 'desktop-update';

/**
 * WINDOWS DASTURI YANGILANISHI — dastur ichida (/download sahifasi dasturda yo'q).
 *
 * - Yangilanish yuklab bo'lingach: "dastur yopilganda o'rnatiladi" banneri va
 *   "Hoziroq qayta ishga tushirish" tugmasi (yuborilmagan oflayn amal bo'lsa
 *   qobiq qayta ishga tushirmaydi — desktop/updater.js).
 * - Menyudan "Yangilanishni tekshirish" bosilganda — natija xabari. Fon
 *   tekshiruvlari (har 4 soatda) jim o'tadi: qobiq ularni `manual` deb belgilamaydi.
 *
 * Brauzer va Android ilovada hech narsa ko'rinmaydi.
 */
const DesktopUpdateNotice = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [status, setStatus] = useState<DesktopUpdateStatus>({ state: 'idle' });

  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge?.onUpdateStatus) return undefined;
    return bridge.onUpdateStatus((next) => {
      setStatus(next);
      if (!next.manual) return;
      switch (next.state) {
        case 'checking':
          void message.loading({ key: TOAST_KEY, content: t('download.updateChecking'), duration: 0 });
          break;
        case 'available':
          void message.info({ key: TOAST_KEY, content: t('download.updateAvailable', { version: next.version ?? '' }) });
          break;
        case 'uptodate':
          void message.success({ key: TOAST_KEY, content: t('download.upToDate') });
          break;
        case 'error':
          void message.error({ key: TOAST_KEY, content: next.message || t('common.error') });
          break;
        case 'ready':
          message.destroy(TOAST_KEY);
          break;
        default:
          break;
      }
    });
  }, [message, t]);

  if (status.state !== 'ready') return null;
  return (
    <Alert
      type="success"
      banner
      showIcon
      message={status.version ? `${t('download.updateReady')} · ${status.version}` : t('download.updateReady')}
      action={
        <Button size="small" type="primary" icon={<ReloadOutlined />} onClick={() => desktopBridge()?.quitAndInstall?.()}>
          {t('download.restartNow')}
        </Button>
      }
    />
  );
};

export default DesktopUpdateNotice;
