import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;
}

export class CreateProductDto {
  @IsInt()
  @Type(() => Number)
  categoryId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  categoryId?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  // Ombor qoldig'i BU YERDA yo'q: tahrirlash formasi eski qoldiqni qayta
  // yuborib, oradagi bar sotuvlarini bekor qilib yuborardi. Qoldiq faqat
  // POST /products/:id/stock (delta) orqali atomar o'zgartiriladi.

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * Ombor qoldig'ini to'g'irlash: musbat — kirim, manfiy — chiqim.
 * Chegara qo'yilgan: adashib kiritilgan ulkan son qoldiqni ma'nosiz qiymatga
 * o'tkazib yuborishi yoki butun-son chegarasidan oshib 500 xato berishi mumkin edi.
 */
export class AdjustStockDto {
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  @Type(() => Number)
  delta: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ListProductsQueryDto {
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
  @IsInt()
  @Type(() => Number)
  categoryId?: number;
}
