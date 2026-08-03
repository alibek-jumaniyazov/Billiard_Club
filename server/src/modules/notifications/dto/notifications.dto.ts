import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Xabarnoma turlari — DTO va servis bir xil ro'yxatdan foydalanadi */
export const NOTIFICATION_TYPES = ['info', 'warning', 'promo', 'maintenance'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Ommaviy e'lon auditoriyasi (klub holati bo'yicha nishonlash) */
export const NOTIFICATION_AUDIENCES = ['all', 'trial', 'active', 'expired'] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

/** Bo'sh joylarni kesuvchi @Transform — validatsiyadan OLDIN ishlaydi */
const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

// ==================== Klub egasi tomoni ====================

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  /** O'qilganlik filtri (berilmasa — barchasi) */
  @IsOptional()
  @IsIn(['all', 'unread', 'read'])
  status?: 'all' | 'unread' | 'read';

  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: NotificationType;

  /** Sarlavha yoki matn bo'yicha qidiruv */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @trim()
  search?: string;
}

/** Ommaviy amallar uchun ID ro'yxati */
export class BulkIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  ids: number[];
}

export class BulkReadDto extends BulkIdsDto {
  /** true — o'qilgan, false — o'qilmagan deb belgilash */
  @IsBoolean()
  read: boolean;
}

// ==================== Superadmin tomoni ====================

export class SendNotificationDto {
  @trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  body: string;

  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: NotificationType;

  /** Aynan bitta klubga (clubIds va audience bilan birga ishlatilmaydi) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clubId?: number;

  /** Tanlangan bir nechta klubga */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  clubIds?: number[];

  /** clubId ham, clubIds ham berilmasa — auditoriya bo'yicha fan-out */
  @IsOptional()
  @IsIn(NOTIFICATION_AUDIENCES)
  audience?: NotificationAudience;

  /** Standart holatda bloklangan klublar chetlab o'tiladi */
  @IsOptional()
  @IsBoolean()
  includeBlocked?: boolean;
}

/** Superadmin tarixi — e'lonlar (batch) bo'yicha guruhlangan ro'yxat filtrlari */
export class AdminHistoryQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: NotificationType;

  /** Shu klub e'lonlar ro'yxatida bo'lgan batchlar */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clubId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  createdById?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @trim()
  search?: string;

  /** YYYY-MM-DD (kiritilgan kun bilan birga) */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** YYYY-MM-DD (kiritilgan kun bilan birga — servis +1 kun qo'shadi) */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Qamrov: bitta klubga yuborilganmi yoki ommaviy e'lonmi */
  @IsOptional()
  @IsIn(['any', 'single', 'broadcast'])
  target?: 'any' | 'single' | 'broadcast';
}

/** Bitta e'lonning qabul qiluvchilari */
export class BatchRecipientsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsIn(['all', 'read', 'unread'])
  status?: 'all' | 'read' | 'unread';

  /** Klub nomi bo'yicha qidiruv */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @trim()
  search?: string;
}

/** Yuborishdan oldingi "nechta klubga boradi" hisobi */
export class AudienceCountQueryDto {
  @IsOptional()
  @IsIn(NOTIFICATION_AUDIENCES)
  audience?: NotificationAudience;

  /** Query string — 'true' / 'false' */
  @IsOptional()
  @IsBooleanString()
  includeBlocked?: string;
}

/** E'lonni qaytarib olish rejimi */
export class RecallBatchQueryDto {
  /** Standart 'true' — faqat hali o'qilmagan nusxalar o'chiriladi */
  @IsOptional()
  @IsIn(['true', 'false'])
  onlyUnread?: 'true' | 'false';
}
