import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, SessionStatus } from '../../../entities/enums';

/** Pul ustunlari numeric(14,2) — bitta yozuvdagi eng katta mumkin summa */
const MAX_MONEY = 999_999_999_999;

export class StartSessionDto {
  @IsInt()
  @Type(() => Number)
  tableId: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** Bo'lib to'lash elementi: usul + summa */
export class SessionPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  amount: number;
}

/**
 * Qo'lda tuzatish: musbat — ustama, manfiy — chegirma; sabab MAJBURIY.
 * Chegara numeric(14,2) ustuni sig'imidan kelib chiqadi — chegarasiz qiymat
 * hisob-kitobni tushunarsiz 500 xatosi bilan orqaga qaytarardi.
 */
export class SessionAdjustmentDto {
  @IsNumber()
  @Min(-MAX_MONEY)
  @Max(MAX_MONEY)
  @Type(() => Number)
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;
}

/** Sessiyani bekor qilish — sabab ixtiyoriy, lekin audit jurnaliga yoziladi */
export class CancelSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

/** Sessiyani boshqa stolga ko'chirish */
export class TransferSessionDto {
  @IsInt()
  @Type(() => Number)
  tableId: number;
}

export class EndSessionDto {
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  /**
   * Bo'lib to'lash: berilsa, yig'indi (totalAmount - qarz) ga teng bo'lishi shart.
   * Berilmasa yoki BO'SH bo'lsa (masalan, 100% qarz) — paymentMethod bo'yicha
   * bitta to'lov yoziladi (servis bo'sh ro'yxatni berilmagani kabi qabul qiladi).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SessionPaymentDto)
  payments?: SessionPaymentDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SessionAdjustmentDto)
  adjustment?: SessionAdjustmentDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  discount?: number;

  /**
   * Kassir ekranida KO'RSATILGAN bar summasi. Berilsa, server o'zi hisoblagan
   * bar summasi bilan solishtiradi va farq bo'lsa 409 qaytaradi: kassa oynasi
   * ochiq turganda boshqa terminaldan qo'shilgan ichimlik tufayli noto'g'ri
   * pul olinib ketmasligi uchun. Stol vaqti tekshirilmaydi (u doim o'sadi).
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  expectedBarAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isDebt?: boolean;

  @IsOptional()
  @IsBoolean()
  isTableDebt?: boolean;

  @IsOptional()
  @IsBoolean()
  isBarDebt?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;
}

export class ListSessionsQueryDto {
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
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  tableId?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  search?: string;
}
