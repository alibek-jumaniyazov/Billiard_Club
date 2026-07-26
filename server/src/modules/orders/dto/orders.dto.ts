import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '../../../entities/enums';

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

export class CreateOrderDto {
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
