import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Pul maydonlari uchun yuqori chegara — tasodifiy ortiqcha nollarga qarshi */
const MAX_AMOUNT = 1_000_000_000_000;

export class OpenShiftDto {
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

export class CloseShiftDto {
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
