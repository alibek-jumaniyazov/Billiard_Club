import { memo, useEffect, useState } from 'react';
import { Form, Modal } from 'antd';
import { BellOutlined, HourglassOutlined, WalletOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { MoneyText, useNow } from '../../components/ui';
import { useCurrency } from '../../context/AppSettingsContext';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Session } from '../../types';
import { isFormValidationError } from '../../utils/formErrors';
import { formatClock, formatMoney } from '../../utils/format';
import { limitProblem, quickLimitAmounts } from '../../utils/limit';
import { sessionLimitLeftMs, sessionTableAmount, type SegmentLike } from '../../utils/session';
import LimitInput, { LimitQuick } from './LimitInput';
import { formatLimitDuration, limitErrorText } from './limit-text';

interface LimitModalProps {
  /** Band stol (sessiyasi bilan) — null bo'lsa oyna yopiq */
  table: BilliardTable | null;
  /** Sessiya segmentlari (transfer tarixi) — qolgan vaqt joriy narxdan hisoblanadi */
  segments: SegmentLike[] | null;
  offsetMs: number;
  /**
   * Limitni saqlash. `true` qaytsa oyna yopiladi; xatoda ochiq qoladi —
   * kassir summani tuzatib qayta yuboradi (xabar chaqiruvchida ko'rsatiladi).
   */
  onSubmit: (session: Session, limitAmount: number) => Promise<boolean>;
  onClose: () => void;
}

interface LimitValues {
  limitAmount?: number | null;
}

/** "Hozirgacha o'ynaldi" — jonli stol summasi (faqat shu barg har soniyada chiziladi) */
const PlayedAmount = memo(({ session, segments, fallbackPrice, offsetMs, currency }: {
  session: Session; segments: SegmentLike[] | null; fallbackPrice: number; offsetMs: number; currency: string;
}) => {
  const now = useNow();
  return (
    <MoneyText
      amount={sessionTableAmount(session, fallbackPrice, now + offsetMs, segments)}
      currency={currency}
      size="md"
      color={TOKENS.color.text.primary}
    />
  );
});
PlayedAmount.displayName = 'PlayedAmount';

/**
 * Kiritilgan limit natijasi: limitgacha qancha vaqt qolishi yoki summa
 * allaqachon o'ynab bo'lingani haqida ogohlantirish. Jonli (har soniyada).
 */
const LimitOutcome = memo(({ session, segments, fallbackPrice, pricePerHour, offsetMs, amount }: {
  session: Session; segments: SegmentLike[] | null; fallbackPrice: number; pricePerHour: number;
  offsetMs: number; amount: number | null | undefined;
}) => {
  const { t } = useTranslation();
  const now = useNow();
  // Summa hali kiritilmagan — bu yerda nima chiqishi aytiladi
  if (amount == null) return <p className="table-limit-result is-empty">{t('tables.limitEmpty')}</p>;
  // Yaroqsiz summa: sababi maydon ostida qizil bilan yozilgan — takrorlanmaydi
  if (limitProblem(amount, pricePerHour) !== null) return null;
  const leftMs = sessionLimitLeftMs({ ...session, limitAmount: amount }, fallbackPrice, now + offsetMs, segments);
  if (leftMs === null) return null;
  if (leftMs <= 0) {
    return (
      <p className="table-limit-result is-warning" role="status">
        <BellOutlined />
        <span><strong>{t('tables.limitPassed')}</strong></span>
      </p>
    );
  }
  return (
    <p className="table-limit-result" role="status">
      <HourglassOutlined />
      <span>
        <strong>{t('tables.limitLeft', { time: formatLimitDuration(leftMs / 1000, t) })}</strong>
        {/* Pauzada tugash vaqti noma'lum (o'yin qachon davom etishi ma'lum emas) */}
        {session.status === 'active' && (
          <small>{t('tables.limitUntil', { time: formatClock(now + offsetMs + leftMs) })}</small>
        )}
      </span>
    </p>
  );
});
LimitOutcome.displayName = 'LimitOutcome';

/**
 * SUMMA LIMITI OYNASI — o'yin DAVOMIDA limit qo'yish yoki o'zgartirish.
 *
 * Eng ko'p uchraydigan holat: limit tugadi, mijoz "yana 20 mingga" deydi —
 * kassir "+20 000" ni bosadi va saqlaydi. Maydonda har doim limitning JAMI
 * summasi turadi (o'yin boshidan), tez tugmalar esa unga qo'shadi.
 * Belgilangan vaqtli yoki cheklanmagan o'yinga ham shu oynadan limit qo'yiladi
 * (server belgilangan vaqtni o'zi olib tashlaydi).
 */
