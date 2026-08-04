import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  InputNumber,
  List,
  Select,
  Skeleton,
  Space,
  Switch,
  Typography,
} from 'antd';
import { ClockCircleOutlined, ReloadOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, platformApi } from '../../api';
import { PageHeader, PageTransition } from '../../components/ui';
import { TELEGRAM_EVENTS, type TelegramEvent } from '../../constants';
import { TOKENS } from '../../theme/tokens';
import type { PlatformConfig } from '../../types';

/** Eslatma uchun tanlash mumkin bo'lgan kunlar (server chegarasi: 1..30) */
const REMINDER_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 21, 30];

const { Text } = Typography;

/**
 * Platforma sozlamalari (superadmin) — Telegram hodisa xabarnomalarini
 * yoqish/o'chirish. Har bir hodisa alohida saqlanadi; server 60 soniyalik
 * kesh ishlatadi, o'zgarish ko'pi bilan bir daqiqada kuchga kiradi.
 */
const AdminSettings = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [events, setEvents] = useState<Record<string, boolean> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configForm] = Form.useForm<{ trialDays: number; expiryReminderDays?: number[] }>();

  useEffect(() => {
    let cancelled = false;
    void platformApi
      .config()
      .then((res) => {
        if (cancelled) return;
        setConfig(res.data);
        // Forma boshlang'ich qiymatlari birinchi renderda o'rnatiladi, ma'lumot
        // esa keyinroq keladi — shuning uchun ochiq ravishda yozamiz
        configForm.setFieldsValue(res.data);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setConfigLoading(false));
    return () => {
      cancelled = true;
    };
  }, [configForm]);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformApi.telegramSettings();
      setEvents(res.data.events);
      setUpdatedAt(res.data.updatedAt ?? null);
    } catch (err) {
      setError(errorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleToggle = async (event: TelegramEvent, enabled: boolean) => {
    if (!events) return;
    const previous = events[event];
    // Optimistik yangilash — xato bo'lsa qaytariladi
    setEvents({ ...events, [event]: enabled });
    setSavingKey(event);
    try {
      const res = await platformApi.updateTelegramSettings({ [event]: enabled });
      setEvents(res.data.events);
      message.success(res.message ?? t('admin.settings.saved'));
    } catch (err) {
      setEvents({ ...events, [event]: previous });
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSavingKey(null);
    }
  };

  /**
   * Platforma sozlamalarini saqlash.
   *
   * `expiryReminderDays` uchun `?? []` ATAYLAB: Select butunlay tozalansa
   * `undefined` keladi va uni shundayligicha yuborish "maydonga tegilmadi"
   * degani bo'lardi — ya'ni foydalanuvchi eslatmalarni o'chira olmasdi.
   * Bo'sh massiv esa "eslatmalar kerak emas" degan ANIQ buyruq.
   */
  const saveConfig = async (values: {
    trialDays: number;
    expiryReminderDays?: number[];
  }) => {
    setConfigSaving(true);
    try {
      const res = await platformApi.updateConfig({
        trialDays: values.trialDays,
        expiryReminderDays: values.expiryReminderDays ?? [],
      });
      setConfig(res.data);
      configForm.setFieldsValue(res.data);
      message.success(res.message ?? t('admin.settings.saved'));
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setConfigSaving(false);
    }
  };

  /**
   * Telegram ulanishini sinash — guruhga haqiqiy xabar yuboriladi.
   *
   * Xato holatida SABAB ko'rsatiladi (token noto'g'ri, bot guruhdan
   * chiqarilgan va h.k.) — shunchaki "xato" emas: aynan sabab tuzatishga
   * yo'l ko'rsatadi.
   */
  const runTest = async () => {
    setTesting(true);
    try {
      const res = await platformApi.telegramTest();
      if (res.data.ok) {
        message.success(t('admin.settings.telegramTestOk', { chatId: res.data.chatId ?? '' }));
      } else {
        message.error(
          t('admin.settings.telegramTestFail', { error: res.data.error ?? '' }),
          8,
        );
      }
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setTesting(false);
    }
  };

  return (
    <PageTransition>
      <PageHeader
        icon={<SettingOutlined />}
        title={t('admin.settings.title')}
        subtitle={t('admin.settings.subtitle')}
        extra={
          <Button
            icon={<ReloadOutlined />}
            aria-label={t('btn.refresh')}
            onClick={() => void fetchSettings()}
          />
        }
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={() => void fetchSettings()}>
              {t('admin.retry')}
            </Button>
          }
          style={{ marginBottom: TOKENS.spacing.md }}
        />
      )}

      {/* PLATFORMA SOZLAMALARI — ilgari bu qiymatlar serverda KODDA edi.
          Ular Telegram kartasidan YUQORIDA turadi: sinov muddati biznes
          qarori va u xabarnoma sozlamalaridan muhimroq. */}
      <Card
        title={
          <span>
            <ClockCircleOutlined style={{ color: TOKENS.color.gold.base, marginRight: 8 }} />
            {t('admin.settings.platformTitle')}
          </span>
        }
        style={{ maxWidth: 760, marginBottom: TOKENS.spacing.md }}
      >
        {configLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : (
          <Form
            form={configForm}
            layout="vertical"
            onFinish={(v) => void saveConfig(v)}
            initialValues={{
              trialDays: config?.trialDays ?? 7,
              expiryReminderDays: config?.expiryReminderDays ?? [1, 3],
            }}
          >
            <Form.Item
              name="trialDays"
              label={t('admin.settings.trialDays')}
              extra={t('admin.settings.trialDaysHint')}
              rules={[{ required: true, type: 'number', min: 0, max: 365 }]}
            >
              <InputNumber min={0} max={365} style={{ width: 200 }} addonAfter={t('common.days')} />
            </Form.Item>

            <Form.Item
              name="expiryReminderDays"
              label={t('admin.settings.reminderDays')}
              extra={t('admin.settings.reminderDaysHint')}
            >
              <Select
                mode="multiple"
                allowClear
                style={{ maxWidth: 380 }}
                placeholder={t('admin.settings.reminderDaysEmpty')}
                maxCount={5}
                options={REMINDER_OPTIONS.map((d) => ({
                  value: d,
                  label: t('admin.settings.reminderOption', { count: d }),
                }))}
              />
            </Form.Item>

            <Button type="primary" htmlType="submit" loading={configSaving}>
              {t('btn.save')}
            </Button>
          </Form>
        )}
      </Card>

      <Card
        title={
          <span>
            <SendOutlined style={{ color: TOKENS.color.gold.base, marginRight: 8 }} />
            {t('admin.settings.telegramTitle')}
          </span>
        }
        extra={
          <Space size={12}>
            {updatedAt && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('admin.settings.updatedAt')}: {dayjs(updatedAt).format('DD.MM.YYYY HH:mm')}
              </Text>
            )}
            {/* Sozlash to'g'ri ekanini bilishning yagona ishonchli yo'li —
                haqiqatan yuborib ko'rish. Ilgari buni faqat server logini
                ochib bilish mumkin edi (xabarlar fire-and-forget ketadi). */}
            <Button size="small" icon={<SendOutlined />} loading={testing} onClick={runTest}>
              {t('admin.settings.telegramTest')}
            </Button>
          </Space>
        }
        style={{ maxWidth: 760 }}
      >
        <Alert
          type="info"
          showIcon
          message={t('admin.settings.telegramHint')}
          description={t('admin.settings.cacheHint')}
          style={{ marginBottom: TOKENS.spacing.md }}
        />

        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={[...TELEGRAM_EVENTS]}
            renderItem={(event) => (
              <List.Item
                actions={[
                  <Switch
                    key="toggle"
                    checked={events?.[event] ?? true}
                    loading={savingKey === event}
                    onChange={(checked) => void handleToggle(event, checked)}
                    aria-label={t(`admin.settings.ev_${event}`)}
                  />,
                ]}
              >
                <List.Item.Meta
                  title={t(`admin.settings.ev_${event}`)}
                  description={
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      {t(`admin.settings.ev_${event}_desc`)}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </PageTransition>
  );
};

export default AdminSettings;
