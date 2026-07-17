import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CouponType, InvoiceStatus } from '../../../entities/enums';

// ==================== Klub egasi (owner) ====================

export class PurchaseDto {
  /** Sotib olinayotgan tarif */
  @IsInt()
  @IsPositive()
  planId: number;

  /** Chegirma kuponi kodi (ixtiyoriy) */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  couponCode?: string;
}

export class ListMyInvoicesQueryDto {
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

// ==================== Superadmin: tariflar ====================

export class CreatePlanDto {
  /** Dasturiy identifikator: 'monthly', 'yearly' va h.k. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-z0-9_-]+$/i, {
    message: "code faqat lotin harflari, raqam va _ - dan iborat bo'lishi kerak",
  })
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameUz: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameRu: string;

  @IsOptional()
  @IsString()
  descriptionUz?: string;

  @IsOptional()
  @IsString()
  descriptionRu?: string;

  /** Obuna davomiyligi kunlarda (1-3650) */
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-z0-9_-]+$/i, {
    message: "code faqat lotin harflari, raqam va _ - dan iborat bo'lishi kerak",
  })
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameUz?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameRu?: string;

  @IsOptional()
  @IsString()
  descriptionUz?: string;

  @IsOptional()
  @IsString()
  descriptionRu?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;
}

// ==================== Superadmin: kuponlar ====================

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-z0-9_-]+$/i, {
    message: "code faqat lotin harflari, raqam va _ - dan iborat bo'lishi kerak",
  })
  code: string;

  @IsEnum(CouponType)
  type: CouponType;

  /** percent: 0-100 foiz, fixed: so'mdagi summa */
  @IsNumber()
  @Min(0)
  value: number;

  /** Necha marta ishlatilishi mumkin (bo'sh — cheksiz) */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  /** Faqat ma'lum tarif uchun (bo'sh — barcha tariflar) */
  @IsOptional()
  @IsInt()
  @IsPositive()
  planId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  planId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ==================== Superadmin: hisob-fakturalar ====================

export class ListAdminInvoicesQueryDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clubId?: number;

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

export class ConfirmInvoiceDto {
  /** Erkin matn: 'click', 'payme', 'naqd', 'bank' va h.k. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  paymentMethod?: string;
}

export class RejectInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
