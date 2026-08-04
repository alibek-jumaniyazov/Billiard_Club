import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Club } from '../entities/club.entity';
import { Feedback } from '../entities/feedback.entity';
import { Invoice } from '../entities/invoice.entity';
import { PlatformSetting } from '../entities/platform-setting.entity';
import { User } from '../entities/user.entity';

/** Sozlanadigan Telegram hodisalari — platform_settings('telegram_events') orqali boshqariladi */
export type TelegramEvent =
  | 'login'
  | 'new_trial'
  | 'new_club'
  | 'payment'
  | 'purchase_request'
  | 'feedback'
  | 'critical_error'
  | 'subscription_expiring';

/** Standart holat: 'login'dan tashqari barcha hodisalar YOQILGAN (kirish xabarlari o'chirilgan) */
export const DEFAULT_TELEGRAM_EVENTS: Record<TelegramEvent, boolean> = {
  login: false,
  new_trial: true,
  new_club: true,
  payment: true,
  purchase_request: true,
  feedback: true,
  critical_error: true,
  subscription_expiring: true,
};

/** platform_settings dagi hodisa sozlamalari kaliti */
export const TELEGRAM_EVENTS_SETTING_KEY = 'telegram_events';

/**
 * platform_settings dagi CHAT ID kaliti.
 *
 * Nega DB da, `.env` da emas: oddiy guruh supergroup'ga aylanganda Telegram
 * chat ID sini BUTUNLAY o'zgartiradi. `.env` ni server o'zi tahrirlay olmaydi
 * (va tahrirlamasligi ham kerak), shuning uchun yangi ID shu yerga yoziladi.
 */
export const TELEGRAM_CHAT_ID_SETTING_KEY = 'telegram_chat_id';

/** Hodisa sozlamalari keshi muddati — har so'rovda DB ga bormaslik uchun */
const EVENTS_CACHE_TTL_MS = 60 * 1000;

/** Bitta xabar uchun eng ko'p urinish (ko'chish + qayta urinishlar bilan birga) */
const SEND_MAX_ATTEMPTS = 3;

/** Bitta so'rov timeouti — chaqiruvchi uzoq bloklanmasin */
const SEND_TIMEOUT_MS = 5000;

/** Vaqtinchalik xatodan keyin kutish (urinish raqamiga ko'paytiriladi) */
const SEND_RETRY_DELAY_MS = 500;

/** 429 dagi `retry_after` shundan uzoq bo'lsa kutmaymiz — xabar eskiradi */
const SEND_MAX_BACKOFF_MS = 3000;

/** Telegram API xato javobining bizga kerakli qismi */
interface TelegramErrorBody {
  description?: string;
  parameters?: {
    /** Guruh supergroup'ga ko'chdi — yangi chat ID */
    migrate_to_chat_id?: number;
    /** Chegaraga urildik — shuncha soniya kutish kerak */
    retry_after?: number;
  };
}

