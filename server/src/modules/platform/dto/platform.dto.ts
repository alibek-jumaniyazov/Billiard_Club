import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  REMINDER_DAY_MAX,
  REMINDER_DAY_MIN,
  REMINDER_MAX_COUNT,
  TRIAL_DAYS_MAX,
  TRIAL_DAYS_MIN,
} from '../../../common/platform-config/platform-config.service';

export class AuditLogsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clubId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  userId?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

/**
 * Platforma sozlamalari — superadmin o'zgartiradigan qiymatlar.
 *
 * Ikkala maydon ham ixtiyoriy: panelda faqat bittasi o'zgartirilishi mumkin
 * va qolgani tegilmagan holicha qolishi kerak (PATCH semantikasi).
 */
export class UpdatePlatformConfigDto {
  /** Bepul sinov muddati (kun). 0 — sinovsiz. */
  @IsOptional()
  @IsInt()
  @Min(TRIAL_DAYS_MIN)
  @Max(TRIAL_DAYS_MAX)
  @Type(() => Number)
  trialDays?: number;

  /**
   * Obuna tugashidan necha kun oldin eslatma yuborilsin.
   * Bo'sh massiv — eslatmalar butunlay o'chiriladi (ataylab ruxsat etilgan).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REMINDER_MAX_COUNT)
  @IsInt({ each: true })
  @Min(REMINDER_DAY_MIN, { each: true })
  @Max(REMINDER_DAY_MAX, { each: true })
  @Type(() => Number)
  expiryReminderDays?: number[];
}

/** Klub ma'lumotlari konsolining sahifalash parametrlari */
export class ClubDataQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export class UpdateTelegramSettingsDto {
  /**
   * Hodisa nomi -> yoqilgan/o'chirilgan xaritasi.
   * Kalitlar TelegramService dagi ma'lum hodisalar ro'yxatiga,
   * qiymatlar boolean ekaniga servisda tekshiriladi.
   */
  @IsObject()
  events: Record<string, unknown>;
}
