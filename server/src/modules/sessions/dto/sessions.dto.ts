import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, SessionStatus } from '../../../entities/enums';

/** Pul ustunlari numeric(14,2) — bitta yozuvdagi eng katta mumkin summa */
const MAX_MONEY = 999_999_999_999;

/**
 * OFLAYN VAQT MUHRI — internet uzilganda bajarilgan amalning HAQIQIY vaqti.
 *
 * NEGA KERAK: klientning oflayn navbati amalni aloqa tiklangandan keyin
 * yuboradi. Server vaqtni o'zi qo'yganida o'yin "hozir boshlangan" bo'lib
 * yozilardi va klub oflayn o'tgan BUTUN vaqt uchun pul olmasdi (2 soatlik
 * uzilish = 2 soatlik tushum yo'qolishi). Pauza uchun teskarisi: oflayn
 * ayirilgan pauza serverda hisobga olinmay, mijozdan ORTIQCHA pul olinardi.
 *
 * ISHONCH CHEGARASI: qiymat klientdan keladi, shuning uchun server uni
 * QAT'IY CHEGARALAYDI (common/time/offline-at.ts: clampOfflineAt) —
 * [hozir - 24 soat, hozir] oralig'idan tashqarisi kesiladi va kesilgan
 * hollarda audit yozuvi qoldiriladi. Bu yangi ishonch yuzasi ochmaydi:
 * kassir baribir "boshlash" tugmasini qachon bosishni o'zi tanlaydi.
 */
export class OfflineAtDto {
  @IsOptional()
  @IsISO8601()
  offlineAt?: string;
}

export class StartSessionDto extends OfflineAtDto {
  @IsInt()
  @Type(() => Number)
  tableId: number;

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

  /** Belgilangan o'yin vaqti (daqiqa); yo'q — cheklanmagan */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  plannedMinutes?: number;

  /**
   * Summa limiti ("50 000 so'mga o'ynayman") — stol summasi shu qiymatga
   * yetganda kassirga ogohlantirish chiqadi. plannedMinutes bilan BIRGA
   * yuborilmaydi. Bu yerda faqat shakl tekshiriladi; stol narxiga bog'liq
   * chegaralar (kamida 5 daqiqalik, ko'pi bilan 24 soatlik summa) servisda
   * (session-limit.ts: checkLimitAmount).
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_MONEY)
  @Type(() => Number)
  limitAmount?: number;
}

/**
 * O'yin vaqti cheklovini o'zgartirish. Uch xil so'rov:
 *  - { plannedMinutes: N }   — belgilangan vaqt (summa limiti bo'lsa olib tashlanadi);
 *  - { limitAmount: X }      — summa limiti (belgilangan vaqt bo'lsa olib tashlanadi);
 *  - { plannedMinutes: null } — cheklovni butunlay olib tashlash (ikkalasi ham).
 * Ikkala qiymat birga yuborilsa rad etiladi.
 *
 * `offlineAt` (OfflineAtDto) — o'zgarish internetsiz paytda kiritilgan va
 * navbatdan kelmoqda: narxga bog'liq tekshiruvlar kassir ekranida o'sha payt
 * bajarilgan, server ularni qayta rad etmaydi (sessions.service.ts: updatePlan).
 */
export class UpdatePlanDto extends OfflineAtDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  plannedMinutes?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_MONEY)
  limitAmount?: number | null;
}

/** Bo'lib to'lash elementi: usul + summa */
export class SessionPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  amount: number;
}

/**
 * Qo'lda tuzatish: musbat — ustama, manfiy — chegirma; sabab MAJBURIY.
 * Chegara numeric(14,2) ustuni sig'imidan kelib chiqadi — chegarasiz qiymat
 * hisob-kitobni tushunarsiz 500 xatosi bilan orqaga qaytarardi.
 */
export class SessionAdjustmentDto {
  @IsNumber()
  @Min(-MAX_MONEY)
  @Max(MAX_MONEY)
  @Type(() => Number)
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;
}

