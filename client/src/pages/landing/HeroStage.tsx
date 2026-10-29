import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BilliardTable, type BilliardGameEvent } from '../../components/ui';
import { TOKENS } from '../../theme/tokens';
import HeroLiveCards, { type HeroNotice } from './HeroLiveCards';
import Scoreboard, { SCOREBOARD_PRICE } from './Scoreboard';
import { amountFor } from './shared';

/**
 * Hero sahnasi: o'ynasa bo'ladigan stol + jonli bildirishnomalar + tablo.
 *
 * Raqobatchi saytlarda ham fizikali stol bor — bizda esa mehmonning O'YINI
 * mahsulotni ko'rsatadi: birinchi zarbada "o'yin boshlandi, chiroq yondi"
 * chiqadi va tablo uning o'z taymerini 00:00:00 dan sanaydi; mehmon
 * to'xtasa (namoyish o'yini qaytsa, stol qayta terilsa yoki 40 s zarba
 * bo'lmasa) — soniyasigacha hisoblangan chek chiqadi.
 */

/** Shuncha vaqt mehmon zarba bermasa o'yini yakunlanadi */
const IDLE_FINISH_MS = 40_000;

interface VisitorGame {
  startedAt: number;
}

const HeroStage = () => {
  const { t } = useTranslation();
  const [game, setGame] = useState<VisitorGame | null>(null);
  const [notice, setNotice] = useState<HeroNotice | null>(null);
  const gameRef = useRef<VisitorGame | null>(null);
  const idleTimer = useRef(0);

  const finish = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    window.clearTimeout(idleTimer.current);
    gameRef.current = null;
    setGame(null);
    const seconds = Math.max(1, Math.round((Date.now() - current.startedAt) / 1000));
    setNotice({ id: Date.now(), kind: 'receipt', seconds, amount: amountFor(seconds, SCOREBOARD_PRICE) });
  }, []);

  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  const onGameEvent = useCallback(
    (event: BilliardGameEvent) => {
      if (event.type === 'shot' && event.by === 'user') {
        if (!gameRef.current) {
          gameRef.current = { startedAt: Date.now() };
          setGame(gameRef.current);
          setNotice({ id: Date.now(), kind: 'start' });
        }
        window.clearTimeout(idleTimer.current);
        idleTimer.current = window.setTimeout(finish, IDLE_FINISH_MS);
      } else if ((event.type === 'shot' && event.by === 'ai') || event.type === 'rack') {
        // Namoyish o'yini qaytdi yoki stol qayta terildi — mehmon o'yini tugadi
        finish();
      }
    },
    [finish],
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: TOKENS.motion.easing.out, delay: 0.25 }}
    >
      <div className="lp-hero-stage">
        <HeroLiveCards notice={notice} />
        <BilliardTable
          hint={t('landing.heroTableHint')}
          ariaLabel={t('landing.heroTableAria')}
          onGameEvent={onGameEvent}
        />
      </div>
      <Scoreboard startedAt={game?.startedAt ?? null} />
    </motion.div>
  );
};

export default HeroStage;
