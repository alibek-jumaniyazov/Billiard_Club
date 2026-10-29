import type { ReactNode } from 'react';
import {
  AndroidFilled,
  BulbOutlined,
  CloudOutlined,
  CloudSyncOutlined,
  FileExcelOutlined,
  GlobalOutlined,
  PrinterOutlined,
  SendOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  TranslationOutlined,
  WindowsFilled,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

/**
 * Hero ostidagi lenta: platformalar va asosiy imkoniyatlar sekin aylanib
 * o'tadi (faqat haqiqiy imkoniyatlar — mijoz logotiplari yoki o'ylab
 * topilgan raqamlar yo'q). Sichqoncha ustiga kelsa to'xtaydi; harakat
 * kamaytirilganda oddiy, o'ralgan ro'yxat.
 */

const ITEMS: { key: string; icon: ReactNode; label?: string }[] = [
  { key: 'windows', icon: <WindowsFilled />, label: 'Windows' },
  { key: 'android', icon: <AndroidFilled />, label: 'Android' },
  { key: 'platformWeb', icon: <GlobalOutlined /> },
  { key: 'capShelly', icon: <BulbOutlined /> },
  { key: 'capOffline', icon: <CloudSyncOutlined /> },
  { key: 'capExcel', icon: <FileExcelOutlined /> },
  { key: 'capPrint', icon: <PrinterOutlined /> },
  { key: 'capLang', icon: <TranslationOutlined /> },
  { key: 'capSetup', icon: <ThunderboltOutlined /> },
  { key: 'capCloud', icon: <CloudOutlined /> },
  { key: 'capTelegram', icon: <SendOutlined /> },
  { key: 'capUpdates', icon: <SyncOutlined /> },
];

const CapabilityStrip = () => {
  const { t } = useTranslation();
  const group = (hidden: boolean) => (
    <ul className="lp-marquee__group" aria-hidden={hidden || undefined}>
      {ITEMS.map((item) => (
        <li key={item.key} className="lp-marquee__item">
          <span aria-hidden>{item.icon}</span>
          {item.label ?? t(`landing.${item.key}`)}
        </li>
      ))}
    </ul>
  );
  return (
    <section className="lp-marquee" aria-label={t('landing.capAria')}>
      <div className="lp-marquee__track">
        {group(false)}
        {group(true)}
      </div>
    </section>
  );
};

export default CapabilityStrip;
