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
import { PaymentMethod } from '../../../entities/enums';

/** Pul ustunlari numeric(14,2) — bitta yozuvdagi eng katta mumkin summa */
const MAX_MONEY = 999_999_999_999;

export class PayDebtDto {
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

  @IsOptional()
  @IsIn(['unpaid', 'paid', 'all'])
  status?: 'unpaid' | 'paid' | 'all';
}
