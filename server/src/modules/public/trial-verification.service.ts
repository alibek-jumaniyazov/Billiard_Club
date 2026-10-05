import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
  ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { canonicalTelegramTrialPhone, canonicalTrialPhone } from './trial-phone';

const TTL_MS = 10 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sameSecret = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));

interface Challenge {
  id: string;
  browserTokenHash: string;
  expiresAt: Date;
  telegramUserId: string | null;
  phone: string | null;
  verifiedAt: Date | null;
  consumedAt: Date | null;
}

interface TelegramMessage {
  message_id?: number;
  date?: number;
  chat?: { id?: number; type?: string };
  from?: { id?: number; is_bot?: boolean };
  text?: string;
  contact?: { user_id?: number; phone_number?: string };
  forward_origin?: unknown;
  forward_date?: unknown;
}

@Injectable()
export class TrialVerificationService {
  constructor(private readonly db: DataSource, private readonly config: ConfigService) {}

  availability() {
    const username = this.config.get<string>('TRIAL_TELEGRAM_BOT_USERNAME') ?? '';
    const secret = this.config.get<string>('TRIAL_TELEGRAM_WEBHOOK_SECRET') ?? '';
    const token = this.config.get<string>('TRIAL_TELEGRAM_BOT_TOKEN') || this.config.get<string>('TELEGRAM_BOT_TOKEN');
    return { method: 'telegram' as const, available: !!token && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)
      && /^[A-Za-z0-9_-]{32,256}$/.test(secret) };
  }

  private requireAvailable() {
    if (!this.availability().available) {
      throw new ServiceUnavailableException({ key: 'public.verificationUnavailable' });
    }
  }

  async start(website?: string) {
    this.requireAvailable();
    if (website?.trim()) throw new BadRequestException({ key: 'common.validationError' });
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TTL_MS);
    await this.db.query(`INSERT INTO trial_telegram_challenges (id, "browserTokenHash", "expiresAt") VALUES ($1, $2, $3)`,
      [id, hash(token), expiresAt]);
    return { id, token, expiresAt: expiresAt.toISOString(),
      telegramUrl: `https://t.me/${this.config.get<string>('TRIAL_TELEGRAM_BOT_USERNAME')}?start=trial_${id}` };
  }

  async status(id: string, token: string) {
    const [row]: Challenge[] = await this.db.query(`SELECT * FROM trial_telegram_challenges WHERE id = $1`, [id]);
    this.checkBrowser(row, token);
    if (row.consumedAt) return { status: 'used' as const };
    if (new Date(row.expiresAt).getTime() <= Date.now()) return { status: 'expired' as const };
    if (row.verifiedAt && row.phone) return { status: 'verified' as const, phone: row.phone };
    return { status: 'pending' as const };
  }

  private checkBrowser(row: Challenge | undefined, token: string) {
    if (!row || !sameSecret(row.browserTokenHash, hash(token))) {
      throw new NotFoundException({ key: 'public.verificationInvalid' });
    }
  }

  /** Called inside the SAME transaction as club/user creation. */
  async claim(manager: EntityManager, id: string, token: string, requestedPhone: string): Promise<string> {
    this.requireAvailable();
    const [row]: Challenge[] = await manager.query(`SELECT * FROM trial_telegram_challenges WHERE id = $1 FOR UPDATE`, [id]);
    this.checkBrowser(row, token);
    if (row.consumedAt || !row.verifiedAt || !row.telegramUserId || !row.phone
      || new Date(row.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException({ key: 'public.verificationRequired' });
    }
    if (canonicalTrialPhone(requestedPhone) !== row.phone) {
      throw new BadRequestException({ key: 'public.verifiedPhoneMismatch' });
    }
    // Consistent lock order and unique PKs enforce once-only across all workers.
    const phones = await manager.query(`INSERT INTO trial_claims (phone) VALUES ($1) ON CONFLICT DO NOTHING RETURNING phone`, [row.phone]);
    if (!phones.length) throw new ConflictException({ key: 'public.trialAlreadyUsed', code: 'TRIAL_ALREADY_USED' });
    const accounts = await manager.query(`INSERT INTO telegram_trial_claims ("telegramUserId") VALUES ($1)
      ON CONFLICT DO NOTHING RETURNING "telegramUserId"`, [row.telegramUserId]);
    if (!accounts.length) throw new ConflictException({ key: 'public.trialAlreadyUsed', code: 'TRIAL_ALREADY_USED' });
    await manager.query(`UPDATE trial_telegram_challenges SET "consumedAt" = now() WHERE id = $1`, [id]);
    return row.phone;
  }

  /** Only trusted Telegram webhook updates can assert ownership of a contact. */
  async webhook(secret: string | undefined, update: { message?: TelegramMessage } | null) {
    const expected = this.config.get<string>('TRIAL_TELEGRAM_WEBHOOK_SECRET') ?? '';
    if (!this.availability().available || !secret || !sameSecret(secret, expected)) {
      throw new UnauthorizedException({ key: 'auth.notAuthenticated' });
    }
    const msg = update?.message;
    const userId = msg?.from?.id;
    if (!msg || !Number.isSafeInteger(userId) || userId! <= 0 || msg.from?.is_bot !== false
      || msg.chat?.type !== 'private' || msg.chat.id !== userId
      || !Number.isSafeInteger(msg.message_id) || msg.message_id! <= 0
      || !Number.isSafeInteger(msg.date) || Math.abs(Date.now() / 1000 - msg.date!) > TTL_MS / 1000
      || msg.forward_origin || msg.forward_date) return { ok: true };

    const start = typeof msg.text === 'string'
      ? /^\/start(?:@[A-Za-z0-9_]+)? trial_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(msg.text) : null;
    if (!start && !msg.contact) return { ok: true };

    const reply = (text: string, requestContact = false) => ({ method: 'sendMessage', chat_id: userId, text,
      reply_markup: requestContact
        ? { keyboard: [[{ text: 'Telefonimni tasdiqlash / Подтвердить номер', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
        : { remove_keyboard: true } });
    const invalid = () => reply("Tasdiqlash muddati tugagan. Saytdan qayta boshlang.\nСрок подтверждения истёк. Начните заново на сайте.");

    return this.db.transaction(async (manager) => {
      // Serialize this private chat across replicas, including first /start.
      await manager.query('SELECT pg_advisory_xact_lock(78234, hashtext($1))', [String(userId)]);
      const [session] = await manager.query(`SELECT * FROM trial_telegram_sessions WHERE "telegramUserId" = $1`, [String(userId)]);
      if (session && Number(session.lastMessageId) >= msg.message_id!) return { ok: true };

      if (start) {
        const [row]: Challenge[] = await manager.query(`SELECT * FROM trial_telegram_challenges WHERE id = $1 FOR UPDATE`, [start[1]]);
        if (!row || row.consumedAt || row.verifiedAt || new Date(row.expiresAt).getTime() <= Date.now()
          || (row.telegramUserId && row.telegramUserId !== String(userId))) return invalid();
        await manager.query(`UPDATE trial_telegram_challenges SET "telegramUserId" = $2 WHERE id = $1`, [row.id, String(userId)]);
        await manager.query(`INSERT INTO trial_telegram_sessions ("telegramUserId", "challengeId", "lastMessageId") VALUES ($1,$2,$3)
          ON CONFLICT ("telegramUserId") DO UPDATE SET "challengeId" = $2, "lastMessageId" = $3, "updatedAt" = now()`,
          [String(userId), row.id, msg.message_id]);
        return reply("Billiard Club bepul sinovi faqat yangi foydalanuvchilarga bir marta beriladi. O'z hisobingizni ochayotgan bo'lsangiz, pastdagi tugma orqali O'Z telefoningizni ulashing. Boshqa odam yuborgan havolani tasdiqlamang.\n\nБесплатный период предоставляется новым пользователям один раз. Поделитесь СВОИМ номером кнопкой ниже, только если вы сами регистрируетесь на сайте. Не подтверждайте чужие ссылки.", true);
      }

      if (!session?.challengeId) return invalid();
      await manager.query(`UPDATE trial_telegram_sessions SET "lastMessageId" = $2, "updatedAt" = now() WHERE "telegramUserId" = $1`, [String(userId), msg.message_id]);
      const phone = typeof msg.contact?.phone_number === 'string'
        ? canonicalTelegramTrialPhone(msg.contact.phone_number) : null;
      if (msg.contact?.user_id !== userId || !phone) {
        return reply("Faqat pastdagi tugma orqali O'Z raqamingizni yuboring.\nОтправьте СВОЙ номер кнопкой ниже.", true);
      }
      const updated = await manager.query(`UPDATE trial_telegram_challenges SET phone = $2, "verifiedAt" = now()
        WHERE id = $1 AND "telegramUserId" = $3 AND "expiresAt" > now() AND "consumedAt" IS NULL AND "verifiedAt" IS NULL RETURNING id`,
        [session.challengeId, phone, String(userId)]);
      if (!updated.length) return invalid();
      return reply("Telefon tasdiqlandi. Saytga qaytib «Tasdiqladim — tekshirish» tugmasini bosing.\nНомер подтверждён. Вернитесь на сайт и нажмите «Я подтвердил — проверить».");
    });
  }

  @Cron('0 15 * * * *')
  async cleanup() {
    // Claims NEVER expire; only short-lived proofs and bot conversation state do.
    await this.db.query(`DELETE FROM trial_telegram_challenges WHERE "expiresAt" < now() - interval '1 day'`);
    await this.db.query(`DELETE FROM trial_telegram_sessions WHERE "updatedAt" < now() - interval '2 days'`);
  }
}
