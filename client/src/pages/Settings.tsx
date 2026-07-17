import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  TimePicker,
  Typography,
} from 'antd';
import {
  ClockCircleOutlined,
  DollarOutlined,
  PhoneOutlined,
  SaveOutlined,
  SettingOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { errorMessage, settingsApi } from '../api';
import type { Settings as ClubSettings } from '../types';

const { Title, Text } = Typography;

interface SettingsFormValues {
  clubName: string;
  phone: string | null;
  address: string | null;
  currency: string;
  currencySymbol: string;
  defaultTablePrice: number;
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
  workingHoursStart: s.workingHoursStart ? dayjs(s.workingHoursStart, 'HH:mm') : null,
  workingHoursEnd: s.workingHoursEnd ? dayjs(s.workingHoursEnd, 'HH:mm') : null,
});

const Settings = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<SettingsFormValues>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialValues, setInitialValues] = useState<SettingsFormValues | null>(null);

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

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

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
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          <SettingOutlined /> {t('settings.title')}
        </Title>
        <Text type="secondary">{t('settings.subtitle')}</Text>
      </div>

      <Card loading={loading} style={{ maxWidth: 920 }}>
        {initialValues && (
          <Form<SettingsFormValues>
            form={form}
            layout="vertical"
            initialValues={initialValues}
            onFinish={(values) => void handleSave(values)}
          >
            <Title level={5} style={{ marginTop: 0 }}>
              <ShopOutlined /> {t('settings.clubInfo')}
            </Title>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="clubName"
                  label={t('settings.clubName')}
                  rules={[{ required: true, message: t('settings.clubNameRequired') }]}
                >
                  <Input maxLength={150} placeholder="Prime Billiard Club" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="phone" label={t('common.phone')}>
                  <Input maxLength={20} prefix={<PhoneOutlined />} placeholder="+998 90 123 45 67" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="address" label={t('settings.address')}>
              <Input.TextArea rows={2} maxLength={300} />
            </Form.Item>

            <Divider />

            <Title level={5}>
              <DollarOutlined /> {t('settings.pricing')}
            </Title>
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
                  <InputNumber min={0} step={1000} style={{ width: '100%' }} placeholder="40000" />
                </Form.Item>
              </Col>
            </Row>

            <Divider />

            <Title level={5}>
              <ClockCircleOutlined /> {t('settings.workingHours')}
            </Title>
            <Alert
              type="info"
              showIcon
              message={t('settings.workingHoursNote')}
              style={{ marginBottom: 16 }}
            />
            <Row gutter={12}>
              <Col xs={12} md={8}>
                <Form.Item name="workingHoursStart" label={t('settings.openTime')}>
                  <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="09:00" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="workingHoursEnd" label={t('settings.closeTime')}>
                  <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="23:00" />
                </Form.Item>
              </Col>
            </Row>

            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                {t('btn.save')}
              </Button>
            </div>
          </Form>
        )}
      </Card>
    </div>
  );
};

export default Settings;
