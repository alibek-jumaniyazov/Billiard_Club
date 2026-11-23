import { memo, useEffect, useState } from 'react';
import { Alert, App, ConfigProvider, Form, Input, Modal, Segmented, Tooltip } from 'antd';
import type { SegmentedProps } from 'antd';
import { HourglassOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, isNetworkError, reservationsApi, sessionsApi } from '../../api';
import { useNow } from '../../components/ui';
import { useConnection } from '../../context/ConnectionContext';
import { useAppSettings, useCurrency } from '../../context/AppSettingsContext';
import { hasPendingOps } from '../../offline/overlay';
import { newActionKey, queueStartSession } from '../../offline/pos';
import { isFormValidationError } from '../../utils/formErrors';
import type { BilliardTable, Reservation, Session } from '../../types';
import { formatClock, formatMoney, formatNumber } from '../../utils/format';
import { limitDuration, limitProblem, limitSeconds, quickLimitAmounts } from '../../utils/limit';
import { useEntitlements } from '../../hooks/useEntitlements';
import LimitInput, { LimitQuick } from './LimitInput';
import { formatLimitDuration, limitErrorText } from './limit-text';

/**
 * O'yin vaqti tanlovi:
 *  - 0        — cheklanmagan (Segmented null qiymatni qabul qilmaydi);
 *  - 30…180   — belgilangan vaqt (daqiqa);
 *  - 'limit'  — summa limiti: kassir pul kiritadi, vaqt stol narxidan chiqadi.
 */
type PlanChoice = number | 'limit';

interface StartValues {
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  plan?: PlanChoice;
  /** Faqat plan === 'limit' bo'lganda */
  limitAmount?: number | null;
}

/** Belgilangan vaqt tanlovlari (daqiqa); 0 — cheklanmagan o'yin */
const PLAN_OPTIONS = [0, 30, 60, 120, 180] as const;

/**
 * Forma qiymatlari -> server tanasi. Vaqt va summa limiti BIRGA yuborilmaydi:
 * 'limit' tanlansa faqat limitAmount, vaqt tanlansa faqat plannedMinutes,
 * 0 (cheklanmagan) bo'lsa ikkalasi ham yo'q.
 */
const toStartValues = ({ plan, limitAmount, ...rest }: StartValues) => ({
  ...rest,
  ...(plan === 'limit'
    ? limitAmount
      ? { limitAmount }
      : {}
    : plan
      ? { plannedMinutes: plan }
      : {}),
});

interface StartModalProps {
  /** null — modal yopiq */
  table: BilliardTable | null;
  onClose: () => void;
  /** Muvaffaqiyatli boshlangan sessiya (segment keshi uchun) */
  onStarted: (session: Session) => void;
  /**
   * Internet yo'q edi — o'yin NAVBATGA yozildi. Sessiyaning serverdagi ID si
   * hali yo'q, shuning uchun bu yerda `Session` uzatilmaydi: ekrandagi holatni
   * navbat qoplamasi (offline/overlay.ts) chizadi.
   */
  onQueuedOffline: () => void;
  /**
   * Server soati bilan farq (ms). Oflayn boshlangan o'yinning vaqt muhri
   * AYNAN shu soatdan olinadi — ekrandagi taymer bilan serverga yoziladigan
   * boshlanish vaqti bir xil bo'lishi uchun (offline/pos.ts izohiga qarang).
   */
  offsetMs: number;
}

/**
 * O'yin vaqti tanlovi (Form.Item ichida: value / onChange).
 *
 * Sirpanish animatsiyasi ATAYLAB o'chirilgan. Tor ekranda olti variant 3×2
 * to'rga o'tadi (tables-workspace.css), antd Segmented esa tanlangan katakni
 * faqat sirpanish tugagach bo'yaydi va sirpanishni gorizontal siljish bo'yicha
 * kutadi: bir USTUN ichida (masalan "Cheksiz" -> "2 soat") siljish nolga teng,
 * animatsiya boshlanmaydi va tanlov umuman bo'yalmay qolardi.
 */
const NO_MOTION_THEME = { token: { motion: false } };
const PlanPicker = (props: SegmentedProps<PlanChoice>) => (
  <ConfigProvider theme={NO_MOTION_THEME}>
    <Segmented<PlanChoice> block className="table-plan-picker" {...props} />
  </ConfigProvider>
);

/** Yaqin 12 soat ichidagi kutilayotgan/tasdiqlangan bronlar ogohlantirishi */
const RESERVATION_WINDOW_MS = 12 * 3600_000;

