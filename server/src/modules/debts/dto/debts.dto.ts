import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OfflineStampDto } from '../../../common/offline/offline-at';
import { PaymentMethod } from '../../../entities/enums';

/** Pul ustunlari numeric(14,2) — bitta yozuvdagi eng katta mumkin summa */
const MAX_MONEY = 999_999_999_999;

/**
 * `offlineAt` (OfflineStampDto) — internetsiz paytda to'lov qabul qilingan
 * HAQIQIY vaqt. Berilsa to'lov o'sha vaqt bilan yoziladi (smena va kunlik
 * hisobot shu vaqtga qarab hisoblaydi), aks holda server vaqti.
 */
export class PayDebtDto extends OfflineStampDto {
  /** Faqat musbat summa — manfiy to'lov qarzni oshirish teshigi edi */
  @IsNumber()
  @IsPositive()
  @Max(MAX_MONEY)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}

/** Undirilmagan qarzni hisobdan chiqarish — sabab audit jurnaliga tushadi */
export class WriteOffDebtDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ListDebtsQueryDto {
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
  @IsString()
  search?: string;

  /**
   * 'written_off' — HISOBDAN CHIQARILGAN qarzlar. Ular `isPaid = true` bo'lgani
   * uchun 'paid' ro'yxatiga tushib qolmasligi kerak: pul olinmagan, qarzdan
   * voz kechilgan. Alohida filtr klub egasiga "qancha pul kechirildi" degan
   * savolga javob beradi.
   */
  @IsOptional()
  @IsIn(['unpaid', 'paid', 'written_off', 'all'])
  status?: 'unpaid' | 'paid' | 'written_off' | 'all';
}
