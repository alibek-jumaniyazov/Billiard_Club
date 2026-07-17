import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Alert,
  App,
  Button,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Skeleton,
  Switch,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DollarOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { errorMessage, sessionsApi } from '../../api';
import { MoneyText, useNow } from '../../components/ui';
import { PAYMENT_METHODS } from '../../constants';
import { TOKENS } from '../../theme/tokens';
import type {
  BilliardTable,
  EndSessionPayload,
  EndSessionResult,
  PaymentMethod,
  Session,
  SessionReceipt,
} from '../../types';
import { formatDateTime, formatNumber, formatSeconds } from '../../utils/format';
import {
  clockOffsetMs,
  round2,
  sessionDurationSeconds,
  sessionSegmentBilling,
  sessionTableAmount,
  timingFromReceipt,
  type SegmentLike,
  type SessionTiming,
} from '../../utils/session';
import { moneyFormatter, moneyParser } from './money';

const { Text, Title } = Typography;

/* ------------------------------------------------------------------ Hisob */

interface DebtFlags {
  isDebt: boolean;
  isTableDebt: boolean;
  isBarDebt: boolean;
}

interface Totals {
  seconds: number;
  tableAmount: number;
  barAmount: number;
  gross: number;
  discount: number;
  total: number;
  debt: number;
  toPay: number;
}

/** Serverdagi end() bilan bir xil tartibda yakuniy summalarni hisoblaydi */
const computeTotals = (
  timing: SessionTiming,
  segments: SegmentLike[],
  barAmount: number,
  fallbackPrice: number,
  discount: number,
  adjustment: number,
  flags: DebtFlags,
  nowMs: number,
): Totals => {
  const tableAmount = sessionTableAmount(timing, fallbackPrice, nowMs, segments);
  const bar = round2(barAmount);
  const gross = round2(tableAmount + bar);
  const safeDiscount = Math.min(Math.max(discount || 0, 0), gross);
  const total = Math.max(0, round2(gross - safeDiscount + (adjustment || 0)));
  let debt = 0;
  if (flags.isDebt && (flags.isTableDebt || flags.isBarDebt)) {
    const tDebt = flags.isTableDebt ? tableAmount : 0;
    const bDebt = flags.isBarDebt ? bar : 0;
    debt = round2(Math.min(tDebt + bDebt, total));
  }
  return {
    seconds: sessionDurationSeconds(timing, nowMs),
    tableAmount,
    barAmount: bar,
    gross,
    discount: safeDiscount,
    total,
    debt,
    toPay: round2(total - debt),
  };
};

/* --------------------------------------------------------- Jonli chek paneli */

interface LiveReceiptProps {
  timing: SessionTiming;
  segments: SegmentLike[];
  barAmount: number;
  fallbackPrice: number;
  discount: number;
  adjustment: number;
  flags: DebtFlags;
  offsetMs: number;
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 12,
};

/**
 * Jonli chek — FAQAT shu barg komponent sekundlik tikka obuna bo'ladi.
 * Pauzada formulaning o'zi qiymatlarni muzlatadi (joriy pauza ayiriladi).
 */
