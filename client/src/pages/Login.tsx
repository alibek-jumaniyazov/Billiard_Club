import { useState } from 'react';
import { Alert, Button, Form, Input, Segmented } from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  LockOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../components/ui';
import { SUPPORT_TELEGRAM } from '../constants';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth, type AuthResult } from '../context/AuthContext';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { isAppShell } from '../utils/appShell';
import '../styles/auth.css';

const Login = () => {
  const { t } = useTranslation();
  // Windows/Android dasturi ichida: faqat kirish, saytga havolalar yo'q
  const inAppShell = isAppShell();
  const { login } = useAuth();
  const { lang, setLang } = useAppSettings();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<AuthResult | null>(null);

  useDocumentHead('login.docTitle', 'landing.metaLoginDescription');

  const onFinish = async (values: { username: string; password: string }) => {
    setFailure(null);
    setLoading(true);
    const result = await login(values.username.trim(), values.password);
    setLoading(false);
    if (result.ok) {
      navigate('/', { replace: true });
      return;
    }
    setFailure(result);
  };

  // Keep connection and rate-limit failures distinct from incorrect credentials.
  const errorMessage = failure
    ? failure.reason === 'network'
      ? t('offline.networkError')
      : failure.reason === 'rateLimited'
        ? failure.message || t('offline.rateLimited')
        : failure.message || t('login.failed')
    : null;

  return (
    <main className="auth-shell">
      <header className="auth-topbar">
        {inAppShell ? (
          // Dastur ichida sayt yo'q — logotip hech qayerga olib bormaydi
          <span className="auth-home">
            <BrandLogo size={34} withWordmark />
          </span>
        ) : (
          <Link to="/" className="auth-home" title={t('login.backHome')}>
            <BrandLogo size={34} withWordmark />
          </Link>
        )}
        <Segmented
          className="auth-language"
          aria-label={t('login.languageLabel')}
          value={lang}
          onChange={(value) => setLang(value as 'uz' | 'ru')}
          options={[
            { label: "O'z", value: 'uz' },
            { label: 'Ру', value: 'ru' },
          ]}
        />
      </header>

      <div className="auth-layout auth-layout--login">
        <aside className="auth-story">
          <span className="auth-eyebrow">{t('login.storyEyebrow')}</span>
          <h1>{t('login.storyTitle')}</h1>
          <p className="auth-story-description">{t('login.storyDescription')}</p>
          <ul className="auth-benefits">
            {['tables', 'sales', 'team'].map((benefit) => (
              <li key={benefit}>
                <CheckCircleOutlined aria-hidden />
                <div>
                  <strong>{t(`login.${benefit}Title`)}</strong>
                  <span>{t(`login.${benefit}Description`)}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="auth-story-footer">{t('login.storyFooter')}</div>
        </aside>

        <section className="auth-panel auth-panel--login" aria-labelledby="login-heading">
          <div className="auth-panel-heading">
            <span className="auth-eyebrow">{t('login.panelEyebrow')}</span>
            <h2 id="login-heading">{t('login.title')}</h2>
            <p>{t('login.subtitle')}</p>
          </div>

          {errorMessage && (
            <Alert className="auth-notice" type="error" showIcon message={errorMessage} role="alert" />
          )}

          <Form
            className="auth-form"
            layout="vertical"
            onFinish={onFinish}
            size="large"
            requiredMark={false}
          >
            <Form.Item
              name="username"
              label={t('login.username')}
              rules={[{ required: true, message: t('login.usernameRequired') }]}
            >
              <Input
                prefix={<UserOutlined aria-hidden />}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                maxLength={50}
                placeholder={t('login.usernamePlaceholder')}
              />
            </Form.Item>
            <Form.Item
              name="password"
              label={t('login.password')}
              rules={[{ required: true, message: t('login.passwordRequired') }]}
            >
              <Input.Password
                prefix={<LockOutlined aria-hidden />}
                autoComplete="current-password"
                maxLength={100}
                placeholder={t('login.passwordPlaceholder')}
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                className="auth-primary"
              >
                {t('login.submit')} <ArrowRightOutlined aria-hidden />
              </Button>
            </Form.Item>
          </Form>

          <div className="auth-support-row">
            <span>{t('login.needHelp')}</span>
            <a href={SUPPORT_TELEGRAM} target="_blank" rel="noopener noreferrer">
              <SendOutlined aria-hidden /> {t('login.supportLink')}
            </a>
          </div>
          {/* Ro'yxatdan o'tish — saytda; dastur faqat kirish uchun */}
          {!inAppShell && (
            <footer className="auth-panel-footer">
              <span>{t('login.noAccount')}</span>{' '}
              <Link to="/register">{t('login.registerLink')}</Link>
            </footer>
          )}
        </section>
      </div>

      <footer className="auth-site-footer">{t('login.siteFooter')}</footer>
    </main>
  );
};

export default Login;
