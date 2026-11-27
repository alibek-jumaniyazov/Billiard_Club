import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderStatus, PaymentMethod } from '../../../entities/enums';
import { OfflineAtDto, SessionPaymentDto } from '../../sessions/dto/sessions.dto';

/** numeric(14,2) ustuni sig'imi (sessions.dto.ts dagi MAX_MONEY bilan bir xil) */
const MAX_MONEY = 999_999_999_999;

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

/** Stolsiz savdo pozitsiyasi: kassir ekranida KO'RSATILGAN narx bilan */
export class BarSaleItemDto extends OrderItemDto {
  /**
   * Kassir ekranidagi birlik narxi. Onlayn: joriy narxdan farq qilsa 409 (ekrandagidan
   * boshqa pul olinmasin). Oflayn: aynan shu narx yoziladi — pul shu narxda olingan.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  price?: number;
}

/**
 * STOLSIZ BAR SAVDOSI — billiard o'ynamaydigan mijozga bardan sotish (bar-sale.service.ts).
 * To'lov: `payments` (bo'lib to'lash) yoki bitta `paymentMethod`; `isDebt` — butun summa
 * qarzga (mijoz ismi shart). `offlineAt` — internetsiz savdo vaqti (navbatdan).
 */
export class CreateBarSaleDto extends OfflineAtDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BarSaleItemDto)
  items: BarSaleItemDto[];

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  /** Bo'lib to'lash satrlari — yig'indi to'lanadigan summaga teng bo'lishi shart */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SessionPaymentDto)
  payments?: SessionPaymentDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  discount?: number;

  /** Butun summa qarzga ("Qarzlar daftari" tarif imkoniyati; mijoz ismi shart) */
  @IsOptional()
  @IsBoolean()
  isDebt?: boolean;

  /** Ro'yxatdagi mijoz — internetsiz qarz faqat shu bilan */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  customerId?: number;

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

  /** Faqat stolsiz (bardan to'g'ridan-to'g'ri) savdolar */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  walkIn?: boolean;

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
