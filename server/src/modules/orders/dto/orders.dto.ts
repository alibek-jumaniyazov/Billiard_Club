import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '../../../entities/enums';
import { OfflineAtDto } from '../../sessions/dto/sessions.dto';

export class OrderItemDto {
  @IsInt()
  @Type(() => Number)
  productId: number;

  /** Manfiy/nol/kasr miqdor qat'iyan taqiqlanadi (hisobni kamaytirish teshigi edi) */
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  quantity: number;
}

/**
 * `offlineAt` (OfflineAtDto) — buyurtma internetsiz paytda kiritilgan payt.
 * Oflayn navbat yuboradi: pozitsiya HAQIQIY vaqti bilan yoziladi (aks holda
 * kechikib kelgan buyurtma "bugungi bar savdosi"da boshqa kunga/smenaga
 * tushib ketardi). Vaqt serverda chegaralanadi (offline-at.ts).
 */
export class CreateOrderDto extends OfflineAtDto {
  @IsInt()
  @Type(() => Number)
  sessionId: number;

  /** Bo'sh yoki cheksiz uzun ro'yxat qabul qilinmaydi (bitta so'rovda 50 pozitsiya) */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

/** Ochiq buyurtmani bekor qilish — sabab ixtiyoriy, lekin audit jurnaliga yoziladi */
export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListOrdersQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sessionId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  tableId?: number;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

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
