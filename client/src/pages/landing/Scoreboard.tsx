import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '../../components/ui';
import { formatNumber } from '../../utils/format';
import { amountFor, formatHms } from './shared';

/** Namunaviy o'yin: VIP stol, soatiga 60 000, sahifa ochilganda 47 daqiqadan beri */
const DEMO_PRICE = 60_000;
const DEMO_ELAPSED_SEC = 47 * 60 + 18;

/**
 * Hero stoli ostidagi tablo — kassada ko'rinadigan narsa: stol, jonli vaqt
 * va summa. Raqamlar har soniyada yuradi (faqat shu barg qayta chiziladi).
 */
const Scoreboard = () => {
  const { t } = useTranslation();
  const now = useNow();
  const startedAt = useRef(Date.now() - DEMO_ELAPSED_SEC * 1000).current;
  const sec = (now - startedAt) / 1000;
  return (
    <div className="lp-scoreboard" role="img" aria-label={t('landing.scoreboardAria')}>
      <span className="lp-scoreboard__table">
        <i aria-hidden>7</i>
        VIP
      </span>
      <span className="lp-scoreboard__time">{formatHms(sec)}</span>
      <span className="lp-scoreboard__sum">
        {formatNumber(amountFor(sec, DEMO_PRICE))}
        <small>{t('common.sum')}</small>
      </span>
    </div>
  );
};

export default Scoreboard;
