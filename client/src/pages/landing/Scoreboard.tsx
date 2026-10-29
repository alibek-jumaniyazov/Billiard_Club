import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '../../components/ui';
import { formatNumber } from '../../utils/format';
import { amountFor, formatHms } from './shared';

/** Hero stoli narxi: VIP stol, soatiga 60 000 */
export const SCOREBOARD_PRICE = 60_000;
/** Namunaviy o'yin sahifa ochilganda 47 daqiqadan beri davom etyapti */
const DEMO_ELAPSED_SEC = 47 * 60 + 18;

interface ScoreboardProps {
  /** Mehmon o'zi o'ynayotgan bo'lsa — uning o'yini boshlangan vaqt (ms) */
  startedAt?: number | null;
}

/**
 * Hero stoli ostidagi tablo — kassada ko'rinadigan narsa: stol, jonli vaqt
 * va summa. Mehmon zarba bersa tablo UNING o'yinini 00:00:00 dan sanaydi.
 * Raqamlar har soniyada yuradi (faqat shu barg qayta chiziladi).
 */
const Scoreboard = ({ startedAt = null }: ScoreboardProps) => {
  const { t } = useTranslation();
  const now = useNow();
  const demoStartedAt = useRef(Date.now() - DEMO_ELAPSED_SEC * 1000).current;
  const visitor = startedAt !== null;
  const sec = Math.max(0, (now - (visitor ? startedAt : demoStartedAt)) / 1000);
  return (
    <div
      className={`lp-scoreboard${visitor ? ' is-visitor' : ''}`}
      role="img"
      aria-label={t('landing.scoreboardAria')}
    >
      <span className="lp-scoreboard__table">
        <i aria-hidden>7</i>
        {visitor ? t('landing.scoreboardYou') : 'VIP'}
      </span>
      <span className="lp-scoreboard__time">{formatHms(sec)}</span>
      <span className="lp-scoreboard__sum">
        {formatNumber(amountFor(sec, SCOREBOARD_PRICE))}
        <small>{t('common.sum')}</small>
      </span>
    </div>
  );
};

export default Scoreboard;
