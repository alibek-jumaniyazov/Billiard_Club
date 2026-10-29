import { useEffect, useState } from 'react';
import { Alert, Button } from 'antd';
import { AndroidOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { publicApi } from '../../api';
import type { AppReleaseInfo } from '../../types';
import { androidShellVersion, isNewerVersion } from '../../utils/version';

/** Banner yopilgan versiya — shu versiya uchun qayta chiqmaydi */
const DISMISS_KEY = 'nativeUpdateDismissed';

/**
 * ANDROID ILOVA (APK) YANGILANISHI.
 *
 * Ilovaning veb qismi har doim serverdan keladi — yangi imkoniyatlar darhol
 * ishlaydi. Faqat nativ qobiq (ikonka, splash, fayl yuklash va h.k.) yangi
 * APK bilan yangilanadi. Qobiq versiyasi /download dagi nashr etilganidan
 * eski bo'lsa, ilova ichida bir martalik taklif chiqadi; "Yangilash" APK ni
 * tizim brauzerida yuklaydi (MainActivity: DownloadListener).
 *
 * Oddiy brauzer va desktop dasturida HECH NARSA ko'rinmaydi (desktopning
 * o'z avto-yangilanishi bor).
 */
const NativeUpdateBanner = () => {
  const { t } = useTranslation();
  const [current] = useState(androidShellVersion);
  const [latest, setLatest] = useState<AppReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!current) return undefined;
    let alive = true;
    publicApi
      .releases()
      .then((res) => {
        const android = res.data.find((r) => r.platform === 'android');
        if (alive && android && isNewerVersion(android.version, current)) setLatest(android);
      })
      .catch(() => undefined); // oflayn — keyingi ochilishda tekshiriladi
    return () => {
      alive = false;
    };
  }, [current]);

  if (!current || !latest || dismissed === latest.version) return null;

  const dismiss = () => {
    setDismissed(latest.version);
    try {
      localStorage.setItem(DISMISS_KEY, latest.version);
    } catch {
      // saqlab bo'lmasa — keyingi ochilishda yana ko'rinadi, xolos
    }
  };

  return (
    <Alert
      banner
      type="info"
      icon={<AndroidOutlined />}
      closable
      onClose={dismiss}
      message={t('download.androidUpdateTitle', { version: latest.version })}
      description={t('download.androidUpdateDesc', { current })}
      action={
        <Button type="primary" size="small" icon={<CloudDownloadOutlined />} href={latest.url}>
          {t('download.androidUpdateAction')}
        </Button>
      }
    />
  );
};

export default NativeUpdateBanner;
