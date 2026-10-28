import { memo, useEffect } from 'react';
import { App, Button, Card, Dropdown, Tag, Tooltip } from 'antd';
import {
  BellOutlined, BulbOutlined, CaretRightOutlined, ClockCircleOutlined, CloseCircleOutlined,
  CloudSyncOutlined, CoffeeOutlined, DollarOutlined, DownOutlined, EllipsisOutlined, FieldTimeOutlined,
  HistoryOutlined, HourglassOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined, SwapOutlined,
  SyncOutlined, UserOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ElapsedTime, MoneyText, StatusTag, useNow } from '../../components/ui';
import { useCurrency } from '../../context/AppSettingsContext';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Session } from '../../types';
import { formatClock, formatElapsed, formatNumber } from '../../utils/format';
import { sessionElapsedMs, sessionTableAmount, type SegmentLike } from '../../utils/session';

// Only these leaf components tick; card order and page state stay stable.
const LiveAmount = memo(({ session, fallbackPrice, segments, offsetMs, currency, size = 'lg' }: {
  session: Session; fallbackPrice: number; segments: SegmentLike[] | null; offsetMs: number; currency: string;
  size?: 'md' | 'lg';
}) => {
  const now = useNow();
  const amount = sessionTableAmount(session, fallbackPrice, now + offsetMs, segments) + (session.barAmount || 0);
  return <MoneyText amount={amount} currency={currency} size={size} color={TOKENS.color.text.primary} />;
});
LiveAmount.displayName = 'LiveAmount';

/**
 * "Vaqt tugadi" ovozli signali — WebAudio bilan (fayl yuklanmaydi). Har bir
 * sessiya uchun sahifa umrida BIR MARTA chalinadi; brauzer ovozni bloklasa
 * jim qoladi — qizil belgi baribir ko'rinib turadi.
 */
const notifiedSessions = new Set<number>();
const playTimeUpSound = () => {
  try {
    const Ctx = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    tone(880, 0, 0.18);
    tone(880, 0.25, 0.18);
    tone(1175, 0.5, 0.32);
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1500);
  } catch {
    /* ovoz bloklangan yoki qo'llab-quvvatlanmaydi */
  }
};

/** Belgilangan vaqt: "Qoldi 00:12:30" yoki "Vaqt tugadi +00:02:15" (har soniyada faqat shu barg) */
const PlannedBadge = memo(({ session, offsetMs }: { session: Session; offsetMs: number }) => {
  const { t } = useTranslation();
  const now = useNow();
  const leftMs = (session.plannedMinutes ?? 0) * 60_000 - sessionElapsedMs(session, now + offsetMs);
  const expired = leftMs <= 0;
  useEffect(() => {
    if (!expired || session.status !== 'active' || notifiedSessions.has(session.id)) return;
    notifiedSessions.add(session.id);
    playTimeUpSound();
  }, [expired, session.id, session.status]);
  return (
    <span className={`table-plan-badge${expired ? ' is-expired' : leftMs <= 5 * 60_000 ? ' is-soon' : ''}`} role="status">
      {expired ? <BellOutlined /> : <HourglassOutlined />}
      {expired ? t('tables.planExpired', { time: formatElapsed(-leftMs) }) : t('tables.planLeft', { time: formatElapsed(leftMs) })}
    </span>
  );
});
PlannedBadge.displayName = 'PlannedBadge';

export interface TableCardProps {
  /**
   * 'card' — keng karta (standart); 'row' — ixcham qator: telefonda va ko'p
   * stolli klublarda butun zal bitta ekranga sig'adi. Mantiq bir xil, faqat
   * joylashuv boshqacha.
   */
  variant?: 'card' | 'row';
  table: BilliardTable;
  focused?: boolean;
  session: Session | null;
  segments: SegmentLike[] | null;
  offsetMs: number;
  online: boolean;
  pending: boolean;
  lightPending?: boolean;
  canCheckout: boolean;
  canManage: boolean;
  onStart: (table: BilliardTable) => void;
  onOrder: (table: BilliardTable) => void;
  onTransfer: (table: BilliardTable) => void;
  onCheckout: (table: BilliardTable) => void;
  onPauseResume: (session: Session, table: BilliardTable) => void;
  onCancel: (session: Session) => void;
  onLightToggle?: (table: BilliardTable, on: boolean) => void;
  onLightAuto?: (table: BilliardTable) => void;
  /** Belgilangan vaqtni o'zgartirish ("+30 daqiqa"); null — cheklovni olib tashlash */
  onPlanChange?: (session: Session, minutes: number | null) => void;
}

