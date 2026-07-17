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

/** Hodisa sozlamalari keshi muddati — har so'rovda DB ga bormaslik uchun */
const EVENTS_CACHE_TTL_MS = 60 * 1000;

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

  /** Xabarni Telegram API ga jo'natish (fire-and-forget) */
  private async send(text: string): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    const chatId = this.config.get<string>('TELEGRAM_CHAT_ID');
    if (!token || !chatId) {
      this.logger.warn('Telegram sozlanmagan (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) — xabar yuborilmadi');
      return;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      if (!res.ok) {
        this.logger.error(`Telegram API xatosi: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      this.logger.error(`Telegram xabari yuborilmadi: ${(err as Error).message}`);
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
