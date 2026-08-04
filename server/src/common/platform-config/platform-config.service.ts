import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSetting } from '../../entities/platform-setting.entity';

/** platform_settings dagi kalit */
export const PLATFORM_CONFIG_KEY = 'platform_config';

/**
 * Kesh muddati. Qiymat kamdan-kam o'zgaradi, lekin HAR bir ro'yxatdan
 * o'tishda va har bir cron ishida o'qiladi — DB ga har safar borish
 * keraksiz. `update()` keshni darhol yangilaydi, shuning uchun panelda
 * o'zgartirilgan qiymat SHU ZAHOTI kuchga kiradi.
 */
const CACHE_TTL_MS = 60 * 1000;

/** Sinov muddati chegaralari (kun). 0 = sinovsiz, darhol to'lov talab qilinadi. */
export const TRIAL_DAYS_MIN = 0;
export const TRIAL_DAYS_MAX = 365;

/** Eslatma chegaralari (kun) */
export const REMINDER_DAY_MIN = 1;
export const REMINDER_DAY_MAX = 30;
export const REMINDER_MAX_COUNT = 5;

export interface PlatformConfig {
  /** Yangi klubga beriladigan bepul sinov muddati (kun) */
  trialDays: number;
  /**
   * Obuna tugashidan necha kun oldin eslatma yuborilsin.
   * Masalan [1, 3] — 3 kun qolganda va 1 kun qolganda.
   */
  expiryReminderDays: number[];
}

/**
 * STANDART qiymatlar — sozlama hech qachon saqlanmagan bo'lsa shular amal qiladi.
 * Ilgari aynan shu sonlar kodda uch xil joyda qat'iy yozilgan edi.
 */
export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  trialDays: 7,
  expiryReminderDays: [1, 3],
};

/**
 * PLATFORMA SOZLAMALARI (superadmin boshqaradi).
 *
 * MUAMMO. Bepul sinov muddati kodda uch joyda qat'iy `7` bo'lib yozilgan edi:
 * landing orqali ro'yxatdan o'tishda, superadmin klub yaratishda va
 * matnlarda. Uni o'zgartirish uchun kodga kirib, uchala joyni topib,
 * qayta deploy qilish kerak edi — biri unutilsa esa tizim o'zi bilan
 * ziddiyatga tushardi (masalan landing "14 kun" deb yozib, aslida 7 kun berardi).
 *
 * YECHIM. Qiymat bitta joyda — bazada. Barcha iste'molchilar SHU servisdan
 * o'qiydi, panelda o'zgartirilgani zahoti hamma joyda (matnlar ham) yangilanadi.
 *
 * Saqlash `platform_settings` da (telegram sozlamalari bilan bir xil naqsh) —
 * yangi jadval va migratsiya kerak emas.
 */
@Injectable()
export class PlatformConfigService {
  private readonly logger = new Logger(PlatformConfigService.name);
  private cache: { value: PlatformConfig; loadedAt: number } | null = null;

  constructor(
    @InjectRepository(PlatformSetting)
    private readonly repo: Repository<PlatformSetting>,
  ) {}

  /**
   * Joriy sozlamalar. DB yetib bo'lmasa — oxirgi kesh, u ham bo'lmasa
   * standart qiymatlar. Ya'ni bu metod HECH QACHON yiqilmaydi: sozlama
   * o'qilmagani uchun ro'yxatdan o'tish to'xtab qolmasligi kerak.
   */
  async get(): Promise<PlatformConfig> {
    const now = Date.now();
    if (this.cache && now - this.cache.loadedAt < CACHE_TTL_MS) return this.cache.value;

    try {
      const row = await this.repo.findOne({ where: { key: PLATFORM_CONFIG_KEY } });
      const value = this.normalize(row?.value);
      this.cache = { value, loadedAt: now };
      return value;
    } catch (err) {
      this.logger.error(`Platforma sozlamalari o'qilmadi: ${(err as Error).message}`);
      return this.cache?.value ?? DEFAULT_PLATFORM_CONFIG;
    }
  }

  /**
   * Sozlamani yangilash (faqat berilgan maydonlar).
   *
   * Kesh DARHOL yangilanadi — superadmin qiymatni o'zgartirgach keyingi
   * ro'yxatdan o'tish yangi muddat bilan ketishi kerak, bir daqiqa
   * kutib turmasligi kerak.
   */
  async update(patch: Partial<PlatformConfig>): Promise<PlatformConfig> {
    const current = await this.get();

    /**
     * `undefined` MAYDONLAR OLIB TASHLANADI.
     *
     * DTO da barcha maydonlar ixtiyoriy, shuning uchun panelda faqat bittasi
     * o'zgartirilganda ikkinchisi `undefined` bo'lib keladi. Oddiy
     * `{ ...current, ...patch }` da esa `undefined` MAVJUD qiymatning
     * USTIDAN yozadi va u `normalize()` da standart qiymatga tushib qolardi:
     * ya'ni "eslatmalarni o'zgartirdim" degan bir amal 365 kunlik sinovni
     * jimgina 7 kunga qaytarib yuborardi.
     */
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    const next = this.normalize({ ...current, ...cleanPatch });

    await this.repo.upsert({ key: PLATFORM_CONFIG_KEY, value: next }, ['key']);
    this.cache = { value: next, loadedAt: Date.now() };
    this.logger.log(
      `Platforma sozlamalari yangilandi: sinov ${next.trialDays} kun, ` +
        `eslatmalar [${next.expiryReminderDays.join(', ')}]`,
    );
    return next;
  }

  /**
   * Saqlangan qiymatni ISHONCHSIZ deb qarab tozalaydi.
   *
   * Nega kerak: bazadagi jsonb ni qo'lda ham tahrirlash mumkin, eski
   * versiyadan qolgan yozuvda maydon umuman bo'lmasligi mumkin. Yaroqsiz
   * qiymat esa bu yerda emas, KLUB YARATILAYOTGANDA (NaN kun sinov) yoki
   * cron ichida portlardi.
   */
  private normalize(raw: unknown): PlatformConfig {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

    const trialDays = this.clampInt(
      obj.trialDays,
      DEFAULT_PLATFORM_CONFIG.trialDays,
      TRIAL_DAYS_MIN,
      TRIAL_DAYS_MAX,
    );

    const rawDays = Array.isArray(obj.expiryReminderDays) ? obj.expiryReminderDays : null;
    let expiryReminderDays = DEFAULT_PLATFORM_CONFIG.expiryReminderDays;
    if (rawDays) {
      const cleaned = Array.from(
        new Set(
          rawDays
            .map((d) => Math.trunc(Number(d)))
            .filter((d) => Number.isFinite(d) && d >= REMINDER_DAY_MIN && d <= REMINDER_DAY_MAX),
        ),
      )
        // O'sish tartibida: eslatma tanlashda "eng yaqin chegara" mantig'i
        // aynan shu tartibga tayanadi (subscription-cron.service.ts)
        .sort((a, b) => a - b)
        .slice(0, REMINDER_MAX_COUNT);
      // Bo'sh ro'yxat — ATAYLAB ruxsat etilgan: eslatmalarni butunlay
      // o'chirib qo'yish mumkin bo'lishi kerak
      expiryReminderDays = cleaned;
    }

    return { trialDays, expiryReminderDays };
  }

  private clampInt(raw: unknown, fallback: number, min: number, max: number): number {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  }
}
