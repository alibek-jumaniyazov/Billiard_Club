import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { CRON_LOCK, withCronLock } from '../../common/cron/cron-lock';
import { returningRows } from '../../common/db/returning-rows';
import { localDayKey } from '../../common/time/club-day';
import { ClubStatus } from '../../entities/enums';
import { DEFAULT_TIMEZONE, safeTimezone, SUPPORTED_TIMEZONES } from '../settings/timezones';
import { FetchLike, OwnerBotApi, SendResult } from './owner-bot.api';
import { isOwnerUpdate, OwnerBotConfig, ownerBotConfig } from './owner-bot.config';
import { renderHelp, renderWelcome, TEXTS } from './owner-report.render';
import { ClubContext, OwnerReportService } from './owner-report.service';
import { BotLang, botLang, localMinutes, parseClock, splitMessage } from './owner-telegram.format';

/** Darhol xabar turlari (egasi har chat uchun alohida yoqadi/o'chiradi) */
export const ALERT_KEYS = ['cancel', 'discount', 'shift', 'debt', 'prices', 'stock'] as const;
export type AlertKey = (typeof ALERT_KEYS)[number];

/** Standart: hammasi yoqiq; ombor qoldig'ini qo'lda o'zgartirish — o'chiq (tez-tez bo'ladi) */
export const DEFAULT_ALERTS: Record<AlertKey, boolean> = {
  cancel: true,
  discount: true,
  shift: true,
  debt: true,
  prices: true,
  stock: false,
};

export const MAX_CHATS_PER_CLUB = 10;
export const DEFAULT_REPORT_TIME = '09:00';
const LINK_TTL_MS = 15 * 60 * 1000;
const MAX_OPEN_LINKS = 20;
const COMMAND_GAP_MS = 3000;
/** Kunlik hisobot vaqtinchalik xato bilan yuborilmasa — shuncha urinishdan keyin bugunga to'xtaymiz */
const MAX_REPORT_ATTEMPTS = 5;
/** platform_settings: avval ro'yxatdan o'tgan egalarni bir martalik ulash bajarilganmi */
export const AUTOLINK_SETTING_KEY = 'owner_telegram_autolink_v1';

export type ReportKind = 'yesterday' | 'today' | 'week' | 'live';

export interface OwnerChatRow {
  id: number;
  clubId: number;
  chatId: string;
  chatType: string;
  title: string | null;
  linkedById: number | null;
  linkedByName?: string | null;
  isActive: boolean;
  inactiveReason: string | null;
  lang: string;
  dailyReport: boolean;
  reportTime: string;
  periodReports: boolean;
  alerts: Partial<Record<AlertKey, boolean>> | null;
  lastReportDate: string | null;
  lastSentAt: Date | null;
  lastError: string | null;
  /** Avtomatik ulangan eski ega: birinchi hisobotdan oldin tanishtiruv xabari ketadi */
  introPending: boolean;
  createdAt: Date;
}

/** `lastReportDate` MATN sifatida o'qiladi — pg `date` ni mahalliy yarim tun Date qilib, kunni surib yuborishi mumkin */
const CHAT_COLUMNS = `c.id, c."clubId", c."chatId", c."chatType", c.title, c."linkedById", c."isActive",
  c."inactiveReason", c.lang, c."dailyReport", c."reportTime", c."periodReports", c.alerts,
  to_char(c."lastReportDate", 'YYYY-MM-DD') AS "lastReportDate", c."lastSentAt", c."lastError", c."introPending",
  c."createdAt"`;

interface TgUser {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}
interface TgChat {
  id?: number;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}
interface TgMessage {
  message_id?: number;
  chat?: TgChat;
  from?: TgUser;
  text?: string;
  migrate_to_chat_id?: number;
}
interface TgChatMemberUpdated {
  chat?: TgChat;
  new_chat_member?: { status?: string };
}
export interface TgUpdate {
  update_id?: number;
  message?: TgMessage;
  my_chat_member?: TgChatMemberUpdated;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const sameSecret = (a: string, b: string) => timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)));
const LINK_PAYLOAD_RE = /^own_([A-Za-z0-9_-]{20,64})$/;

const ACTIVE_CLUB_STATUSES: readonly string[] = [ClubStatus.TRIAL, ClubStatus.ACTIVE];

export interface OwnerChatDto {
  id: number;
  chatType: string;
  title: string | null;
  isActive: boolean;
  inactiveReason: string | null;
  lang: BotLang;
  dailyReport: boolean;
  reportTime: string;
  periodReports: boolean;
  alerts: Record<AlertKey, boolean>;
  lastSentAt: Date | null;
  lastError: string | null;
  linkedByName: string | null;
  createdAt: Date;
}

export interface UpdateOwnerChatInput {
  dailyReport?: boolean;
  reportTime?: string;
  periodReports?: boolean;
  lang?: string;
  alerts?: Record<string, unknown>;
}

