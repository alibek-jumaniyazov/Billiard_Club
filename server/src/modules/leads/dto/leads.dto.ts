import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LeadStatus } from '../../../entities/enums';

/** Landing'dagi "bepul konsultatsiya" formasi (POST /public/leads) */
export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsString()
  @Matches(/^\+?[\d\s()-]{9,20}$/, { message: "Telefon raqam noto'g'ri formatda" })
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clubName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  tablesCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @IsIn(['uz', 'ru'])
  lang?: 'uz' | 'ru';

  /** Honeypot — odam ko'rmaydi; to'ldirilgan bo'lsa ariza jimgina tashlanadi */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class ListLeadsQueryDto {
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

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
