import type { ReactNode } from 'react';
import { Alert, Button, Popconfirm, Select, Tag, Tooltip, Typography } from 'antd';
import {
  ApiOutlined,
  BulbFilled,
  BulbOutlined,
  CloudOutlined,
  DesktopOutlined,
  DisconnectOutlined,
  PoweroffOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../../components/ui';
import { formatClock } from '../../../utils/format';
import { boardMetrics, type BoardRow, type LightController } from './board';
import { lightCopy } from './light-copy';
import { needsLightAttention, type LightHealth } from './light-health';

const { Text } = Typography;

/** Qo'lda boshqaruv muddati (daqiqa) */
export const MANUAL_DURATIONS: readonly number[] = [15, 30, 60, 120, 240];

/** Hozir bajarilayotgan amal: `all:on`, `t:12:off` va h.k. */
export type BoardBusy = string | null;

const HEALTH_COLOR: Partial<Record<LightHealth, string>> = {
  error: 'error',
  offline: 'warning',
  stale: 'warning',
  pending: 'processing',
  unconfirmed: 'default',
};

export interface LightStatusBoardProps {
  rows: BoardRow[];
  controller: LightController;
  /** Server bilan aloqa yo'q — ma'lumot faqat shu kompyuterdagi markazdan */
  offline: boolean;
  /** Boshqaruv rejimi o'chiq */
  modeOff: boolean;
  /** Buyruq yuborish mumkinmi (onlayn yoki markaz shu kompyuterda) */
  canControl: boolean;
  minutes: number;
  onMinutesChange: (minutes: number) => void;
  busy: BoardBusy;
  onOverride: (tableId: number, on: boolean | null) => void;
  onMaster: (on: boolean | null) => void;
  /** Sozlash huquqi bo'lsa — "Ulash" bo'limiga o'tish */
  onGoConnect?: () => void;
}

/**
 * HOLAT bo'limi: kim boshqarayotgani, qisqa ko'rsatkichlar, hamma stollarni
 * birdan boshqarish va har stol uchun ixcham karta (chiroq holati + tugmalar).
 */
const LightStatusBoard = ({
  rows,
  controller,
  offline,
  modeOff,
  canControl,
  minutes,
  onMinutesChange,
  busy,
  onOverride,
  onMaster,
  onGoConnect,
}: LightStatusBoardProps) => {
  const { t, i18n } = useTranslation();
  const copy = lightCopy(i18n.language.startsWith('ru'));

  if (modeOff && !offline) {
    return (
      <EmptyState
        icon={<BulbOutlined />}
        title={t('lights.offTitle')}
        hint={t('lights.offHint')}
        action={onGoConnect && <Button type="primary" onClick={onGoConnect}>{t('lights.goConnect')}</Button>}
      />
    );
  }

  const metrics = boardMetrics(rows);
  const configured = rows.filter((row) => row.configured);
  const unconfigured = rows.filter((row) => !row.configured);
  const anyBusy = busy !== null;

  const banner: { type: 'success' | 'info' | 'warning' | 'error'; icon: ReactNode; text: string } | null = offline
    ? controller === 'this-pc'
      ? { type: 'warning', icon: <DisconnectOutlined />, text: t('lights.offlineHub') }
      : { type: 'error', icon: <DisconnectOutlined />, text: t('lights.offlineNoHub') }
    : controller === 'this-pc'
      ? { type: 'success', icon: <DesktopOutlined />, text: t('lights.ctrlThisPc') }
      : controller === 'agent'
        ? { type: 'info', icon: <ApiOutlined />, text: t('lights.ctrlAgent') }
        : controller === 'agent-offline'
          ? { type: 'warning', icon: <DisconnectOutlined />, text: t('lights.ctrlAgentOffline') }
          : controller === 'server'
            ? { type: 'info', icon: <CloudOutlined />, text: t('lights.ctrlServer') }
            : controller === 'none'
              ? { type: 'warning', icon: <ApiOutlined />, text: t('lights.ctrlNone') }
              : null;

  const stateText = (row: BoardRow) =>
    row.shown === true ? t('lights.stateOn') : row.shown === false ? t('lights.stateOff') : t('lights.stateUnknown');

  const sessionText = (row: BoardRow) =>
    row.session === 'active'
      ? t('lights.sessionActive')
      : row.session === 'paused'
        ? t('lights.sessionPaused')
        : offline
          ? null
          : t('lights.sessionFree');

  const manualText = (row: BoardRow) => {
    if (!row.manual) return null;
    if (row.manual.local) return t('lights.manualLocal');
    return row.manual.until ? t('lights.manualUntil', { time: formatClock(row.manual.until) }) : t('lights.manualLocal');
  };

  return (
    <div className="light-board">
      {banner && (
        <Alert
          type={banner.type}
          showIcon
          icon={banner.icon}
          message={banner.text}
          action={
            onGoConnect && !offline && (controller === 'none' || controller === 'agent-offline') ? (
              <Button size="small" onClick={onGoConnect}>{t('lights.goConnect')}</Button>
            ) : undefined
          }
        />
      )}

      <div className="light-metrics">
        <div>
          <strong>
            {metrics.configured}
            <small> / {metrics.total}</small>
          </strong>
          <span>{t('lights.metricConfigured')}</span>
        </div>
        <div className={metrics.on > 0 ? 'is-on' : undefined}>
          <strong>{metrics.on}</strong>
          <span>{t('lights.metricOn')}</span>
        </div>
        <div className={metrics.attention > 0 ? 'is-attention' : undefined}>
          <strong>{metrics.attention}</strong>
          <span>{t('lights.metricAttention')}</span>
        </div>
      </div>

      {configured.length === 0 ? (
        <EmptyState
          icon={<BulbOutlined />}
          title={t('lights.emptyTitle')}
          hint={t('lights.emptyHint')}
          action={onGoConnect && <Button type="primary" onClick={onGoConnect}>{t('lights.goConnect')}</Button>}
        />
      ) : (
        <>
          <div className="light-master">
            <Select<number>
              value={minutes}
              onChange={onMinutesChange}
              aria-label={t('lights.duration')}
              options={MANUAL_DURATIONS.map((n) => ({
                value: n,
                label: n >= 60 ? t('lights.hoursN', { n: n / 60 }) : t('lights.minutesN', { n }),
              }))}
              className="light-master-duration"
            />
            <Popconfirm
              title={t('lights.confirmAllOn', { n: minutes })}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              disabled={!canControl || anyBusy}
              onConfirm={() => onMaster(true)}
            >
              <Button icon={<BulbOutlined />} loading={busy === 'all:on'} disabled={!canControl || (anyBusy && busy !== 'all:on')}>
                {t('lights.allOn')}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t('lights.confirmAllOff', { n: minutes })}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              okButtonProps={{ danger: true }}
              disabled={!canControl || anyBusy}
              onConfirm={() => onMaster(false)}
            >
              <Button icon={<PoweroffOutlined />} loading={busy === 'all:off'} disabled={!canControl || (anyBusy && busy !== 'all:off')}>
                {t('lights.allOff')}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t('lights.confirmAllAuto')}
              okText={t('common.yes')}
              cancelText={t('common.no')}
              disabled={!canControl || anyBusy}
              onConfirm={() => onMaster(null)}
            >
              <Button type="text" icon={<SyncOutlined />} loading={busy === 'all:auto'} disabled={!canControl || (anyBusy && busy !== 'all:auto')}>
                {t('lights.allAuto')}
              </Button>
            </Popconfirm>
          </div>
          <Text type="secondary" className="light-board-hint">{t('lights.manualHint')}</Text>

          <div className="light-board-grid">
            {configured.map((row) => {
              const attention = row.authMissing || needsLightAttention(row.health);
              const session = sessionText(row);
              const manual = manualText(row);
              const rowBusy = busy?.startsWith(`t:${row.tableId}:`) ?? false;
              const disabled = !canControl || (anyBusy && !rowBusy);
              const stateClass = row.shown === true ? 'is-on' : row.shown === false ? 'is-off' : 'is-unknown';
              return (
                <div key={row.tableId} className={`light-tile ${stateClass}${attention ? ' needs-attention' : ''}`}>
                  <div className="light-tile-head">
                    <span className="light-tile-number">{row.tableNumber}</span>
                    <div className="light-tile-name">
                      <Text strong ellipsis={{ tooltip: row.tableName }}>{row.tableName || t('lights.tableN', { n: row.tableNumber })}</Text>
                      <span className="light-tile-sub">{[session, manual].filter(Boolean).join(' · ') || ' '}</span>
                    </div>
                    <Tooltip title={stateText(row)}>
                      <span className="light-tile-lamp" role="img" aria-label={stateText(row)}>
                        {row.shown ? <BulbFilled /> : <BulbOutlined />}
                      </span>
                    </Tooltip>
                  </div>

                  <div className="light-tile-state">
                    <span className="light-tile-state-text">{stateText(row)}</span>
                    {attention && (
                      <Tag color={HEALTH_COLOR[row.health] ?? 'default'} className="light-tile-health">
                        {row.authMissing ? copy.health.error : copy.health[row.health]}
                      </Tag>
                    )}
                  </div>
                  {row.authMissing ? (
                    <Text type="warning" className="light-tile-note">{t('lights.authMissing')}</Text>
                  ) : row.error ? (
                    <Text type="danger" className="light-tile-note" ellipsis={{ tooltip: row.error }}>{row.error}</Text>
                  ) : null}

                  <div className="light-tile-actions">
                    <Button
                      size="small"
                      icon={<BulbOutlined />}
                      loading={busy === `t:${row.tableId}:on`}
                      disabled={disabled}
                      onClick={() => onOverride(row.tableId, true)}
                    >
                      {t('lights.on')}
                    </Button>
                    <Popconfirm
                      title={t('lights.confirmOffActive')}
                      okText={t('common.yes')}
                      cancelText={t('common.no')}
                      okButtonProps={{ danger: true }}
                      disabled={row.session !== 'active' || disabled}
                      onConfirm={() => onOverride(row.tableId, false)}
                    >
                      <Button
                        size="small"
                        icon={<PoweroffOutlined />}
                        loading={busy === `t:${row.tableId}:off`}
                        disabled={disabled}
                        onClick={row.session === 'active' ? undefined : () => onOverride(row.tableId, false)}
                      >
                        {t('lights.off')}
                      </Button>
                    </Popconfirm>
                    <Tooltip title={t('tables.lightsOverrideAuto')}>
                      <Button
                        size="small"
                        type={row.manual ? 'primary' : 'text'}
                        ghost={!!row.manual}
                        icon={<SyncOutlined />}
                        loading={busy === `t:${row.tableId}:auto`}
                        disabled={disabled || !row.manual}
                        onClick={() => onOverride(row.tableId, null)}
                      >
                        {t('lights.auto')}
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>

          {unconfigured.length > 0 && (
            <Text type="secondary" className="light-board-hint">
              {t('lights.notConfigured')}: {unconfigured.map((row) => row.tableNumber).join(', ')}
            </Text>
          )}
        </>
      )}
    </div>
  );
};

export default LightStatusBoard;
