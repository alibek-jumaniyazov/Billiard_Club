/**
 * Klub egasi botining sozlamasi.
 *
 * STANDART — MAVJUD BOT: `OWNER_TELEGRAM_*` bo'sh bo'lsa, ro'yxatdan o'tishda telefonni
 * tasdiqlaydigan bot (TRIAL_TELEGRAM_*, u ham bo'lmasa TELEGRAM_BOT_TOKEN) ishlatiladi.
 * Egalar ro'yxatdan o'tishda shu botga Start bosgani uchun bot ularga yoza oladi va hisob
 * avtomatik ulanadi. Webhook bitta (ro'yxatdan o'tish marshruti), yangilanishlar
 * `isOwnerUpdate` bo'yicha ikki xizmatga taqsimlanadi.
 *
 * ALOHIDA BOT (ixtiyoriy): `OWNER_TELEGRAM_*` to'ldirilsa va token boshqa bo'lsa — o'z
 * webhooki (/api/public/owner-telegram/webhook) bilan ishlaydi.
 */
export const OWNER_BOT_TOKEN_RE = /^[0-9]+:[A-Za-z0-9_-]{20,}$/;
export const OWNER_BOT_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
export const OWNER_BOT_SECRET_RE = /^[A-Za-z0-9_-]{32,256}$/;

export interface OwnerBotConfig {
  token: string;
  username: string;
  secret: string;
  /** Ro'yxatdan o'tish boti bilan BIR bot (webhook o'sha marshrutda, yangilanishlar taqsimlanadi) */
  shared: boolean;
}

const clean = (value: string | undefined) => (value ?? '').trim();

export function ownerBotConfig(get: (key: string) => string | undefined): OwnerBotConfig | null {
  const trialToken = clean(get('TRIAL_TELEGRAM_BOT_TOKEN')) || clean(get('TELEGRAM_BOT_TOKEN'));
  const ownToken = clean(get('OWNER_TELEGRAM_BOT_TOKEN'));
  const shared = !ownToken || ownToken === trialToken;
  const token = shared ? trialToken : ownToken;
  const username = clean(shared ? get('TRIAL_TELEGRAM_BOT_USERNAME') : get('OWNER_TELEGRAM_BOT_USERNAME')).replace(/^@/, '');
  // Umumiy botda webhook ro'yxatdan o'tish siri bilan o'rnatilgan — tekshiruv ham shu sir bilan
  const secret = clean(shared ? get('TRIAL_TELEGRAM_WEBHOOK_SECRET') : get('OWNER_TELEGRAM_WEBHOOK_SECRET'));
  if (!OWNER_BOT_TOKEN_RE.test(token) || !OWNER_BOT_USERNAME_RE.test(username) || !OWNER_BOT_SECRET_RE.test(secret)) {
    return null;
  }
  return { token, username, secret, shared };
}

interface UpdateLike {
  my_chat_member?: unknown;
  message?: {
    chat?: { type?: string };
    text?: unknown;
    contact?: unknown;
    migrate_to_chat_id?: unknown;
  };
}

/**
 * Umumiy botda yangilanish kimniki: klub egasi xizmatiniki (true) yoki ro'yxatdan o'tish
 * tasdig'iniki (false). Tasdiqlash oqimi: shaxsiy chatda `/start trial_...` va kontakt.
 * Qolgan buyruqlar, guruhlar, botni bloklash va guruh ko'chishi — egasi xizmatiga.
 * Shaxsiy chatdagi oddiy matn tasdiqlash oqimida qoladi (u yerda e'tiborsiz qoldiriladi).
 */
export function isOwnerUpdate(update: unknown): boolean {
  if (!update || typeof update !== 'object') return false;
  const u = update as UpdateLike;
  if (u.my_chat_member) return true;
  const msg = u.message;
  if (!msg || typeof msg !== 'object') return false;
  if (msg.migrate_to_chat_id) return true;
  if (msg.chat?.type && msg.chat.type !== 'private') return true;
  if (msg.contact) return false;
  const text = typeof msg.text === 'string' ? msg.text.trim() : '';
  if (!text.startsWith('/')) return false;
  const start = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?/i.exec(text);
  if (start) return !(start[1] ?? '').startsWith('trial_');
  return true;
}
