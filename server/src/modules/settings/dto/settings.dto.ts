import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

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

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'workingHoursStart HH:MM formatida bo\'lishi kerak' })
  workingHoursStart?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'workingHoursEnd HH:MM formatida bo\'lishi kerak' })
  workingHoursEnd?: string;
}
