import { useState } from 'react';
import { App, Button, Col, Divider, Form, Input, Row, Segmented, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  LockOutlined,
  PhoneOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatedBackground, BrandLogo, GlassCard, PageTransition } from '../components/ui';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { TOKENS } from '../theme/tokens';

const { Text, Title } = Typography;

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
  const { register } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useDocumentHead('register.docTitle', 'landing.metaRegisterDescription');

  const onFinish = async (values: RegisterForm) => {
    setLoading(true);
    // AuthContext.register avto-login qiladi: token saqlanadi, user/club
    // javobdan o'rnatiladi (qo'shimcha refreshMe so'rovisiz)
    const result = await register({
      clubName: values.clubName.trim(),
      ownerName: values.ownerName.trim(),
      phone: values.phone.trim(),
      address: values.address.trim(),
      username: values.username.trim(),
      password: values.password,
      website: values.website,
    });
    setLoading(false);
    if (result.ok) {
      message.success(t('register.successTitle'));
      navigate('/dashboard', { replace: true });
    } else {
      message.error(result.message || t('common.error'));
    }
  };

  return (
    <div className="auth-page">
      {/* Jonli aurora fon — karta orqasida suzadi (qatlamlash index.css da) */}
      <AnimatedBackground variant="aurora" withGrain />

      {/* Landing sahifaga qaytish — shisha pilyula (chap yuqorida) */}
      <Link to="/" className="auth-back-pill" title={t('register.backHome')}>
        <ArrowLeftOutlined />
        {t('register.backHome')}
      </Link>

      <PageTransition>
        <GlassCard padding={TOKENS.spacing.xl} style={{ width: 620, maxWidth: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: TOKENS.spacing.lg }}>
            {/* Logo ham bosh sahifaga qaytaradi */}
            <Link
              to="/"
              title={t('register.backHome')}
              style={{ display: 'inline-block', cursor: 'pointer' }}
            >
              <BrandLogo size={44} withWordmark style={{ marginBottom: 14 }} />
            </Link>
            <Title level={3} style={{ margin: '0 0 4px' }}>
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
                  <Input
                    prefix={<PhoneOutlined />}
                    placeholder="+998 90 123 45 67"
                    maxLength={20}
                  />
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
                  rules={[{ required: true, min: 8, message: t('register.passwordRequired') }]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    maxLength={100}
                    autoComplete="new-password"
                  />
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
                  <Input.Password
                    prefix={<LockOutlined />}
                    maxLength={100}
                    autoComplete="new-password"
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* Honeypot — ekranda ko'rinmaydi, botlar avtomatik to'ldiradi */}
            <div
              style={{
                position: 'absolute',
                left: -9999,
                top: -9999,
                height: 0,
                overflow: 'hidden',
              }}
              aria-hidden="true"
            >
              <Form.Item name="website" label="Website">
                <Input tabIndex={-1} autoComplete="off" />
              </Form.Item>
            </div>

            <Form.Item style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                className="auth-submit-glow"
              >
                {t('register.submit')}
              </Button>
            </Form.Item>
          </Form>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              paddingTop: 16,
              borderTop: `1px solid ${TOKENS.color.border.subtle}`,
            }}
          >
            <Text type="secondary" style={{ fontSize: 13 }}>
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
        </GlassCard>
      </PageTransition>
    </div>
  );
};

export default Register;
