import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { TABLE_ROUNDING_VALUES } from '../../../common/money/table-rounding';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  clubName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currencySymbol?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  defaultTablePrice?: number;

  /**
   * "Stolda yig'ilgan pulni yaxlitlash": 0 — o'chiq, aks holda qadam
   * (100 / 500 / 1000 / 5000). Ro'yxatdan tashqari qiymat 400 bilan rad etiladi.
   */
  @IsOptional()
  @IsInt()
  @IsIn(TABLE_ROUNDING_VALUES)
  @Type(() => Number)
  tableRoundingStep?: number;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'workingHoursStart HH:MM formatida bo\'lishi kerak' })
  workingHoursStart?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'workingHoursEnd HH:MM formatida bo\'lishi kerak' })
  workingHoursEnd?: string;

  /** Klub vaqt mintaqasi — ro'yxat bo'yicha tekshiruv servisda (i18n xato uchun) */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;
}