const LiveReceipt = memo(
  ({ timing, segments, barAmount, fallbackPrice, discount, adjustment, flags, offsetMs }: LiveReceiptProps) => {
    const { t } = useTranslation();
    const now = useNow();
    const shifted = now + offsetMs;
    const currency = t('common.sum');

    const totals = computeTotals(
      timing,
      segments,
      barAmount,
      fallbackPrice,
      discount,
      adjustment,
      flags,
      shifted,
    );
    const segmentLines =
      segments.length > 1 ? sessionSegmentBilling(timing, segments, shifted).items : null;

    return (
      <div
        style={{
          background: TOKENS.color.bg.bg1,
          border: `1px solid ${TOKENS.color.border.subtle}`,
          borderRadius: TOKENS.radius.md,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={rowStyle}>
          <Text type="secondary">{t('common.duration')}</Text>
          <span
            className="timer-display"
            style={{ fontSize: 18, fontWeight: 700, color: TOKENS.color.neonGreen }}
          >
            {formatSeconds(totals.seconds)}
          </span>
        </div>

        {/* Segmentlar (transfer bo'lgan bo'lsa) — har biri o'z narxida */}
        {segmentLines && (
          <div
            style={{
              borderTop: `1px dashed ${TOKENS.color.border.base}`,
              paddingTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('tables.segmentsTitle')}
            </Text>
            {segmentLines.map((seg, i) => (
              <div key={seg.startedAt + String(i)} style={{ ...rowStyle, fontSize: 12.5 }}>
                <Text type="secondary" className="tabular-nums">
                  {formatNumber(seg.pricePerHour)}/{t('common.hours')} ·{' '}
                  {formatSeconds(seg.billedSeconds)}
                </Text>
                <MoneyText amount={seg.amount} size="sm" color={TOKENS.color.text.secondary} />
              </div>
            ))}
          </div>
        )}

        <div style={rowStyle}>
          <Text type="secondary">{t('tables.tableAmount')}</Text>
          <MoneyText amount={totals.tableAmount} currency={currency} size="md" />
        </div>
        <div style={rowStyle}>
          <Text type="secondary">{t('tables.barAmount')}</Text>
          <MoneyText amount={totals.barAmount} currency={currency} size="md" />
        </div>
        {(totals.discount > 0 || adjustment !== 0) && (
          <div style={rowStyle}>
            <Text type="secondary">{t('tables.gross')}</Text>
            <MoneyText amount={totals.gross} currency={currency} size="sm" />
          </div>
        )}
        {totals.discount > 0 && (
          <div style={rowStyle}>
            <Text type="secondary">{t('common.discount')}</Text>
            <MoneyText
              amount={-totals.discount}
              currency={currency}
              size="sm"
              color={TOKENS.color.semantic.warning}
            />
          </div>
        )}
        {adjustment !== 0 && (
          <div style={rowStyle}>
            <Text type="secondary">{t('tables.adjustment')}</Text>
            <MoneyText amount={adjustment} currency={currency} size="sm" signed />
          </div>
        )}
        <Divider style={{ margin: '4px 0' }} />
        <div style={rowStyle}>
          <Text strong>{t('common.total')}</Text>
          <MoneyText amount={totals.total} currency={currency} size="lg" />
        </div>
        {totals.debt > 0 && (
          <div style={rowStyle}>
            <Text type="secondary">{t('tables.debtPortion')}</Text>
            <MoneyText
              amount={totals.debt}
              currency={currency}
              size="md"
              color={TOKENS.color.semantic.error}
            />
          </div>
        )}
        <div style={rowStyle}>
          <Text strong style={{ color: TOKENS.color.gold.base }}>
            {t('tables.toPayNow')}
          </Text>
          <MoneyText amount={totals.toPay} currency={currency} size="xl" color={TOKENS.color.gold.base} />
        </div>
      </div>
    );
  },
);
LiveReceipt.displayName = 'LiveReceipt';

/* ----------------------------------------------------------- Chop etish */

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );

/** Chekni yashirin iframe orqali chop etish (popup blokerlarga chidamli) */
const printHtml = (title: string, bodyHtml: string) => {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>body{font-family:'Consolas',monospace;font-size:12px;color:#000;margin:0;padding:12px;max-width:300px}` +
      `h1{font-size:14px;text-align:center;margin:0 0 4px}` +
      `.c{text-align:center;margin:0 0 8px}` +
      `.r{display:flex;justify-content:space-between;gap:8px;margin:2px 0}` +
      `.b{font-weight:700}hr{border:none;border-top:1px dashed #000;margin:6px 0}</style>` +
      `</head><body>${bodyHtml}</body></html>`,
  );
  doc.close();
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  window.setTimeout(() => frame.remove(), 2000);
};

/* --------------------------------------------------------------- Drawer */

interface PaymentRow {
  method?: PaymentMethod;
  amount?: number;
}

interface EndFormValues {
  discount?: number;
  adjustmentAmount?: number;
  adjustmentReason?: string;
  split?: boolean;
  payments?: PaymentRow[];
  paymentMethod: PaymentMethod;
  isDebt?: boolean;
  isTableDebt?: boolean;
  isBarDebt?: boolean;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

interface CheckoutDrawerProps {
  /** Band stol — null bo'lsa drawer yopiq */
  table: BilliardTable | null;
  /** Qo'lda tuzatish huquqi (faqat admin/superadmin) */
  isAdmin: boolean;
  /** Klub nomi (chop etiladigan chek sarlavhasi) */
  clubName: string;
  onClose: () => void;
  /** Sessiya holati o'zgardi (pauza/davom) — sahifa jimgina yangilansin */
  onSessionMutated: () => void;
  /** Muvaffaqiyatli yakun — sahifa stollarni yangilasin */
  onSettled: () => void;
}

const CheckoutDrawer = ({
  table,
  isAdmin,
  clubName,
  onClose,
  onSessionMutated,
  onSettled,
}: CheckoutDrawerProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<EndFormValues>();

  const session = table?.sessions?.[0] ?? null;
  const sessionId = session?.id ?? null;
  const fallbackPrice = table?.pricePerHour ?? 0;
  const currency = t('common.sum');

  const [receipt, setReceipt] = useState<SessionReceipt | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState(false);
  const [timing, setTiming] = useState<SessionTiming | null>(null);
  const [segments, setSegments] = useState<SegmentLike[]>([]);
  const [offsetMs, setOffsetMs] = useState(0);
  const [frozeForSplit, setFrozeForSplit] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EndSessionResult | null>(null);

  const discount = Form.useWatch('discount', form) ?? 0;
  const watchedAdjustment = Form.useWatch('adjustmentAmount', form) ?? 0;
  const adjustmentAmount = isAdmin ? watchedAdjustment : 0;
  const split = Form.useWatch('split', form) ?? false;
  const payments = Form.useWatch('payments', form);
  const isDebt = Form.useWatch('isDebt', form) ?? false;
  const isTableDebt = Form.useWatch('isTableDebt', form) ?? false;
  const isBarDebt = Form.useWatch('isBarDebt', form) ?? false;

  const flags: DebtFlags = useMemo(
    () => ({ isDebt, isTableDebt, isBarDebt }),
    [isDebt, isTableDebt, isBarDebt],
  );

  const loadReceipt = useCallback(async () => {
    if (!sessionId) return;
    setReceiptLoading(true);
    setReceiptError(false);
    try {
      const res = await sessionsApi.receipt(sessionId);
      const r = res.data;
      setReceipt(r);
      setOffsetMs(clockOffsetMs(r.serverNow));
      setTiming(timingFromReceipt(r));
      setSegments((r.segments ?? []) as SegmentLike[]);
      form.setFieldsValue({ isBarDebt: r.barAmount > 0 });
    } catch {
      setReceiptError(true);
    } finally {
      setReceiptLoading(false);
    }
  }, [sessionId, form]);

  // Ochilganda: holatni tozalash + chekni yuklash
  useEffect(() => {
    if (!table) return;
    setReceipt(null);
    setTiming(null);
    setSegments([]);
    setResult(null);
    setFrozeForSplit(false);
    form.resetFields();
    form.setFieldsValue({
      discount: 0,
      adjustmentAmount: 0,
      adjustmentReason: '',
      split: false,
      payments: [],
      paymentMethod: 'cash',
      isDebt: false,
      isTableDebt: true,
      isBarDebt: false,
      customerName: session?.customerName ?? '',
      customerPhone: session?.customerPhone ?? '',
      notes: '',
    });
    void loadReceipt();
    // table sahifadan olingan SNAPSHOT — drawer ochiq payt identligi o'zgarmaydi,
    // shuning uchun bu effekt faqat yangi ochilishda ishlaydi
  }, [table, session, form, loadReceipt]);

  const applySession = useCallback((s: Session) => {
    setTiming({
      startTime: s.startTime,
      status: s.status,
      pausedAt: s.pausedAt,
      totalPausedMs: s.totalPausedMs,
      pricePerHour: s.pricePerHour,
    });
  }, []);

  /** Muzlatilgan (pauzadagi) holatda statik yakuniy summalar */
  const staticTotals = useMemo(() => {
    if (!timing || !receipt) return null;
    return computeTotals(
      timing,
      segments,
      receipt.barAmount,
      fallbackPrice,
      discount,
      adjustmentAmount,
      flags,
      Date.now() + offsetMs,
    );
  }, [timing, receipt, segments, fallbackPrice, discount, adjustmentAmount, flags, offsetMs]);

  const paymentsSum = round2(
    (payments ?? []).reduce((acc, r) => acc + (r?.amount || 0), 0),
  );
  const splitTarget = staticTotals?.toPay ?? 0;
  const splitRemaining = round2(splitTarget - paymentsSum);
  const splitOk = Math.abs(splitRemaining) <= 0.01;

  /** Bo'lib to'lash yoqilganda vaqt muzlatiladi (server bilan aniq tenglik) */
  const handleSplitToggle = async (checked: boolean) => {
    if (!sessionId || !timing) return;
    if (checked) {
      let frozenTiming = timing;
      if (timing.status === 'active') {
        setFreezing(true);
        try {
          const res = await sessionsApi.pause(sessionId);
          applySession(res.data);
          frozenTiming = {
            startTime: res.data.startTime,
            status: res.data.status,
            pausedAt: res.data.pausedAt,
            totalPausedMs: res.data.totalPausedMs,
            pricePerHour: res.data.pricePerHour,
          };
          setFrozeForSplit(true);
          onSessionMutated();
        } catch (err) {
          message.error(errorMessage(err, t('common.error')));
          form.setFieldsValue({ split: false });
          setFreezing(false);
          return;
        }
        setFreezing(false);
      }
      // Bitta qator bilan boshlaymiz — qoldiqni to'liq qoplaydi
      const target = computeTotals(
        frozenTiming,
        segments,
        receipt?.barAmount ?? 0,
        fallbackPrice,
        discount,
        adjustmentAmount,
        flags,
        Date.now() + offsetMs,
      );
      form.setFieldsValue({ payments: [{ method: 'cash', amount: target.toPay }] });
    } else if (frozeForSplit && timing.status === 'paused') {
      setFreezing(true);
      try {
        const res = await sessionsApi.resume(sessionId);
        applySession(res.data);
        setFrozeForSplit(false);
        onSessionMutated();
      } catch (err) {
        message.error(errorMessage(err, t('common.error')));
        form.setFieldsValue({ split: true });
      } finally {
        setFreezing(false);
      }
    }
  };

  /** Oxirgi to'lov qatoriga qoldiqni qo'yish */
  const fillRemaining = () => {
    const rows = (form.getFieldValue('payments') as PaymentRow[] | undefined) ?? [];
    if (rows.length === 0) return;
    const idx = rows.length - 1;
    const sumOthers = rows.reduce((acc, r, i) => (i === idx ? acc : acc + (r?.amount || 0)), 0);
    const next = [...rows];
    next[idx] = { ...next[idx], amount: Math.max(0, round2(splitTarget - sumOthers)) };
    form.setFieldsValue({ payments: next });
  };

  const handleEnd = async () => {
    if (!sessionId || !timing || !receipt) return;
    const values = await form.validateFields();

    if (values.isDebt && !values.isTableDebt && !values.isBarDebt) {
      message.warning(t('tables.debtNeedsComponent'));
      return;
    }

    const adjustment =
      isAdmin && values.adjustmentAmount ? round2(values.adjustmentAmount) : 0;
    const totals = computeTotals(
      timing,
      segments,
      receipt.barAmount,
      fallbackPrice,
      values.discount ?? 0,
      adjustment,
      {
        isDebt: !!values.isDebt,
        isTableDebt: !!values.isTableDebt,
        isBarDebt: !!values.isBarDebt,
      },
      Date.now() + offsetMs,
    );

    const payload: EndSessionPayload = {
      discount: totals.discount,
      notes: values.notes?.trim() || undefined,
      isDebt: values.isDebt || undefined,
      isTableDebt: values.isDebt ? values.isTableDebt : undefined,
      isBarDebt: values.isDebt ? values.isBarDebt : undefined,
      customerName: values.customerName?.trim() || undefined,
      customerPhone: values.customerPhone?.trim() || undefined,
    };
    if (adjustment !== 0) {
      payload.adjustment = { amount: adjustment, reason: (values.adjustmentReason ?? '').trim() };
    }
    if (values.split) {
      const rows = (values.payments ?? [])
        .filter((r): r is { method: PaymentMethod; amount: number } =>
          Boolean(r?.method && (r?.amount ?? 0) > 0),
        )
        .map((r) => ({ method: r.method, amount: round2(r.amount) }));
      const sum = round2(rows.reduce((acc, r) => acc + r.amount, 0));
      if (Math.abs(sum - totals.toPay) > 0.01) {
        message.error(t('tables.splitMismatch'));
        return;
      }
      // 100% qarz: qatorlar bo'sh qoladi — payments umuman yuborilmaydi
      if (rows.length > 0) payload.payments = rows;
    } else {
      payload.paymentMethod = values.paymentMethod;
    }

    setSubmitting(true);
    try {
      const res = await sessionsApi.end(sessionId, payload);
      message.success(res.message);
      setResult(res.data);
      onSettled();
    } catch (err) {
      message.error(errorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  /** Yopish: yakunlanmagan bo'lsa va biz muzlatgan bo'lsak — vaqt davom etadi */
  const handleClose = () => {
    if (!result && frozeForSplit && timing?.status === 'paused' && sessionId) {
      void sessionsApi
        .resume(sessionId)
        .then(() => onSessionMutated())
        .catch(() => undefined);
    }
    onClose();
  };

  const handlePrint = () => {
    if (!result) return;
    const lines: string[] = [];
    const row = (label: string, value: string, bold = false) =>
      lines.push(`<div class="r${bold ? ' b' : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`);

    lines.push(`<h1>${escapeHtml(clubName || 'Prime Billiard')}</h1>`);
    lines.push(
      `<div class="c">${escapeHtml(`${t('common.table')} ${table?.number ?? ''} — ${table?.name ?? ''}`)}<br>${escapeHtml(formatDateTime(new Date()))}</div>`,
    );
    lines.push('<hr>');
    row(t('common.duration'), formatSeconds(result.durationSeconds));
    if (result.segments && result.segments.length > 1) {
      for (const seg of result.segments) {
        row(
          `${formatNumber(seg.pricePerHour)}/${t('common.hours')} · ${formatSeconds(seg.billedSeconds)}`,
          `${formatNumber(seg.amount)} ${currency}`,
        );
      }
    }
    row(t('tables.tableAmount'), `${formatNumber(result.tableAmount)} ${currency}`);
    row(t('tables.barAmount'), `${formatNumber(result.barAmount)} ${currency}`);
    if (result.discount > 0) row(t('common.discount'), `-${formatNumber(result.discount)} ${currency}`);
    if (result.adjustmentAmount !== 0) {
      row(
        `${t('tables.adjustment')}${result.adjustmentReason ? ` (${result.adjustmentReason})` : ''}`,
        `${formatNumber(result.adjustmentAmount)} ${currency}`,
      );
    }
    lines.push('<hr>');
    row(t('common.total'), `${formatNumber(result.totalAmount)} ${currency}`, true);
    if (result.totalDebt > 0) row(t('tables.debtAmount'), `${formatNumber(result.totalDebt)} ${currency}`);
    row(t('tables.paidNow'), `${formatNumber(result.paidNow)} ${currency}`, true);
    if (result.payments.length > 1) {
      lines.push('<hr>');
      for (const p of result.payments) {
        row(t(`payment.${p.method}`), `${formatNumber(p.amount)} ${currency}`);
      }
    }
    printHtml(`${t('tables.receipt')} #${result.sessionId}`, lines.join(''));
  };

  const live = receipt?.live !== false;
  const isPausedNow = timing?.status === 'paused';

  /* ------------------------------------------------------------ Render */

  const successView = result && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <CheckCircleOutlined style={{ fontSize: 42, color: TOKENS.color.semantic.success }} />
        <Title level={4} style={{ marginTop: 12, marginBottom: 0 }}>
          {t('tables.endedTitle')}
        </Title>
      </div>
      <div
        style={{
          background: TOKENS.color.bg.bg1,
          border: `1px solid ${TOKENS.color.border.subtle}`,
          borderRadius: TOKENS.radius.md,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={rowStyle}>
          <Text type="secondary">{t('common.duration')}</Text>
          <span className="timer-display" style={{ fontWeight: 700 }}>
            {formatSeconds(result.durationSeconds)}
          </span>
        </div>
        <div style={rowStyle}>
          <Text type="secondary">{t('tables.tableAmount')}</Text>
          <MoneyText amount={result.tableAmount} currency={currency} size="md" />
        </div>
        <div style={rowStyle}>
          <Text type="secondary">{t('tables.barAmount')}</Text>
          <MoneyText amount={result.barAmount} currency={currency} size="md" />
        </div>
        {result.discount > 0 && (
          <div style={rowStyle}>
            <Text type="secondary">{t('common.discount')}</Text>
            <MoneyText
              amount={-result.discount}
              currency={currency}
              size="sm"
              color={TOKENS.color.semantic.warning}
            />
          </div>
        )}
        {result.adjustmentAmount !== 0 && (
          <div style={rowStyle}>
            <Text type="secondary">
              {t('tables.adjustment')}
              {result.adjustmentReason ? ` — ${result.adjustmentReason}` : ''}
            </Text>
            <MoneyText amount={result.adjustmentAmount} currency={currency} size="sm" signed />
          </div>
        )}
        <Divider style={{ margin: '4px 0' }} />
        <div style={rowStyle}>
          <Text strong>{t('common.total')}</Text>
          <MoneyText amount={result.totalAmount} currency={currency} size="lg" />
        </div>
        {result.totalDebt > 0 && (
          <div style={rowStyle}>
            <Text type="secondary">{t('tables.debtAmount')}</Text>
            <MoneyText
              amount={result.totalDebt}
              currency={currency}
              size="md"
              color={TOKENS.color.semantic.error}
            />
          </div>
        )}
        <div style={rowStyle}>
          <Text strong style={{ color: TOKENS.color.gold.base }}>
            {t('tables.paidNow')}
          </Text>
          <MoneyText
            amount={result.paidNow}
            currency={currency}
            size="xl"
            color={TOKENS.color.gold.base}
          />
        </div>
        {result.payments.length > 1 && (
          <div style={{ borderTop: `1px dashed ${TOKENS.color.border.base}`, paddingTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('tables.paymentsTitle')}
            </Text>
            {result.payments.map((p, i) => (
              <div key={i} style={{ ...rowStyle, fontSize: 12.5 }}>
                <Text type="secondary">{t(`payment.${p.method}`)}</Text>
                <MoneyText amount={p.amount} size="sm" color={TOKENS.color.text.secondary} />
              </div>
            ))}
          </div>
        )}
      </div>
      <Row gutter={8}>
        <Col span={12}>
          <Button block icon={<PrinterOutlined />} onClick={handlePrint}>
            {t('tables.printReceipt')}
          </Button>
        </Col>
        <Col span={12}>
          <Button block type="primary" onClick={onClose}>
            {t('btn.close')}
          </Button>
        </Col>
      </Row>
    </div>
  );

  return (
    <Drawer
      title={`${t('tables.checkoutTitle')} — ${t('common.table')} ${table?.number ?? ''}`}
      open={!!table}
      onClose={handleClose}
      width="min(480px, 100vw)"
      destroyOnHidden
      maskClosable={!submitting}
      footer={
        !result && live && timing ? (
          <Row gutter={8}>
            <Col span={10}>
              <Button block onClick={handleClose} disabled={submitting}>
                {t('btn.cancel')}
              </Button>
            </Col>
            <Col span={14}>
              <Button
                block
                type="primary"
                danger={!isDebt}
                icon={<DollarOutlined />}
                loading={submitting}
                disabled={freezing || (split && !splitOk)}
                onClick={() => void handleEnd()}
              >
                {isDebt ? t('tables.endDebt') : t('tables.endPay')}
              </Button>
            </Col>
          </Row>
        ) : null
      }
    >
      {result ? (
        successView
      ) : receiptLoading && !receipt ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : receiptError ? (
        <Alert
          type="error"
          showIcon
          message={t('tables.receiptError')}
          action={
            <Button size="small" onClick={() => void loadReceipt()}>
              {t('tables.retry')}
            </Button>
          }
        />
      ) : !live ? (
        <Alert type="warning" showIcon message={t('tables.alreadyEnded')} />
      ) : timing && receipt ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isPausedNow && (
            <Alert
              type="warning"
              showIcon
              icon={<PauseCircleOutlined />}
              message={frozeForSplit ? t('tables.splitFrozen') : t('tables.pausedBanner')}
            />
          )}

          <LiveReceipt
            timing={timing}
            segments={segments}
            barAmount={receipt.barAmount}
            fallbackPrice={fallbackPrice}
            discount={discount}
            adjustment={adjustmentAmount}
            flags={flags}
            offsetMs={offsetMs}
          />

          <Form form={form} layout="vertical" requiredMark={false}>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="discount" label={t('common.discount')} style={{ marginBottom: 12 }}>
                  <InputNumber
                    min={0}
                    step={1000}
                    style={{ width: '100%' }}
                    formatter={moneyFormatter}
                    parser={moneyParser}
                  />
                </Form.Item>
              </Col>
              {!split && (
                <Col span={12}>
                  <Form.Item
                    name="paymentMethod"
                    label={t('payment.method')}
                    rules={[{ required: true, message: t('tables.paymentRequired') }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Select
                      options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`payment.${m}`) }))}
                    />
                  </Form.Item>
                </Col>
              )}
            </Row>

            {/* Qo'lda tuzatish — faqat admin */}
            {isAdmin && (
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="adjustmentAmount"
                    label={t('tables.adjustment')}
                    tooltip={t('tables.adjustmentHint')}
                    style={{ marginBottom: 12 }}
                  >
                    <InputNumber
                      step={1000}
                      style={{ width: '100%' }}
                      formatter={moneyFormatter}
                      parser={moneyParser}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="adjustmentReason"
                    label={t('tables.adjustmentReason')}
                    rules={
                      adjustmentAmount !== 0
                        ? [{ required: true, whitespace: true, message: t('tables.reasonRequired') }]
                        : []
                    }
                    style={{ marginBottom: 12 }}
                  >
                    <Input maxLength={200} />
                  </Form.Item>
                </Col>
              </Row>
            )}

            {/* Bo'lib to'lash */}
            <Form.Item
              name="split"
              valuePropName="checked"
              label={t('tables.splitPayment')}
              style={{ marginBottom: split ? 8 : 12 }}
            >
              <Switch loading={freezing} onChange={(checked) => void handleSplitToggle(checked)} />
            </Form.Item>

            {split && (
              <div
                style={{
                  border: `1px solid ${TOKENS.color.border.base}`,
                  borderRadius: TOKENS.radius.md,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Form.List name="payments">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...rest }) => (
                        <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                          <Col flex="120px">
                            <Form.Item
                              {...rest}
                              name={[name, 'method']}
                              rules={[{ required: true, message: t('tables.splitMethodRequired') }]}
                              style={{ margin: 0 }}
                            >
                              <Select
                                options={PAYMENT_METHODS.map((m) => ({
                                  value: m,
                                  label: t(`payment.${m}`),
                                }))}
                              />
                            </Form.Item>
                          </Col>
                          <Col flex="auto">
                            <Form.Item
                              {...rest}
                              name={[name, 'amount']}
                              rules={[{ required: true, message: t('tables.splitAmountRequired') }]}
                              style={{ margin: 0 }}
                            >
                              <InputNumber
                                min={0}
                                step={1000}
                                style={{ width: '100%' }}
                                formatter={moneyFormatter}
                                parser={moneyParser}
                              />
                            </Form.Item>
                          </Col>
                          <Col flex="36px">
                            <Button
                              danger
                              type="text"
                              icon={<DeleteOutlined />}
                              onClick={() => remove(name)}
                              aria-label={t('btn.delete')}
                            />
                          </Col>
                        </Row>
                      ))}
                      <Row gutter={8}>
                        <Col span={12}>
                          <Button
                            type="dashed"
                            block
                            icon={<PlusOutlined />}
                            onClick={() => add({ method: 'cash', amount: Math.max(0, splitRemaining) })}
                          >
                            {t('tables.splitAdd')}
                          </Button>
                        </Col>
                        <Col span={12}>
                          <Button block onClick={fillRemaining} disabled={fields.length === 0}>
                            {t('tables.splitFillRemaining')}
                          </Button>
                        </Col>
                      </Row>
                    </>
                  )}
                </Form.List>

                {/* Jonli tekshiruv: yig'indi = hozir to'lanadigan summa */}
                <div style={{ ...rowStyle, marginTop: 10 }}>
                  <Text type="secondary" style={{ fontSize: 12.5 }}>
                    {t('tables.splitSum')}
                  </Text>
                  <MoneyText
                    amount={paymentsSum}
                    currency={currency}
                    size="sm"
                    color={splitOk ? TOKENS.color.semantic.success : TOKENS.color.semantic.error}
                  />
                </div>
                {!splitOk && (
                  <div style={rowStyle}>
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      {t('tables.splitRemaining')}
                    </Text>
                    <MoneyText
                      amount={splitRemaining}
                      currency={currency}
                      size="sm"
                      signed
                    />
                  </div>
                )}
                {!splitOk && (
                  <Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    {t('tables.splitMismatch')}
                  </Text>
                )}
              </div>
            )}

            {/* Qarz */}
            <Form.Item
              name="isDebt"
              valuePropName="checked"
              label={t('tables.debtQuestion')}
              style={{ marginBottom: 12 }}
            >
              <Switch checkedChildren={t('status.debt')} unCheckedChildren={t('status.paid')} />
            </Form.Item>

            {isDebt && (
              <>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item
                      name="isTableDebt"
                      valuePropName="checked"
                      label={t('tables.tableDebt')}
                      style={{ marginBottom: 12 }}
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="isBarDebt"
                      valuePropName="checked"
                      label={t('tables.barDebt')}
                      style={{ marginBottom: 12 }}
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item
                  name="customerName"
                  label={t('tables.customerName')}
                  rules={[{ required: true, whitespace: true, message: t('tables.nameRequired') }]}
                  style={{ marginBottom: 12 }}
                >
                  <Input maxLength={100} />
                </Form.Item>
                <Form.Item name="customerPhone" label={t('common.phone')} style={{ marginBottom: 12 }}>
                  <Input maxLength={20} placeholder="+998" />
                </Form.Item>
              </>
            )}

            <Form.Item name="notes" label={t('common.notes')} style={{ marginBottom: 0 }}>
              <Input.TextArea maxLength={2000} rows={2} />
            </Form.Item>
          </Form>
        </div>
      ) : null}
    </Drawer>
  );
};

export default CheckoutDrawer;
