import { useState } from 'react';
import { App, Button, Card, Col, Divider, Form, Input, Row, Segmented, Typography } from 'antd';
import {
  EnvironmentOutlined,
  LockOutlined,
  PhoneOutlined,
  ShopOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { errorMessage, publicApi } from '../api';
import { tokenStore } from '../api/client';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

interface RegisterForm {
  clubName: string;
  ownerName: string;
  phone: string;
  address: string;
  username: string;
  password: string;
  confirmPassword: string;
  /** Honeypot — odam ko'rmaydi, botlar to'ldiradi */
  website?: string;
}

/** Landing sahifadan keladigan ro'yxatdan o'tish — 7 kunlik bepul sinov */
const Register = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { lang, setLang } = useAppSettings();
  const { refreshMe } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: RegisterForm) => {
    setLoading(true);
    try {
      const res = await publicApi.register({
        clubName: values.clubName.trim(),
        ownerName: values.ownerName.trim(),
        phone: values.phone.trim(),
        address: values.address.trim(),
        username: values.username.trim(),
        password: values.password,
        website: values.website,
      });
      // Avto-login: tokenlar saqlanadi va foydalanuvchi darhol tizimga kiradi
      tokenStore.set(res.data.accessToken, res.data.refreshToken);
      await refreshMe();
      message.success(t('register.successTitle'));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <Card style={{ width: 560, maxWidth: '100%' }} styles={{ body: { padding: 32 } }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 12px',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #faad14, #d48806)',
              color: '#111',
              fontSize: 26,
            }}
          >
            <TrophyOutlined />
          </div>
          <Title level={3} style={{ marginBottom: 4 }}>
            {t('register.title')}
          </Title>
          <Text type="secondary">{t('register.subtitle')}</Text>
        </div>

        <Form layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
          <Divider orientation="left" plain style={{ marginTop: 0 }}>
            {t('register.step1')}
          </Divider>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="clubName"
                label={t('register.clubName')}
                rules={[
                  {
                    required: true,
                    min: 2,
                    transform: (v: string) => (v ?? '').trim(),
                    message: t('register.clubNameRequired'),
                  },
                ]}
              >
                <Input prefix={<ShopOutlined />} maxLength={150} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="ownerName"
                label={t('register.ownerName')}
                rules={[
                  {
                    required: true,
                    min: 2,
                    transform: (v: string) => (v ?? '').trim(),
                    message: t('register.ownerNameRequired'),
                  },
                ]}
              >
                <Input prefix={<UserOutlined />} maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="phone"
                label={t('register.phone')}
                rules={[
                  { required: true, message: t('register.phoneRequired') },
                  { pattern: /^\+?[\d\s()-]{7,20}$/, message: t('register.phoneInvalid') },
                ]}
              >
                <Input prefix={<PhoneOutlined />} placeholder="+998 90 123 45 67" maxLength={20} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="address"
                label={t('register.address')}
                rules={[
                  {
                    required: true,
                    min: 3,
                    transform: (v: string) => (v ?? '').trim(),
                    message: t('register.addressRequired'),
                  },
                ]}
              >
                <Input prefix={<EnvironmentOutlined />} maxLength={300} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>
            {t('register.step2')}
          </Divider>
          <Form.Item
            name="username"
            label={t('register.username')}
            rules={[
              { required: true, min: 3, message: t('register.usernameRequired') },
              { pattern: /^[a-zA-Z0-9_.-]+$/, message: t('register.usernamePattern') },
            ]}
          >
            <Input prefix={<UserOutlined />} maxLength={50} autoComplete="username" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="password"
                label={t('register.password')}
                rules={[{ required: true, min: 6, message: t('register.passwordRequired') }]}
              >
                <Input.Password prefix={<LockOutlined />} maxLength={100} autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="confirmPassword"
                label={t('register.confirmPassword')}
                dependencies={['password']}
                rules={[
                  { required: true, message: t('register.confirmRequired') },
                  ({ getFieldValue }) => ({
                    validator: (_, value) =>
                      !value || getFieldValue('password') === value
                        ? Promise.resolve()
                        : Promise.reject(new Error(t('register.confirmMismatch'))),
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} maxLength={100} autoComplete="new-password" />
              </Form.Item>
            </Col>
          </Row>

          {/* Honeypot — ekranda ko'rinmaydi, botlar avtomatik to'ldiradi */}
          <div style={{ position: 'absolute', left: -9999, top: -9999, height: 0, overflow: 'hidden' }} aria-hidden="true">
            <Form.Item name="website" label="Website">
              <Input tabIndex={-1} autoComplete="off" />
            </Form.Item>
          </div>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              {t('register.submit')}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">
            {t('register.haveAccount')} <Link to="/login">{t('register.loginLink')}</Link>
          </Text>
          <Segmented
            size="small"
            value={lang}
            onChange={(value) => setLang(value as 'uz' | 'ru')}
            options={[
              { label: "O'z", value: 'uz' },
              { label: 'Ру', value: 'ru' },
            ]}
          />
        </div>
      </Card>
    </div>
  );
};

export default Register;
