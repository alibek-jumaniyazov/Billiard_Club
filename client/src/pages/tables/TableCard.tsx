import { memo } from 'react';
import { App, Button, Card, Dropdown, Tag, Tooltip } from 'antd';
import {
  BulbOutlined, CaretRightOutlined, ClockCircleOutlined, CloseCircleOutlined,
  CloudSyncOutlined, CoffeeOutlined, DollarOutlined, DownOutlined, HistoryOutlined,
  PauseCircleOutlined, PlayCircleOutlined, SwapOutlined, SyncOutlined, UserOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ElapsedTime, MoneyText, StatusTag, useNow } from '../../components/ui';
import { useCurrency } from '../../context/AppSettingsContext';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Session } from '../../types';
import { formatClock, formatNumber } from '../../utils/format';
import { sessionElapsedMs, sessionTableAmount, type SegmentLike } from '../../utils/session';

// Only these leaf components tick; card order and page state stay stable.
const LiveAmount = memo(({ session, fallbackPrice, segments, offsetMs, currency }: {
  session: Session; fallbackPrice: number; segments: SegmentLike[] | null; offsetMs: number; currency: string;
}) => {
  const now = useNow();
  const amount = sessionTableAmount(session, fallbackPrice, now + offsetMs, segments) + (session.barAmount || 0);
  return <MoneyText amount={amount} currency={currency} size="lg" color={TOKENS.color.text.primary} />;
});
LiveAmount.displayName = 'LiveAmount';

export interface TableCardProps {
  table: BilliardTable;
  focused?: boolean;
  session: Session | null;
  segments: SegmentLike[] | null;
  offsetMs: number;
  online: boolean;
  pending: boolean;
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
}

const TableCard = memo(({
  table, focused, session, segments, offsetMs, online, pending, canCheckout, canManage,
  onStart, onOrder, onTransfer, onCheckout, onPauseResume, onCancel, onLightToggle, onLightAuto,
}: TableCardProps) => {
  const { t } = useTranslation();
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
  const lightState = table.lightState ?? null;
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
  const moreItems = [
    ...(isBusy && session ? [{ key: 'transfer', icon: <SwapOutlined />,
      label: <Tooltip title={offlineBlocked ? t('offline.offlineBlocked') : isPaused ? t('tables.transferPausedHint') : undefined}><span>{t('tables.transfer')}</span></Tooltip>,
      disabled: isPaused || offlineBlocked || pending, onClick: () => onTransfer(table) }] : []),
    ...(hasLight && lightOverride && onLightAuto ? [{ key: 'light-auto', icon: <SyncOutlined />,
      label: t('tables.lightsOverrideAuto'), onClick: () => onLightAuto(table) }] : []),
    ...(isBusy && session && canCheckout ? [{ key: 'cancel', icon: <CloseCircleOutlined />, danger: true,
      label: <Tooltip title={!canCancel ? t(offlineBlocked ? 'offline.offlineBlocked' : 'tables.cancelNeedsAdmin') : undefined}><span>{t('tables.cancelTooltip')}</span></Tooltip>,
      disabled: !canCancel || pending, onClick: confirmCancel }] : []),
  ];

  return (
    <Card id={`workspace-table-${table.id}`} tabIndex={focused ? -1 : undefined}
      className={`table-work-card ${isBusy ? isPaused ? 'is-paused' : 'is-busy' : 'is-free'}${focused ? ' is-focused' : ''}`}>
      <div className="table-work-card__header">
        <div className="table-work-card__identity">
          <span className="table-work-card__number" aria-label={`${t('common.table')} ${table.number}`}>{String(table.number).padStart(2, '0')}</span>
          <div><h2 title={table.name}>{table.name || `${t('common.table')} ${table.number}`}</h2>
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
          {hasLight && <Tooltip title={`${lightLabel} · ${lightHint}`}><Button type="text" icon={<BulbOutlined />}
            className={lightError ? 'has-light-error' : lightState ? 'is-light-on' : ''}
            aria-label={`${lightLabel} · ${lightHint}`} onClick={() => onLightToggle?.(table, !lightTarget)} /></Tooltip>}
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
