/**
 * Klub egasi botining sozlamasi (`.env`). ALOHIDA bot: ro'yxatdan o'tish boti
 * (TRIAL_TELEGRAM_*) va platforma xabarnomalari boti bilan webhook ulashilmaydi.
 * Uchala qiymat to'g'ri bo'lmaguncha funksiya «sozlanmagan» hisoblanadi.
 */
export const OWNER_BOT_TOKEN_RE = /^[0-9]+:[A-Za-z0-9_-]{20,}$/;
export const OWNER_BOT_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
export const OWNER_BOT_SECRET_RE = /^[A-Za-z0-9_-]{32,256}$/;

export interface OwnerBotConfig {
  token: string;
  username: string;
  secret: string;
}

export function ownerBotConfig(get: (key: string) => string | undefined): OwnerBotConfig | null {
  const token = (get('OWNER_TELEGRAM_BOT_TOKEN') ?? '').trim();
  const username = (get('OWNER_TELEGRAM_BOT_USERNAME') ?? '').trim().replace(/^@/, '');
  const secret = (get('OWNER_TELEGRAM_WEBHOOK_SECRET') ?? '').trim();
  if (!OWNER_BOT_TOKEN_RE.test(token) || !OWNER_BOT_USERNAME_RE.test(username) || !OWNER_BOT_SECRET_RE.test(secret)) {
    return null;
  }
  return { token, username, secret };
}
