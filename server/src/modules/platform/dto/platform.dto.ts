import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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

export class UpdateTelegramSettingsDto {
  /**
   * Hodisa nomi -> yoqilgan/o'chirilgan xaritasi.
   * Kalitlar TelegramService dagi ma'lum hodisalar ro'yxatiga,
   * qiymatlar boolean ekaniga servisda tekshiriladi.
   */
  @IsObject()
  events: Record<string, unknown>;
}
