/**
 * MA'LUMOTLAR BAZASIGA ULANISHDAGI VAQTINCHALIK XATOLAR.
 *
 * Bu xatolar so'rovning o'zida emas — Postgres yoki tarmoq bir lahza javob
 * bermagan (server qayta ishga tushmoqda, yuklama cho'qqisi, tarmoq lipillashi).
 * Ular "kod xatosi" emas, shuning uchun:
 *  - ulanish ochish bosqichida bo'lsa — xavfsiz qayta urinib ko'riladi
 *    (hali birorta SQL bajarilmagan, `pool-retry.ts`);
 *  - foydalanuvchiga 500 "Server xatosi" emas, 503 "vaqtincha band" qaytadi;
 *  - har biri alohida "Kritik xatolik" bo'lib Telegramga ketmaydi — faqat
 *    davom etsa bitta jamlangan ogohlantirish yuboriladi.
 */

/** pg / pg-pool ulanish xatolari matnlari */
const CONNECT_MESSAGES = [
  // pg-pool: yangi ulanish connectionTimeoutMillis ichida ochilmadi
  'connection terminated due to connection timeout',
  // pg-pool: hamma ulanishlar band va navbat muddati tugadi
  'timeout exceeded when trying to connect',
  // Postgres ulanishni kutilmaganda uzdi (qayta ishga tushish, tarmoq)
  'connection terminated unexpectedly',
  'the database system is starting up',
  'the database system is shutting down',
  'sorry, too many clients already',
];

/** Tizim (Node) tarmoq xato kodlari */
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'EPIPE',
]);

/**
 * Postgres SQLSTATE kodlari:
 *  08xxx — connection_exception (08000, 08001, 08003, 08004, 08006);
 *  53300 — too_many_connections; 57P01/57P02/57P03 — server to'xtatilmoqda/ishga tushmoqda.
 */
const SQLSTATE_CODES = new Set(['08000', '08001', '08003', '08004', '08006', '53300', '57P01', '57P02', '57P03']);

const collect = (err: unknown, depth = 0): Array<{ message: string; code: string }> => {
  if (!err || typeof err !== 'object' || depth > 3) return [];
  const value = err as { message?: unknown; code?: unknown; cause?: unknown; driverError?: unknown };
  const own = {
    message: typeof value.message === 'string' ? value.message.toLowerCase() : '',
    code: typeof value.code === 'string' ? value.code : '',
  };
  return [own, ...collect(value.driverError, depth + 1), ...collect(value.cause, depth + 1)];
};

/** Xato bazaga ULANISHdagi vaqtinchalik muammo ekanini aniqlaydi */
export function isTransientDbConnectError(err: unknown): boolean {
  return collect(err).some(
    ({ message, code }) =>
      NETWORK_CODES.has(code) ||
      SQLSTATE_CODES.has(code) ||
      CONNECT_MESSAGES.some((text) => message.includes(text)),
  );
}
