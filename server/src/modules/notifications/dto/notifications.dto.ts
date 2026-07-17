import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ListNotificationsQueryDto {
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

export class SendNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;

  @IsOptional()
  @IsIn(['info', 'warning', 'promo', 'maintenance'])
  type?: string;

  /** Berilmasa — BARCHA bloklanmagan klublarga yuboriladi (fan-out) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clubId?: number;
}