/**
 * Telegram xabarnomalari — platforma egasiga (sizga) muhim hodisalar
 * haqida xabar yuboradi (login, yangi klub, to'lov, shikoyat va h.k.).
 * Har bir hodisa platform_settings('telegram_events') da alohida
 * yoqib/o'chirib qo'yiladi (kalit yo'q bo'lsa — yoqilgan).
 * Sozlanmagan bo'lsa (token yo'q) — jimgina o'tkazib yuboriladi.
 * Xatolar asosiy oqimni to'xtatmaydi (fire-and-forget).
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  private eventsCache: { value: Record<string, boolean>; loadedAt: number } | null = null;

  /**
   * Joriy chat ID keshi. `undefined` — hali o'qilmagan, `null` — sozlanmagan.
   * TTL yo'q: qiymat faqat shu servis o'zi ko'chirganda o'zgaradi.
   */
  private chatIdCache: string | null | undefined = undefined;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(PlatformSetting)
    private readonly platformSettingRepo: Repository<PlatformSetting>,
  ) {}

  /**
   * Umumiy xabar yuborish:
   *  - notify(text) — eski chaqiruvlar bilan moslik, to'g'ridan-to'g'ri yuboriladi;
   *  - notify(event, html) — hodisa o'chirilgan bo'lsa yuborilmaydi.
   */
  async notify(text: string): Promise<void>;
  async notify(event: TelegramEvent, html: string): Promise<void>;
  async notify(eventOrText: string, html?: string): Promise<void> {
    if (html === undefined) {
      return this.send(eventOrText);
    }
    if (!(await this.isEventEnabled(eventOrText))) return;
    return this.send(html);
  }

  /** Landing orqali yangi sinov klubi ro'yxatdan o'tdi */
  async notifyNewTrial(club: Club, adminUsername: string): Promise<void> {
    await this.notify(
      'new_trial',
      [
        "🆕 <b>Yangi sinov foydalanuvchi ro'yxatdan o'tdi!</b>",
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `👤 Egasi: ${this.escapeHtml(club.ownerName ?? '-')}`,
        `📞 Telefon: ${this.escapeHtml(club.phone ?? '-')}`,
        `📍 Manzil: ${this.escapeHtml(club.address ?? '-')}`,
        `🔑 Login: <code>${this.escapeHtml(adminUsername)}</code>`,
        `⏳ Sinov tugaydi: ${this.formatDate(club.trialEndsAt)}`,
      ].join('\n'),
    );
  }

  /** Superadmin tomonidan yangi klub yaratildi */
  async notifyNewClub(club: Club, adminUsername: string): Promise<void> {
    await this.notify(
      'new_club',
      [
        "🎱 <b>Yangi klub qo'shildi!</b>",
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `👤 Egasi: ${this.escapeHtml(club.ownerName ?? '-')}`,
        `📞 Telefon: ${this.escapeHtml(club.phone ?? '-')}`,
        `🔑 Login: <code>${this.escapeHtml(adminUsername)}</code>`,
        `⏳ Sinov tugaydi: ${this.formatDate(club.trialEndsAt)}`,
      ].join('\n'),
    );
  }

  /** To'lov qabul qilindi (hisob-faktura paid holatiga o'tdi) */
  async notifyPayment(invoice: Invoice, club: Club): Promise<void> {
    await this.notify(
      'payment',
      [
        "💰 <b>To'lov qabul qilindi</b>",
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `🧾 Hisob-faktura: <code>${this.escapeHtml(invoice.number)}</code>`,
        `💵 Summa: <b>${this.formatMoney(invoice.amount)}</b>`,
        ...(invoice.discountAmount > 0 ? [`🏷 Chegirma: ${this.formatMoney(invoice.discountAmount)}`] : []),
        `💳 To'lov usuli: ${this.escapeHtml(invoice.paymentMethod ?? '-')}`,
      ].join('\n'),
    );
  }

  /** Klub egasi obuna sotib olish / uzaytirish so'rovini yubordi */
  async notifyPurchaseRequest(invoice: Invoice, club: Club): Promise<void> {
    await this.notify(
      'purchase_request',
      [
        "🛒 <b>Yangi obuna to'lov so'rovi</b>",
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `📞 Telefon: ${this.escapeHtml(club.phone ?? '-')}`,
        `🧾 Hisob-faktura: <code>${this.escapeHtml(invoice.number)}</code>`,
        `💵 Summa: <b>${this.formatMoney(invoice.amount)}</b>`,
        '⏳ Holat: tasdiqlash kutilmoqda',
      ].join('\n'),
    );
  }

  /** Yangi fikr-mulohaza (taklif/shikoyat/xatolik/imkoniyat) keldi */
  async notifyFeedback(feedback: Feedback, club: Club, user: User): Promise<void> {
    const typeIcons: Record<string, string> = {
      suggestion: '💡',
      complaint: '😠',
      bug: '🐞',
      feature: '✨',
    };
    const icon = typeIcons[feedback.type] ?? '📨';
    await this.notify(
      'feedback',
      [
        `${icon} <b>Yangi fikr-mulohaza (${this.escapeHtml(feedback.type)})</b>`,
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `👤 Yuboruvchi: ${this.escapeHtml(user.name)}`,
        `🔥 Muhimlik: ${this.escapeHtml(feedback.priority)}`,
        `📌 Mavzu: <b>${this.escapeHtml(feedback.subject)}</b>`,
        `💬 ${this.escapeHtml(this.truncate(feedback.message, 500))}`,
      ].join('\n'),
    );
  }

  /** Kritik server xatosi (5xx) haqida xabar */
  async notifyCriticalError(context: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const stack =
      err instanceof Error && err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : null;
    await this.notify(
      'critical_error',
      [
        '🚨 <b>Kritik xatolik!</b>',
        '',
        `📍 Kontekst: ${this.escapeHtml(context)}`,
        `❌ Xato: <code>${this.escapeHtml(this.truncate(message, 500))}</code>`,
        ...(stack ? [`<pre>${this.escapeHtml(this.truncate(stack, 800))}</pre>`] : []),
      ].join('\n'),
    );
  }

  /** Obuna muddati tugashiga oz qoldi (cron eslatmasi) */
  async notifySubscriptionExpiringSoon(club: Club, daysLeft: number): Promise<void> {
    await this.notify(
      'subscription_expiring',
      [
        '⏳ <b>Obuna muddati tugayapti</b>',
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `📞 Telefon: ${this.escapeHtml(club.phone ?? '-')}`,
        `📅 Tugash sanasi: ${this.formatDate(club.effectiveEndsAt)}`,
        `⏰ Qolgan kunlar: <b>${daysLeft}</b>`,
      ].join('\n'),
    );
  }

  /**
   * Joriy chat ID.
   *
   * Manba tartibi: DB dagi ko'chirilgan qiymat > `.env`. DB birinchi turadi,
   * chunki guruh supergroup'ga aylanganda Telegram YANGI ID beradi va eski
   * `.env` qiymati abadiy ishlamay qoladi (pastdagi izohga qarang).
   */
  private async resolveChatId(): Promise<string | null> {
    if (this.chatIdCache !== undefined) return this.chatIdCache;
    try {
      const row = await this.platformSettingRepo.findOne({
        where: { key: TELEGRAM_CHAT_ID_SETTING_KEY },
      });
      const stored = typeof row?.value === 'string' ? row.value : null;
      this.chatIdCache = stored || this.config.get<string>('TELEGRAM_CHAT_ID') || null;
    } catch {
      // DB yetib bo'lmasa .env ga qaytamiz — xabarnoma to'xtamasin
      this.chatIdCache = this.config.get<string>('TELEGRAM_CHAT_ID') || null;
    }
    return this.chatIdCache;
  }

  /**
   * Yangi chat ID ni DOIMIY saqlash (supergroup ko'chishidan keyin).
   *
   * `.env` ni o'zgartirib bo'lmaydi — server uni faqat o'qiydi va qayta
   * ishga tushirish kerak bo'lardi. platform_settings esa allaqachon shu
   * maqsad uchun ishlatiladi (telegram_events shu yerda).
   */
  private async persistChatId(chatId: string): Promise<void> {
    this.chatIdCache = chatId;
    try {
      await this.platformSettingRepo.upsert(
        { key: TELEGRAM_CHAT_ID_SETTING_KEY, value: chatId },
        ['key'],
      );
      this.logger.log(`Telegram chat ID yangilandi va saqlandi: ${chatId}`);
    } catch (err) {
      // Saqlanmasa ham joriy jarayon davomida ishlaydi (kesh yangilangan)
      this.logger.error(`Telegram chat ID saqlanmadi: ${(err as Error).message}`);
    }
  }

  /**
   * Xabarni Telegram API ga jo'natish (fire-and-forget).
   *
   * UCHTA HOLAT ALOHIDA QAYTA ISHLANADI — ilgari ularning hammasi shunchaki
   * logga yozilib, xabar YO'QOLARDI:
   *
   *  1. SUPERGROUP KO'CHISHI (400 + `migrate_to_chat_id`). Oddiy guruhga
   *     admin qo'shilsa yoki tarix yoqilsa Telegram uni supergroup'ga
   *     aylantiradi va ID BUTUNLAY o'zgaradi (masalan -123 -> -1004487367602).
   *     Shundan keyin BARCHA xabarlar 400 bilan yiqilardi va buni faqat
   *     server logini ochgan odam bilardi. Endi yangi ID javobning o'zidan
   *     olinadi, DB ga saqlanadi va xabar DARHOL qayta yuboriladi.
   *
   *  2. CHEGARA (429 + `retry_after`). Telegram aytgan muddat kutiladi.
   *
   *  3. VAQTINCHALIK XATO (5xx, tarmoq, timeout). Qisqa kutish bilan
   *     qayta urinish — bir marталик tarmoq lipillashi xabarni yo'qotmasin.
   *
   * Urinishlar soni cheklangan: bu fire-and-forget yo'l va u hech qachon
   * chaqiruvchini uzoq ushlab turmasligi kerak.
   */
  private async send(text: string): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('Telegram sozlanmagan (TELEGRAM_BOT_TOKEN) — xabar yuborilmadi');
      return;
    }

    let chatId = await this.resolveChatId();
    if (!chatId) {
      this.logger.warn('Telegram sozlanmagan (TELEGRAM_CHAT_ID) — xabar yuborilmadi');
      return;
    }

    for (let attempt = 1; attempt <= SEND_MAX_ATTEMPTS; attempt += 1) {
      try {
        // Timeout SHART: aks holda Telegram sekin/yetib bo'lmaydigan bo'lsa fetch
        // uzoq osilib qolardi — bu esa xabarni AWAIT qilgan chaqiruvchilarni
        // (masalan fikr-mulohaza yuborish) bloklaydi.
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            // Havolalar ostidagi katta oldindan ko'rish bloklari xabarnomalarni
            // o'qishni qiyinlashtiradi
            link_preview_options: { is_disabled: true },
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });

        if (res.ok) return;

        const body = (await res.json().catch(() => null)) as TelegramErrorBody | null;

        // 1. Guruh supergroup'ga ko'chdi — yangi ID bilan DARHOL qayta yuboramiz
        const migrateTo = body?.parameters?.migrate_to_chat_id;
        if (migrateTo) {
          await this.persistChatId(String(migrateTo));
          chatId = String(migrateTo);
          continue;
        }

        // 2. Chegara — Telegram aytgan muddat kutiladi
        const retryAfter = body?.parameters?.retry_after;
        if (res.status === 429 && retryAfter && attempt < SEND_MAX_ATTEMPTS) {
          await this.delay(Math.min(retryAfter * 1000, SEND_MAX_BACKOFF_MS));
          continue;
        }

        // 3. Server tomondagi vaqtinchalik xato
        if (res.status >= 500 && attempt < SEND_MAX_ATTEMPTS) {
          await this.delay(SEND_RETRY_DELAY_MS * attempt);
          continue;
        }

        // Qolgani DOIMIY xato (noto'g'ri token, bot guruhdan chiqarilgan,
        // chat topilmadi) — qayta urinish yordam bermaydi, sabab logda qoladi
        this.logger.error(
          `Telegram API xatosi: ${res.status} ${body?.description ?? '(tavsifsiz)'}`,
        );
        return;
      } catch (err) {
        // Tarmoq/timeout — vaqtinchalik deb qaraladi
        if (attempt < SEND_MAX_ATTEMPTS) {
          await this.delay(SEND_RETRY_DELAY_MS * attempt);
          continue;
        }
        this.logger.error(`Telegram xabari yuborilmadi: ${(err as Error).message}`);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sozlamani tekshirish — superadmin panelidagi "Sinov xabari" tugmasi uchun.
   * Xatoni YUTMAYDI: bu yerda foydalanuvchi aynan sababni ko'rishi kerak.
   */
  async selfTest(): Promise<{ ok: boolean; chatId: string | null; error?: string }> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    const chatId = await this.resolveChatId();
    if (!token) return { ok: false, chatId, error: 'TELEGRAM_BOT_TOKEN kiritilmagan' };
    if (!chatId) return { ok: false, chatId, error: 'TELEGRAM_CHAT_ID kiritilmagan' };

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ <b>Billiard Club</b> — Telegram ulanishi ishlayapti.',
          parse_mode: 'HTML',
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (res.ok) return { ok: true, chatId };

      const body = (await res.json().catch(() => null)) as TelegramErrorBody | null;

      // Sinov paytida ham ko'chishni o'zi hal qiladi — foydalanuvchi tugmani
      // ikkinchi marta bosishga majbur bo'lmasin
      const migrateTo = body?.parameters?.migrate_to_chat_id;
      if (migrateTo) {
        await this.persistChatId(String(migrateTo));
        const retry = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: String(migrateTo),
            text: '✅ <b>Billiard Club</b> — Telegram ulanishi ishlayapti (guruh supergroup‘ga ko‘chdi, yangi ID saqlandi).',
            parse_mode: 'HTML',
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (retry.ok) return { ok: true, chatId: String(migrateTo) };
      }

      return { ok: false, chatId, error: body?.description ?? `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, chatId, error: (err as Error).message };
    }
  }

  /** Hodisa yoqilganmi? Kalit yo'q bo'lsa — yoqilgan deb hisoblanadi */
  private async isEventEnabled(event: string): Promise<boolean> {
    const toggles = await this.getEventToggles();
    return toggles[event] !== false;
  }

  /** platform_settings('telegram_events') ni 60 soniyalik kesh bilan o'qish */
  private async getEventToggles(): Promise<Record<string, boolean>> {
    const now = Date.now();
    if (this.eventsCache && now - this.eventsCache.loadedAt < EVENTS_CACHE_TTL_MS) {
      return this.eventsCache.value;
    }
    try {
      const row = await this.platformSettingRepo.findOne({
        where: { key: TELEGRAM_EVENTS_SETTING_KEY },
      });
      const value =
        row && typeof row.value === 'object' && row.value !== null && !Array.isArray(row.value)
          ? (row.value as Record<string, boolean>)
          : {};
      this.eventsCache = { value, loadedAt: now };
      return value;
    } catch (err) {
      // DB xatosi xabarnomani to'xtatmasin — eski kesh yoki "hammasi yoqilgan"
      this.logger.error(`Telegram hodisa sozlamalari o'qilmadi: ${(err as Error).message}`);
      return this.eventsCache?.value ?? {};
    }
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  private formatDate(date: Date | string | null): string {
    return date ? new Date(date).toLocaleDateString('uz-UZ') : '-';
  }

  private formatMoney(amount: number): string {
    return `${amount.toLocaleString('uz-UZ')} so'm`;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
