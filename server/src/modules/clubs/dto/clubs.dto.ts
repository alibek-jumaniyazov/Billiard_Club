import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateClubDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ownerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'adminUsername faqat lotin harflari, raqam va _ . - dan iborat bo\'lishi kerak' })
  adminUsername: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  adminPassword: string;

  /** Sinov davomiyligi (kun). Default: 7 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  trialDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateClubDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ExtendSubscriptionDto {
  /** Necha oyga uzaytirish (1-36) — yoki `until` bering */
  @ValidateIf((o) => o.until === undefined)
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;

  /** Aniq sana (ISO) — yoki `months` bering */
  @ValidateIf((o) => o.months === undefined)
  @IsDateString()
  until?: string;
}

export class ResetClubPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;
}

export class CreateContractDto {
  @IsIn(['monthly', 'quarterly', 'semiannual', 'yearly', 'custom'])
  type: 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'custom';

  /** Shartnoma summasi (platformaga to'langan pul, so'mda) */
  @IsNumber()
  @Min(0)
  amount: number;

  /** custom uchun: tugash sanasi (ISO) */
  @ValidateIf((o) => o.type === 'custom')
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
