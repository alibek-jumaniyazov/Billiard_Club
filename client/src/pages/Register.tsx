import { useEffect, useRef, useState } from 'react';
import {
  Alert, App, Button, Col, Divider, Form, Input, Row, Segmented, Space, Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  LockOutlined,
  PhoneOutlined,
  ShopOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatedBackground, BrandLogo, GlassCard, PageTransition } from '../components/ui';
import {
  errorMessage,
  isNetworkError,
  publicApi,
  type TrialVerificationChallenge,
  type TrialVerificationStatus,
} from '../api';
import { SUPPORT_TELEGRAM } from '../constants';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { setTrialDays } from '../i18n';
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

/** Sinov faqat server tasdiqlagan Telegram kontakti bilan boshlanadi. */
const Register = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { lang, setLang } = useAppSettings();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<RegisterForm>();
  const [loading, setLoading] = useState(false);
  const [configState, setConfigState] = useState<'loading' | 'available' | 'unavailable' | 'error'>('loading');
  const [configAttempt, setConfigAttempt] = useState(0);
  // Tasdiqlash siri faqat shu sahifa xotirasida; URL yoki storage'ga yozilmaydi.
  const [challenge, setChallenge] = useState<TrialVerificationChallenge | null>(null);
  const [verification, setVerification] = useState<TrialVerificationStatus>({ status: 'pending' });
  const [verificationBusy, setVerificationBusy] = useState<'start' | 'check' | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const requestEpoch = useRef(0);

  useDocumentHead('register.docTitle', 'landing.metaRegisterDescription');

  useEffect(() => {
    let alive = true;
    publicApi.config().then((res) => {
      if (!alive) return;
      setTrialDays(res.data.trialDays);
      setConfigState(
        res.data.trialVerification?.method === 'telegram' && res.data.trialVerification.available
          ? 'available'
          : 'unavailable',
      );
    }).catch(() => {
      if (alive) setConfigState('error');
    });
    return () => { alive = false; };
  }, [configAttempt]);

  useEffect(() => () => { requestEpoch.current += 1; }, []);

  useEffect(() => {
    if (!challenge || verification.status === 'expired' || verification.status === 'used') return;
    const timeout = window.setTimeout(() => {
      // Kechikib kelgan tekshirish javobi muddati tugagan ruxsatni tiklamasin.
      requestEpoch.current += 1;
      setVerification({ status: 'expired' });
      setVerificationBusy(null);
      setVerificationError(null);
      form.setFieldValue('phone', '');
    }, Math.max(0, Date.parse(challenge.expiresAt) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [challenge, verification.status, form]);

  const verificationFailure = (error: unknown) => {
    const response = (error as { response?: { status?: number } })?.response;
    const fallback = isNetworkError(error)
      ? 'offline.networkError'
      : response?.status === 429 ? 'offline.rateLimited' : 'common.error';
    return errorMessage(error, t(fallback));
  };

  const resetVerification = () => {
    requestEpoch.current += 1;
    setChallenge(null);
    setVerification({ status: 'pending' });
    setVerificationBusy(null);
    setVerificationError(null);
    form.setFieldValue('phone', '');
  };

  const startVerification = async () => {
    if (configState !== 'available' || loading || verificationBusy) return;
    resetVerification();
    const epoch = requestEpoch.current;
    setVerificationBusy('start');
    try {
      const res = await publicApi.startTrialVerification({ website: form.getFieldValue('website') });
      if (epoch !== requestEpoch.current) return;
      const url = new URL(res.data.telegramUrl);
      if (url.protocol !== 'https:' || url.hostname !== 't.me' || !Number.isFinite(Date.parse(res.data.expiresAt))) {
        throw new Error('Invalid verification response');
      }
      setChallenge(res.data);
    } catch (error) {
      if (epoch === requestEpoch.current) setVerificationError(verificationFailure(error));
    } finally {
      if (epoch === requestEpoch.current) setVerificationBusy(null);
    }
  };

  const checkVerification = async () => {
    if (!challenge || loading || verificationBusy) return;
    const epoch = ++requestEpoch.current;
    setVerificationBusy('check');
    setVerificationError(null);
    try {
      const res = await publicApi.trialVerificationStatus({ id: challenge.id, token: challenge.token });
      if (epoch !== requestEpoch.current) return;
      if (res.data.status === 'verified' && !/^\d{7,15}$/.test(res.data.phone)) {
        throw new Error('Invalid verified phone');
      }
      setVerification(res.data);
      form.setFieldValue('phone', res.data.status === 'verified' ? `+${res.data.phone}` : '');
      if (res.data.status === 'pending') message.info(t('register.verificationPending'));
    } catch (error) {
      if (epoch === requestEpoch.current) setVerificationError(verificationFailure(error));
    } finally {
      if (epoch === requestEpoch.current) setVerificationBusy(null);
    }
  };

  const onFinish = async (values: RegisterForm) => {
    if (loading) return;
    if (configState !== 'available' || !challenge || verification.status !== 'verified') {
      message.error(t('register.verificationRequired'));
      return;
    }
    if (Date.parse(challenge.expiresAt) <= Date.now()) {
      setVerification({ status: 'expired' });
      form.setFieldValue('phone', '');
      message.error(t('register.verificationExpired'));
      return;
    }
    setLoading(true);
    // AuthContext.register avto-login qiladi: token saqlanadi, user/club
    // javobdan o'rnatiladi (qo'shimcha refreshMe so'rovisiz)
    const result = await register({
      clubName: values.clubName.trim(),
      ownerName: values.ownerName.trim(),
      phone: `+${verification.phone}`,
      address: values.address.trim(),
      username: values.username.trim(),
      password: values.password,
      website: values.website,
      trialVerificationId: challenge.id,
      trialVerificationToken: challenge.token,
    });
    setLoading(false);
    if (result.ok) {
      message.success(t('register.successTitle'));
      navigate('/dashboard', { replace: true });
      return;
    }
    // Login sahifasidagi kabi: tarmoq xatosini "ma'lumot noto'g'ri" deb
    // ko'rsatmaymiz — foydalanuvchi shaklni qayta-qayta yuboravermasin
    if (result.reason === 'network') {
      message.error(t('offline.networkError'));
    } else if (result.reason === 'rateLimited') {
      message.error(result.message || t('offline.rateLimited'));
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

          <Form form={form} layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
            <div style={{ marginBottom: 24 }} aria-live="polite">
              <Alert type="info" showIcon message={t('register.verificationTitle')} description={t('register.verificationDescription')} />
              {configState === 'loading' && (
                <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>{t('register.verificationLoading')}</Text>
              )}
              {(configState === 'unavailable' || configState === 'error') && (
                <Alert
                  style={{ marginTop: 12 }}
                  type="warning"
                  showIcon
                  message={t(configState === 'error' ? 'offline.networkError' : 'register.verificationUnavailable')}
                  description={(
                    <Space wrap>
                      <Button size="small" onClick={() => { setConfigState('loading'); setConfigAttempt((attempt) => attempt + 1); }}>{t('register.verificationRetry')}</Button>
                      <a href={SUPPORT_TELEGRAM} target="_blank" rel="noopener noreferrer">{t('register.verificationSupport')}</a>
                      <Link to="/login">{t('register.loginLink')}</Link>
                    </Space>
                  )}
                />
              )}
              {configState === 'available' && (
                <>
                  {!challenge && (
                    <Button style={{ marginTop: 12 }} icon={<SendOutlined />} loading={verificationBusy === 'start'} disabled={loading} onClick={startVerification}>
                      {t('register.verificationStart')}
                    </Button>
                  )}
                  {challenge && verification.status === 'pending' && (
                    <>
                      <Text style={{ display: 'block', margin: '12px 0' }}>{t('register.verificationInstructions')}</Text>
                      <Space wrap>
                        <Button type="primary" icon={<SendOutlined />} href={challenge.telegramUrl} target="_blank" rel="noopener noreferrer">{t('register.verificationOpen')}</Button>
                        <Button loading={verificationBusy === 'check'} disabled={loading} onClick={checkVerification}>{t('register.verificationCheck')}</Button>
                        <Button type="text" disabled={loading} onClick={resetVerification}>{t('register.verificationReset')}</Button>
                      </Space>
                      <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                        {t('register.verificationExpires', { time: new Date(challenge.expiresAt).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { hour: '2-digit', minute: '2-digit' }) })}
                      </Text>
                    </>
                  )}
                  {challenge && verification.status === 'verified' && (
                    <Alert
                      style={{ marginTop: 12 }}
                      type="success"
                      showIcon
                      message={t('register.verificationConfirmed', { phone: `+${verification.phone}` })}
                      description={<Button size="small" disabled={loading} onClick={resetVerification}>{t('register.verificationChange')}</Button>}
                    />
                  )}
                  {challenge && (verification.status === 'expired' || verification.status === 'used') && (
                    <Alert
                      style={{ marginTop: 12 }}
                      type="warning"
                      showIcon
                      message={t(verification.status === 'expired' ? 'register.verificationExpired' : 'register.verificationUsed')}
                      description={(
                        <Space wrap>
                          <Button size="small" disabled={loading} onClick={resetVerification}>{t('register.verificationRetry')}</Button>
                          <Link to="/login">{t('register.loginLink')}</Link>
                        </Space>
                      )}
                    />
                  )}
                </>
              )}
              {verificationError && <Alert style={{ marginTop: 12 }} type="error" showIcon message={verificationError} />}
            </div>
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
                    { required: true, message: t('register.verificationRequired') },
                  ]}
                >
                  <Input
                    prefix={<PhoneOutlined />}
                    placeholder={t('register.verifiedPhonePlaceholder')}
                    maxLength={20}
                    readOnly
                    autoComplete="off"
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
                disabled={configState !== 'available' || verification.status !== 'verified'}
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
