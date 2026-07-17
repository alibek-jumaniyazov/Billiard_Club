import { useCallback, useEffect, useState } from 'react';
import { App, Alert, Button, Card, List, Skeleton, Switch, Typography } from 'antd';
import { ReloadOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, platformApi } from '../../api';
import { PageHeader, PageTransition } from '../../components/ui';
import { TELEGRAM_EVENTS, type TelegramEvent } from '../../constants';
import { TOKENS } from '../../theme/tokens';

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

      <Card
        title={
          <span>
            <SendOutlined style={{ color: TOKENS.color.gold.base, marginRight: 8 }} />
            {t('admin.settings.telegramTitle')}
          </span>
        }
        extra={
          updatedAt && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('admin.settings.updatedAt')}: {dayjs(updatedAt).format('DD.MM.YYYY HH:mm')}
            </Text>
          )
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
