import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Skeleton,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import {
  AuditOutlined,
  CloudUploadOutlined,
  InfoCircleOutlined,
  LockOutlined,
  PrinterOutlined,
  ReloadOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage, errorMessage, isNetworkError, shiftsApi } from '../api';
import { ElapsedTime, EmptyState, MoneyText, PageHeader, PageTransition, StatusTag } from '../components/ui';
import { useCurrency } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import {
  applyShiftOps,
  closeMustQueue,
  countOps,
  newOpKey,
  opNow,
  queueShiftClose,
  queueShiftOpen,
  shiftRefOf,
} from '../offline/ops';
import type { CashShift, ShiftReport, ShiftSummary } from '../types';
import { formatDateTime, formatMoney, formatNumber, moneyFormatter, moneyParser } from '../utils/format';
import { escapeHtml, printHtml, receiptRow } from '../utils/print';
import '../styles/shifts.css';

/** Ochiq smena hisobotini jonli yangilash davri */
const LIVE_REFRESH_MS = 30_000;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Farq: manfiy — kamomad (qizil), musbat — ortiqcha (sariq), 0 — mos (yashil) */
const DifferenceText = ({ value, currency }: { value: number; currency: string }) => {
  const { t } = useTranslation();
  const tone = value < 0 ? 'is-shortage' : value > 0 ? 'is-surplus' : 'is-balanced';
  const label = value < 0 ? t('shifts.shortage') : value > 0 ? t('shifts.surplus') : t('shifts.balanced');
  return (
    <span className={`shift-diff ${tone}`}>
      {label}
      {value !== 0 && (
        <b>
          {value > 0 ? '+' : '−'}
          {formatNumber(Math.abs(value))} {currency}
        </b>
      )}
    </span>
  );
};

/** Hisobot tanasi — joriy smena kartasida ham, Z-hisobot oynasida ham bir xil */
const SummaryBody = ({
  summary,
  shift,
  expectedCash,
  currency,
}: {
  summary: ShiftSummary;
  shift: CashShift;
  expectedCash: number | null;
  currency: string;
}) => {
  const { t } = useTranslation();
  const total = summary.byMethod.cash + summary.byMethod.card + summary.byMethod.transfer;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const rows: { key: string; value: number; negative?: boolean }[] = [
    { key: 'tableRevenue', value: summary.tableRevenue },
    { key: 'barRevenue', value: summary.barRevenue },
    { key: 'discounts', value: summary.discounts, negative: true },
    { key: 'debtPayments', value: summary.debtPayments },
    { key: 'debtsCreated', value: summary.debtsCreated },
    { key: 'expenses', value: summary.expenses },
  ];
  return (
    <>
      <div className="shift-kpis">
        <div className="shift-kpi is-accent">
          <span>{t('shifts.collected')}</span>
          <MoneyText amount={summary.collected} currency={currency} size="xl" />
        </div>
        <div className="shift-kpi">
          <span>
            {t('shifts.expectedCash')}{' '}
            <Tooltip title={t('shifts.expectedHint')}>
              <InfoCircleOutlined aria-label={t('shifts.expectedHint')} />
            </Tooltip>
          </span>
          <MoneyText amount={expectedCash ?? 0} currency={currency} size="xl" />
        </div>
        <div className="shift-kpi">
          <span>{t('shifts.sessions')}</span>
          <strong>{summary.sessionsCount}</strong>
        </div>
        {(summary.barSalesCount ?? 0) > 0 && (
          <div className="shift-kpi">
            <span>{t('shifts.barSales')}</span>
            <strong>{summary.barSalesCount}</strong>
          </div>
        )}
        <div className="shift-kpi">
          <span>{t('shifts.activeSessions')}</span>
          <strong>{summary.activeSessions}</strong>
        </div>
      </div>
      <div className="shift-breakdown">
        <div className="shift-methods">
          {(['cash', 'card', 'transfer'] as const).map((m) => (
            <div key={m} className="shift-method">
              <span>{t(`shifts.${m}`)}</span>
              <i>
                <b style={{ width: `${pct(summary.byMethod[m])}%` }} />
              </i>
              <MoneyText amount={summary.byMethod[m]} currency={currency} size="md" />
            </div>
          ))}
          <div className="shift-method is-total">
            <span>{t('shifts.total')}</span>
            <i />
            <MoneyText amount={total} currency={currency} size="md" />
          </div>
        </div>
        <dl className="shift-details">
          {rows.map((row) => (
            <div key={row.key}>
              <dt>{t(`shifts.${row.key}`)}</dt>
              <dd>
                {row.negative && row.value > 0 ? '−' : ''}
                {formatNumber(row.value)} {currency}
              </dd>
            </div>
          ))}
          <div>
            <dt>{t('shifts.openingCash')}</dt>
            <dd>
              {formatNumber(shift.openingCash)} {currency}
            </dd>
          </div>
        </dl>
      </div>
    </>
  );
};

