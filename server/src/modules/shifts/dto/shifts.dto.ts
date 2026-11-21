import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { OfflineStampDto } from '../../../common/offline/offline-at';

/** Pul maydonlari uchun yuqori chegara — tasodifiy ortiqcha nollarga qarshi */
const MAX_AMOUNT = 1_000_000_000_000;

/**
 * `offlineAt` (OfflineStampDto) — smena internetsiz paytda ochilgan HAQIQIY
 * vaqt (navbatdan). Smena oynasi shu paytdan boshlanadi.
 */
export class OpenShiftDto extends OfflineStampDto {
  /** Kassadagi boshlang'ich naqd (maydalik) */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  openingCash?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * `offlineAt` — kassir internetsiz paytda kassani sanab "Yopish" ni bosgan
 * HAQIQIY vaqt. Z-hisobot [ochilgan, offlineAt) oralig'i bo'yicha SERVER
 * ma'lumotidan, navbat yetib kelgan paytda hisoblanadi.
 */
export class CloseShiftDto extends OfflineStampDto {
  /** Kassir sanagan naqd */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  countedCash: number;

  /** Smena davomida kassadan chiqarilgan naqd (xarajat, egaga topshirilgan) */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  cashOut?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListShiftsQueryDto {
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
