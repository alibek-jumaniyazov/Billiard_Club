import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTableDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  number: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerHour: number;

  @IsOptional()
  @IsString()
  description?: string;

  /** Zona / zal — bo'sh satr zonani olib tashlaydi */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  zone?: string;
}

/** status YO'Q — stol holati faqat sessiya oqimidan boshqariladi */
export class UpdateTableDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  number?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerHour?: number;

  @IsOptional()
  @IsString()
  description?: string;

  /** Zona / zal — bo'sh satr zonani olib tashlaydi */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  zone?: string;
}
