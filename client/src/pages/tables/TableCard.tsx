import { memo } from 'react';
import { Button, Card, Popconfirm, Tooltip, Typography } from 'antd';
import {
  CaretRightOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CoffeeOutlined,
  DollarOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SwapOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ElapsedTime, MoneyText, StatusTag, useNow } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type { BilliardTable, Session } from '../../types';
import { formatClock, formatNumber } from '../../utils/format';
import { sessionElapsedMs, sessionTableAmount, type SegmentLike } from '../../utils/session';

const { Text, Title } = Typography;

/**
 * Jonli summa — FAQAT shu barg komponent har soniyada qayta render bo'ladi.
 * Hisob serverdagi bilan bir xil: segmentlar bo'yicha sekundlik formula,
 * soat siljishi (offsetMs) hisobga olingan.
 */
const LiveAmount = memo(
  ({
    session,
    fallbackPrice,
    segments,
    offsetMs,
    currency,
  }: {
    session: Session;
    fallbackPrice: number;
    segments: SegmentLike[] | null;
    offsetMs: number;
    currency: string;
  }) => {
    const now = useNow();
    const amount =
      sessionTableAmount(session, fallbackPrice, now + offsetMs, segments) +
      (session.barAmount || 0);
    return (
      <MoneyText amount={amount} currency={currency} size="lg" color={TOKENS.color.gold.base} />
    );
  },
);
LiveAmount.displayName = 'LiveAmount';

export interface TableCardProps {
  table: BilliardTable;
  /** Faol/pauzadagi sessiya (bo'lsa) */
  session: Session | null;
  /** Sessiya segmentlari keshi (transfer tarixi) — bo'lmasa legacy hisob */
  segments: SegmentLike[] | null;
  /** Server soat siljishi: shiftedNow = Date.now() + offsetMs */
  offsetMs: number;
  /** Shu sessiya uchun amal bajarilmoqda (pause/resume/cancel) */
  pending: boolean;
  /** Hisob-kitob va bekor qilish huquqi (admin/kassir) */
  canCheckout: boolean;
  onStart: (table: BilliardTable) => void;
  onOrder: (table: BilliardTable) => void;
  onTransfer: (table: BilliardTable) => void;
  onCheckout: (table: BilliardTable) => void;
  onPauseResume: (session: Session) => void;
  onCancel: (session: Session) => void;
}

/**
 * Stol kartasi — React.memo bilan izolyatsiya qilingan: sahifa har tikda
 * QAYTA RENDER BO'LMAYDI, faqat ichidagi ElapsedTime/LiveAmount barglari
 * tiklaydi. Kartaning o'zi faqat poll/amaldan keyin yangilanadi.
 */
