import type { Session, SessionReceipt, SessionStatus } from '../types';

/**
 * SESSIYA HISOBI — server (sessions.service.ts) formulasining AYNAN nusxasi.
 *
 * SEKUNDLIK HISOB MODELI (server v2 bilan lockstep):
 *  - activeMs = (now - startTime) - totalPausedMs - joriy tugallanmagan pauza
 *  - billedSeconds = floor(activeMs / 1000)
 *  - amount = round2(pricePerHour * billedSeconds / 3600)
 *  - Segmentli sessiyalar (transfer tarixi): har segment alohida hisoblanadi
 *    va yig'indisi round2 qilinadi — serverdagi billSegments bilan bir xil.
 *  - Segmentlarsiz (legacy) sessiyalar: muhrlangan session.pricePerHour
 *    bo'yicha sekundlik hisob.
 *
 * DRIFT YO'Q: barcha funksiyalar nowMs qabul qiladi — chaqiruvchi
 * clockOffsetMs(serverNow) bilan siljitilgan vaqtni uzatadi, shunda kassa
 * kompyuterining soati noto'g'ri bo'lsa ham ko'rsatilgan summa server
 * hisobiga teng bo'ladi.
 */

/** Serverdagi round2 bilan bir xil: 2 kasr xonagacha yaxlitlash */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Hisob uchun zarur minimal sessiya ko'rinishi (to'liq Session ham mos) */
export interface SessionTiming {
  startTime: string;
  status: SessionStatus;
  pausedAt?: string | null;
  totalPausedMs: number;
  /** Sessiya boshlanganida muhrlangan narx (legacy hisob uchun) */
  pricePerHour?: number | null;
}

/** Segment hisobi uchun zarur maydonlar (entity yoki receipt bandi mos) */
export interface SegmentLike {
  tableId: number;
  pricePerHour: number;
  startedAt: string;
  endedAt: string | null;
  pausedMs: number;
}

/** Hisoblangan segment bandi — chekda ko'rsatish uchun */
export interface SegmentBillingLine extends SegmentLike {
  billedSeconds: number;
  amount: number;
}

/** serverNow (ISO) dan soat siljishi: shiftedNow = Date.now() + offset */
export const clockOffsetMs = (serverNow: string | null | undefined): number => {
  if (!serverNow) return 0;
  const ms = Date.parse(serverNow);
  return Number.isNaN(ms) ? 0 : ms - Date.now();
};

/** Joriy tugallanmagan pauza davomiyligi (ms) — serverdagi currentPauseMs */
const currentPauseMs = (session: SessionTiming, now: number): number =>
  session.status === 'paused' && session.pausedAt
    ? Math.max(0, now - new Date(session.pausedAt).getTime())
    : 0;

/**
 * Sessiyaning o'tgan FAOL vaqti (ms) — pauzalar ayirilgan.
 * Har tikda startTime dan qayta hisoblanadi (yig'ilish drifti yo'q).
 */
export const sessionElapsedMs = (session: SessionTiming, now: number = Date.now()): number => {
  const start = new Date(session.startTime).getTime();
  const elapsed = now - start - (session.totalPausedMs || 0) - currentPauseMs(session, now);
  return Math.max(0, elapsed);
};

/** Faol soniyalar — serverdagi durationSeconds bilan bir xil (floor) */
export const sessionDurationSeconds = (session: SessionTiming, now?: number): number =>
  Math.floor(sessionElapsedMs(session, now) / 1000);

/** Sekundlik narx formulasi: round2(pricePerHour * soniyalar / 3600) */
export const secondsAmount = (pricePerHour: number, seconds: number): number =>
  round2((pricePerHour * Math.max(0, seconds)) / 3600);

/**
 * Kesh yaroqliligi: ochiq segment mavjud va sessiyaning joriy stoliga mos
 * bo'lsa — segmentlar yangilangan (transfer bo'lmagan) hisoblanadi.
 */
export const segmentsMatchSession = (
  session: { tableId: number },
  segments: SegmentLike[],
): boolean => {
  const open = segments.find((s) => !s.endedAt);
  return !!open && open.tableId === session.tableId;
};

