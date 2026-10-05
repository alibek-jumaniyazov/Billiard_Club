import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Form, Input, Segmented, Spin } from 'antd';
import {
  ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined, CheckOutlined,
  EnvironmentOutlined, LockOutlined, SafetyCertificateOutlined, SendOutlined,
  ShopOutlined, UserOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../components/ui';
import { SUPPORT_TELEGRAM } from '../constants';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { useTrialVerification } from '../hooks/useTrialVerification';
import '../styles/auth.css';

interface RegisterForm {
  clubName: string;
  ownerName: string;
  address: string;
  username: string;
  password: string;
  confirmPassword: string;
  website?: string;
}

type RegistrationStep = 0 | 1 | 2;
const CLUB_FIELDS: (keyof RegisterForm)[] = ['clubName', 'ownerName', 'address'];

/** Phone is never a form field: only the server-confirmed contact is submitted. */
const Register = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { lang, setLang } = useAppSettings();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<RegisterForm>();
  const clubName = Form.useWatch('clubName', form);
  const ownerName = Form.useWatch('ownerName', form);
  const address = Form.useWatch('address', form);
  const [step, setStep] = useState<RegistrationStep>(0);
  const [loading, setLoading] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const flowVersion = useRef(0);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const invalidateProgress = useCallback(() => {
    flowVersion.current += 1;
    setSubmitError(null);
    setStep(0);
  }, []);
  const trial = useTrialVerification(invalidateProgress);

  useDocumentHead('register.docTitle', 'landing.metaRegisterDescription');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; flowVersion.current += 1; };
  }, []);

  useEffect(() => {
    if (previousStep.current !== step) heading.current?.focus();
    previousStep.current = step;
  }, [step]);

  useEffect(() => {
    const invalidFields = form.getFieldsError().filter((field) => field.errors.length > 0).map((field) => field.name);
    if (invalidFields.length) void form.validateFields(invalidFields).catch(() => undefined);
  }, [lang, form]);

  const nextStep = async () => {
    if (loading || advancing) return;
    if (!trial.currentProof()) { trial.expire(); return; }
    setSubmitError(null);
    if (step === 0) { setStep(1); return; }
    const version = flowVersion.current;
    setAdvancing(true);
    try {
      await form.validateFields(CLUB_FIELDS);
      if (version !== flowVersion.current || !mounted.current) return;
      if (!trial.currentProof()) { trial.expire(); return; }
      setStep(2);
    } catch {
      // Specific field errors stay beside inputs; form values are preserved.
    } finally {
      if (mounted.current) setAdvancing(false);
    }
  };

  const onFinish = async (values: RegisterForm) => {
    if (submitting.current || step !== 2) return;
    const proof = trial.currentProof();
    if (!proof) { trial.expire(); return; }
    submitting.current = true;
    setLoading(true);
    setSubmitError(null);
    try {
      const result = await register({
        clubName: values.clubName.trim(), ownerName: values.ownerName.trim(),
        address: values.address.trim(), username: values.username.trim(),
        password: values.password, website: values.website,
        phone: proof.phone, trialVerificationId: proof.id, trialVerificationToken: proof.token,
      });
      if (!mounted.current) return;
      if (result.ok) {
        message.success(t('register.successTitle'));
        navigate('/dashboard', { replace: true });
      } else {
        setSubmitError(result.reason === 'network' ? t('offline.networkError') :
          result.message || t(result.reason === 'rateLimited' ? 'offline.rateLimited' : 'common.error'));
      }
    } catch (error) {
      if (mounted.current) setSubmitError(trial.failure(error));
    } finally {
      submitting.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  const labels = ['stepTelegram', 'stepClub', 'stepAccount'];
  const titles = ['verificationTitle', 'clubTitle', 'accountTitle'];
  const descriptions = ['verificationDescription', 'clubDescription', 'accountDescription'];

  return (
    <main className="auth-shell">
      <header className="auth-topbar">
        <Link className="auth-home" to="/" aria-label={t('register.backHome')}><BrandLogo size={34} withWordmark /></Link>
        <Segmented className="auth-language" aria-label={t('register.language')} value={lang}
          onChange={(value) => setLang(value as 'uz' | 'ru')}
          options={[{ label: "O'z", value: 'uz' }, { label: 'Ру', value: 'ru' }]} />
      </header>

      <div className="auth-layout auth-layout--register">
        <aside className="auth-story">
          <span className="auth-eyebrow">{t('register.storyEyebrow')}</span>
          <h1>{t('register.storyTitle')}</h1>
          <p className="auth-story-description">{t('register.storyDescription')}</p>
          <ul className="auth-benefits">
            {['Time', 'Sales', 'Control'].map((benefit) => (
              <li key={benefit}><CheckCircleOutlined aria-hidden />
                <div><strong>{t(`register.benefit${benefit}`)}</strong><span>{t(`register.benefit${benefit}Description`)}</span></div>
              </li>
            ))}
          </ul>
          <div className="auth-story-footer"><SafetyCertificateOutlined aria-hidden /><span>{t('register.trialNote')}</span></div>
        </aside>

        <section className="auth-panel auth-panel--register" aria-labelledby="register-heading">
          <div className="auth-panel-heading">
            <span className="auth-eyebrow">{t('register.subtitle')}</span>
            <h2 id="register-heading" ref={heading} tabIndex={-1}>{t(`register.${titles[step]}`)}</h2>
            <p>{t(`register.${descriptions[step]}`)}</p>
          </div>

          <ol className="auth-steps" aria-label={t('register.progressLabel')}>
            {labels.map((label, index) => (
              <li key={label} className={index === step ? 'is-current' : index < step ? 'is-complete' : ''} aria-current={index === step ? 'step' : undefined}>
                <span className="auth-step-number" aria-hidden>{index < step ? <CheckOutlined /> : index + 1}</span>
                <span>{t(`register.${label}`)}</span>
              </li>
            ))}
          </ol>

          <Form form={form} className="auth-form" layout="vertical" size="large" requiredMark={false} onFinish={onFinish}
            onFinishFailed={({ errorFields }) => {
              if (!trial.proof) setStep(0);
              else setStep(errorFields.some(({ name }) => CLUB_FIELDS.includes(name[0] as keyof RegisterForm)) ? 1 : 2);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && step < 2 && event.target instanceof HTMLInputElement) {
                event.preventDefault(); void nextStep();
              }
            }}>
            <div hidden={step !== 0} className="auth-step-content" aria-live="polite">
              {trial.configState === 'loading' && <div className="auth-service-status" role="status"><Spin size="small" /><span>{t('register.verificationLoading')}</span></div>}
              {(trial.configState === 'unavailable' || trial.configState === 'error') && (
                <Alert className="auth-notice" type="warning" showIcon
                  message={t(trial.configState === 'error' ? 'offline.networkError' : 'register.verificationUnavailable')}
                  description={<div className="auth-inline-links">
                    <Button size="small" onClick={trial.reloadConfig}>{t('register.verificationRetry')}</Button>
                    <a href={SUPPORT_TELEGRAM} target="_blank" rel="noopener noreferrer">{t('register.verificationSupport')}</a>
                    <Link to="/login">{t('register.loginLink')}</Link>
                  </div>} />
              )}
              {trial.configState === 'available' && <>
                {!trial.challenge && (
                  <div className="auth-telegram-card">
                    <span className="auth-telegram-icon"><SendOutlined aria-hidden /></span>
                    <div><strong>{t('register.telegramCardTitle')}</strong><p>{t('register.telegramCardDescription')}</p></div>
                    <Button className="auth-primary" type="primary" block icon={<SendOutlined />} loading={trial.busy === 'start'} onClick={() => void trial.start(form.getFieldValue('website'))}>
                      {t('register.verificationStart')}
                    </Button>
                  </div>
                )}
                {trial.challenge && trial.verification.status === 'pending' && (
                  <div className="auth-telegram-pending">
                    <ol className="auth-instructions">
                      <li>{t('register.telegramInstruction1')}</li><li>{t('register.telegramInstruction2')}</li><li>{t('register.telegramInstruction3')}</li>
                    </ol>
                    <Button className="auth-primary" type="primary" block icon={<SendOutlined />} href={trial.challenge.telegramUrl} target="_blank" rel="noopener noreferrer">{t('register.verificationOpen')}</Button>
                    <Button block loading={trial.busy === 'check'} onClick={() => void trial.check()}>{t('register.verificationCheck')}</Button>
                    <p className="auth-helper">{t('register.verificationAutoCheck')}</p>
                    {trial.pendingNotice && <p className="auth-pending-notice" role="status">{t('register.verificationPending')}</p>}
                    <div className="auth-pending-footer">
                      <span>{t('register.verificationExpires', { time: new Date(trial.challenge.expiresAt).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { hour: '2-digit', minute: '2-digit' }) })}</span>
                      <Button type="link" size="small" onClick={trial.reset}>{t('register.verificationReset')}</Button>
                    </div>
                  </div>
                )}
                {trial.challenge && trial.verification.status === 'verified' && (
                  <div className="auth-verified">
                    <CheckCircleOutlined className="auth-verified-icon" aria-hidden />
                    <strong>{t('register.verificationConfirmed', { phone: `+${trial.verification.phone}` })}</strong>
                    <p>{t('register.verificationReady')}</p>
                    <Button className="auth-primary" type="primary" block onClick={() => void nextStep()} disabled={!trial.proof}>{t('register.next')}<ArrowRightOutlined /></Button>
                    <Button type="link" onClick={trial.reset}>{t('register.verificationChange')}</Button>
                  </div>
                )}
                {trial.challenge && (trial.verification.status === 'expired' || trial.verification.status === 'used') && (
                  <Alert className="auth-notice" type="warning" showIcon
                    message={t(trial.verification.status === 'expired' ? 'register.verificationExpired' : 'register.verificationUsed')}
                    description={<div className="auth-inline-links"><Button size="small" onClick={trial.reset}>{t('register.verificationRetry')}</Button><Link to="/login">{t('register.loginLink')}</Link></div>} />
                )}
              </>}
              {trial.error && <Alert className="auth-notice" role="alert" type="error" showIcon message={trial.error} />}
              <p className="auth-privacy-note"><SafetyCertificateOutlined aria-hidden />{t('register.verificationPrivacy')}</p>
            </div>

            <div hidden={step !== 1} className="auth-step-content">
              <Form.Item name="clubName" label={t('register.clubName')} rules={[{ required: true, min: 2, transform: (value: string) => (value ?? '').trim(), message: t('register.clubNameRequired') }]}>
                <Input prefix={<ShopOutlined />} placeholder={t('register.clubNamePlaceholder')} maxLength={150} autoComplete="organization" />
              </Form.Item>
              <Form.Item name="ownerName" label={t('register.ownerName')} rules={[{ required: true, min: 2, transform: (value: string) => (value ?? '').trim(), message: t('register.ownerNameRequired') }]}>
                <Input prefix={<UserOutlined />} placeholder={t('register.ownerNamePlaceholder')} maxLength={100} autoComplete="name" />
              </Form.Item>
              <Form.Item name="address" label={t('register.address')} rules={[{ required: true, min: 3, transform: (value: string) => (value ?? '').trim(), message: t('register.addressRequired') }]}>
                <Input prefix={<EnvironmentOutlined />} placeholder={t('register.addressPlaceholder')} maxLength={300} autoComplete="street-address" />
              </Form.Item>
            </div>

            <div hidden={step !== 2} className="auth-step-content">
              <div className="auth-review">
                <div><span>{t('register.reviewClub')}</span><strong>{clubName || '—'}</strong><p>{[ownerName, address].filter(Boolean).join(' · ')}</p></div>
                <Button type="link" size="small" disabled={loading} onClick={() => { setSubmitError(null); setStep(1); }}>{t('register.edit')}</Button>
              </div>
              <Form.Item name="username" label={t('register.username')} extra={t('register.usernameHint')}
                rules={[{ required: true, min: 3, message: t('register.usernameRequired') }, { pattern: /^[a-zA-Z0-9_.-]+$/, message: t('register.usernamePattern') }]}>
                <Input prefix={<UserOutlined />} placeholder={t('register.usernamePlaceholder')} maxLength={50} autoComplete="username" autoCapitalize="none" spellCheck={false} />
              </Form.Item>
              <Form.Item name="password" label={t('register.password')} rules={[{ required: true, min: 8, message: t('register.passwordRequired') }]}>
                <Input.Password prefix={<LockOutlined />} placeholder={t('register.passwordPlaceholder')} maxLength={100} autoComplete="new-password" />
              </Form.Item>
              <Form.Item name="confirmPassword" label={t('register.confirmPassword')} dependencies={['password']}
                rules={[{ required: true, message: t('register.confirmRequired') }, ({ getFieldValue }) => ({ validator: (_, value) => !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error(t('register.confirmMismatch'))) })]}>
                <Input.Password prefix={<LockOutlined />} placeholder={t('register.confirmPlaceholder')} maxLength={100} autoComplete="new-password" />
              </Form.Item>
            </div>

            <div className="auth-honeypot" aria-hidden="true"><Form.Item name="website" label="Website"><Input tabIndex={-1} autoComplete="off" /></Form.Item></div>
            {submitError && <Alert className="auth-notice" role="alert" type="error" showIcon message={submitError} />}
            {step > 0 && (
              <div className="auth-form-actions">
                <Button icon={<ArrowLeftOutlined />} disabled={loading || advancing} onClick={() => { setSubmitError(null); setStep(step === 2 ? 1 : 0); }}>{t('register.back')}</Button>
                {step === 1 ? (
                  <Button key="next-step" className="auth-primary" type="primary" htmlType="button" loading={advancing} disabled={!trial.proof} onClick={(event) => { event.preventDefault(); void nextStep(); }}>{t('register.next')}<ArrowRightOutlined /></Button>
                ) : (
                  <Button key="submit-registration" className="auth-primary" type="primary" htmlType="submit" loading={loading} disabled={!trial.proof}>{t('register.submit')}<ArrowRightOutlined /></Button>
                )}
              </div>
            )}
          </Form>
          <footer className="auth-panel-footer">{t('register.haveAccount')} <Link to="/login">{t('register.loginLink')}</Link></footer>
        </section>
      </div>
      <footer className="auth-site-footer"><span>BILLIARD CLUB</span><a href={SUPPORT_TELEGRAM} target="_blank" rel="noopener noreferrer">{t('register.verificationSupport')} <ArrowRightOutlined aria-hidden /></a></footer>
    </main>
  );
};

export default Register;
