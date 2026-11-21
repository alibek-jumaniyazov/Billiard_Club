import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OfflineStampDto } from '../../../common/offline/offline-at';
import { ReservationStatus } from '../../../entities/enums';

/**
 * `offlineAt` (OfflineStampDto) — bron internetsiz paytda kiritilgan HAQIQIY
 * vaqt. Berilsa amal "oflayn navbatdan" deb qaraladi: vaqt to'qnashuvi
 * ogohlantirish emas, RAD ETISH bo'ladi (reservations.service.ts: create).
 */
export class CreateReservationDto extends OfflineStampDto {
  @IsInt()
  @Type(() => Number)
  tableId: number;

  /** Ro'yxatdagi mijoz (ixtiyoriy) */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  customerId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  /** Bron boshlanish vaqti (ISO) */
  @IsDateString()
  startsAt: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  @Type(() => Number)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/** `offlineAt` — holat o'tishi (tasdiqlash/o'tirdi/kelmadi) oflayn bosilgan payt */
export class UpdateReservationDto extends OfflineStampDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  tableId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  customerId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  @Type(() => Number)
  durationMinutes?: number;

  /** Holat o'tishi servisda tekshiriladi (ruxsat etilgan o'tishlar xaritasi) */
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ListReservationsQueryDto {
  /** 'YYYY-MM-DD' yoki to'liq ISO — startsAt bo'yicha filtr */
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  tableId?: number;

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
