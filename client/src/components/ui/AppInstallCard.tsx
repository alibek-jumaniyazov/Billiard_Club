import { useEffect, useState } from 'react';
import { Alert, App, Button, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, DownloadOutlined, MobileOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { canInstall, installApp, installed, mobilePlatform, onInstallChange } from '../../offline/install';
import { isAppShell } from '../../utils/appShell';
import { offlineStorageAvailable } from '../../offline/db';
import { readLicense } from '../../offline/license';
import { useConnection } from '../../context/ConnectionContext';
import GlassCard from './GlassCard';

export default function AppInstallCard() {
  const { i18n } = useTranslation();
  const ru = i18n.language === 'ru';
  const { message } = App.useApp();
  const { pending, failed } = useConnection();
  const [, update] = useState(0);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [storage, setStorage] = useState<boolean | null>(null);
  const [shellReady, setShellReady] = useState(false);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const platform = mobilePlatform(navigator.userAgent, navigator.maxTouchPoints);
  const inApp = installed() || isAppShell();

  useEffect(() => onInstallChange(() => update((n) => n + 1)), []);
  useEffect(() => {
    let active = true;
    const read = async () => {
      const [available, protectedStorage, registration, lease] = await Promise.all([
        offlineStorageAvailable(), navigator.storage?.persisted?.().catch(() => false),
        navigator.serviceWorker?.getRegistration().catch(() => undefined), readLicense(),
      ]);
      if (!active) return;
      setStorage(available);
      setPersistent(protectedStorage ?? false);
      setShellReady(!!registration?.active);
      setDeadline(lease?.expiresAt ?? null);
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const protect = async () => {
    setBusy(true);
    try {
      const result = await navigator.storage?.persist?.();
      setPersistent(result ?? false);
      if (!result) message.info(ru ? 'Браузер не предоставил постоянное хранилище. Чаще синхронизируйте данные.' : 'Brauzer doimiy saqlashga ruxsat bermadi. Ma’lumotlarni tez-tez sinxronlang.');
    } finally { setBusy(false); }
  };

  return <GlassCard style={{ padding: 24, marginBottom: 24 }}>
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space align="start"><MobileOutlined style={{ fontSize: 28, color: '#cba866' }} /><div>
        <Typography.Title level={4} style={{ margin: 0 }}>{ru ? 'Приложение всегда под рукой' : 'Ilova doim yoningizda'}</Typography.Title>
        <Typography.Text type="secondary">{ru ? 'Android, iPhone и компьютер · единый аккаунт' : 'Android, iPhone va kompyuter · yagona hisob'}</Typography.Text>
      </div></Space>
      {inApp ? <Tag color="success" icon={<CheckCircleOutlined />}>{ru ? 'Открыто как приложение' : 'Ilova sifatida ochilgan'}</Tag>
        : canInstall() ? <Button size="large" type="primary" icon={<DownloadOutlined />} onClick={() => void installApp().catch(() => message.error(ru ? 'Повторите установку через меню браузера.' : 'Brauzer menyusi orqali o‘rnatishni qayta urinib ko‘ring.'))}>{ru ? 'Установить приложение' : 'Ilovani o‘rnatish'}</Button>
          : <Alert type="info" showIcon message={platform === 'ios' ? (ru ? 'Safari → Поделиться → На экран «Домой»' : 'Safari → Ulashish → Bosh ekranga qo‘shish') : (ru ? 'Меню Chrome / Edge → Установить приложение' : 'Chrome / Edge menyusi → Ilovani o‘rnatish')} description={ru ? 'Первое открытие и вход требуют интернета. Приложение появится отдельным значком.' : 'Birinchi ochish va kirish uchun internet kerak. Ilova alohida belgi bilan ochiladi.'} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div><Typography.Text type="secondary">{ru ? 'Офлайн-интерфейс' : 'Oflayn interfeys'}</Typography.Text><div>{shellReady ? (ru ? 'Загружен' : 'Yuklangan') : (ru ? 'Нужна загрузка с сервера' : 'Serverdan yuklash kerak')}</div></div>
        <div><Typography.Text type="secondary">{ru ? 'Хранилище устройства' : 'Qurilma xotirasi'}</Typography.Text><div>{storage === null ? '…' : !storage ? (ru ? 'Недоступно' : 'Mavjud emas') : persistent ? (ru ? 'Постоянное' : 'Doimiy saqlash yoqilgan') : (ru ? 'Обычное' : 'Oddiy saqlash')}</div></div>
        <div><Typography.Text type="secondary">{ru ? 'Не отправлено' : 'Yuborilmagan amallar'}</Typography.Text><div>{pending + failed}</div></div>
        <div><Typography.Text type="secondary">{ru ? 'Офлайн-разрешение до' : 'Oflayn ruxsat muddati'}</Typography.Text><div>{deadline ? new Date(deadline).toLocaleString(ru ? 'ru-RU' : 'uz-UZ') : (ru ? 'Войдите через интернет' : 'Internet orqali kiring')}</div></div>
      </div>
      {storage && !persistent && typeof navigator.storage?.persist === 'function' && <Button icon={<SafetyCertificateOutlined />} loading={busy} onClick={() => void protect().catch(() => message.error(ru ? 'Хранилище недоступно' : 'Saqlash imkoni yo‘q'))}>{ru ? 'Запросить постоянное хранилище' : 'Doimiy saqlashni yoqish'}</Button>}
      <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>{ru
        ? 'Офлайн-доступ — до 24 часов после проверки, но не дольше подписки. Расчёт без интернета тоже возможен (кроме долга) — он отправится при связи. Не очищайте данные приложения, пока есть неотправленные операции.'
        : 'Oflayn ruxsat tekshiruvdan keyin 24 soatgacha, lekin obuna muddatidan oshmaydi. Hisob-kitob ham internetsiz bo‘ladi (qarzdan tashqari) — aloqa tiklanganda yuboriladi. Yuborilmagan amallar borida ilova ma’lumotlarini tozalamang.'}</Typography.Paragraph>
    </Space>
  </GlassCard>;
}
