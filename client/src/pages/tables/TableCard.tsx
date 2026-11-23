import { memo, useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { App, Button, Dropdown, Tooltip } from 'antd';
import {
  BellOutlined, BulbOutlined, CalendarOutlined, CaretRightOutlined, ClockCircleOutlined, CloseCircleOutlined,
  CloudSyncOutlined, CoffeeOutlined, DollarOutlined, EllipsisOutlined, FieldTimeOutlined,
  HistoryOutlined, HourglassOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined, SwapOutlined,
  SyncOutlined, UserOutlined, WalletOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ElapsedTime, MoneyText, StatusTag, useNow } from '../../components/ui';
import { useCurrency } from '../../context/AppSettingsContext';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Session, SessionPlanPayload } from '../../types';
import { formatClock, formatElapsed, formatNumber } from '../../utils/format';
import {
  round2, sessionChargeAmount, sessionElapsedMs, sessionLimitLeftMs, type SegmentLike,
} from '../../utils/session';

// Only these leaf components tick; card order and page state stay stable.
// Stol summasi yaxlitlash yoqilgan bo'lsa yaxlit (kassaga tushadigan) qiymatda
const LiveAmount = memo(({ session, fallbackPrice, segments, offsetMs, currency, size = 'lg' }: {
  session: Session; fallbackPrice: number; segments: SegmentLike[] | null; offsetMs: number; currency: string;
  size?: 'md' | 'lg';
}) => {
  const now = useNow();
  const amount = sessionChargeAmount(session, fallbackPrice, now + offsetMs, segments) + (session.barAmount || 0);
  return <MoneyText amount={amount} currency={currency} size={size} color={TOKENS.color.text.primary} />;
});
LiveAmount.displayName = 'LiveAmount';

/**
 * "Vaqt tugadi" ovozli signali — WebAudio bilan (fayl yuklanmaydi). Har bir
 * CHEKLOV uchun sahifa umrida BIR MARTA chalinadi; brauzer ovozni bloklasa
 * jim qoladi — qizil belgi baribir ko'rinib turadi.
 *
 * Kalitda cheklovning o'zi ham bor (vaqt yoki summa): mijoz "yana 20 mingga"
 * yoki "+30 daqiqa" deb uzaytirsa, YANGI chegara tugaganda signal qayta
 * chalinadi. Faqat sessiya ID si bo'lganida ikkinchi marta jim qolardi.
 */
const notifiedPlans = new Set<string>();
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

/**
 * O'yin vaqti cheklovi nishoni: "Qoldi 00:12:30" yoki "Vaqt tugadi +00:02:15"
 * (har soniyada faqat shu barg qayta chiziladi).
 *
 * Ikki xil cheklov bitta ko'rinishda:
 *  - belgilangan vaqt (plannedMinutes) — o'tgan faol vaqt bilan solishtiriladi;
 *  - summa limiti (limitAmount) — qolgan pul JORIY narx bo'yicha vaqtga
 *    aylanadi (utils/session.ts: sessionLimitLeftMs), shuning uchun transferdan
 *    keyin ham to'g'ri. Narx 0 bo'lsa limitga yetilmaydi — nishon ko'rinmaydi.
 */