/**
 * Limit natijasi: "50 000 so'm = 1 soat 15 daqiqa o'yin · taxminan 21:45 gacha".
 * Kassir summani terishi bilan mijozga necha daqiqa berilishini ko'radi.
 * Tugash vaqti soat bo'yicha yuradi, shuning uchun faqat shu barg sekundlik
 * tikka obuna (butun oyna har soniyada qayta chizilmaydi).
 */
const LimitPreview = memo(({ amount, pricePerHour, currency, offsetMs }: {
  amount: number | null | undefined; pricePerHour: number; currency: string; offsetMs: number;
}) => {
  const { t } = useTranslation();
  const now = useNow();
  // Summa hali kiritilmagan — bu yerda nima chiqishi aytiladi
  if (amount == null) return <p className="table-limit-result is-empty">{t('tables.limitEmpty')}</p>;
  // Yaroqsiz summa: sababi maydon ostida qizil bilan yozilgan — takrorlanmaydi
  const seconds = limitProblem(amount, pricePerHour) === null ? limitSeconds(amount, pricePerHour) : null;
  if (seconds === null) return null;
  return (
    <p className="table-limit-result" role="status">
      <HourglassOutlined />
      <span>
        <strong>
          {t('tables.limitEquals', {
            amount: formatMoney(amount, currency),
            // Butun daqiqaga teng bo'lmasa "≈": ko'rsatilgan vaqt pastga yaxlitlangan
            sign: limitDuration(seconds).approximate ? '≈' : '=',
            time: formatLimitDuration(seconds, t),
          })}
        </strong>
        <small>{t('tables.limitUntil', { time: formatClock(now + offsetMs + seconds * 1000) })}</small>
      </span>
    </p>
  );
});
LimitPreview.displayName = 'LimitPreview';

