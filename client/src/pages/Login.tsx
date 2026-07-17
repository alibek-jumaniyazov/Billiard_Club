import { useState } from 'react';
import { App, Button, Form, Input, Segmented, Typography } from 'antd';
import { ArrowLeftOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatedBackground, BrandLogo, GlassCard, PageTransition } from '../components/ui';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { TOKENS } from '../theme/tokens';

const { Text } = Typography;

const Login = () => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { lang, setLang } = useAppSettings();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useDocumentHead('login.docTitle', 'landing.metaLoginDescription');

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    const result = await login(values.username.trim(), values.password);
    setLoading(false);
    if (result.ok) {
      navigate('/', { replace: true });
    } else {
      message.error(result.message || t('login.failed'));
    }
  };

  return (
    <div className="auth-page">
      {/* Jonli aurora fon — karta orqasida suzadi (qatlamlash index.css da) */}
      <AnimatedBackground variant="aurora" withGrain />

      {/* Landing sahifaga qaytish — shisha pilyula (chap yuqorida) */}
      <Link to="/" className="auth-back-pill" title={t('login.backHome')}>
        <ArrowLeftOutlined />
        {t('login.backHome')}
      </Link>

      <PageTransition>
        <GlassCard padding={TOKENS.spacing.xl} style={{ width: 420, maxWidth: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: TOKENS.spacing.lg }}>
            {/* Logo ham bosh sahifaga qaytaradi */}
            <Link
              to="/"
              title={t('login.backHome')}
              style={{ display: 'inline-block', cursor: 'pointer' }}
            >
              <BrandLogo size={48} withWordmark style={{ marginBottom: 14 }} />
            </Link>
            <Text type="secondary" style={{ display: 'block' }}>
              {t('login.subtitle')}
            </Text>
          </div>

          <Form layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
            <Form.Item
              name="username"
              label={t('login.username')}
              rules={[{ required: true, message: t('login.usernameRequired') }]}
            >
              <Input prefix={<UserOutlined />} autoComplete="username" autoFocus maxLength={50} />
            </Form.Item>
            <Form.Item
              name="password"
              label={t('login.password')}
              rules={[{ required: true, message: t('login.passwordRequired') }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                autoComplete="current-password"
                maxLength={100}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                className="auth-submit-glow"
              >
                {t('login.submit')}
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
              marginTop: 4,
              paddingTop: 16,
              borderTop: `1px solid ${TOKENS.color.border.subtle}`,
            }}
          >
            <Text type="secondary" style={{ fontSize: 13 }}>
              {t('login.noAccount')} <Link to="/register">{t('login.registerLink')}</Link>
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

export default Login;
