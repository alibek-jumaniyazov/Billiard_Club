import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { OfflineStampDto } from '../../../common/offline/offline-at';

/**
 * `offlineAt` (OfflineStampDto) — mijoz internetsiz paytda qo'shilgan HAQIQIY
 * vaqt; berilsa so'rov oflayn navbatdan kelgan deb qaraladi
 * (customers.service.ts: create — telefon bo'yicha birlashtirish).
 */
export class CreateCustomerDto extends OfflineStampDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ListCustomersQueryDto {
  /** Ism yoki telefon bo'yicha qidiruv */
  @IsOptional()
  @IsString()
  search?: string;

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
