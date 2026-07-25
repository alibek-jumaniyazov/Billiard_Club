import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LightDriver, LightMode } from '../../../entities/enums';

/**
 * Stolning rele (chiroq) sozlamalari.
 * Barcha maydonlar ixtiyoriy — faqat yuborilganlari yangilanadi; null yuborilsa
 * qiymat tozalanadi. Drayver va manzil MOSLIGI (masalan http uchun onUrl+offUrl
 * majburiyligi) servisda tekshiriladi — xato i18n kaliti bilan qaytishi uchun
 * (lights.invalidHost).
 */
export class UpdateTableLightDto {
  @IsOptional()
  @IsEnum(LightDriver)
  driver?: LightDriver;

  /** "192.168.1.51" yoki "192.168.1.51:8080" */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  host?: string | null;

  /** Rele kanali (0 dan boshlanadi) */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(32)
  @Type(() => Number)
  channel?: number;

  /** NC (normally closed) rele — buyruq teskari yuboriladi */
  @IsOptional()
  @IsBoolean()
  inverted?: boolean;

  /** Basic-auth "user:parol" */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  auth?: string | null;

  /** driver='http' uchun yoqish shabloni ({channel}, {state} o'rniga qo'yiladi) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  onUrl?: string | null;

  /** driver='http' uchun o'chirish shabloni */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  offUrl?: string | null;
}

/**
 * Qo'lda boshqaruv (override): on=null — bekor qilish, chiroq avtomatik
 * (sessiyaga bog'liq) holatga qaytadi.
 */
export class LightOverrideDto {
  @IsOptional()
  @IsBoolean()
  on?: boolean | null;

  /** Override qancha vaqt kuchda turadi (daqiqa) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  @Type(() => Number)
  minutes?: number = 30;
}

/** Qurilmani sinash: relega yoqish/o'chirish buyrug'ini yuborish */
export class LightTestDto {
  @IsBoolean()
  on: boolean;
}

/** Klubning chiroq rejimi sozlamalari */
export class UpdateLightSettingsDto {
  @IsEnum(LightMode)
  mode: LightMode;

  /** Sessiya pauzada bo'lganda chiroq o'chirilsinmi (standart: yoniq qoladi) */
  @IsOptional()
  @IsBoolean()
  offOnPause?: boolean;
}

/** Yangi bridge tokeni chiqarish (nom ixtiyoriy) */
export class IssueBridgeTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

/** Agent hisobotining bitta qatori */
export class BridgeReportItemDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  tableId: number;

  @IsBoolean()
  ok: boolean;

  /** Qo'llangan MANTIQIY holat (xatoda null bo'lishi mumkin) */
  @IsOptional()
  @IsBoolean()
  on?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  error?: string | null;
}

/** Agent -> server hisoboti (POST /api/bridge/report) */
export class BridgeReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  agentVersion?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BridgeReportItemDto)
  results: BridgeReportItemDto[];
}