const LimitModal = ({ table, segments, offsetMs, onSubmit, onClose }: LimitModalProps) => {
  const { t } = useTranslation();
  const currency = useCurrency();
  const [form] = Form.useForm<LimitValues>();
  const [submitting, setSubmitting] = useState(false);
  const amount = Form.useWatch('limitAmount', form);

  const session = table?.sessions?.[0] ?? null;
  const sessionId = session?.id ?? null;
  const fallbackPrice = table?.pricePerHour ?? 0;
  // JORIY narx: ochiq segment (transferdan keyin yangi stol), bo'lmasa muhrlangan narx
  const pricePerHour = segments?.find((seg) => !seg.endedAt)?.pricePerHour
    ?? session?.pricePerHour ?? fallbackPrice;
  const currentLimit = session?.limitAmount ?? null;

  // Oyna ochilganda (yoki boshqa sessiyaga o'tganda) maydon joriy limit bilan
  // to'ldiriladi. Bog'liqlik ATAYLAB faqat sessiya ID si: har 15 soniyadagi
  // poll sessiyani yangilaganda kassir terayotgan qiymat o'chib ketmasin.
  useEffect(() => {
    if (sessionId === null) return;
    form.setFieldsValue({ limitAmount: currentLimit });
  }, [sessionId, form]); // currentLimit — yuqoridagi izohga qarang

  /** "+20 000" tugmasi: yig'indi yoziladi va darhol tekshiriladi (eski xato o'chadi) */
  const pickLimit = (next: number) => {
    form.setFieldValue('limitAmount', next);
    void form.validateFields(['limitAmount']).catch(() => undefined);
  };

  const handleOk = async () => {
    if (!session) return;
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      if (values.limitAmount == null) return;
      if (await onSubmit(session, values.limitAmount)) onClose();
    } catch (err) {
      // Forma xatosi maydon ostida ko'rinadi. Server xatosini onSubmit o'zi
      // ko'rsatadi va `false` qaytaradi — bu yerga faqat kutilmagan xato keladi.
      if (!isFormValidationError(err)) console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`${t('tables.limitEditTitle')} — ${t('common.table')} ${table?.number ?? ''}`}
      className="table-session-modal"
      width="min(460px, calc(100vw - 24px))"
      centered
      open={!!table && !!session}
      onCancel={() => { if (!submitting) onClose(); }}
      maskClosable={!submitting}
      closable={!submitting}
      keyboard={!submitting}
      onOk={() => void handleOk()}
      confirmLoading={submitting}
      okText={t('btn.save')}
      okButtonProps={{ icon: <WalletOutlined /> }}
      cancelText={t('btn.cancel')}
      destroyOnHidden
    >
      <div className="table-session-intro"><div><strong>{table?.name}</strong><small>{t('tables.startRate')}</small></div>
        <strong>{formatMoney(pricePerHour, currency)}</strong></div>
      {session && (
        <dl className="table-limit-facts">
          <div>
            <dt>{t('tables.limitPlayed')}</dt>
            <dd><PlayedAmount session={session} segments={segments} fallbackPrice={fallbackPrice} offsetMs={offsetMs} currency={currency} /></dd>
          </div>
          {currentLimit !== null && (
            <div>
              <dt>{t('tables.limitCurrent')}</dt>
              <dd><MoneyText amount={currentLimit} currency={currency} size="md" color={TOKENS.color.text.primary} /></dd>
            </div>
          )}
        </dl>
      )}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        size="large"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && !submitting) {
            e.preventDefault();
            void handleOk();
          }
        }}
      >
        <div className="table-limit-box">
          <Form.Item
            name="limitAmount"
            label={t('tables.limitAmount')}
            validateFirst
            rules={[{
              validator: (_, value: number | null | undefined) => {
                const problem = limitErrorText(value, pricePerHour, t);
                return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
              },
            }]}
          >
            <LimitInput currency={currency} focusOnMount />
          </Form.Item>
          <LimitQuick amounts={quickLimitAmounts(pricePerHour, 3)} value={amount} mode="add" onPick={pickLimit} />
          {session && (
            <LimitOutcome
              session={session}
              segments={segments}
              fallbackPrice={fallbackPrice}
              pricePerHour={pricePerHour}
              offsetMs={offsetMs}
              amount={amount}
            />
          )}
          <p className="table-limit-note">{t('tables.limitHint')}</p>
        </div>
      </Form>
    </Modal>
  );
};

export default LimitModal;
