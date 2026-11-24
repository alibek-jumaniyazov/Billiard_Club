/**
 * Klub egasi botining Telegram API mijozi.
 *
 * Har bir xato TURI alohida qaytariladi — chaqiruvchi bazani to'g'ri yangilashi uchun:
 *  - `migratedTo`  — guruh supergroup'ga ko'chdi (yangi chat ID bilan qayta yuboriladi);
 *  - `blocked`     — foydalanuvchi botni bloklagan / guruhdan chiqarilgan / chat yo'q
 *                    (chat faolsizlantiriladi, qayta urinilmaydi);
 *  - vaqtinchalik  — 429 / 5xx / tarmoq: qisqa kutish bilan qayta urinish.
 * Token hech qachon logga yozilmaydi (fetch xatosi URL ni o'z ichiga olishi mumkin).
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SendResult {
  ok: boolean;
  /** Doimiy xato: qayta urinish foyda bermaydi */
  permanent?: boolean;
  /** Bot bloklangan, chiqarilgan yoki chat topilmadi */
  blocked?: boolean;
  /** Guruh yangi supergroup ID siga ko'chdi */
  migratedTo?: string;
  error?: string;
}

interface TelegramResponse {
  ok?: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
  parameters?: { migrate_to_chat_id?: number; retry_after?: number };
}

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;
/** 429 da Telegram aytgan kutish shundan oshsa — keyingi daqiqada cron qayta urinadi */
const MAX_RETRY_AFTER_MS = 30_000;

const BLOCKED_RE = /bot was blocked|bot was kicked|user is deactivated|chat not found|not a member|have no rights to send|group chat was deleted|need administrator rights/i;

export class OwnerBotApi {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Xom chaqiruv: javob tanasi va HTTP holati (xato tashlamaydi) */
  async call(method: string, payload: Record<string, unknown>): Promise<{ status: number; body: TelegramResponse | null }> {
    try {
      const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await res.json().catch(() => null)) as TelegramResponse | null;
      return { status: res.status, body };
    } catch {
      // Tarmoq/timeout — URL (token bilan) logga tushmasin
      return { status: 0, body: null };
    }
  }

  async sendMessage(chatId: string, html: string, extra: Record<string, unknown> = {}): Promise<SendResult> {
    let lastError = 'unknown';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const { status, body } = await this.call('sendMessage', {
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...extra,
      });
      if (status === 200 && body?.ok) return { ok: true };

      const migrateTo = body?.parameters?.migrate_to_chat_id;
      if (migrateTo) return { ok: false, migratedTo: String(migrateTo), error: 'migrated' };

      const description = body?.description ?? (status === 0 ? 'network error' : `HTTP ${status}`);
      lastError = description.slice(0, 200);

      if (status === 403 || BLOCKED_RE.test(description)) {
        return { ok: false, permanent: true, blocked: true, error: lastError };
      }
      const retryAfter = body?.parameters?.retry_after;
      if (status === 429 && retryAfter && retryAfter * 1000 <= MAX_RETRY_AFTER_MS && attempt < MAX_ATTEMPTS) {
        await this.sleep(retryAfter * 1000);
        continue;
      }
      if ((status === 0 || status >= 500) && attempt < MAX_ATTEMPTS) {
        await this.sleep(700 * attempt);
        continue;
      }
      // 400 (noto'g'ri HTML va h.k.) — doimiy, lekin chatni o'chirish shart emas
      return { ok: false, permanent: status >= 400 && status < 500 && status !== 429, error: lastError };
    }
    return { ok: false, error: lastError };
  }
}