/**
 * Segmentlar bo'yicha sekundlik hisob — serverdagi billSegments nusxasi.
 *
 * Ochiq segmentning pausedMs qiymati sessiyaning YANGI totalPausedMsidan
 * qayta hisoblanadi (totalPausedMs - yopiq segmentlar yig'indisi): server
 * invarianti bo'yicha pauza segment chegarasidan oshmaydi va resume ikkala
 * qiymatni birga oshiradi, shu tufayli eskirgan segment keshida ham hisob
 * aniq qoladi. Joriy tugallanmagan pauza ham ochiq segmentga qo'shiladi.
 */
export const sessionSegmentBilling = (
  session: SessionTiming,
  segments: SegmentLike[],
  now: number = Date.now(),
): { items: SegmentBillingLine[]; tableAmount: number } => {
  const closedPausedMs = segments.reduce(
    (sum, seg) => (seg.endedAt ? sum + (seg.pausedMs || 0) : sum),
    0,
  );
  const openPausedMs =
    Math.max(0, (session.totalPausedMs || 0) - closedPausedMs) + currentPauseMs(session, now);

  const items: SegmentBillingLine[] = segments.map((seg) => {
    const endMs = seg.endedAt ? Math.min(new Date(seg.endedAt).getTime(), now) : now;
    const pausedMs = seg.endedAt ? seg.pausedMs || 0 : openPausedMs;
    const billedSeconds = Math.max(
      0,
      Math.floor((endMs - new Date(seg.startedAt).getTime() - pausedMs) / 1000),
    );
    return {
      ...seg,
      pausedMs,
      billedSeconds,
      amount: secondsAmount(seg.pricePerHour, billedSeconds),
    };
  });

  const tableAmount = round2(items.reduce((sum, i) => sum + i.amount, 0));
  return { items, tableAmount };
};

/**
 * Joriy stol summasi — server yakuni bilan BIR XIL:
 *  - segmentlar berilsa: segmentlar bo'yicha (transferlar hisobga olinadi)
 *  - berilmasa: legacy yo'l — muhrlangan session.pricePerHour (yo'q bo'lsa
 *    fallbackPricePerHour) bo'yicha sekundlik hisob
 */
export const sessionTableAmount = (
  session: SessionTiming,
  fallbackPricePerHour: number,
  now: number = Date.now(),
  segments?: SegmentLike[] | null,
): number => {
  if (segments && segments.length > 0) {
    return sessionSegmentBilling(session, segments, now).tableAmount;
  }
  const price = session.pricePerHour ?? fallbackPricePerHour;
  return secondsAmount(price, sessionDurationSeconds(session, now));
};

/**
 * Chekdan (GET /sessions/:id/receipt, live) hisob ko'rinishini tiklaydi.
 * Receipt.totalPausedMs joriy pauzani ham o'z ichiga oladi — bu yerda u
 * ajratib olinadi, chunki hisob funksiyalari joriy pauzani pausedAt dan
 * o'zi qo'shadi (jonli yangilanish uchun).
 */
export const timingFromReceipt = (receipt: SessionReceipt): SessionTiming => {
  const serverNowMs = Date.parse(receipt.serverNow);
  const pauseSoFar =
    receipt.status === 'paused' && receipt.pausedAt
      ? Math.max(0, serverNowMs - Date.parse(receipt.pausedAt))
      : 0;
  return {
    startTime: receipt.startTime,
    status: receipt.status,
    pausedAt: receipt.pausedAt ?? null,
    totalPausedMs: Math.max(0, (receipt.totalPausedMs || 0) - pauseSoFar),
    pricePerHour: receipt.pricePerHour ?? null,
  };
};

/** Sessiya obyektidan sintetik bitta ochiq segment (start javobi uchun) */
export const initialSegmentOf = (session: Session): SegmentLike[] | null =>
  session.pricePerHour == null
    ? null
    : [
        {
          tableId: session.tableId,
          pricePerHour: session.pricePerHour,
          startedAt: session.startTime,
          endedAt: null,
          pausedMs: 0,
        },
      ];
