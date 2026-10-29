import { memo, useEffect, useState } from 'react';
import { Tooltip } from 'antd';
import { InfoCircleOutlined, RightOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { shiftsApi } from '../../api';
import { MoneyText, useNow } from '../../components/ui';
import type { BilliardTable, ShiftReport } from '../../types';
import { sessionTableAmount, type SegmentLike } from '../../utils/session';

/** Smena ma'lumotini jimgina yangilash davri */
const SHIFT_REFRESH_MS = 60_000;

/**
 * "Ochiq stollarda" — hozir o'ynalayotgan barcha stollar va bar buyurtmalari
 * yakunlanganda kassaga tushadigan summa. Har soniyada FAQAT shu barg qayta
 * chiziladi (sahifa emas) — stol kartalaridagi jonli summa bilan bir formula.
 */
const LiveExpected = memo(({ tables, segmentsMap, offsetMs, currency }: {
  tables: BilliardTable[];
  segmentsMap: Record<number, SegmentLike[]>;
  offsetMs: number;
  currency: string;
}) => {
  const now = useNow();
  const total = tables.reduce((sum, table) => {
    const session = table.sessions?.[0];
    if (table.status !== 'busy' || !session) return sum;
    return sum
      + sessionTableAmount(session, table.pricePerHour, now + offsetMs, segmentsMap[session.id] ?? null)
      + (session.barAmount || 0);
  }, 0);
  return <MoneyText amount={total} currency={currency} size="lg" />;
});
LiveExpected.displayName = 'LiveExpected';

interface BoardMoneyStripProps {
  tables: BilliardTable[];
  segmentsMap: Record<number, SegmentLike[]>;
  offsetMs: number;
  currency: string;
  /** Kassa ma'lumoti (smena) faqat pul bilan ishlaydigan rollarga */
  showShift: boolean;
  online: boolean;
}

/**
 * Stollar sahifasi tepasidagi pul paneli: ochiq stollardagi kutilayotgan summa,
 * joriy smenada olingan pul va kassada bo'lishi kerak bo'lgan naqd.
 */
const BoardMoneyStrip = ({ tables, segmentsMap, offsetMs, currency, showShift, online }: BoardMoneyStripProps) => {
  const { t } = useTranslation();
  const [shift, setShift] = useState<ShiftReport | null>(null);

  useEffect(() => {
    if (!showShift || !online) return;
    let alive = true;
    const load = () =>
      shiftsApi
        .current()
        .then((res) => {
          if (alive) setShift(res.data);
        })
        .catch(() => {
          /* ikkilamchi ma'lumot — xatoda jim */
        });
    void load();
    const id = window.setInterval(load, SHIFT_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [showShift, online]);

  const open = shift?.shift ?? null;

  return (
    <div className={`tables-money${showShift ? '' : ' is-single'}`} aria-label={t('tables.moneyStrip')}>
      <div className="tables-money__cell is-live">
        <span>
          {t('tables.moneyExpected')}
          <Tooltip title={t('tables.moneyExpectedHint')}>
            <InfoCircleOutlined aria-label={t('tables.moneyExpectedHint')} />
          </Tooltip>
        </span>
        <LiveExpected tables={tables} segmentsMap={segmentsMap} offsetMs={offsetMs} currency={currency} />
      </div>
      {showShift && (open && shift?.summary ? (
        <>
          <Link to="/shifts" className="tables-money__cell">
            <span>{t('tables.moneyCollected')} <RightOutlined /></span>
            <MoneyText amount={shift.summary.collected} currency={currency} size="lg" />
          </Link>
          <Link to="/shifts" className="tables-money__cell">
            <span>{t('tables.moneyCash')} <RightOutlined /></span>
            <MoneyText amount={shift.expectedCash ?? 0} currency={currency} size="lg" />
          </Link>
        </>
      ) : (
        <Link to="/shifts" className="tables-money__cell is-wide is-muted">
          <span>{t('tables.moneyNoShift')}</span>
          <strong>{t('tables.moneyOpenShift')} <RightOutlined /></strong>
        </Link>
      ))}
    </div>
  );
};

export default BoardMoneyStrip;
