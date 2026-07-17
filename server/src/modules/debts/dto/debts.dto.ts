import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../../../entities/enums';

export class PayDebtDto {
  /** Faqat musbat summa — manfiy to'lov qarzni oshirish teshigi edi */
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
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