/**
 * KLUB EGASI UCHUN TELEGRAM BOT.
 *  - Ulash: ilova bir martalik havola beradi (`t.me/<bot>?start=own_<token>`), egasi uni
 *    telefonida ochadi — chat klubga bog'lanadi (shaxsiy chat yoki sheriklar guruhi).
 *  - Har kuni belgilangan soatda kechagi kun hisoboti (klub vaqti bo'yicha, bir marta).
 *  - Buyruqlar: /hisobot, /bugun, /hozir, /hafta, /stop.
 *  - Darhol xabarlar `OwnerAlertsService` dan keladi (audit jurnali hodisalari).
 * Bot bloklansa yoki guruhdan chiqarilsa chat faolsizlanadi (ilovada ko'rinadi).
 */
@Injectable()
export class OwnerTelegramService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OwnerTelegramService.name);

  /** Tarmoq chaqiruvi — testlarda soxta Telegram bilan almashtiriladi */
  fetchImpl: FetchLike = (input, init) => fetch(input, init);
  /** Bitta chatga ketma-ket xabarlar orasidagi pauza (Telegram: chatga ~1 xabar/soniya) */
  chatGapMs = 1050;

  private readonly chatQueues = new Map<string, Promise<unknown>>();
  private readonly lastCommandAt = new Map<string, number>();
  private readonly reportAttempts = new Map<number, { date: string; count: number }>();

  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly reports: OwnerReportService,
  ) {}

  get botConfig(): OwnerBotConfig | null {
    return ownerBotConfig((key) => this.config.get<string>(key));
  }

  /** Umumiy botda (ro'yxatdan o'tish boti bilan bitta) bu yangilanish egasi xizmatinikimi */
  isSharedUpdate(update: unknown): boolean {
    return this.botConfig?.shared === true && isOwnerUpdate(update);
  }

  private api(): OwnerBotApi | null {
    const cfg = this.botConfig;
    return cfg ? new OwnerBotApi(cfg.token, this.fetchImpl) : null;
  }

  /* ================================================================ ilova API */

  async status(clubId: number) {
    const cfg = this.botConfig;
    const rows = await this.listChats(clubId);
    return {
      available: cfg !== null,
      botUsername: cfg?.username ?? null,
      maxChats: MAX_CHATS_PER_CLUB,
      chats: rows.map((row) => this.toDto(row)),
    };
  }

  private async listChats(clubId: number): Promise<OwnerChatRow[]> {
    return this.db.query(
      `SELECT ${CHAT_COLUMNS}, u.name AS "linkedByName"
       FROM owner_telegram_chats c LEFT JOIN users u ON u.id = c."linkedById"
       WHERE c."clubId" = $1
       ORDER BY c."createdAt", c.id`,
      [clubId],
    ) as Promise<OwnerChatRow[]>;
  }

  private async chatOfClub(clubId: number, id: number): Promise<OwnerChatRow> {
    const rows = (await this.db.query(
      `SELECT ${CHAT_COLUMNS}, u.name AS "linkedByName"
       FROM owner_telegram_chats c LEFT JOIN users u ON u.id = c."linkedById"
       WHERE c."clubId" = $1 AND c.id = $2`,
      [clubId, id],
    )) as OwnerChatRow[];
    if (!rows[0]) throw new NotFoundException({ key: 'ownerTelegram.chatNotFound' });
    return rows[0];
  }

  toDto(row: OwnerChatRow): OwnerChatDto {
    return {
      id: row.id,
      chatType: row.chatType,
      title: row.title,
      isActive: row.isActive,
      inactiveReason: row.inactiveReason,
      lang: botLang(row.lang),
      dailyReport: row.dailyReport,
      reportTime: row.reportTime,
      periodReports: row.periodReports,
      alerts: this.alertsOf(row),
      lastSentAt: row.lastSentAt,
      lastError: row.lastError,
      linkedByName: row.linkedByName ?? null,
      createdAt: row.createdAt,
    };
  }

  private alertsOf(row: Pick<OwnerChatRow, 'alerts'>): Record<AlertKey, boolean> {
    const stored = row.alerts && typeof row.alerts === 'object' ? row.alerts : {};
    const result = { ...DEFAULT_ALERTS };
    for (const key of ALERT_KEYS) {
      if (typeof stored[key] === 'boolean') result[key] = stored[key] as boolean;
    }
    return result;
  }

  /** «Telegram'ni ulash»: bir martalik 15 daqiqalik havola (bazada faqat hash) */
  async createLink(clubId: number, userId: number, lang: BotLang) {
    const cfg = this.botConfig;
    if (!cfg) throw new ServiceUnavailableException({ key: 'ownerTelegram.notConfigured' });
    await this.db.query(
      `DELETE FROM owner_telegram_link_tokens WHERE "clubId" = $1 AND ("expiresAt" < now() OR "usedAt" IS NOT NULL)`,
      [clubId],
    );
    const [{ open }] = (await this.db.query(
      `SELECT COUNT(*)::int AS open FROM owner_telegram_link_tokens WHERE "clubId" = $1 AND "usedAt" IS NULL AND "expiresAt" > now()`,
      [clubId],
    )) as Array<{ open: number }>;
    if (open >= MAX_OPEN_LINKS) throw new BadRequestException({ key: 'ownerTelegram.tooManyLinks' });
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);
    await this.db.query(
      `INSERT INTO owner_telegram_link_tokens ("tokenHash", "clubId", "userId", lang, "expiresAt") VALUES ($1, $2, $3, $4, $5)`,
      [sha256(token), clubId, userId, lang, expiresAt],
    );
    return {
      botUsername: cfg.username,
      url: `https://t.me/${cfg.username}?start=own_${token}`,
      groupUrl: `https://t.me/${cfg.username}?startgroup=own_${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async updateChat(clubId: number, id: number, input: UpdateOwnerChatInput): Promise<OwnerChatDto> {
    const row = await this.chatOfClub(clubId, id);
    const sets: string[] = [];
    const params: unknown[] = [clubId, id];
    const set = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`"${column}" = $${params.length}`);
    };
    if (typeof input.dailyReport === 'boolean') set('dailyReport', input.dailyReport);
    if (typeof input.periodReports === 'boolean') set('periodReports', input.periodReports);
    if (input.lang !== undefined) set('lang', botLang(input.lang));
    if (input.reportTime !== undefined) {
      if (parseClock(input.reportTime) === null) throw new BadRequestException({ key: 'common.validationError' });
      set('reportTime', input.reportTime);
      // Vaqt kechroqqa surilsa bugungi hisobot qayta kelmasin: sana o'zgarmaydi
    }
    if (input.alerts && typeof input.alerts === 'object') {
      const next = this.alertsOf(row);
      for (const key of ALERT_KEYS) {
        if (typeof input.alerts[key] === 'boolean') next[key] = input.alerts[key] as boolean;
      }
      params.push(JSON.stringify(next));
      sets.push(`alerts = $${params.length}::jsonb`);
    }
    if (sets.length) {
      await this.db.query(
        `UPDATE owner_telegram_chats SET ${sets.join(', ')}, "updatedAt" = now() WHERE "clubId" = $1 AND id = $2`,
        params,
      );
    }
    return this.toDto(await this.chatOfClub(clubId, id));
  }

  async removeChat(clubId: number, id: number): Promise<void> {
    const row = await this.chatOfClub(clubId, id);
    await this.db.query(`DELETE FROM owner_telegram_chats WHERE "clubId" = $1 AND id = $2`, [clubId, id]);
    if (row.isActive) {
      // Xayrlashuv xabari — kutmaymiz, xatosi o'chirishga ta'sir qilmaydi
      void this.reply(row.chatId, TEXTS.unlinked[botLang(row.lang)]).catch(() => undefined);
    }
  }

  async testChat(clubId: number, id: number): Promise<SendResult> {
    const row = await this.chatOfClub(clubId, id);
    if (!row.isActive) throw new BadRequestException({ key: 'ownerTelegram.chatInactive' });
    const ctx = await this.reports.clubContext(clubId);
    return this.deliver(row, TEXTS.test[botLang(row.lang)](ctx?.info.name ?? ''));
  }

  async sendReportNow(clubId: number, id: number, kind: ReportKind): Promise<SendResult> {
    const row = await this.chatOfClub(clubId, id);
    if (!row.isActive) throw new BadRequestException({ key: 'ownerTelegram.chatInactive' });
    const ctx = await this.reports.clubContext(clubId);
    if (!ctx) throw new NotFoundException({ key: 'ownerTelegram.chatNotFound' });
    return this.deliver(row, await this.render(ctx, kind, botLang(row.lang), row.periodReports));
  }

  /** Ilovadagi «Namuna» — Telegram'ga yubormasdan matnni qaytaradi */
  async preview(clubId: number, kind: ReportKind, lang: BotLang): Promise<string> {
    const ctx = await this.reports.clubContext(clubId);
    if (!ctx) throw new NotFoundException({ key: 'ownerTelegram.chatNotFound' });
    return this.render(ctx, kind, lang, true);
  }

  private render(ctx: ClubContext, kind: ReportKind, lang: BotLang, periodBlocks: boolean): Promise<string> {
    switch (kind) {
      case 'today':
        return this.reports.renderToday(ctx, lang);
      case 'week':
        return this.reports.renderWeek(ctx, lang);
      case 'live':
        return this.reports.renderLive(ctx, lang);
      default:
        return this.reports.renderYesterday(ctx, lang, { periodBlocks });
    }
  }

  /* ============================================== avtomatik ulash (umumiy bot) */

  /**
   * Saytda ro'yxatdan o'tish bilan BIR tranzaksiyada: telefonini shu botda tasdiqlagan
   * egasining shaxsiy chati klubga ulanadi. U botga Start bosgani uchun bot unga yoza oladi.
   * Faqat umumiy botda (alohida egalar botiga u hali Start bosmagan bo'ladi).
   * Birinchi kunlik hisobot ertaga ertalab keladi.
   * @returns ulangan chat ID yoki null
   */
  async linkRegisteredOwner(
    manager: EntityManager,
    input: { clubId: number; userId: number; telegramUserId: string | null; title: string; lang: BotLang },
  ): Promise<string | null> {
    if (!this.botConfig?.shared) return null;
    const chatId = (input.telegramUserId ?? '').trim();
    if (!/^[1-9][0-9]{0,19}$/.test(chatId)) return null;
    await manager.query(
      `INSERT INTO owner_telegram_chats ("clubId", "chatId", "chatType", title, "linkedById", lang, "lastReportDate")
       VALUES ($1, $2, 'private', $3, $4, $5, $6::date)
       ON CONFLICT ("clubId", "chatId") DO NOTHING`,
      [
        input.clubId,
        chatId,
        input.title.trim().slice(0, 128) || null,
        input.userId,
        input.lang,
        localDayKey(DEFAULT_TIMEZONE, new Date()),
      ],
    );
    return chatId;
  }

  /** Ro'yxatdan o'tgach salomlashuv (tranzaksiya yakunlangach, kutmasdan) */
  async welcomeRegisteredOwner(clubId: number, chatId: string): Promise<void> {
    const rows = (await this.db.query(
      `SELECT ${CHAT_COLUMNS} FROM owner_telegram_chats c WHERE c."clubId" = $1 AND c."chatId" = $2 AND c."isActive" = true`,
      [clubId, chatId],
    )) as OwnerChatRow[];
    const row = rows[0];
    if (!row) return;
    const ctx = await this.reports.clubContext(clubId);
    await this.deliver(
      row,
      renderWelcome({ club: ctx?.info.name ?? '', reportTime: row.reportTime, chatType: row.chatType, variant: 'registered' }, botLang(row.lang)),
    );
  }

  /**
   * BIR MARTALIK: avval saytda ro'yxatdan o'tgan egalarni ulash. Ro'yxatdan o'tishda klub,
   * tasdiqlangan telefon (trial_claims) va Telegram akkaunti (telegram_trial_claims) bitta
   * tranzaksiyada yoziladi — vaqt belgisi aynan bir xil (`now()`). Bog'lash shu vaqt VA
   * telefon mosligi bilan; bitta vaqtga bir nechta akkaunt to'g'ri kelsa — ulanmaydi.
   * Faqat umumiy botda; natija platform_settings ga yoziladi (qayta ishlamaydi —
   * egasi o'chirgan chat qayta paydo bo'lmasin).
   */
  async autoLinkRegisteredOwners(): Promise<number | null> {
    if (!this.botConfig?.shared) return null;
    const done = (await this.db.query(`SELECT 1 FROM platform_settings WHERE key = $1`, [AUTOLINK_SETTING_KEY])) as unknown[];
    if (done.length) return null;
    const inserted = (await this.db.query(
      `INSERT INTO owner_telegram_chats ("clubId", "chatId", "chatType", title, "linkedById", lang, "introPending", "lastReportDate")
       SELECT c.id, t."telegramUserId", 'private', left(COALESCE(NULLIF(btrim(c."ownerName"), ''), c.name), 128), a.id, 'uz', true,
              (now() AT TIME ZONE (CASE WHEN s.timezone = ANY($1) THEN s.timezone ELSE $2 END))::date
       FROM clubs c
       JOIN trial_claims p ON p."claimedAt" = c."createdAt" AND c.phone = '+' || p.phone
       JOIN telegram_trial_claims t ON t."claimedAt" = c."createdAt"
       LEFT JOIN settings s ON s."clubId" = c.id
       LEFT JOIN LATERAL (
         SELECT u.id FROM users u WHERE u."clubId" = c.id AND u.role = 'admin' ORDER BY u."createdAt", u.id LIMIT 1
       ) a ON true
       WHERE t."telegramUserId" ~ '^[1-9][0-9]{0,19}$'
         AND (SELECT count(*) FROM telegram_trial_claims t2 WHERE t2."claimedAt" = c."createdAt") = 1
         AND (SELECT count(*) FROM owner_telegram_chats o WHERE o."clubId" = c.id) < $3
       ON CONFLICT ("clubId", "chatId") DO NOTHING
       RETURNING id`,
      [[...SUPPORTED_TIMEZONES], DEFAULT_TIMEZONE, MAX_CHATS_PER_CLUB],
    )) as unknown[];
    await this.db.query(
      `INSERT INTO platform_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [AUTOLINK_SETTING_KEY, JSON.stringify({ at: new Date().toISOString(), linked: inserted.length })],
    );
    if (inserted.length) this.logger.log(`Avval ro'yxatdan o'tgan ${inserted.length} ta klub egasi Telegram'ga ulandi`);
    return inserted.length;
  }

  /** Ishga tushganda (kutmasdan) — bir martalik ulash; ko'p instansiyada bittasi bajaradi */
  onApplicationBootstrap(): void {
    if (!this.botConfig?.shared) return;
    void withCronLock(this.db, CRON_LOCK.ownerTelegramAutolink, async () => {
      await this.autoLinkRegisteredOwners();
    }).catch((err: Error) => this.logger.error(`Avtomatik ulash bajarilmadi: ${err.message}`));
  }

  /* ========================================================= yetkazib berish */

  /**
   * Navbat: bitta chatga xabarlar ketma-ket va orasida pauza bilan ketadi (Telegram
   * chegarasi), turli chatlar esa bir-birini kutmaydi.
   */
  private enqueue<T>(chatId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chatQueues.get(chatId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const tail = run
      .catch(() => undefined)
      .then(() => (this.chatGapMs > 0 ? new Promise((resolve) => setTimeout(resolve, this.chatGapMs)) : undefined));
    this.chatQueues.set(chatId, tail);
    void tail.then(() => {
      if (this.chatQueues.get(chatId) === tail) this.chatQueues.delete(chatId);
    });
    return run;
  }

  /** Bazadagi chatga yuborish: natija (`lastSentAt`/`lastError`), ko'chish va bloklash qayd etiladi */
  async deliver(chat: Pick<OwnerChatRow, 'id' | 'chatId'>, html: string): Promise<SendResult> {
    const api = this.api();
    if (!api) return { ok: false, permanent: true, error: 'not configured' };
    return this.enqueue(chat.chatId, async () => {
      let chatId = chat.chatId;
      let result: SendResult = { ok: true };
      for (const part of splitMessage(html)) {
        result = await api.sendMessage(chatId, part);
        if (!result.ok && result.migratedTo) {
          await this.migrateChat(chatId, result.migratedTo);
          chatId = result.migratedTo;
          result = await api.sendMessage(chatId, part);
        }
        if (!result.ok) break;
      }
      if (result.ok) {
        await this.db.query(`UPDATE owner_telegram_chats SET "lastSentAt" = now(), "lastError" = NULL WHERE id = $1`, [chat.id]);
      } else if (result.blocked) {
        await this.deactivateChat(chatId, 'blocked', result.error ?? null);
      } else {
        await this.db.query(`UPDATE owner_telegram_chats SET "lastError" = $2 WHERE id = $1`, [
          chat.id,
          (result.error ?? 'error').slice(0, 255),
        ]);
      }
      return result;
    });
  }

  /** Bazaga bog'lanmagan javob (buyruqqa yordam, ogohlantirish) */
  private reply(chatId: string, html: string): Promise<SendResult> {
    const api = this.api();
    if (!api) return Promise.resolve({ ok: false, error: 'not configured' });
    return this.enqueue(chatId, () => api.sendMessage(chatId, html));
  }

  private async deactivateChat(chatId: string, reason: string, error: string | null): Promise<void> {
    await this.db.query(
      `UPDATE owner_telegram_chats SET "isActive" = false, "inactiveReason" = $2, "lastError" = $3, "updatedAt" = now()
       WHERE "chatId" = $1 AND "isActive" = true`,
      [chatId, reason, error ? error.slice(0, 255) : null],
    );
  }

  /** Guruh supergroup'ga ko'chdi: yangi ID ga o'tkazamiz (shu klubda yangi ID allaqachon bo'lsa — eskisi o'chadi) */
  private async migrateChat(fromChatId: string, toChatId: string): Promise<void> {
    await this.db.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM owner_telegram_chats o WHERE o."chatId" = $1
           AND EXISTS (SELECT 1 FROM owner_telegram_chats n WHERE n."chatId" = $2 AND n."clubId" = o."clubId")`,
        [fromChatId, toChatId],
      );
      await manager.query(
        `UPDATE owner_telegram_chats SET "chatId" = $2, "chatType" = 'supergroup', "updatedAt" = now() WHERE "chatId" = $1`,
        [fromChatId, toChatId],
      );
    });
  }

  /**
   * Darhol xabar klubning tegishli chatlariga. Egasi o'zi bajargan amal haqida
   * o'zining SHAXSIY chatiga xabar olmaydi (guruhga esa boradi — sheriklar ko'rsin).
   */
  async notifyClub(
    clubId: number,
    alert: AlertKey,
    render: (lang: BotLang) => string,
    options: { actorUserId?: number | null } = {},
  ): Promise<number> {
    if (!this.botConfig) return 0;
    const rows = (await this.db.query(
      `SELECT ${CHAT_COLUMNS} FROM owner_telegram_chats c JOIN clubs cl ON cl.id = c."clubId"
       WHERE c."clubId" = $1 AND c."isActive" = true AND cl.status::text = ANY($2)`,
      [clubId, ACTIVE_CLUB_STATUSES],
    )) as OwnerChatRow[];
    let queued = 0;
    for (const row of rows) {
      if (!this.alertsOf(row)[alert]) continue;
      if (options.actorUserId && row.chatType === 'private' && row.linkedById === options.actorUserId) continue;
      queued += 1;
      void this.deliver(row, render(botLang(row.lang))).catch((err: Error) =>
        this.logger.error(`Telegram xabari yuborilmadi (klub ${clubId}): ${err.message}`),
      );
    }
    return queued;
  }

  /* ================================================================ webhook */

  async handleWebhook(secret: string | undefined, update: unknown): Promise<{ ok: true }> {
    const cfg = this.botConfig;
    if (!cfg || !secret || !sameSecret(secret, cfg.secret)) {
      throw new UnauthorizedException({ key: 'auth.notAuthenticated' });
    }
    try {
      await this.handleUpdate(update && typeof update === 'object' ? (update as TgUpdate) : {}, cfg);
    } catch (err) {
      // Telegram bir xil yangilanishni qayta-qayta yubormasin — xato logda qoladi
      this.logger.error(`Telegram yangilanishi qayta ishlanmadi: ${(err as Error).message}`);
    }
    return { ok: true };
  }

  async handleUpdate(update: TgUpdate, cfg: OwnerBotConfig): Promise<void> {
    if (update.my_chat_member) {
      const status = update.my_chat_member.new_chat_member?.status;
      const id = update.my_chat_member.chat?.id;
      if (Number.isSafeInteger(id) && (status === 'kicked' || status === 'left')) {
        await this.deactivateChat(String(id), 'blocked', null);
      }
      return;
    }
    const msg = update.message;
    if (!msg?.chat || !Number.isSafeInteger(msg.chat.id)) return;
    const chatId = String(msg.chat.id);
    if (msg.migrate_to_chat_id && Number.isSafeInteger(msg.migrate_to_chat_id)) {
      await this.migrateChat(chatId, String(msg.migrate_to_chat_id));
      return;
    }
    if (!msg.from || msg.from.is_bot) return;
    const isPrivate = msg.chat.type === 'private';
    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    const userLang: BotLang = msg.from.language_code?.toLowerCase().startsWith('ru') ? 'ru' : 'uz';

    const command = /^\/([A-Za-z_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/.exec(text);
    if (!command) {
      // Guruhdagi oddiy suhbatga aralashmaymiz; shaxsiy chatda — yordam
      if (isPrivate) await this.reply(chatId, renderHelp(await this.chatLang(chatId, userLang), await this.isLinked(chatId)));
      return;
    }
    const [, name, mention, arg] = command;
    if (mention && mention.toLowerCase() !== cfg.username.toLowerCase()) return;
    const lang = await this.chatLang(chatId, userLang);

    switch (name.toLowerCase()) {
      case 'start':
        await this.onStart(msg, chatId, (arg ?? '').trim(), userLang);
        return;
      case 'stop':
        await this.deactivateChat(chatId, 'stopped', null);
        await this.reply(chatId, TEXTS.stopped[lang]);
        return;
      case 'hisobot':
      case 'report':
        await this.onReport(chatId, 'yesterday', lang);
        return;
      case 'bugun':
      case 'today':
        await this.onReport(chatId, 'today', lang);
        return;
      case 'hozir':
      case 'now':
        await this.onReport(chatId, 'live', lang);
        return;
      case 'hafta':
      case 'week':
        await this.onReport(chatId, 'week', lang);
        return;
      default:
        await this.reply(chatId, renderHelp(lang, await this.isLinked(chatId)));
    }
  }

  private async isLinked(chatId: string): Promise<boolean> {
    const rows = (await this.db.query(
      `SELECT 1 FROM owner_telegram_chats WHERE "chatId" = $1 AND "isActive" = true LIMIT 1`,
      [chatId],
    )) as unknown[];
    return rows.length > 0;
  }

  /** Chatning saqlangan tili (ulangan bo'lsa), aks holda foydalanuvchi Telegram tili */
  private async chatLang(chatId: string, fallback: BotLang): Promise<BotLang> {
    const rows = (await this.db.query(
      `SELECT lang FROM owner_telegram_chats WHERE "chatId" = $1 ORDER BY "isActive" DESC, "updatedAt" DESC LIMIT 1`,
      [chatId],
    )) as Array<{ lang: string }>;
    return rows[0] ? botLang(rows[0].lang) : fallback;
  }

  private async onStart(msg: TgMessage, chatId: string, payload: string, userLang: BotLang): Promise<void> {
    const link = LINK_PAYLOAD_RE.exec(payload);
    if (!link) {
      // Oddiy /start: avval to'xtatilgan yoki bloklangan chat bo'lsa — qayta yoqamiz
      const resumedCount = returningRows<{ id: number }>(
        await this.db.query(
          `UPDATE owner_telegram_chats SET "isActive" = true, "inactiveReason" = NULL, "lastError" = NULL, "updatedAt" = now()
           WHERE "chatId" = $1 AND "isActive" = false AND "inactiveReason" IN ('stopped', 'blocked')
           RETURNING id`,
          [chatId],
        ),
      ).length;
      const lang = await this.chatLang(chatId, userLang);
      if (resumedCount > 0) {
        await this.reply(chatId, `${TEXTS.resumed[lang]}\n\n${renderHelp(lang, true)}`);
        return;
      }
      await this.reply(chatId, renderHelp(lang, await this.isLinked(chatId)));
      return;
    }

    const chat = msg.chat ?? {};
    const chatType = chat.type === 'group' || chat.type === 'supergroup' ? chat.type : chat.type === 'private' ? 'private' : null;
    if (!chatType) return;
    const title = (
      chat.title ||
      [chat.first_name, chat.last_name].filter(Boolean).join(' ') ||
      (chat.username ? `@${chat.username}` : '') ||
      [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ')
    ).slice(0, 128) || null;

    const outcome = await this.db.transaction(async (manager) => {
      const tokens = (await manager.query(
        `SELECT "clubId", "userId", lang, "expiresAt", "usedAt" FROM owner_telegram_link_tokens WHERE "tokenHash" = $1 FOR UPDATE`,
        [sha256(link[1])],
      )) as Array<{ clubId: number; userId: number; lang: string; expiresAt: Date; usedAt: Date | null }>;
      const token = tokens[0];
      if (!token || token.usedAt || new Date(token.expiresAt).getTime() <= Date.now()) {
        return { kind: 'expired' as const };
      }
      // Klub qatori qulfi — bir vaqtdagi ikki ulash chegarani aylanib o'tmasin
      await manager.query(`SELECT id FROM clubs WHERE id = $1 FOR UPDATE`, [token.clubId]);
      const [{ n }] = (await manager.query(
        `SELECT COUNT(*)::int AS n FROM owner_telegram_chats WHERE "clubId" = $1 AND "chatId" <> $2`,
        [token.clubId, chatId],
      )) as Array<{ n: number }>;
      if (n >= MAX_CHATS_PER_CLUB) return { kind: 'tooMany' as const, lang: botLang(token.lang) };

      // Ulangan payt hisobot vaqti o'tib ketgan bo'lsa, birinchi hisobot ertaga keladi
      const ctx = await this.reports.clubContext(token.clubId);
      const tz = ctx?.tz ?? safeTimezone(null);
      const now = new Date();
      const initialDate =
        localMinutes(tz, now) >= (parseClock(DEFAULT_REPORT_TIME) ?? 540) ? localDayKey(tz, now) : null;

      const inserted = (await manager.query(
        `INSERT INTO owner_telegram_chats ("clubId", "chatId", "chatType", title, "linkedById", lang, "lastReportDate")
         VALUES ($1, $2, $3, $4, $5, $6, $7::date)
         ON CONFLICT ("clubId", "chatId") DO UPDATE SET
           "isActive" = true, "inactiveReason" = NULL, "lastError" = NULL,
           "chatType" = EXCLUDED."chatType", title = EXCLUDED.title, "linkedById" = EXCLUDED."linkedById",
           "updatedAt" = now()
         RETURNING "reportTime"`,
        [token.clubId, chatId, chatType, title, token.userId, botLang(token.lang), initialDate],
      )) as Array<{ reportTime: string }>;
      await manager.query(`UPDATE owner_telegram_link_tokens SET "usedAt" = now() WHERE "tokenHash" = $1`, [sha256(link[1])]);
      return {
        kind: 'linked' as const,
        lang: botLang(token.lang),
        club: ctx?.info.name ?? '',
        reportTime: inserted[0]?.reportTime ?? DEFAULT_REPORT_TIME,
      };
    });

    if (outcome.kind === 'expired') {
      await this.reply(chatId, TEXTS.linkExpired[userLang]);
    } else if (outcome.kind === 'tooMany') {
      await this.reply(chatId, TEXTS.tooManyChats[outcome.lang]);
    } else {
      await this.reply(chatId, renderWelcome({ club: outcome.club, reportTime: outcome.reportTime, chatType }, outcome.lang));
    }
  }

  private async onReport(chatId: string, kind: ReportKind, lang: BotLang): Promise<void> {
    const last = this.lastCommandAt.get(chatId) ?? 0;
    if (Date.now() - last < COMMAND_GAP_MS) {
      await this.reply(chatId, TEXTS.slowDown[lang]);
      return;
    }
    this.lastCommandAt.set(chatId, Date.now());
    if (this.lastCommandAt.size > 5000) this.lastCommandAt.clear();

    const rows = (await this.db.query(
      `SELECT ${CHAT_COLUMNS} FROM owner_telegram_chats c WHERE c."chatId" = $1 AND c."isActive" = true ORDER BY c."clubId"`,
      [chatId],
    )) as OwnerChatRow[];
    if (rows.length === 0) {
      await this.reply(chatId, renderHelp(lang, false));
      return;
    }
    for (const row of rows) {
      const ctx = await this.reports.clubContext(row.clubId);
      if (!ctx) continue;
      const rowLang = botLang(row.lang);
      if (!ACTIVE_CLUB_STATUSES.includes(ctx.status)) {
        await this.reply(chatId, TEXTS.inactiveClub[rowLang](ctx.info.name));
        continue;
      }
      await this.deliver(row, await this.render(ctx, kind, rowLang, row.periodReports));
    }
  }

  /* ============================================================ kunlik hisobot */

  @Cron('5 * * * * *')
  async reportsTick(): Promise<void> {
    if (!this.botConfig) return;
    await withCronLock(this.db, CRON_LOCK.ownerTelegramReports, async () => {
      await this.runDueReports(new Date());
    });
  }

  /**
   * Vaqti kelgan kunlik hisobotlar: klub vaqti bo'yicha `reportTime` o'tgan va bugun hali
   * yuborilmagan chatlar. `lastReportDate` FAQAT yuborilgandan (yoki doimiy xatodan) keyin
   * yoziladi — server o'chib qolsa, qaytgach o'sha kun hisoboti baribir boradi.
   */
  async runDueReports(now = new Date()): Promise<number> {
    if (!this.botConfig) return 0;
    const rows = (await this.db.query(
      `SELECT ${CHAT_COLUMNS}, s.timezone
       FROM owner_telegram_chats c
       JOIN clubs cl ON cl.id = c."clubId"
       LEFT JOIN settings s ON s."clubId" = c."clubId"
       WHERE c."isActive" = true AND c."dailyReport" = true AND cl.status::text = ANY($1)
       ORDER BY c."clubId", c.id`,
      [ACTIVE_CLUB_STATUSES],
    )) as Array<OwnerChatRow & { timezone: string | null }>;

    const cache = new Map<string, string>();
    let sent = 0;
    for (const row of rows) {
      try {
        const tz = safeTimezone(row.timezone);
        const today = localDayKey(tz, now);
        if (row.lastReportDate && row.lastReportDate >= today) continue;
        if (localMinutes(tz, now) < (parseClock(row.reportTime) ?? 540)) continue;

        const lang = botLang(row.lang);
        const cacheKey = `${row.clubId}|${lang}|${row.periodReports}|${today}`;
        let html = cache.get(cacheKey);
        if (html === undefined) {
          const ctx = await this.reports.clubContext(row.clubId, now);
          if (!ctx) continue;
          html = await this.reports.renderYesterday(ctx, lang, { periodBlocks: row.periodReports }, now);
          cache.set(cacheKey, html);
        }

        if (row.introPending) {
          // Avtomatik ulangan eski ega: avval bot nima uchun yozayotganini tushuntiramiz
          const ctx = await this.reports.clubContext(row.clubId, now);
          const intro = await this.deliver(
            row,
            renderWelcome({ club: ctx?.info.name ?? '', reportTime: row.reportTime, chatType: row.chatType, variant: 'intro' }, lang),
          );
          if (!intro.ok) {
            if (intro.permanent) {
              await this.db.query(`UPDATE owner_telegram_chats SET "lastReportDate" = $2::date WHERE id = $1`, [row.id, today]);
            }
            continue;
          }
          await this.db.query(`UPDATE owner_telegram_chats SET "introPending" = false WHERE id = $1`, [row.id]);
        }

        const result = await this.deliver(row, html);
        const attempt = this.reportAttempts.get(row.id);
        const attempts = (attempt?.date === today ? attempt.count : 0) + 1;
        if (result.ok || result.permanent || attempts >= MAX_REPORT_ATTEMPTS) {
          await this.db.query(`UPDATE owner_telegram_chats SET "lastReportDate" = $2::date WHERE id = $1`, [row.id, today]);
          this.reportAttempts.delete(row.id);
          if (result.ok) sent += 1;
        } else {
          this.reportAttempts.set(row.id, { date: today, count: attempts });
        }
      } catch (err) {
        this.logger.error(`Kunlik hisobot tayyorlanmadi (chat ${row.id}, klub ${row.clubId}): ${(err as Error).message}`);
      }
    }
    return sent;
  }

  /** Eskirgan bir martalik havolalarni tozalash (har kuni) */
  @Cron('0 40 4 * * *')
  async cleanupLinks(): Promise<void> {
    await this.db.query(
      `DELETE FROM owner_telegram_link_tokens WHERE "expiresAt" < now() - interval '1 day' OR "usedAt" < now() - interval '1 day'`,
    );
  }
}
