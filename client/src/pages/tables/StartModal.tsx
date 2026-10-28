import { useEffect, useState } from 'react';
import { Alert, App, Form, Input, Modal, Segmented } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, isNetworkError, reservationsApi, sessionsApi } from '../../api';
import { useConnection } from '../../context/ConnectionContext';
import { useCurrency } from '../../context/AppSettingsContext';
import { newActionKey, queueStartSession } from '../../offline/pos';
import { isFormValidationError } from '../../utils/formErrors';
import type { BilliardTable, Reservation, Session } from '../../types';
import { formatClock, formatMoney } from '../../utils/format';

interface StartValues {
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  /** 0 — cheklanmagan (Segmented null qiymatni qabul qilmaydi) */
  plannedMinutes?: number;
}

/** Belgilangan vaqt tanlovlari (daqiqa); 0 — cheklanmagan o'yin */
const PLAN_OPTIONS = [0, 30, 60, 120, 180] as const;

/** Forma qiymatlari -> server tanasi: 0 daqiqa "cheklanmagan" degani */
const toStartValues = ({ plannedMinutes, ...rest }: StartValues) => ({
  ...rest,
  ...(plannedMinutes ? { plannedMinutes } : {}),
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

/** Yaqin 12 soat ichidagi kutilayotgan/tasdiqlangan bronlar ogohlantirishi */
const RESERVATION_WINDOW_MS = 12 * 3600_000;

const StartModal = ({ table, onClose, onStarted, onQueuedOffline, offsetMs }: StartModalProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { online } = useConnection();
  const currency = useCurrency();
  const [form] = Form.useForm<StartValues>();
  const [submitting, setSubmitting] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    if (!table) return;
    form.resetFields();
    setReservations([]);
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
  }, [table, form]);

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
      if (!online) {
        await queueStartSession(table, values, key, offsetMs);
        message.success(t('offline.savedOffline'));
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
          await queueStartSession(table, values, key, offsetMs);
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
          name="plannedMinutes"
          label={t('tables.plannedTime')}
          extra={t('tables.plannedHint')}
          initialValue={0}
        >
          <Segmented<number>
            block
            className="table-plan-picker"
            options={PLAN_OPTIONS.map((m) => ({
              value: m,
              label: t(m === 0 ? 'tables.planUnlimited' : `tables.plan${m}`),
            }))}
          />
        </Form.Item>
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
