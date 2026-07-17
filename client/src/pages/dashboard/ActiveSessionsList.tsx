import { memo } from 'react';
import { Typography } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ElapsedTime, StatusTag, useNow } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import type { Session } from '../../types';
import { formatMoney } from '../../utils/format';
import { sessionElapsedMs, sessionTableAmount } from '../../utils/session';
import ChartCard from './ChartCard';

const { Text } = Typography;

interface ActiveSessionsListProps {
  sessions: Session[];
  currency: string;
  loading: boolean;
  /** serverNow - Date.now() — taymer/summa soat siljishisiz hisoblanadi */
  clockOffset: number;
}

/**
 * Jonli summa — FAQAT shu barg komponent har soniyada qayta render bo'ladi.
 * Narx sessiyada muhrlangan qiymatdan olinadi (auditdagi tuzatish:
 * stolning JORIY narxi emas — server ham muhrlangan narx bilan hisoblaydi).
 * Segmentlar javobda kelsa, hisob transferlarni ham aniq aks ettiradi.
 */
const LiveAmount = ({
  session,
  currency,
  clockOffset,
}: {
  session: Session;
  currency: string;
  clockOffset: number;
}) => {
  const now = useNow() + clockOffset;
  const pricePerHour = session.pricePerHour ?? session.table?.pricePerHour ?? 0;
  const total =
    sessionTableAmount(session, pricePerHour, now, session.segments) +
    (session.barAmount || 0);
  const hasMoney = pricePerHour > 0 || (session.barAmount || 0) > 0;

  return (
    <span
      className="tabular-nums"
      style={{ color: TOKENS.color.neonGreen, fontWeight: 600, fontSize: 13.5 }}
    >
      {hasMoney ? formatMoney(total, currency) : '—'}
    </span>
  );
};

/** Bitta faol sessiya qatori — memo, ota ro'yxat pollda yangilanganda ham arzon */
const SessionRow = memo(
  ({
    session,
    currency,
    clockOffset,
  }: {
    session: Session;
    currency: string;
    clockOffset: number;
  }) => {
    const { t } = useTranslation();
    const paused = session.status === 'paused';

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: TOKENS.spacing.sm,
          padding: '10px 4px',
          borderBottom: `1px solid ${TOKENS.color.border.subtle}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text strong style={{ fontSize: 14 }}>
              {session.table?.name ?? '—'}
            </Text>
            {session.table?.number !== undefined && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                №{session.table.number}
              </Text>
            )}
            <StatusTag status={session.status} label={t(`status.${session.status}`)} />
          </div>
          <Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginTop: 2 }}>
            {session.customerName || t('dashboard.anonymous')}
          </Text>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <ElapsedTime
            from={session.startTime}
            paused={paused}
            computeMs={(now) => sessionElapsedMs(session, now + clockOffset)}
            style={{ fontSize: 15, display: 'block' }}
          />
          <LiveAmount session={session} currency={currency} clockOffset={clockOffset} />
        </div>
      </div>
    );
  },
);

SessionRow.displayName = 'SessionRow';

/**
 * Faol o'yinlar ro'yxati — taymer va summa har soniyada faqat barg
 * komponentlarda yangilanadi; ro'yxatning o'zi 30s poll bilan yangilanadi.
 */
const ActiveSessionsList = ({
  sessions,
  currency,
  loading,
  clockOffset,
}: ActiveSessionsListProps) => {
  const { t } = useTranslation();

  return (
    <ChartCard
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {t('dashboard.activeTitle')}
          {sessions.length > 0 && (
            <span
              className="tabular-nums"
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: TOKENS.color.neonGreen,
                background: TOKENS.color.emerald.deep,
                border: `1px solid ${TOKENS.color.emerald.felt}`,
                borderRadius: TOKENS.radius.pill,
                padding: '0 10px',
                lineHeight: '20px',
              }}
            >
              {sessions.length}
            </span>
          )}
        </span>
      }
      height={332}
      loading={loading}
      empty={sessions.length === 0}
      emptyIcon={<PlayCircleOutlined />}
      emptyTitle={t('dashboard.activeEmpty')}
      emptyHint={t('dashboard.activeEmptyHint')}
    >
      <div style={{ overflowY: 'auto', flex: 1, marginTop: -6 }}>
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            currency={currency}
            clockOffset={clockOffset}
          />
        ))}
      </div>
    </ChartCard>
  );
};

export default ActiveSessionsList;