const TableCard = memo(
  ({
    table,
    session,
    segments,
    offsetMs,
    pending,
    canCheckout,
    onStart,
    onOrder,
    onTransfer,
    onCheckout,
    onPauseResume,
    onCancel,
  }: TableCardProps) => {
    const { t } = useTranslation();
    const reduceMotion = useReducedMotion();
    const currency = t('common.sum');

    const isBusy = table.status === 'busy' && !!session;
    const isPaused = session?.status === 'paused';
    const todayCompleted = table.todayCompletedSessions ?? 0;

    const surface = isBusy
      ? isPaused
        ? `linear-gradient(165deg, ${TOKENS.color.bg.bg2} 0%, ${TOKENS.color.bg.bg1} 65%)`
        : `linear-gradient(165deg, ${TOKENS.color.emerald.deepest} 0%, ${TOKENS.color.bg.bg1} 70%)`
      : TOKENS.color.bg.bg1;

    return (
      <motion.div
        whileHover={reduceMotion ? undefined : { y: -3 }}
        transition={{ duration: TOKENS.motion.duration.fast }}
        style={{ height: '100%' }}
      >
        <Card
          className={isBusy && !isPaused ? 'table-card-active' : undefined}
          style={{
            height: '100%',
            background: surface,
            borderColor: isPaused ? TOKENS.color.semantic.warning : undefined,
          }}
          styles={{ body: { padding: 16, display: 'flex', flexDirection: 'column', gap: 10 } }}
        >
          {/* Sarlavha: raqam + nom + holat */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>
                {t('common.table')} {table.number}
              </Title>
              <Text type="secondary" style={{ fontSize: 12.5 }} ellipsis>
                {table.name}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {isBusy ? (
                <StatusTag
                  status={isPaused ? 'paused' : 'active'}
                  label={isPaused ? t('status.paused') : t('status.active')}
                />
              ) : (
                <StatusTag status="free" label={t('status.free')} />
              )}
              {isBusy && canCheckout && (
                <Popconfirm
                  title={t('tables.cancelConfirmTitle')}
                  description={t('tables.cancelConfirmDesc')}
                  okText={t('common.yes')}
                  cancelText={t('common.no')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => onCancel(session)}
                >
                  <Tooltip title={t('tables.cancelTooltip')}>
                    <Button
                      type="text"
                      danger
                      size="small"
                      loading={pending}
                      icon={<CloseCircleOutlined />}
                      aria-label={t('tables.cancelTooltip')}
                    />
                  </Tooltip>
                </Popconfirm>
              )}
            </div>
          </div>

          {isBusy ? (
            <>
              {/* Jonli taymer + summa — barg komponentlar o'zi tiklaydi */}
              <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
                <ElapsedTime
                  computeMs={(now) => sessionElapsedMs(session, now + offsetMs)}
                  from={session.startTime}
                  paused={isPaused}
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    color: isPaused ? TOKENS.color.semantic.warning : TOKENS.color.neonGreen,
                    display: 'block',
                  }}
                />
                <LiveAmount
                  session={session}
                  fallbackPrice={table.pricePerHour}
                  segments={segments}
                  offsetMs={offsetMs}
                  currency={currency}
                />
              </div>

              {/* Mijoz + boshlanish vaqti + bar chip */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  justifyContent: 'center',
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: TOKENS.color.text.secondary }}>
                  <UserOutlined style={{ marginRight: 4 }} />
                  {session.customerName || t('tables.guest')}
                </span>
                <span style={{ color: TOKENS.color.text.tertiary }}>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {t('tables.startedAt')} {formatClock(session.startTime)}
                </span>
                {session.barAmount > 0 && (
                  <span
                    className="tabular-nums"
                    style={{
                      color: TOKENS.color.emerald.glow,
                      background: TOKENS.color.emerald.deep,
                      border: `1px solid ${TOKENS.color.emerald.felt}`,
                      borderRadius: TOKENS.radius.pill,
                      padding: '0 8px',
                      lineHeight: '20px',
                    }}
                  >
                    <CoffeeOutlined style={{ marginRight: 4 }} />
                    {formatNumber(session.barAmount)} {currency}
                  </span>
                )}
              </div>

              {/* Amallar */}
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                <Tooltip title={isPaused ? t('tables.resume') : t('tables.pause')}>
                  <Button
                    icon={isPaused ? <CaretRightOutlined /> : <PauseCircleOutlined />}
                    loading={pending}
                    onClick={() => onPauseResume(session)}
                    aria-label={isPaused ? t('tables.resume') : t('tables.pause')}
                    style={{ flex: 1 }}
                  />
                </Tooltip>
                <Tooltip title={t('common.bar')}>
                  <Button
                    icon={<CoffeeOutlined />}
                    onClick={() => onOrder(table)}
                    aria-label={t('common.bar')}
                    style={{ flex: 1 }}
                  />
                </Tooltip>
                <Tooltip title={isPaused ? t('tables.transferPausedHint') : t('tables.transfer')}>
                  <Button
                    icon={<SwapOutlined />}
                    disabled={isPaused}
                    onClick={() => onTransfer(table)}
                    aria-label={t('tables.transfer')}
                    style={{ flex: 1 }}
                  />
                </Tooltip>
                {canCheckout && (
                  <Button
                    type="primary"
                    icon={<DollarOutlined />}
                    onClick={() => onCheckout(table)}
                    style={{ flex: 2, minWidth: 0 }}
                  >
                    {t('tables.end')}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Bo'sh stol: narx + tezkor boshlash */}
              <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
                <MoneyText
                  amount={table.pricePerHour}
                  currency={currency}
                  size="lg"
                  color={TOKENS.color.text.primary}
                />
                <Text type="secondary" style={{ display: 'block', fontSize: 12.5 }}>
                  {t('tables.perHour')}
                </Text>
              </div>
              <Button
                type="primary"
                ghost
                block
                icon={<PlayCircleOutlined />}
                onClick={() => onStart(table)}
                style={{ marginTop: 'auto' }}
              >
                {t('tables.start')}
              </Button>
            </>
          )}

          {/* Bugungi yakunlangan o'yinlar */}
          {todayCompleted > 0 && (
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <HistoryOutlined style={{ marginRight: 4 }} />
                {t('tables.todayCompleted', { n: todayCompleted })}
              </Text>
            </div>
          )}
        </Card>
      </motion.div>
    );
  },
);
TableCard.displayName = 'TableCard';

export default TableCard;