const StartModal = ({ table, onClose, onStarted, onQueuedOffline, offsetMs }: StartModalProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { online, entries } = useConnection();
  const currency = useCurrency();
  // Internetsiz boshlangan o'yinga klubning yaxlitlash qadami muhrlanadi
  const { roundingStep } = useAppSettings();
  const [form] = Form.useForm<StartValues>();
  const [submitting, setSubmitting] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  // Bron — tarif imkoniyati; yo'q bo'lsa ogohlantirish uchun so'ralmaydi
  const canReservations = useEntitlements().can('reservations');
  const plan = Form.useWatch('plan', form);
  const limitAmount = Form.useWatch('limitAmount', form);
  const pricePerHour = table?.pricePerHour ?? 0;
  // Bepul stolda (narx 0) limitga hech qachon yetilmaydi — tanlov o'chiriladi
  const limitAvailable = pricePerHour > 0;
  const quickAmounts = quickLimitAmounts(pricePerHour);

  useEffect(() => {
    if (!table) return;
    form.resetFields();
    setReservations([]);
    if (!canReservations) return;
    // Bron ogohlantirishi — xato bo'lsa jimgina e'tiborsiz (boshlashga to'siq emas)
    let alive = true;
    const from = new Date();
    const to = new Date(from.getTime() + RESERVATION_WINDOW_MS);
    reservationsApi
      .list({ tableId: table.id, from: from.toISOString(), to: to.toISOString(), limit: 5 })
      .then((res) => {
        if (!alive) return;
        setReservations(
          (res.data ?? []).filter((r) => r.status === 'pending' || r.status === 'confirmed'),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [table, form, canReservations]);

  /** Tez tanlash tugmasi: summa yoziladi va darhol tekshiriladi (eski xato o'chadi) */
  const pickLimit = (next: number) => {
    form.setFieldValue('limitAmount', next);
    void form.validateFields(['limitAmount']).catch(() => undefined);
  };

  const handleOk = async () => {
    if (!table) return;
    setSubmitting(true);
    // Bir martalik kalit — onlayn urinish va navbatdagi takror uchun BIR XIL
    // (takroriy so'rov ikkinchi sessiya ochib yubormasin)
    const key = newActionKey();
    try {
      // Validatsiya try ICHIDA — rad javob "unhandled rejection" bo'lib qolmasin
      const values = toStartValues(await form.validateFields());

      // OFLAYN: o'yin navbatga yoziladi va ekranda darhol ko'rinadi.
      // Taymer `startTime` dan yuradi, ya'ni aloqa tiklanganda vaqt ham,
      // summa ham yo'qolmaydi (offline/pos.ts izohiga qarang).
      // Stolda yuborilmagan amal bo'lsa (masalan oldingi o'yinning oflayn
      // hisob-kitobi yoki bekor qilinishi) — internet bo'lsa ham navbat orqali:
      // aks holda server stolni hali band deb rad etardi
      const pendingOps = hasPendingOps(entries, null, [table.id]);
      if (!online || pendingOps) {
        await queueStartSession(table, values, key, offsetMs, roundingStep);
        message.success(t(online ? 'offline.savedQueued' : 'offline.savedOffline'));
        onQueuedOffline();
        onClose();
        return;
      }

      const res = await sessionsApi.start({ tableId: table.id, ...values }, key);
      message.success(res.message);
      onStarted(res.data);
      onClose();
    } catch (err) {
      if (isFormValidationError(err)) return;
      // Aloqa aynan shu so'rovda uzildi — o'yin yo'qolmasin, navbatga tushsin
      if (isNetworkError(err)) {
        try {
          const values = toStartValues(form.getFieldsValue());
          await queueStartSession(table, values, key, offsetMs, roundingStep);
          message.success(t('offline.savedOffline'));
          onQueuedOffline();
          onClose();
          return;
        } catch {
          // navbatga ham yozib bo'lmadi — oddiy xato ko'rsatiladi
        }
      }
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`${t('tables.startTitle')} — ${t('common.table')} ${table?.number ?? ''}`}
      className="table-session-modal"
      width="min(520px, calc(100vw - 24px))"
      centered
      open={!!table}
      onCancel={() => { if (!submitting) onClose(); }}
      maskClosable={!submitting}
      closable={!submitting}
      keyboard={!submitting}
      onOk={() => void handleOk()}
      confirmLoading={submitting}
      okText={t('tables.start')}
      okButtonProps={{ icon: <PlayCircleOutlined /> }}
      cancelText={t('btn.cancel')}
      destroyOnHidden
    >
      <div className="table-session-intro"><div><strong>{table?.name}</strong><small>{t('tables.startRate')}</small></div>
        <strong>{formatMoney(table?.pricePerHour ?? 0, currency)}</strong></div>
      {reservations.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('tables.reservationWarnTitle')}
          description={reservations.slice(0, 3).map((r) => (
            <div key={r.id}>
              {t('tables.reservationWarnLine', {
                time: formatClock(r.startsAt),
                name: r.customerName || r.customer?.name || t('tables.guest'),
              })}
            </div>
          ))}
        />
      )}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        size="large"
        onKeyDown={(e) => {
          // Enter — darhol boshlash (izoh maydonida esa yangi qator qoldiradi)
          if (
            e.key === 'Enter' &&
            (e.target as HTMLElement).tagName !== 'TEXTAREA' &&
            !e.nativeEvent.isComposing &&
            !submitting
          ) {
            e.preventDefault();
            void handleOk();
          }
        }}
      >
        <Form.Item name="customerName" label={t('tables.customerNameOptional')}>
          <Input maxLength={100} autoFocus />
        </Form.Item>
        <Form.Item
          name="plan"
          label={t('tables.plannedTime')}
          extra={plan === 'limit' ? undefined : t('tables.plannedHint')}
          initialValue={0}
          style={plan === 'limit' ? { marginBottom: 12 } : undefined}
        >
          <PlanPicker
            options={[
              ...PLAN_OPTIONS.map((m) => ({
                value: m as PlanChoice,
                label: t(m === 0 ? 'tables.planUnlimited' : `tables.plan${m}`),
              })),
              {
                value: 'limit' as PlanChoice,
                disabled: !limitAvailable,
                label: limitAvailable
                  ? t('tables.planLimit')
                  : <Tooltip title={t('tables.limitNeedsPrice')}><span>{t('tables.planLimit')}</span></Tooltip>,
              },
            ]}
          />
        </Form.Item>
        {/* Summa limiti: pul kiritiladi, vaqt stol narxidan o'zi chiqadi */}
        {plan === 'limit' && (
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
              <LimitInput
                currency={currency}
                placeholder={t('tables.limitPlaceholder', { amount: formatNumber(quickAmounts[2] ?? quickAmounts[0] ?? pricePerHour) })}
                focusOnMount
              />
            </Form.Item>
            <LimitQuick amounts={quickAmounts} value={limitAmount} onPick={pickLimit} />
            <LimitPreview amount={limitAmount} pricePerHour={pricePerHour} currency={currency} offsetMs={offsetMs} />
            <p className="table-limit-note">{t('tables.limitHint')}</p>
          </div>
        )}
        <Form.Item name="customerPhone" label={t('tables.customerPhoneOptional')}>
          <Input maxLength={20} placeholder="+998" inputMode="tel" />
        </Form.Item>
        <Form.Item name="notes" label={t('tables.notesOptional')} style={{ marginBottom: 0 }}>
          <Input.TextArea maxLength={2000} rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StartModal;