const TableCard = memo(({
  variant = 'card', table, focused, session, segments, offsetMs, online, pending, lightPending, canCheckout, canManage,
  onStart, onOrder, onTransfer, onCheckout, onPauseResume, onCancel, onLightToggle, onLightAuto, onPlanChange,
}: TableCardProps) => {
  const { t, i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  const { modal } = App.useApp();
  const currency = useCurrency();
  const isBusy = table.status === 'busy';
  const isPaused = session?.status === 'paused';
  const isOfflineSession = !!session?.offlineLocalId;
  // Preserve online/role restrictions, including local synthetic sessions.
  const offlineBlocked = !online || isOfflineSession;
  const canCancel = !offlineBlocked && (canManage || (!!session &&
    (session.barAmount ?? 0) <= 0 && sessionElapsedMs(session, Date.now() + offsetMs) <= 600_000));
  const hasLight = !!onLightToggle && table.lightControl === true;
  const lightFresh = table.lightFreshUntil && Date.parse(table.lightFreshUntil) > Date.now() + offsetMs;
  const lightState = online && lightFresh && !table.lightError ? table.lightState ?? null : null;
  const lightError = table.lightError ?? null;
  const lightOverride = !!table.lightOverrideUntil && new Date(table.lightOverrideUntil).getTime() > Date.now() + offsetMs;
  const lightTarget = (lightOverride ? (table.lightOverrideOn ?? null) : null) ?? lightState ?? false;
  const lightLabel = lightError ? `${t('tables.lightsStateError')}: ${lightError}`
    : lightState === true ? t('tables.lightsStateOn')
      : lightState === false ? t('tables.lightsStateOff') : t('tables.lightsStateUnknown');
  const lightHint = lightState === null && !lightError
    ? t(lightTarget ? 'tables.lightsStateUnknownOffHint' : 'tables.lightsStateUnknownOnHint')
    : t(lightTarget ? 'tables.lightsToggleOff' : 'tables.lightsToggleOn');

  const confirmCancel = () => {
    if (!session || !canCheckout || !canCancel || pending) return;
    modal.confirm({
      title: t('tables.cancelConfirmTitle'), content: t('tables.cancelConfirmDesc'),
      okText: t('common.yes'), cancelText: t('common.no'), okButtonProps: { danger: true },
      onOk: () => onCancel(session),
    });
  };
  const toggleLight = () => {
    if (!online || lightPending) return;
    if (isBusy && lightTarget) {
      modal.confirm({
        title: ru ? 'Выключить свет на занятом столе?' : 'O‘yin ketayotgan stolda chiroq o‘chirilsinmi?',
        content: ru ? 'Игра и расчёт времени продолжатся. Чтобы вернуть управление по игре, выберите «Авто».'
          : 'O‘yin va vaqt hisobi davom etadi. O‘yinga mos boshqaruvni qaytarish uchun «Avto» ni tanlang.',
        okText: t('common.yes'), cancelText: t('common.no'),
        onOk: () => onLightToggle?.(table, false),
      });
    } else onLightToggle?.(table, !lightTarget);
  };
  const moreItems = [
    ...(isBusy && session ? [{ key: 'transfer', icon: <SwapOutlined />,
      label: <Tooltip title={offlineBlocked ? t('offline.offlineBlocked') : isPaused ? t('tables.transferPausedHint') : undefined}><span>{t('tables.transfer')}</span></Tooltip>,
      disabled: isPaused || offlineBlocked || pending, onClick: () => onTransfer(table) }] : []),
    ...(hasLight && lightOverride && onLightAuto ? [{ key: 'light-auto', icon: <SyncOutlined />,
      label: t('tables.lightsOverrideAuto'), disabled: !online || lightPending, onClick: () => onLightAuto(table) }] : []),
    // Belgilangan vaqt: cheklangan o'yinga plan ustiga, cheklanmaganga hozirgi vaqtdan qo'shiladi
    ...(isBusy && session && onPlanChange ? (() => {
      // Asos bosilgan PAYTDA hisoblanadi (karta har soniyada qayta chizilmaydi)
      const extend = (minutes: number) => {
        const base = session.plannedMinutes
          ?? Math.ceil(sessionElapsedMs(session, Date.now() + offsetMs) / 60_000);
        onPlanChange(session, Math.min(1440, base + minutes));
      };
      return [
        { key: 'plan-30', icon: <FieldTimeOutlined />, label: t('tables.planAdd30'),
          disabled: offlineBlocked || pending, onClick: () => extend(30) },
        { key: 'plan-60', icon: <FieldTimeOutlined />, label: t('tables.planAdd60'),
          disabled: offlineBlocked || pending, onClick: () => extend(60) },
        ...(session.plannedMinutes ? [{ key: 'plan-off', icon: <StopOutlined />, label: t('tables.planRemove'),
          disabled: offlineBlocked || pending, onClick: () => onPlanChange(session, null) }] : []),
      ];
    })() : []),
    ...(isBusy && session && canCheckout ? [{ key: 'cancel', icon: <CloseCircleOutlined />, danger: true,
      label: <Tooltip title={!canCancel ? t(offlineBlocked ? 'offline.offlineBlocked' : 'tables.cancelNeedsAdmin') : undefined}><span>{t('tables.cancelTooltip')}</span></Tooltip>,
      disabled: !canCancel || pending, onClick: confirmCancel }] : []),
  ];

  const stateClass = isBusy ? isPaused ? 'is-paused' : 'is-busy' : 'is-free';
  const displayName = table.name || `${t('common.table')} ${table.number}`;
  const lightButton = hasLight && <Tooltip title={`${lightLabel} · ${lightHint}`}><Button type="text" icon={<BulbOutlined />}
    loading={lightPending} disabled={!online}
    className={lightError ? 'has-light-error' : lightState ? 'is-light-on' : ''}
    aria-label={`${lightLabel} · ${lightHint}`} onClick={toggleLight} /></Tooltip>;

  if (variant === 'row') {
    return (
      <div id={`workspace-table-${table.id}`} tabIndex={focused ? -1 : undefined}
        className={`table-row ${stateClass}${focused ? ' is-focused' : ''}`}>
        <span className="table-row__num" aria-label={`${t('common.table')} ${table.number}`}>{String(table.number).padStart(2, '0')}</span>
        <div className="table-row__info">
          <strong title={displayName}>{displayName}</strong>
          {isBusy && session ? <span>
            <UserOutlined />{session.customerName || t('tables.guest')}
            <em><ClockCircleOutlined />{formatClock(session.startTime)}</em>
            {session.barAmount > 0 && <em><CoffeeOutlined />{formatNumber(session.barAmount)}</em>}
            {isOfflineSession && <em className="is-warning"><CloudSyncOutlined />{t('offline.queuePending')}</em>}
            {session.plannedMinutes ? <PlannedBadge session={session} offsetMs={offsetMs} /> : null}
          </span> : <span>{formatNumber(table.pricePerHour)} {currency} / {t('tables.perHour')}</span>}
        </div>
        <div className="table-row__live">
          {isBusy && session ? <>
            <ElapsedTime from={session.startTime} computeMs={(now) => sessionElapsedMs(session, now + offsetMs)} paused={isPaused}
              style={{ fontSize: 17, fontWeight: 650, color: isPaused ? TOKENS.color.semantic.warning : TOKENS.color.text.primary }} />
            <LiveAmount session={session} fallbackPrice={table.pricePerHour} segments={segments} offsetMs={offsetMs} currency={currency} size="md" />
          </> : isBusy ? <span className="table-row__muted">{t('tables.sessionUnavailable')}</span>
            : <StatusTag status="free" label={t('status.free')} />}
        </div>
        <div className="table-row__actions">
          {isBusy && session ? <>
            <Tooltip title={t(isPaused ? 'tables.resume' : 'tables.pause')}>
              <Button icon={isPaused ? <CaretRightOutlined /> : <PauseCircleOutlined />} loading={pending}
                aria-label={t(isPaused ? 'tables.resume' : 'tables.pause')} onClick={() => onPauseResume(session, table)} />
            </Tooltip>
            <Tooltip title={t('tables.addOrder')}>
              <Button icon={<CoffeeOutlined />} aria-label={t('tables.addOrder')} onClick={() => onOrder(table)} />
            </Tooltip>
            {lightButton}
            {moreItems.length > 0 && <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
              <Button icon={<EllipsisOutlined />} aria-label={t('tables.moreActions')} />
            </Dropdown>}
            {canCheckout && <Tooltip title={offlineBlocked ? t('offline.offlineBlocked') : undefined}>
              <Button className="table-row__primary" type="primary" icon={<DollarOutlined />} disabled={offlineBlocked || pending}
                onClick={() => onCheckout(table)}>{t('tables.end')}</Button>
            </Tooltip>}
          </> : isBusy ? null : <>
            {lightButton}
            <Button className="table-row__primary" type="primary" ghost icon={<PlayCircleOutlined />} onClick={() => onStart(table)}>{t('tables.start')}</Button>
          </>}
        </div>
        {hasLight && lightError && <p className="table-row__warning" title={lightError}><BulbOutlined />{t('tables.lightAttention')}</p>}
      </div>
    );
  }

  return (
    <Card id={`workspace-table-${table.id}`} tabIndex={focused ? -1 : undefined}
      className={`table-work-card ${stateClass}${focused ? ' is-focused' : ''}`}>
      <div className="table-work-card__header">
        <div className="table-work-card__identity">
          <span className="table-work-card__number" aria-label={`${t('common.table')} ${table.number}`}>{String(table.number).padStart(2, '0')}</span>
          <div><h2 title={table.name}>{displayName}</h2>
            <span className="table-work-card__rate">{formatNumber(table.pricePerHour)} {currency} / {t('tables.perHour')}</span></div>
        </div>
        <StatusTag status={isBusy ? isPaused ? 'paused' : 'active' : 'free'} label={t(isBusy ? isPaused ? 'status.paused' : 'status.active' : 'status.free')} />
      </div>

      {isBusy && session ? <>
        <div className="table-work-card__numbers">
          <div><span className="table-work-card__caption">{t('common.duration')}</span>
            <ElapsedTime from={session.startTime} computeMs={(now) => sessionElapsedMs(session, now + offsetMs)} paused={isPaused}
              style={{ fontSize: 28, fontWeight: 650, color: isPaused ? TOKENS.color.semantic.warning : TOKENS.color.text.primary, display: 'block' }} />
          </div>
          <div className="table-work-card__amount"><span className="table-work-card__caption">{t('tables.liveTotalCaption')}</span>
            <LiveAmount session={session} fallbackPrice={table.pricePerHour} segments={segments} offsetMs={offsetMs} currency={currency} />
          </div>
        </div>
        <div className="table-work-card__guest">
          <span title={session.customerName || t('tables.guest')}><UserOutlined />{session.customerName || t('tables.guest')}</span>
          <span><ClockCircleOutlined />{formatClock(session.startTime)}</span>
        </div>
        {session.plannedMinutes ? <div className="table-work-card__plan"><PlannedBadge session={session} offsetMs={offsetMs} /></div> : null}
        {(session.barAmount > 0 || isOfflineSession) && <div className="table-work-card__details">
          {session.barAmount > 0 && <span><CoffeeOutlined />{formatNumber(session.barAmount)} {currency}</span>}
          {isOfflineSession && <Tag icon={<CloudSyncOutlined />} color="warning">{t('offline.queuePending')}</Tag>}
        </div>}
        <div className="table-work-card__actions">
          <Button icon={<CoffeeOutlined />} onClick={() => onOrder(table)}>{t('tables.addOrder')}</Button>
          {canCheckout && <Tooltip title={offlineBlocked ? t('offline.offlineBlocked') : undefined}>
            <Button type="primary" icon={<DollarOutlined />} disabled={offlineBlocked || pending} onClick={() => onCheckout(table)}>{t('tables.end')}</Button>
          </Tooltip>}
        </div>
      </> : isBusy ? <p className="table-work-card__empty">{t('tables.sessionUnavailable')}</p> : <>
        <div className="table-work-card__available"><span className="table-work-card__caption">{t('tables.readyForGame')}</span>
          <strong>{t('tables.freeToStart')}</strong><span>{t('tables.startGuestHint')}</span></div>
        <Button className="table-work-card__start" type="primary" ghost block icon={<PlayCircleOutlined />} onClick={() => onStart(table)}>{t('tables.start')}</Button>
      </>}

      <div className="table-work-card__utilities">
        {isBusy && session ? <Button type="text" icon={isPaused ? <CaretRightOutlined /> : <PauseCircleOutlined />} loading={pending}
          onClick={() => onPauseResume(session, table)}>{t(isPaused ? 'tables.resume' : 'tables.pause')}</Button>
          : <span className="table-work-card__history"><HistoryOutlined />{t('tables.todayCompleted', { n: table.todayCompletedSessions ?? 0 })}</span>}
        <div className="table-work-card__utility-buttons">
          {lightButton}
          {moreItems.length > 0 && <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<DownOutlined />}>{t('tables.moreActions')}</Button>
          </Dropdown>}
        </div>
      </div>
      {hasLight && lightError && <p className="table-work-card__warning" title={lightError}><BulbOutlined />{t('tables.lightAttention')}</p>}
    </Card>
  );
});
TableCard.displayName = 'TableCard';
export default TableCard;