const Shifts = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { online, entries } = useConnection();
  const { club } = useAuth();
  const currency = useCurrency();
  const screens = Grid.useBreakpoint();
  const compact = screens.md === false;

  const [report, setReport] = useState<ShiftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CashShift[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [openVisible, setOpenVisible] = useState(false);
  const [closeVisible, setCloseVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<ShiftReport | null>(null);

  const [openForm] = Form.useForm<{ openingCash?: number; note?: string }>();
  const [closeForm] = Form.useForm<{ countedCash?: number; cashOut?: number; note?: string }>();
  const countedCash = Form.useWatch('countedCash', closeForm);
  const cashOut = Form.useWatch('cashOut', closeForm);

  const tRef = useRef(t);
  tRef.current = t;

  const loadCurrent = useCallback(async () => {
    const res = await shiftsApi.current();
    setReport(res.data);
  }, []);

  const loadHistory = useCallback(async (p: number) => {
    const res = await shiftsApi.list({ page: p, limit: 10 });
    setHistory(res.data);
    setHistoryTotal(res.pagination?.total ?? res.data.length);
  }, []);

  /**
   * Joriy smena va tarix ALOHIDA yuklanadi: internetsiz paytda tarix keshda
   * bo'lmasa ham joriy smena (keshdan) ko'rinib, ochish/yopish ishlayveradi.
   */
  const loadAll = useCallback(async () => {
    setError(null);
    const [current, list] = await Promise.allSettled([loadCurrent(), loadHistory(1)]);
    if (list.status === 'fulfilled') setPage(1);
    if (current.status === 'rejected') {
      setError(apiErrorMessage(current.reason, tRef.current));
    } else if (list.status === 'rejected' && !isNetworkError(list.reason)) {
      setError(apiErrorMessage(list.reason, tRef.current));
    }
    setLoading(false);
  }, [loadCurrent, loadHistory]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Ochiq smena hisoboti jonli: to'lovlar boshqa kassadan ham tushishi mumkin
  const openShiftId = report?.shift?.id;
  useEffect(() => {
    if (!openShiftId) return;
    const id = window.setInterval(() => {
      void loadCurrent().catch(() => {
        /* fon yangilanishi — xatoda jim */
      });
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [openShiftId, loadCurrent]);

  /**
   * OFLAYN QOPLAMA — navbatdagi smena ochish/yopish joriy holat ustiga
   * qo'yiladi (offline/ops.ts: applyShiftOps). Oflayn ochilgan smenaning
   * hisoboti hali yo'q; oflayn yopilgan smena "yuborilishi kutilmoqda".
   */
  const view = useMemo(() => applyShiftOps(report, entries), [report, entries]);
  const shift = view.shift;
  const summary = view.summary;
  const shiftOps = useMemo(() => countOps(entries, ['shift.open', 'shift.close']), [entries]);
  /** Navbatda smena amali bor — yangisi ham faqat uning ORTIDAN yuborilishi shart */
  const shiftOpsQueued = shiftOps > 0;

  // Navbatdagi smena amali serverga yetdi (yoki voz kechildi) — qayta yuklaymiz
  const prevShiftOps = useRef(shiftOps);
  useEffect(() => {
    if (shiftOps < prevShiftOps.current && online) void loadAll();
    prevShiftOps.current = shiftOps;
  }, [shiftOps, online, loadAll]);

  /**
   * Smenani ochish. Internet yo'q (yoki aynan shu so'rovda uzildi) — ochilgan
   * payt bilan navbatga; server smenani o'sha paytdan boshlaydi.
   */
  const submitOpen = async () => {
    let values: { openingCash?: number; note?: string };
    try {
      values = await openForm.validateFields();
    } catch {
      return; // forma xatolari maydon ostida ko'rinadi
    }
    const body = { openingCash: values.openingCash ?? 0, note: values.note };
    const key = newOpKey();
    const at = opNow();
    const behindQueue = shiftOpsQueued;
    const saveOffline = async () => {
      await queueShiftOpen(body, key, at);
      message.success(online && behindQueue ? t('shifts.queuedBehind') : t('offline.savedOffline'));
      setOpenVisible(false);
      openForm.resetFields();
    };
    setSubmitting(true);
    try {
      if (!online || behindQueue) {
        await saveOffline();
        return;
      }
      const res = await shiftsApi.open(body, key);
      message.success(res.message ?? t('shifts.open'));
      setOpenVisible(false);
      openForm.resetFields();
      await loadAll();
    } catch (err) {
      if (isNetworkError(err)) {
        try {
          await saveOffline();
        } catch (queueErr) {
          message.error(errorMessage(queueErr, t('common.error')));
        }
        return;
      }
      message.error(apiErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Kutilgan naqd FAQAT onlayn, server hisoboti bor va navbatda yuborilmagan
   * pul amali YO'Q bo'lsa ko'rsatiladi — aks holda u to'liq bo'lmaydi va
   * kassirni chalg'itadi (yopish baribir navbat orqali, server hisoblaydi).
   */
  const showExpected = online && !!summary && !closeMustQueue(entries);
  const expectedForClose = shift && summary ? round2(shift.openingCash + summary.byMethod.cash - (cashOut ?? 0)) : 0;
  const liveDifference = showExpected && typeof countedCash === 'number' ? round2(countedCash - expectedForClose) : null;

  /**
   * Smenani yopish. Oflayn (yoki navbatda hali yuborilmagan pul amallari
   * bo'lsa) yopish NAVBATGA tushadi: kassir sanagan summa va "Yopish"
   * bosilgan payt yuboriladi, kutilgan naqd va farqni server navbat yetib
   * kelganda — o'zidan OLDINGI barcha pul amallari yozilgach — hisoblaydi.
   * Onlayn yopish navbatdagi to'lovlardan oldin o'tib ketsa, ular muhrlangan
   * Z-hisobotdan tushib qolardi.
   */
  const submitClose = async () => {
    if (!shift) return;
    let values: { countedCash?: number; cashOut?: number; note?: string };
    try {
      values = await closeForm.validateFields();
    } catch {
      return; // forma xatolari maydon ostida ko'rinadi
    }
    const target = shift;
    const body = { countedCash: values.countedCash ?? 0, cashOut: values.cashOut ?? 0, note: values.note };
    const key = newOpKey();
    const at = opNow();
    const behindQueue = !!target.offlineLocalId || closeMustQueue(entries);
    const saveOffline = async () => {
      await queueShiftClose(shiftRefOf(target), body, key, at);
      message.success(online && behindQueue ? t('shifts.queuedBehind') : t('offline.savedOffline'));
      setCloseVisible(false);
      closeForm.resetFields();
    };
    setSubmitting(true);
    try {
      if (!online || behindQueue) {
        await saveOffline();
        return;
      }
      const res = await shiftsApi.close(target.id, body, key);
      message.success(res.message ?? t('shifts.close'));
      setCloseVisible(false);
      closeForm.resetFields();
      // Yopilgan smenaning Z-hisoboti darhol ko'rsatiladi — chop etish uchun
      setDetail({ shift: res.data, summary: res.data.summary, expectedCash: res.data.expectedCash });
      await loadAll();
    } catch (err) {
      if (isNetworkError(err)) {
        try {
          await saveOffline();
        } catch (queueErr) {
          message.error(errorMessage(queueErr, t('common.error')));
        }
        return;
      }
      message.error(apiErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (row: CashShift) => {
    if (row.closedAt && row.summary) {
      setDetail({ shift: row, summary: row.summary, expectedCash: row.expectedCash });
      return;
    }
    try {
      const res = await shiftsApi.detail(row.id);
      setDetail(res.data);
    } catch (err) {
      message.error(apiErrorMessage(err, t));
    }
  };

  /** Z-hisobot (yopilgan) yoki X-hisobot (ochiq smena) — 80 mm chek */
  const printReport = (rep: ShiftReport) => {
    if (!rep.shift || !rep.summary) return;
    const s = rep.summary;
    const sh = rep.shift;
    const money = (v: number) => `${formatNumber(v)} ${currency}`;
    const closed = !!sh.closedAt;
    const parts: string[] = [];
    parts.push(`<h1>${escapeHtml(club?.name || 'Billiard Club')}</h1>`);
    parts.push(
      `<div class="c">${escapeHtml(closed ? t('shifts.zReport') : t('shifts.xReport'))} · #${sh.id}<br>` +
        `${escapeHtml(formatDateTime(s.from))} — ${escapeHtml(formatDateTime(s.to))}</div>`,
    );
    parts.push('<hr>');
    parts.push(receiptRow(t('shifts.openedBy'), sh.openedByName ?? '—'));
    if (closed) parts.push(receiptRow(t('shifts.closedBy'), sh.closedByName ?? '—'));
    parts.push('<hr>');
    parts.push(receiptRow(t('shifts.sessions'), String(s.sessionsCount)));
    if ((s.barSalesCount ?? 0) > 0) parts.push(receiptRow(t('shifts.barSales'), String(s.barSalesCount)));
    parts.push(receiptRow(t('shifts.tableRevenue'), money(s.tableRevenue)));
    parts.push(receiptRow(t('shifts.barRevenue'), money(s.barRevenue)));
    if (s.discounts > 0) parts.push(receiptRow(t('shifts.discounts'), `-${money(s.discounts)}`));
    if (s.debtsCreated > 0) parts.push(receiptRow(t('shifts.debtsCreated'), money(s.debtsCreated)));
    if (s.debtPayments > 0) parts.push(receiptRow(t('shifts.debtPayments'), money(s.debtPayments)));
    parts.push('<hr>');
    parts.push(receiptRow(t('shifts.cash'), money(s.byMethod.cash)));
    parts.push(receiptRow(t('shifts.card'), money(s.byMethod.card)));
    parts.push(receiptRow(t('shifts.transfer'), money(s.byMethod.transfer)));
    parts.push(receiptRow(t('shifts.collected'), money(s.collected), true));
    parts.push('<hr>');
    parts.push(receiptRow(t('shifts.openingCash'), money(sh.openingCash)));
    if (closed) {
      parts.push(receiptRow(t('shifts.cashOut'), money(sh.cashOut ?? 0)));
      parts.push(receiptRow(t('shifts.expectedCash'), money(sh.expectedCash ?? 0), true));
      parts.push(receiptRow(t('shifts.countedCash'), money(sh.countedCash ?? 0)));
      parts.push(receiptRow(t('shifts.difference'), `${(sh.difference ?? 0) > 0 ? '+' : ''}${money(sh.difference ?? 0)}`, true));
    } else {
      parts.push(receiptRow(t('shifts.expectedCash'), money(rep.expectedCash ?? 0), true));
    }
    if (s.expenses > 0) parts.push(receiptRow(t('shifts.expenses'), money(s.expenses)));
    printHtml(t('shifts.reportTitle', { id: sh.id }), parts.join(''));
  };

  const historyColumns: ColumnsType<CashShift> = [
    {
      title: t('shifts.colShift'),
      dataIndex: 'id',
      width: 120,
      render: (id: number, row) => (
        <span className="shift-id">
          #{id}
          {!row.closedAt && <StatusTag status="active" label={t('shifts.statusOpen')} />}
        </span>
      ),
    },
    {
      title: t('shifts.colPeriod'),
      dataIndex: 'openedAt',
      render: (_: string, row) => (
        <span className="shift-period">
          {formatDateTime(row.openedAt)}
          <small>{row.closedAt ? `→ ${formatDateTime(row.closedAt)}` : '→ …'}</small>
        </span>
      ),
    },
    {
      title: t('shifts.colCashier'),
      dataIndex: 'openedByName',
      render: (_: string, row) =>
        row.closedByName && row.closedByName !== row.openedByName
          ? `${row.openedByName ?? '—'} → ${row.closedByName}`
          : row.openedByName ?? '—',
    },
    {
      title: t('shifts.colCollected'),
      align: 'right',
      render: (_: unknown, row) =>
        row.summary ? <MoneyText amount={row.summary.collected} currency={currency} /> : '—',
    },
    {
      title: t('shifts.colExpected'),
      align: 'right',
      render: (_: unknown, row) => (row.expectedCash !== null ? formatNumber(row.expectedCash) : '—'),
    },
    {
      title: t('shifts.colCounted'),
      align: 'right',
      render: (_: unknown, row) => (row.countedCash !== null ? formatNumber(row.countedCash) : '—'),
    },
    {
      title: t('shifts.colDifference'),
      align: 'right',
      render: (_: unknown, row) =>
        row.difference !== null ? <DifferenceText value={row.difference} currency={currency} /> : '—',
    },
    {
      title: '',
      width: 130,
      render: (_: unknown, row) => (
        <Button size="small" icon={<AuditOutlined />} onClick={() => void openDetail(row)}>
          {row.closedAt ? t('shifts.zReport') : t('shifts.xReport')}
        </Button>
      ),
    },
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<AuditOutlined />}
        title={t('shifts.title')}
        subtitle={t('shifts.subtitle')}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void loadAll()} aria-label={t('btn.refresh')}>
            {t('btn.refresh')}
          </Button>
        }
      />

      {!online && <Alert type="warning" showIcon message={t('shifts.offline')} style={{ marginBottom: 16 }} />}
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {/* Server rad etgan smena amali — sababi bilan, jimgina emas */}
      {view.failed.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('shifts.offlineFailedTitle')}
          description={
            <>
              {view.failed.map((entry) => (
                <div key={entry.localId}>
                  {t(entry.labelKey, entry.labelParams)}
                  {entry.lastError ? ` — ${entry.lastError}` : ''}
                </div>
              ))}
              <div>{t('shifts.offlineFailedHint')}</div>
            </>
          }
        />
      )}

      <Card className="shift-current">
        {loading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : shift ? (
          <>
            <div className="shift-current__head">
              <div>
                <span className="shift-current__eyebrow">
                  {t('shifts.current')}{shift.offlineLocalId ? '' : ` · #${shift.id}`}
                </span>
                <h2>
                  <StatusTag status="active" label={t('shifts.statusOpen')} />
                  {shift.offlineLocalId && (
                    <Tag color="processing" icon={<CloudUploadOutlined />}>{t('shifts.offlinePending')}</Tag>
                  )}
                  <ElapsedTime from={shift.openedAt} className="shift-current__timer" />
                </h2>
                <p>
                  {t('shifts.openedAt')}: {formatDateTime(shift.openedAt)} · {t('shifts.openedBy')}:{' '}
                  {shift.openedByName ?? '—'}
                </p>
              </div>
              <div className="shift-current__actions">
                <Button
                  icon={<PrinterOutlined />}
                  disabled={!summary}
                  onClick={() => summary && printReport({ shift, summary, expectedCash: view.expectedCash })}
                >
                  {t('shifts.xReport')}
                </Button>
                <Button
                  type="primary"
                  icon={<LockOutlined />}
                  onClick={() => {
                    closeForm.resetFields();
                    setCloseVisible(true);
                  }}
                >
                  {t('shifts.close')}
                </Button>
              </div>
            </div>
            {summary ? (
              <SummaryBody summary={summary} shift={shift} expectedCash={view.expectedCash} currency={currency} />
            ) : (
              <Alert type="info" showIcon message={t('shifts.offlineOpenPending')} />
            )}
          </>
        ) : (
          <EmptyState
            icon={view.closePending ? <CloudUploadOutlined /> : <UnlockOutlined />}
            title={view.closePending ? t('shifts.offlineClosePendingTitle') : t('shifts.noShift')}
            hint={
              view.closePending
                ? t('shifts.offlineClosePending', {
                    time: formatDateTime(view.closePending.at),
                    amount: formatMoney(view.closePending.countedCash, currency),
                  })
                : t('shifts.noShiftHint')
            }
            action={
              <Button
                type="primary"
                icon={<UnlockOutlined />}
                onClick={() => {
                  openForm.resetFields();
                  setOpenVisible(true);
                }}
              >
                {t('shifts.open')}
              </Button>
            }
          />
        )}
      </Card>

      <div className="workspace-section-heading">
        <div>
          <h2>{t('shifts.history')}</h2>
        </div>
      </div>
      <Card styles={{ body: { padding: compact ? 12 : 0 } }}>
        {compact ? (
          history.length === 0 ? (
            <EmptyState icon={<AuditOutlined />} title={t('shifts.historyEmpty')} />
          ) : (
            <div className="shift-history-cards">
              {history.map((row) => (
                <button key={row.id} type="button" className="shift-history-card" onClick={() => void openDetail(row)}>
                  <span className="shift-history-card__top">
                    <span className="shift-id">
                      #{row.id}
                      {!row.closedAt && <StatusTag status="active" label={t('shifts.statusOpen')} />}
                    </span>
                    {row.summary && <MoneyText amount={row.summary.collected} currency={currency} />}
                  </span>
                  <span className="shift-history-card__meta">
                    {formatDateTime(row.openedAt)} · {row.openedByName ?? '—'}
                  </span>
                  {row.difference !== null && <DifferenceText value={row.difference} currency={currency} />}
                </button>
              ))}
            </div>
          )
        ) : (
          <Table<CashShift>
            rowKey="id"
            columns={historyColumns}
            dataSource={history}
            locale={{ emptyText: <EmptyState icon={<AuditOutlined />} title={t('shifts.historyEmpty')} /> }}
            pagination={{
              current: page,
              pageSize: 10,
              total: historyTotal,
              showSizeChanger: false,
              onChange: (p) => {
                setPage(p);
                void loadHistory(p).catch((err) => message.error(apiErrorMessage(err, t)));
              },
            }}
          />
        )}
      </Card>

      {/* Smenani ochish */}
      <Modal
        open={openVisible}
        title={t('shifts.openTitle')}
        okText={t('shifts.open')}
        onOk={() => void submitOpen()}
        confirmLoading={submitting}
        onCancel={() => setOpenVisible(false)}
        destroyOnClose
      >
        <Form form={openForm} layout="vertical" requiredMark={false} initialValues={{ openingCash: 0 }}>
          <Form.Item name="openingCash" label={t('shifts.openingCash')} extra={t('shifts.openingCashHint')}>
            <InputNumber
              min={0}
              style={{ width: '100%' }}
              size="large"
              addonAfter={currency}
              formatter={moneyFormatter}
              parser={moneyParser}
              inputMode="numeric"
            />
          </Form.Item>
          <Form.Item name="note" label={t('shifts.note')}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Smenani yopish */}
      <Modal
        open={closeVisible}
        title={t('shifts.closeTitle')}
        okText={t('shifts.close')}
        onOk={() => void submitClose()}
        confirmLoading={submitting}
        onCancel={() => setCloseVisible(false)}
        destroyOnClose
      >
        {shift && (
          <>
            {summary && summary.activeSessions > 0 && (
              <Alert
                type="warning"
                showIcon
                message={t('shifts.activeWarning', { n: summary.activeSessions })}
                style={{ marginBottom: 16 }}
              />
            )}
            {showExpected ? (
              <div className="shift-close-expected">
                <span>{t('shifts.expectedCash')}</span>
                <MoneyText amount={expectedForClose} currency={currency} size="xl" />
                <small>{t('shifts.expectedHint')}</small>
              </div>
            ) : (
              // Internetsiz (yoki navbatda yuborilmagan pul bor) — kutilgan naqdni
              // server hisoblaydi; eskirgan raqam kassirni chalg'itmasin
              <Alert type="info" showIcon message={t('shifts.offlineCloseInfo')} style={{ marginBottom: 16 }} />
            )}
            <Form form={closeForm} layout="vertical" requiredMark={false} initialValues={{ cashOut: 0 }}>
              <Form.Item
                name="countedCash"
                label={t('shifts.countedCash')}
                rules={[{ required: true, message: t('shifts.countedCash') }]}
              >
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  size="large"
                  autoFocus
                  addonAfter={currency}
                  formatter={moneyFormatter}
                  parser={moneyParser}
                  inputMode="numeric"
                />
              </Form.Item>
              <Form.Item name="cashOut" label={t('shifts.cashOut')} extra={t('shifts.cashOutHint')}>
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  addonAfter={currency}
                  formatter={moneyFormatter}
                  parser={moneyParser}
                  inputMode="numeric"
                />
              </Form.Item>
              {liveDifference !== null && (
                <div className="shift-close-diff">
                  <span>{t('shifts.difference')}</span>
                  <DifferenceText value={liveDifference} currency={currency} />
                </div>
              )}
              <Form.Item name="note" label={t('shifts.note')}>
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* Z-/X-hisobot */}
      <Modal
        open={!!detail}
        width={720}
        title={
          detail?.shift
            ? `${detail.shift.closedAt ? t('shifts.zReport') : t('shifts.xReport')} · #${detail.shift.id}`
            : ''
        }
        onCancel={() => setDetail(null)}
        footer={[
          <Button key="close" onClick={() => setDetail(null)}>
            {t('btn.close')}
          </Button>,
          <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={() => detail && printReport(detail)}>
            {t('shifts.print')}
          </Button>,
        ]}
      >
        {detail?.shift && detail.summary && (
          <>
            <p className="shift-detail-meta">
              {formatDateTime(detail.summary.from)} — {formatDateTime(detail.summary.to)}
              <br />
              {t('shifts.openedBy')}: {detail.shift.openedByName ?? '—'}
              {detail.shift.closedAt && (
                <>
                  {' · '}
                  {t('shifts.closedBy')}: {detail.shift.closedByName ?? '—'}
                </>
              )}
            </p>
            <SummaryBody
              summary={detail.summary}
              shift={detail.shift}
              expectedCash={detail.expectedCash}
              currency={currency}
            />
            {detail.shift.closedAt && detail.shift.difference !== null && (
              <div className="shift-close-diff is-final">
                <span>
                  {t('shifts.countedCash')}: {formatNumber(detail.shift.countedCash ?? 0)} {currency}
                  {(detail.shift.cashOut ?? 0) > 0 && (
                    <>
                      {' · '}
                      {t('shifts.cashOut')}: {formatNumber(detail.shift.cashOut ?? 0)} {currency}
                    </>
                  )}
                </span>
                <DifferenceText value={detail.shift.difference} currency={currency} />
              </div>
            )}
            {detail.shift.closingNote && <p className="shift-detail-note">{detail.shift.closingNote}</p>}
          </>
        )}
      </Modal>
    </PageTransition>
  );
};

export default Shifts;
