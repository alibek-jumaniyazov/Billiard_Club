import type { Session } from '../types';

/**
 * Sessiyaning o'tgan faol vaqti (ms) — pauzalar ayirilgan.
 * Har tikda startTime dan qayta hisoblanadi (drift yo'q).
 * Tables va Dashboard bir xil hisobdan foydalanadi (avval har xil edi).
 */
export const sessionElapsedMs = (session: Session, now: number = Date.now()): number => {
  const start = new Date(session.startTime).getTime();
  let elapsed = now - start - (session.totalPausedMs || 0);
  if (session.status === 'paused' && session.pausedAt) {
    elapsed -= now - new Date(session.pausedAt).getTime();
  }
  return Math.max(0, elapsed);
};

/** Joriy hisoblangan stol summasi (serverdagi bilan bir xil formula) */
export const sessionTableAmount = (session: Session, pricePerHour: number, now?: number): number => {
  const minutes = Math.ceil(sessionElapsedMs(session, now) / 60_000);
  return Math.round(((pricePerHour * minutes) / 60) * 100) / 100;
};
