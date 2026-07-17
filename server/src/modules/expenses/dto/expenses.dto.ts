import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  /** Erkin matn; taklif ro'yxati — EXPENSE_CATEGORY_SUGGESTIONS */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  category: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Xarajat amalda qilingan sana (ISO); bo'lmasa — hozir */
  @IsOptional()
  @IsDateString()
  spentAt?: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  spentAt?: string;
}

export class ListExpensesQueryDto {
  /** 'YYYY-MM-DD' yoki to'liq ISO — spentAt bo'yicha filtr */
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

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
