import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Skeleton,
  Space,
  TimePicker,
  Typography,
} from 'antd';
import {
  ClockCircleOutlined,
  DollarOutlined,
  GlobalOutlined,
  PhoneOutlined,
  SaveOutlined,
  SettingOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, settingsApi } from '../api';
import { PageHeader, PageTransition } from '../components/ui';
import { TOKENS } from '../theme/tokens';
import type { Settings as ClubSettings } from '../types';

const { Text } = Typography;

/**
 * Zaxira ro'yxat — server validatsiyasidagi SUPPORTED_TIMEZONES bilan BIR XIL
 * (server/src/modules/settings/timezones.ts). Asosiy manba GET /settings/timezones,
 * bu ro'yxat faqat so'rov muvaffaqiyatsiz bo'lsa ishlatiladi.
 */
const FALLBACK_TIMEZONES = [
  'Asia/Tashkent',
  'Asia/Samarkand',
  'Asia/Almaty',
  'Asia/Bishkek',
  'Asia/Dushanbe',
  'Asia/Ashgabat',
  'Asia/Baku',
  'Asia/Yerevan',
  'Asia/Tbilisi',
  'Europe/Moscow',
  'Asia/Yekaterinburg',
  'Asia/Novosibirsk',
  'Europe/Kiev',
  'Europe/Istanbul',
  'Asia/Dubai',
] as const;

/** "Asia/Tashkent" -> "Asia/Tashkent (GMT+5)" — brauzer qo'llamasa nomning o'zi */
const timezoneLabel = (tz: string): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    } as Intl.DateTimeFormatOptions).formatToParts(new Date());
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value;
    return offset ? `${tz} (${offset})` : tz;
  } catch {
    return tz;
  }
};

interface SettingsFormValues {
  clubName: string;
  phone: string | null;
  address: string | null;
  currency: string;
  currencySymbol: string;
  defaultTablePrice: number;
  timezone: string;
  workingHoursStart: Dayjs | null;
  workingHoursEnd: Dayjs | null;
}

/** Serverdagi 'HH:mm' satrlarini forma uchun dayjs ga aylantiradi */
const toFormValues = (s: ClubSettings): SettingsFormValues => ({
  clubName: s.clubName,
  phone: s.phone,
  address: s.address,
  currency: s.currency,
  currencySymbol: s.currencySymbol,
  defaultTablePrice: s.defaultTablePrice,
  timezone: s.timezone,
  workingHoursStart: s.workingHoursStart ? dayjs(s.workingHoursStart, 'HH:mm') : null,
  workingHoursEnd: s.workingHoursEnd ? dayjs(s.workingHoursEnd, 'HH:mm') : null,
});

/** Karta sarlavhasi — ikonka oltin urg'u bilan */
const cardTitle = (icon: ReactNode, label: string) => (
  <Space size={8}>
    <span style={{ color: TOKENS.color.gold.base, display: 'inline-flex' }}>{icon}</span>
    {label}
  </Space>
);

const Settings = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<SettingsFormValues>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialValues, setInitialValues] = useState<SettingsFormValues | null>(null);
  const [timezones, setTimezones] = useState<readonly string[]>(FALLBACK_TIMEZONES);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settingsApi.get();
      setInitialValues(toFormValues(res.data));
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  // Ro'yxatni serverdan olamiz (validatsiya bilan bir manba); xatoda zaxira qoladi
  const fetchTimezones = useCallback(async () => {
    try {
      const res = await settingsApi.timezones();
      if (Array.isArray(res.data) && res.data.length > 0) setTimezones(res.data);
    } catch {
      // Zaxira ro'yxat yetarli — toast shart emas
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
    void fetchTimezones();
  }, [fetchSettings, fetchTimezones]);

  const handleSave = async (values: SettingsFormValues) => {
    setSaving(true);
    try {
      const res = await settingsApi.update({
        ...values,
        // dayjs -> 'HH:mm' (server satr kutadi)
        workingHoursStart: values.workingHoursStart
          ? values.workingHoursStart.format('HH:mm')
          : null,
        workingHoursEnd: values.workingHoursEnd ? values.workingHoursEnd.format('HH:mm') : null,
      });
      message.success(res.message);
      form.setFieldsValue(toFormValues(res.data));
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageTransition>
      <PageHeader
        icon={<SettingOutlined />}
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />

      <div style={{ maxWidth: 920 }}>
        {loading || !initialValues ? (
          <Card>
            <Skeleton active paragraph={{ rows: 8 }} />
          </Card>
        ) : (
          <Form<SettingsFormValues>
            form={form}
            layout="vertical"
            initialValues={initialValues}
            onFinish={(values) => void handleSave(values)}
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {/* Klub ma'lumotlari */}
              <Card title={cardTitle(<ShopOutlined />, t('settings.clubInfo'))}>
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="clubName"
                      label={t('settings.clubName')}
                      rules={[{ required: true, message: t('settings.clubNameRequired') }]}
                    >
                      <Input maxLength={150} placeholder="Billiard Club" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="phone" label={t('common.phone')}>
                      <Input
                        maxLength={20}
                        prefix={<PhoneOutlined />}
                        placeholder="+998 90 123 45 67"
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="address" label={t('settings.address')} style={{ marginBottom: 0 }}>
                  <Input.TextArea rows={2} maxLength={300} />
                </Form.Item>
              </Card>

              {/* Valyuta va narx */}
              <Card title={cardTitle(<DollarOutlined />, t('settings.pricing'))}>
                <Row gutter={12}>
                  <Col xs={24} md={8}>
                    <Form.Item name="currency" label={t('settings.currency')}>
                      <Input maxLength={10} placeholder="UZS" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="currencySymbol" label={t('settings.currencySymbol')}>
                      <Input maxLength={10} placeholder={t('common.sum')} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="defaultTablePrice"
                      label={t('settings.defaultTablePrice')}
                      rules={[{ required: true, message: t('settings.priceRequired') }]}
                    >
                      <InputNumber
                        min={0}
                        step={1000}
                        style={{ width: '100%' }}
                        placeholder="40000"
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              {/* Vaqt mintaqasi */}
              <Card title={cardTitle(<GlobalOutlined />, t('settings.regional'))}>
                <Form.Item
                  name="timezone"
                  label={t('settings.timezone')}
                  style={{ marginBottom: 8 }}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={timezones.map((tz) => ({ value: tz, label: timezoneLabel(tz) }))}
                  />
                </Form.Item>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {t('settings.timezoneHint')}
                </Text>
              </Card>

              {/* Ish vaqti */}
              <Card title={cardTitle(<ClockCircleOutlined />, t('settings.workingHours'))}>
                <Alert
                  type="info"
                  showIcon
                  message={t('settings.workingHoursNote')}
                  style={{ marginBottom: 16 }}
                />
                <Row gutter={12}>
                  <Col xs={12} md={8}>
                    <Form.Item
                      name="workingHoursStart"
                      label={t('settings.openTime')}
                      style={{ marginBottom: 0 }}
                    >
                      <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="09:00" />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item
                      name="workingHoursEnd"
                      label={t('settings.closeTime')}
                      style={{ marginBottom: 0 }}
                    >
                      <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="23:00" />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <div style={{ textAlign: 'right' }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={saving}
                >
                  {t('btn.save')}
                </Button>
              </div>
            </Space>
          </Form>
        )}
      </div>
    </PageTransition>
  );
};

export default Settings;
