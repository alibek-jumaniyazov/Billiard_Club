import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { ClubStatus, InvoiceStatus } from '../../entities/enums';
import { Invoice } from '../../entities/invoice.entity';
import { PlatformSetting } from '../../entities/platform-setting.entity';
import { TelegramService } from '../../telegram/telegram.service';
import { DAY_MS } from './billing.util';

/** Eslatma yuborilgan klublar xaritasi kaliti: clubId -> 'YYYY-MM-DD' */
export const EXPIRY_NOTIFIED_SETTING_KEY = 'expiry_notified';

/** PENDING faktura shuncha kundan keyin avtomatik EXPIRED bo'ladi */
const PENDING_INVOICE_TTL_DAYS = 7;

/**
 * Obuna bo'yicha rejalashtirilgan ishlar (har kuni 03:00):
 *  1. Muddati tugagan klublarni EXPIRED holatiga o'tkazish (BLOCKED tegilmaydi) —
 *     hech kim kirmagan "uxlab yotgan" klublar ham to'g'ri hisoblansin;
 *  2. 7 kundan eski PENDING fakturalarni EXPIRED qilish;
 *  3. Obunasi 3 kun va 1 kun qolgan klublar haqida Telegram eslatma
 *     (platform_settings('expiry_notified') orqali kuniga bir marta).
 */
@Injectable()
export class SubscriptionCronService {
  private readonly logger = new Logger(SubscriptionCronService.name);

  constructor(
    private readonly telegram: TelegramService,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(PlatformSetting)
    private readonly platformSettingRepo: Repository<PlatformSetting>,
  ) {}

  /** Har kuni soat 03:00 da */
  @Cron('0 0 3 * * *')
  async handleDaily(): Promise<void> {
    // Har bir bosqich mustaqil — bittasining xatosi qolganlarini to'xtatmaydi
    try {
      await this.flipExpiredClubs();
    } catch (err) {
      this.logger.error(`Muddati tugagan klublarni belgilashda xato: ${(err as Error).message}`);
    }
    try {
      await this.expireStaleInvoices();
    } catch (err) {
      this.logger.error(`Eski PENDING fakturalarni yopishda xato: ${(err as Error).message}`);
    }
    try {
      await this.notifyExpiringClubs();
    } catch (err) {
      this.logger.error(`Obuna eslatmalarini yuborishda xato: ${(err as Error).message}`);
    }
  }

  /** Amaldagi muddati o'tgan klublar -> EXPIRED (BLOCKED va EXPIRED tegilmaydi) */
  private async flipExpiredClubs(): Promise<void> {
    const result = await this.clubRepo
      .createQueryBuilder()
      .update(Club)
      .set({ status: ClubStatus.EXPIRED })
      .where('status NOT IN (:...skipStatuses)', {
        skipStatuses: [ClubStatus.BLOCKED, ClubStatus.EXPIRED],
      })
      .andWhere(`COALESCE("subscriptionEndsAt", "trialEndsAt") < now()`)
      .execute();
    if (result.affected) {
      this.logger.log(`${result.affected} ta klub EXPIRED holatiga o'tkazildi`);
    }
  }

  /** 7 kundan eski PENDING fakturalar -> EXPIRED */
  private async expireStaleInvoices(): Promise<void> {
    const cutoff = new Date(Date.now() - PENDING_INVOICE_TTL_DAYS * DAY_MS);
    const result = await this.invoiceRepo
      .createQueryBuilder()
      .update(Invoice)
      .set({ status: InvoiceStatus.EXPIRED })
      .where('status = :pending', { pending: InvoiceStatus.PENDING })
      .andWhere('"createdAt" < :cutoff', { cutoff })
      .execute();
    if (result.affected) {
      this.logger.log(`${result.affected} ta eski PENDING faktura EXPIRED qilindi`);
    }
  }

  /**
   * Obunasi 3 yoki 1 kun qolgan klublarga Telegram eslatma.
   * Deduplikatsiya: platform_settings('expiry_notified') da
   * clubId -> oxirgi yuborilgan sana; kuniga bitta xabar.
   */
  private async notifyExpiringClubs(): Promise<void> {
    const clubs = await this.clubRepo
      .createQueryBuilder('club')
      .where('club.status NOT IN (:...skipStatuses)', {
        skipStatuses: [ClubStatus.BLOCKED, ClubStatus.EXPIRED],
      })
      .andWhere(`COALESCE(club."subscriptionEndsAt", club."trialEndsAt") IS NOT NULL`)
      .andWhere(`COALESCE(club."subscriptionEndsAt", club."trialEndsAt") > now()`)
      .andWhere(`COALESCE(club."subscriptionEndsAt", club."trialEndsAt") < now() + interval '4 days'`)
      .getMany();
    if (clubs.length === 0) return;

    const today = this.dateStr(new Date());
    const notified = await this.loadNotifiedMap();
    let changed = false;

    for (const club of clubs) {
      const end = club.subscriptionEndsAt ?? club.trialEndsAt;
      if (!end) continue;
      const daysLeft = Math.ceil((new Date(end).getTime() - Date.now()) / DAY_MS);
      // Faqat 3 kun va 1 kun qolganda eslatiladi
      if (daysLeft !== 3 && daysLeft !== 1) continue;
      // Bugun allaqachon yuborilgan bo'lsa — o'tkazib yuboriladi
      if (notified[String(club.id)] === today) continue;

      await this.telegram.notifySubscriptionExpiringSoon(club, daysLeft);
      notified[String(club.id)] = today;
      changed = true;
    }

    if (changed) {
      await this.saveNotifiedMap(this.pruneNotifiedMap(notified, today));
    }
  }

  /** platform_settings('expiry_notified') xaritasini o'qish */
  private async loadNotifiedMap(): Promise<Record<string, string>> {
    const row = await this.platformSettingRepo.findOne({
      where: { key: EXPIRY_NOTIFIED_SETTING_KEY },
    });
    return row && typeof row.value === 'object' && row.value !== null && !Array.isArray(row.value)
      ? ({ ...(row.value as Record<string, string>) })
      : {};
  }

  private async saveNotifiedMap(map: Record<string, string>): Promise<void> {
    await this.platformSettingRepo.save({ key: EXPIRY_NOTIFIED_SETTING_KEY, value: map });
  }

  /** Xarita cheksiz o'smasin — 7 kundan eski yozuvlar tozalanadi */
  private pruneNotifiedMap(
    map: Record<string, string>,
    today: string,
  ): Record<string, string> {
    const cutoff = this.dateStr(new Date(Date.now() - 7 * DAY_MS));
    const pruned: Record<string, string> = {};
    for (const [clubId, dateStr] of Object.entries(map)) {
      if (dateStr >= cutoff || dateStr === today) pruned[clubId] = dateStr;
    }
    return pruned;
  }

  private dateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
