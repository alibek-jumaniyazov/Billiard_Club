/**
 * Zarba boshqaruvi — DOM'siz toza funksiyalar (vitest bilan tekshiriladi).
 *
 * Kuch "bosib turish" bilan yig'iladi: qancha uzoq bosib tursangiz, kiy
 * shuncha orqaga tortiladi va zarba kuchliroq bo'ladi. Vint — biток
 * yuzasidagi tegish nuqtasi (vidjetdagi qizil nuqta).
 */
import { PHYS, type AimInfo } from './physics';

/** Bosib turish shuncha vaqtda kuchni 100% ga yetkazadi, ms */
export const CHARGE_FULL_MS = 1150;
/** Bir zum bosib qo'yib yuborish ham yumshoq zarba beradi (nol emas) */
export const TAP_POWER = 0.12;
/** Eng yumshoq zarba tezligi, R/s (stolning ~uchdan biriga boradi) */
const MIN_SPEED = 8;
/** Vidjetdagi chekka nuqta — kiy uchining markazdan eng katta siljishi (R) */
export const SPIN_MAX = 0.55;
/** Shundan kuchli zarbada stol sezilar-sezilmas silkinadi */
const SHAKE_FROM = 0.85;
const SHAKE_MAX_PX = 2.5;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** −0 ni 0 ga aylantiradi (UI va testlarda "-0" chiqmasin) */
const tidy = (v: number) => v + 0;

/**
 * Bosib turish vaqti → kuch (0..1). Egri chiziq boshida yotiq: kichik
 * kuchlarda nazorat aniqroq, oxiri esa CHARGE_FULL_MS da 100% ga yetadi.
 */
export const chargePower = (heldMs: number): number => {
  const t = clamp01(heldMs / CHARGE_FULL_MS);
  return TAP_POWER + (1 - TAP_POWER) * t ** 1.35;
};

/** Kuch → biток tezligi; 100% — stol ruxsat bergan eng kuchli zarba (razbiy) */
export const powerToSpeed = (power: number): number =>
  MIN_SPEED + clamp01(power) ** 1.2 * (PHYS.maxSpeed - MIN_SPEED);

/** Kiy uchining shardan uzoqligi (R): kuch ortgan sari kiy orqaga tortiladi */
export const aimGap = (power: number): number => 0.35 + clamp01(power) * 4.2;

/** Kiyning oldinga harakati, ms — kuchli zarba tezroq */
export const strikeDuration = (power: number): number => Math.round(170 - 100 * clamp01(power));

/** Vidjetdagi nuqta (−1..1, ekran o'qlari: y — pastga) doiradan chiqmasin */
export const clampSpinPoint = (x: number, y: number): { x: number; y: number } => {
  const d = Math.hypot(x, y);
  return d > 1 ? { x: x / d, y: y / d } : { x, y };
};

/**
 * Vidjet nuqtasi → fizika parametrlari (physics.strike):
 * o'ngga — o'ng vint (bortdan o'ngga qaytadi), yuqoriga — nakat (oldinga
 * davom etadi), pastga — ottyajka (orqaga qaytadi).
 */
export const spinFromPoint = (x: number, y: number): { side: number; vertical: number } => {
  const p = clampSpinPoint(x, y);
  return { side: tidy(p.x * SPIN_MAX), vertical: tidy(-p.y * SPIN_MAX) };
};

/**
 * Biтокning soqqaga tekkandan keyingi taxminiy yo'li: vintsiz — urinma
 * (90° qoidasi), nakat — zarba yo'nalishiga, ottyajka — orqaga egiladi.
 * To'liq (markaziy) zarbada vintsiz biток to'xtaydi — ulush 0.
 */
export const cuePathAfterContact = (
  aim: AimInfo,
  dirX: number,
  dirY: number,
  vertical: number,
): { x: number; y: number; share: number } => {
  if (!aim.target) return { x: aim.cueX, y: aim.cueY, share: aim.cueShare };
  const k = (vertical / SPIN_MAX) * aim.objShare * 0.9;
  const x = aim.cueX * aim.cueShare + dirX * k;
  const y = aim.cueY * aim.cueShare + dirY * k;
  const len = Math.hypot(x, y);
  if (len < 1e-6) return { x: aim.cueX, y: aim.cueY, share: 0 };
  return { x: x / len, y: y / len, share: Math.min(1, len) };
};

/** Zarbadan keyingi silkinish amplitudasi, px — faqat juda kuchli zarbada */
export const shakeAmplitude = (power: number): number =>
  power < SHAKE_FROM ? 0 : (clamp01((power - SHAKE_FROM) / (1 - SHAKE_FROM)) * SHAKE_MAX_PX);

/** Silkinish siljishi vaqt bo'yicha (≈200 ms da so'nadi) */
export const shakeOffset = (amplitude: number, elapsedMs: number): { x: number; y: number } => {
  if (amplitude <= 0 || elapsedMs < 0 || elapsedMs > 200) return { x: 0, y: 0 };
  const fade = 1 - elapsedMs / 200;
  // Markaz orqali u yoq-bu yoqqa tebranish, yo'nalishi sekin buriladi; |siljish| ≤ amplituda
  const m = amplitude * fade * fade * Math.sin(elapsedMs * 0.13);
  const angle = elapsedMs * 0.047 + 0.6 * Math.sin(elapsedMs * 0.11);
  return { x: tidy(m * Math.cos(angle)), y: tidy(m * Math.sin(angle)) };
};