/**
 * Sessiyani bekor qilish — sabab ixtiyoriy, lekin audit jurnaliga yoziladi.
 * `offlineAt` — internetsiz paytda "Bekor qilish" bosilgan payt: o'yin AYNAN
 * o'sha paytda to'xtagan hisoblanadi (yakun vaqti, audit va kassir chegarasi).
 */
export class CancelSessionDto extends OfflineAtDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

/**
 * Sessiyani boshqa stolga ko'chirish.
 * `offlineAt` — internetsiz paytda ko'chirilgan payt: vaqt va narx AYNAN shu
 * paytda bo'linadi (o'sha paytdagi onlayn ko'chirish bilan bir xil natija).
 */
export class TransferSessionDto extends OfflineAtDto {
  @IsInt()
  @Type(() => Number)
  tableId: number;

  /**
   * Kassir ko'chirishni bosgan paytda o'yin TURGAN stol. Berilsa server
   * tekshiradi: o'yin oraliqda boshqa kassada boshqa stolga ko'chirilgan
   * bo'lsa, eskirgan ko'chirish qo'llanmaydi (vaqt noto'g'ri stol narxida
   * bo'linib ketmasin). Oflayn navbat har doim yuboradi.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  fromTableId?: number;
}

/**
 * Hisob-kitob. `offlineAt` (OfflineAtDto) — internetsiz paytda kassada bosilgan
 * "Yakunlash" vaqti: navbat aloqa tiklanganda yuboradi va server summani AYNAN
 * o'sha paytga hisoblaydi (sessions.service.ts: end — oflayn tafsilotlari).
 */
export class EndSessionDto extends OfflineAtDto {
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  /**
   * Bo'lib to'lash: berilsa, yig'indi (totalAmount - qarz) ga teng bo'lishi shart.
   * Berilmasa yoki BO'SH bo'lsa (masalan, 100% qarz) — paymentMethod bo'yicha
   * bitta to'lov yoziladi (servis bo'sh ro'yxatni berilmagani kabi qabul qiladi).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SessionPaymentDto)
  payments?: SessionPaymentDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SessionAdjustmentDto)
  adjustment?: SessionAdjustmentDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  discount?: number;

  /**
   * Kassir ekranida KO'RSATILGAN bar summasi. Berilsa, server o'zi hisoblagan
   * bar summasi bilan solishtiradi va farq bo'lsa 409 qaytaradi: kassa oynasi
   * ochiq turganda boshqa terminaldan qo'shilgan ichimlik tufayli noto'g'ri
   * pul olinib ketmasligi uchun. Stol vaqti tekshirilmaydi (u doim o'sadi).
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  expectedBarAmount?: number;

  /**
   * YAXLITLASH yoqilgan o'yinda kassir ekranida KO'RSATILGAN (va mijozdan
   * olingan) yaxlit stol summasi. "Yakunlash" bosilgan oni bilan server
   * hisobi orasida taymer yaxlitlash chegarasidan o'tib ketsa (46 499 → 46 501),
   * server shu qiymatni qabul qiladi — kassadagi pul ekrandagi bilan bir xil
   * qolsin. Faqat qisqa oynada va qadamga karrali qiymat qabul qilinadi
   * (sessions.service.ts: ROUNDING_GRACE_SECONDS); aks holda e'tiborsiz.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY)
  @Type(() => Number)
  expectedTableAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isDebt?: boolean;

  @IsOptional()
  @IsBoolean()
  isTableDebt?: boolean;

  @IsOptional()
  @IsBoolean()
  isBarDebt?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  /**
   * Ro'yxatdagi mijoz (customers.id). Qarzga yozishda berilsa server mijozni
   * QAYTA tekshiradi (shu klubda mavjudmi) va qarzni aynan unga bog'laydi —
   * ism/telefon ham shu yozuvdan olinadi. Internetsiz (offlineAt bilan) qarz
   * FAQAT shu maydon bilan qabul qilinadi.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  customerId?: number;
}

export class ListSessionsQueryDto {
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
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  tableId?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  search?: string;
}
