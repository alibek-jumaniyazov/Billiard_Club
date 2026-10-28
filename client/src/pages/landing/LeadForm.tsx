import { useState } from 'react';
import { Alert, Button, Form, Input, InputNumber } from 'antd';
import { CheckCircleFilled, PhoneOutlined, SendOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage, publicApi } from '../../api';
import { SUPPORT_TELEGRAM } from '../../constants';

/**
 * "Bepul konsultatsiya" arizasi — ro'yxatdan o'tishga hali tayyor bo'lmagan
 * klub egasi faqat ism va telefon qoldiradi. Ariza bazaga yoziladi va
 * platforma egasiga Telegram orqali darhol yetkaziladi (POST /public/leads).
 *
 * `website` — honeypot: odam uni ko'rmaydi, bot to'ldiradi.
 */

interface LeadValues {
  name: string;
  phone: string;
  clubName?: string;
  tablesCount?: number | null;
  message?: string;
  website?: string;
}

/** +998 90 123 45 67 / 901234567 / +7 ... — 9..15 raqam */
const PHONE_RE = /^\+?[\d\s()-]{9,20}$/;

const LeadForm = () => {
  const { t, i18n } = useTranslation();
  const [form] = Form.useForm<LeadValues>();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (values: LeadValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await publicApi.lead({
        name: values.name.trim(),
        phone: values.phone.trim(),
        clubName: values.clubName?.trim() || undefined,
        tablesCount: values.tablesCount ?? undefined,
        message: values.message?.trim() || undefined,
        lang: i18n.language.startsWith('ru') ? 'ru' : 'uz',
        website: values.website,
      });
      setDone(true);
      form.resetFields();
    } catch (err) {
      setError(apiErrorMessage(err, t, t('landing.leadError')));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="lp-lead lp-lead--done" role="status">
        <CheckCircleFilled className="lp-lead__done-icon" aria-hidden />
        <h3>{t('landing.leadDoneTitle')}</h3>
        <p>{t('landing.leadDoneDesc')}</p>
        <div className="lp-lead__done-actions">
          <Button
            type="primary"
            className="lp-cta-btn"
            size="large"
            icon={<SendOutlined />}
            href={SUPPORT_TELEGRAM}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('landing.leadDoneTelegram')}
          </Button>
          <Button size="large" onClick={() => setDone(false)}>
            {t('landing.leadAgain')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-lead">
      <div className="lp-lead__head">
        <span className="lp-lead__badge">
          <PhoneOutlined aria-hidden /> {t('landing.leadBadge')}
        </span>
        <h3>{t('landing.leadTitle')}</h3>
        <p>{t('landing.leadSubtitle')}</p>
      </div>
      <Form<LeadValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={submit}
        disabled={submitting}
        className="lp-lead__form"
      >
        <div className="lp-lead__grid">
          <Form.Item
            name="name"
            label={t('landing.leadName')}
            rules={[
              { required: true, whitespace: true, message: t('landing.leadNameRequired') },
              { max: 80, message: t('landing.leadTooLong') },
            ]}
          >
            <Input size="large" autoComplete="name" placeholder={t('landing.leadNamePh')} />
          </Form.Item>
          <Form.Item
            name="phone"
            label={t('landing.leadPhone')}
            rules={[
              { required: true, message: t('landing.leadPhoneRequired') },
              {
                validator: (_, value?: string) => {
                  const digits = (value ?? '').replace(/\D/g, '');
                  return !value || (PHONE_RE.test(value.trim()) && digits.length >= 9 && digits.length <= 15)
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('landing.leadPhoneInvalid')));
                },
              },
            ]}
          >
            <Input
              size="large"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+998 90 123 45 67"
            />
          </Form.Item>
          <Form.Item
            name="clubName"
            label={t('landing.leadClub')}
            rules={[{ max: 120, message: t('landing.leadTooLong') }]}
          >
            <Input size="large" autoComplete="organization" placeholder={t('landing.leadClubPh')} />
          </Form.Item>
          <Form.Item name="tablesCount" label={t('landing.leadTables')}>
            <InputNumber size="large" min={1} max={500} precision={0} style={{ width: '100%' }} placeholder="8" />
          </Form.Item>
        </div>
        <Form.Item
          name="message"
          label={t('landing.leadMessage')}
          rules={[{ max: 1000, message: t('landing.leadTooLong') }]}
        >
          <Input.TextArea rows={3} maxLength={1000} placeholder={t('landing.leadMessagePh')} />
        </Form.Item>
        {/* Honeypot — ekrandan va ekran o'quvchidan yashirilgan */}
        <Form.Item name="website" className="lp-hp" aria-hidden>
          <Input tabIndex={-1} autoComplete="off" />
        </Form.Item>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={submitting}
          className="lp-cta-btn"
          style={{ height: 50 }}
        >
          {t('landing.leadSubmit')}
        </Button>
        <p className="lp-lead__privacy">{t('landing.leadPrivacy')}</p>
      </Form>
    </div>
  );
};

export default LeadForm;