const PlannedBadge = memo(({ session, segments, fallbackPrice, offsetMs }: {
  session: Session; segments: SegmentLike[] | null; fallbackPrice: number; offsetMs: number;
}) => {
  const { t } = useTranslation();
  const now = useNow();
  const isLimit = session.limitAmount != null;
  const leftMs = isLimit
    ? sessionLimitLeftMs(session, fallbackPrice, now + offsetMs, segments)
    : (session.plannedMinutes ?? 0) * 60_000 - sessionElapsedMs(session, now + offsetMs);
  const expired = leftMs !== null && leftMs <= 0;
  const planKey = `${session.id}|${session.plannedMinutes ?? ''}|${session.limitAmount ?? ''}`;
  useEffect(() => {
    if (!expired || session.status !== 'active' || notifiedPlans.has(planKey)) return;
    notifiedPlans.add(planKey);
    playTimeUpSound();
  }, [expired, planKey, session.status]);
  if (leftMs === null) return null;
  return (
    <span className={`table-plan-badge${expired ? ' is-expired' : leftMs <= 5 * 60_000 ? ' is-soon' : ''}`} role="status">
      {expired ? <BellOutlined /> : <HourglassOutlined />}
      {expired
        ? t(isLimit ? 'tables.limitExpired' : 'tables.planExpired', { time: formatElapsed(-leftMs) })
        : t('tables.planLeft', { time: formatElapsed(leftMs) })}
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
  /**
   * Chiroq shu kompyuterdagi markaz orqali boshqariladi (desktop dastur) —
   * internetsiz ham chiroq tugmasi ishlaydi
   */
  lightLocal?: boolean;
  pending: boolean;
  lightPending?: boolean;
  /** Hisob-kitob tugmasi (admin, kassir, operator) */
  canCheckout: boolean;
  /**
   * O'yinni bekor qilish menyusi — admin va kassir (operatorga server ham ruxsat bermaydi).
   * Berilmasa `canCheckout` ga teng.
   */
  canCancelGames?: boolean;
  canManage: boolean;
  /** Eng yaqin bron yorlig'i ("Bron 21:00 · Aziza") — bo'lsa kartada ko'rinadi */
  reservation?: string;
  onStart: (table: BilliardTable) => void;
  /** Bar (tarif imkoniyati) — berilmasa buyurtma tugmasi ko'rinmaydi */
  onOrder?: (table: BilliardTable) => void;
  onTransfer: (table: BilliardTable) => void;
  onCheckout: (table: BilliardTable) => void;
  onPauseResume: (session: Session, table: BilliardTable) => void;
  onCancel: (session: Session, table: BilliardTable) => void;
  onLightToggle?: (table: BilliardTable, on: boolean) => void;
  onLightAuto?: (table: BilliardTable) => void;
  /**
   * O'yin vaqti cheklovini o'zgartirish: "+30 daqiqa", summa limitini oshirish
   * yoki `{ plannedMinutes: null }` — cheklovni olib tashlash
   */
  onPlanChange?: (session: Session, plan: SessionPlanPayload) => void;
  /** Summa limitini qo'yish/o'zgartirish oynasini ochish */
  onLimitEdit?: (table: BilliardTable) => void;
}

const TableCard = memo(({
  variant = 'card', table, focused, session, segments, offsetMs, online, lightLocal, pending, lightPending, canCheckout,
  canCancelGames = canCheckout, canManage, reservation,
  onStart, onOrder, onTransfer, onCheckout, onPauseResume, onCancel, onLightToggle, onLightAuto, onPlanChange, onLimitEdit,
}: TableCardProps) => {
  const { t, i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  const { modal } = App.useApp();
  const currency = useCurrency();
  const isBusy = table.status === 'busy';
  const isPaused = session?.status === 'paused';
  const isOfflineSession = !!session?.offlineLocalId;
  // Serverga hali yetmagan o'zgarish bor: oflayn boshlangan yoki oflayn ko'chirilgan o'yin
  const isQueuedSession = isOfflineSession || !!session?.offlineTransfers?.length;
  // O'yin vaqti cheklovi bormi: belgilangan vaqt yoki summa limiti
  const hasPlan = !!session && (!!session.plannedMinutes || session.limitAmount != null);
  // Internet yo'q yoki sessiya hali serverda yo'q — hisob-kitob oynasida eslatma uchun
  const offlineBlocked = !online || isOfflineSession;
  // Hisob-kitob, ko'chirish, bekor qilish va vaqt/limit oflayn ham ishlaydi
  // (offline/pos.ts) — tugmalar bloklanmaydi. Kassir chegarasi (barsiz va
  // 10 daqiqagacha) bosilgan payt bo'yicha; server o'sha payt bo'yicha qayta tekshiradi.
  const canCancel = canManage || (!!session &&
    (session.barAmount ?? 0) <= 0 && sessionElapsedMs(session, Date.now() + offsetMs) <= 600_000);
  const hasLight = !!onLightToggle && table.lightControl === true;
  const lightFresh = table.lightFreshUntil && Date.parse(table.lightFreshUntil) > Date.now() + offsetMs;
  // Chiroqni boshqarish mumkinmi: internet bor yoki markaz shu kompyuterda
  const lightOnline = online || lightLocal === true;
  const lightState = lightOnline && lightFresh && !table.lightError ? table.lightState ?? null : null;
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
    if (!session || !canCancelGames || !canCancel || pending) return;
    modal.confirm({
      title: t('tables.cancelConfirmTitle'),
      content: online ? t('tables.cancelConfirmDesc') : `${t('tables.cancelConfirmDesc')} ${t('offline.cancelOfflineNote')}`,
      okText: t('common.yes'), cancelText: t('common.no'), okButtonProps: { danger: true },
      onOk: () => onCancel(session, table),
    });
  };
  const toggleLight = () => {
    if (!lightOnline || lightPending) return;
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
      label: <Tooltip title={isPaused ? t('tables.transferPausedHint') : undefined}><span>{t('tables.transfer')}</span></Tooltip>,
      disabled: isPaused || pending, onClick: () => onTransfer(table) }] : []),
    ...(hasLight && lightOverride && onLightAuto ? [{ key: 'light-auto', icon: <SyncOutlined />,
      label: t('tables.lightsOverrideAuto'), disabled: !lightOnline || lightPending, onClick: () => onLightAuto(table) }] : []),
    // O'yin vaqti cheklovi: belgilangan vaqt yoki summa limiti (bittasi)
    ...(isBusy && session && onPlanChange ? (() => {
      const limit = session.limitAmount ?? null;
      // JORIY narx: ochiq segment (transferdan keyin yangi stol), bo'lmasa muhrlangan narx
      const price = segments?.find((seg) => !seg.endedAt)?.pricePerHour
        ?? session.pricePerHour ?? table.pricePerHour;
      // Asos bosilgan PAYTDA hisoblanadi (karta har soniyada qayta chizilmaydi)
      const extend = (minutes: number) => {
        // Limitli o'yin PULDA o'lchanadi: qo'shilgan daqiqalar joriy narxda pulga
        // aylanib limitga qo'shiladi — limit vaqtga almashib qolmaydi
        if (limit !== null) {
          onPlanChange(session, { limitAmount: round2(limit + (price * minutes) / 60) });
          return;
        }
        // Cheklangan o'yinga plan ustiga, cheklanmaganga hozirgi vaqtdan qo'shiladi
        const base = session.plannedMinutes
          ?? Math.ceil(sessionElapsedMs(session, Date.now() + offsetMs) / 60_000);
        onPlanChange(session, { plannedMinutes: Math.min(1440, base + minutes) });
      };
      // Bepul stolga ko'chirilgan limitli o'yin: daqiqani pulga aylantirib bo'lmaydi
      const extendBlocked = pending || (limit !== null && !(price > 0));
      return [
        { key: 'plan-30', icon: <FieldTimeOutlined />, label: t('tables.planAdd30'),
          disabled: extendBlocked, onClick: () => extend(30) },
        { key: 'plan-60', icon: <FieldTimeOutlined />, label: t('tables.planAdd60'),
          disabled: extendBlocked, onClick: () => extend(60) },
        ...(onLimitEdit ? [{ key: 'limit', icon: <WalletOutlined />, label: t('tables.limitEdit'),
          disabled: pending || !(price > 0), onClick: () => onLimitEdit(table) }] : []),
        ...(session.plannedMinutes || limit !== null ? [{ key: 'plan-off', icon: <StopOutlined />,
          label: t(limit !== null ? 'tables.limitRemove' : 'tables.planRemove'),
          disabled: pending, onClick: () => onPlanChange(session, { plannedMinutes: null }) }] : []),
      ];
    })() : []),
    ...(isBusy && session && canCancelGames ? [{ key: 'cancel', icon: <CloseCircleOutlined />, danger: true,
      label: <Tooltip title={!canCancel ? t('tables.cancelNeedsAdmin') : undefined}><span>{t('tables.cancelTooltip')}</span></Tooltip>,
      disabled: !canCancel || pending, onClick: confirmCancel }] : []),
  ];

  const stateClass = isBusy ? isPaused ? 'is-paused' : 'is-busy' : 'is-free';
  const displayName = table.name || `${t('common.table')} ${table.number}`;
  const lightButton = hasLight && <Tooltip title={`${lightLabel} · ${lightHint}`}><Button type="text" icon={<BulbOutlined />}
    loading={lightPending} disabled={!lightOnline}
    className={lightError ? 'has-light-error' : lightState ? 'is-light-on' : ''}
    aria-label={`${lightLabel} · ${lightHint}`} onClick={toggleLight} /></Tooltip>;

  if (variant === 'row') {
    return (
      <div id={`workspace-table-${table.id}`} tabIndex={focused ? -1 : undefined}
        className={`table-row ${stateClass}${focused ? ' is-focused' : ''}`}>
        <span className="pool-ball is-sm table-row__num" aria-label={`${t('common.table')} ${table.number}`}>{table.number}</span>
        <div className="table-row__info">
          <strong title={displayName}>{displayName}</strong>
          {isBusy && session ? <span>
            <UserOutlined />{session.customerName || t('tables.guest')}
            <em><ClockCircleOutlined />{formatClock(session.startTime)}</em>
            {session.barAmount > 0 && <em><CoffeeOutlined />{formatNumber(session.barAmount)}</em>}
            {isQueuedSession && <em className="is-warning"><CloudSyncOutlined />{t('offline.queuePending')}</em>}
            {session.limitAmount != null && <em className="is-limit"><WalletOutlined />{t('tables.limitBadge', { amount: formatNumber(session.limitAmount) })}</em>}
            {hasPlan ? <PlannedBadge session={session} segments={segments} fallbackPrice={table.pricePerHour} offsetMs={offsetMs} /> : null}
            {reservation && <em className="is-reservation"><CalendarOutlined />{reservation}</em>}
          </span> : <span>
            {formatNumber(table.pricePerHour)} {currency} / {t('tables.perHour')}
            {reservation && <em className="is-reservation"><CalendarOutlined />{reservation}</em>}
          </span>}
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
            {onOrder && <Tooltip title={t('tables.addOrder')}>
              <Button icon={<CoffeeOutlined />} aria-label={t('tables.addOrder')} onClick={() => onOrder(table)} />
            </Tooltip>}
            {lightButton}
            {moreItems.length > 0 && <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
              <Button icon={<EllipsisOutlined />} aria-label={t('tables.moreActions')} />
            </Dropdown>}
            {canCheckout && <Tooltip title={offlineBlocked ? t('offline.checkoutOfflineTitle') : undefined}>
              <Button className="table-row__primary" type="primary" icon={<DollarOutlined />} disabled={pending}
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

  /*
   * KARTA = HAQIQIY BILLIARD STOLI (yuqoridan ko'rinish): yong'oq yog'och bort,
   * olmos nishonlar, 6 ta luza va mato. Mato yorug'ligi chiroq holatini
   * takrorlaydi: band — chiroq yoqilgan (yorqin mato), bo'sh — o'chiq (xira).
   * Stol raqami billiard shari: bo'sh — oq (biton), o'yinda — sariq, pauza — to'q sariq.
   */
  return (
    <div id={`workspace-table-${table.id}`} tabIndex={focused ? -1 : undefined}
      className={`pool-card ${stateClass}${focused ? ' is-focused' : ''}`}>
      <div className="pool-card__table">
        <span className="pool-card__pockets" aria-hidden />
        {/* Bo'sh stol matosi bosiladi — "stolga bosing, o'yin boshlanadi" */}
        <div className="pool-card__felt"
          {...(!isBusy ? {
            role: 'button', tabIndex: 0, 'aria-label': `${t('tables.start')} — ${displayName}`,
            onClick: () => onStart(table),
            onKeyDown: (e: ReactKeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStart(table); }
            },
          } : {})}>
          <div className="pool-card__top">
            <span className="pool-ball" aria-label={`${t('common.table')} ${table.number}`}>{table.number}</span>
            <div className="pool-card__title">
              <h2 title={displayName}>{displayName}</h2>
              <span>{formatNumber(table.pricePerHour)} {currency} / {t('tables.perHour')}</span>
            </div>
            <span className="pool-chip">{t(isBusy ? isPaused ? 'status.paused' : 'status.active' : 'status.free')}</span>
          </div>

          {isBusy && session ? <>
            <div className="pool-card__live">
              <ElapsedTime from={session.startTime} computeMs={(now) => sessionElapsedMs(session, now + offsetMs)} paused={isPaused}
                className="pool-card__timer" />
              <LiveAmount session={session} fallbackPrice={table.pricePerHour} segments={segments} offsetMs={offsetMs} currency={currency} />
            </div>
            <div className="pool-card__meta">
              <span title={session.customerName || t('tables.guest')}><UserOutlined />{session.customerName || t('tables.guest')}</span>
              <span><ClockCircleOutlined />{formatClock(session.startTime)}</span>
              {session.barAmount > 0 && <span><CoffeeOutlined />{formatNumber(session.barAmount)}</span>}
              {isQueuedSession && <span className="is-warning"><CloudSyncOutlined />{t('offline.queuePending')}</span>}
              {session.limitAmount != null && <span className="is-limit"><WalletOutlined />{t('tables.limitBadge', { amount: formatNumber(session.limitAmount) })}</span>}
              {hasPlan ? <PlannedBadge session={session} segments={segments} fallbackPrice={table.pricePerHour} offsetMs={offsetMs} /> : null}
              {reservation && <span className="pool-reservation"><CalendarOutlined />{reservation}</span>}
            </div>
          </> : isBusy ? <p className="pool-card__idle"><span>{t('tables.sessionUnavailable')}</span></p> : (
            <div className="pool-card__idle">
              {reservation && <span className="pool-reservation"><CalendarOutlined />{reservation}</span>}
              <strong>{t('tables.freeToStart')}</strong>
              <span><HistoryOutlined /> {t('tables.todayCompleted', { n: table.todayCompletedSessions ?? 0 })}</span>
            </div>
          )}
        </div>
      </div>

      <div className="pool-card__actions">
        {isBusy && session ? <>
          <Tooltip title={t(isPaused ? 'tables.resume' : 'tables.pause')}>
            <Button icon={isPaused ? <CaretRightOutlined /> : <PauseCircleOutlined />} loading={pending}
              aria-label={t(isPaused ? 'tables.resume' : 'tables.pause')} onClick={() => onPauseResume(session, table)} />
          </Tooltip>
          {onOrder && <Tooltip title={t('tables.addOrder')}>
            <Button icon={<CoffeeOutlined />} aria-label={t('tables.addOrder')} onClick={() => onOrder(table)} />
          </Tooltip>}
          {lightButton}
          {moreItems.length > 0 && <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
            <Button icon={<EllipsisOutlined />} aria-label={t('tables.moreActions')} />
          </Dropdown>}
          {canCheckout && <Tooltip title={offlineBlocked ? t('offline.checkoutOfflineTitle') : undefined}>
            <Button className="pool-card__primary" type="primary" icon={<DollarOutlined />} disabled={pending}
              onClick={() => onCheckout(table)}>{t('tables.end')}</Button>
          </Tooltip>}
        </> : isBusy ? null : <>
          {lightButton}
          {moreItems.length > 0 && <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
            <Button icon={<EllipsisOutlined />} aria-label={t('tables.moreActions')} />
          </Dropdown>}
          <Button className="pool-card__primary is-start" icon={<PlayCircleOutlined />} onClick={() => onStart(table)}>{t('tables.start')}</Button>
        </>}
      </div>
      {hasLight && lightError && <p className="pool-card__warning" title={lightError}><BulbOutlined />{t('tables.lightAttention')}</p>}
    </div>
  );
});
TableCard.displayName = 'TableCard';
export default TableCard;
