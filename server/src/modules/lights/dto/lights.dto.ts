import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { LightDriver, LightMode } from '../../../entities/enums';

/**
 * Drayverga xos qo'shimcha sozlamalar (`tables."lightConfig"` jsonb).
 *
 * Hamma maydon ixtiyoriy: qaysi biri MAJBURIY ekani tanlangan drayverga bog'liq
 * va servisda tekshiriladi (`lights.invalidConfig`) — shunda xato i18n kaliti
 * bilan qaytadi va klient uni tarjima qila oladi.
 *
 * DIQQAT: bu obyektga PAROL/TOKEN yozilmaydi — ular alohida `auth` maydonida
 * (`tables."lightAuth"`, `select: false`) saqlanadi.
 */
export class LightConfigDto {
  /** Qo'shimcha rele kanallari (bitta stolda 2–3 lampa) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(32, { each: true })
  @Type(() => Number)
  channels?: number[];

  // --- home_assistant ---
  /** 'switch.stol_3' */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityId?: string;

  // --- esphome ---
  /** switch obyekt nomi: 'relay_1' */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entity?: string;

  // --- mqtt (faqat bridge) ---
  /** buyruq mavzusi: 'zigbee2mqtt/stol3/set' */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  onPayload?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  offPayload?: string;

  /** holat mavzusi (verify uchun) */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  stateTopic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  stateOnValue?: string;

  @IsOptional()
  @IsBoolean()
  retain?: boolean;

  @IsOptional()
  @IsIn([0, 1])
  @Type(() => Number)
  qos?: 0 | 1;

  // --- modbus_tcp (faqat bridge) ---
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(247)
  @Type(() => Number)
  unitId?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  @Type(() => Number)
  coil?: number;

  // --- tcp / serial (faqat bridge) ---
  /** 'A00101A2' (probel va ':' ajratkichlarga ruxsat) */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  onHex?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  offHex?: string;

  /** hex o'rniga matn ('ON\r\n') */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  onAscii?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  offAscii?: string;

  /** javobda kutilgan bosh baytlar */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  expectHex?: string;

  // --- serial (faqat bridge) ---
  /** 'COM3' | '/dev/ttyUSB0' */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialPort?: string;

  /**
   * Chegara 921600 — agent (bridge) ham aynan shu tezlikda to'xtaydi.
   * Ilgari 1 000 000 gacha ruxsat berilardi va agent uni JIMGINA qisqartirardi:
   * foydalanuvchi saqlagan qiymat bilan haqiqiy tezlik farq qilib qolardi.
   */
  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(921_600)
  @Type(() => Number)
  baudRate?: number;

  /** Shu stol uchun holatni o'qib tekshirish (klub sozlamasidan ustun) */
  @IsOptional()
  @IsBoolean()
  verify?: boolean;

  // --- serial: tayyor shablon (LCUS / CH340) ---
  @IsOptional()
  @IsIn(['lcus'])
  preset?: 'lcus';

  // --- tuya / sonoff ---
  /** Tuya gwId/devId yoki eWeLink deviceid */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{6,40}$/)
  deviceId?: string;

  /** Tuya lokal protokol versiyasi */
  @IsOptional()
  @IsIn(['3.1', '3.3', '3.4', '3.5'])
  version?: '3.1' | '3.3' | '3.4' | '3.5';

  /** Tuya: kanal tartibidagi aniq DP raqamlari */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(255, { each: true })
  @Type(() => Number)
  dps?: number[];

  /** Sonoff: eWeLink LAN (shifrlangan) rejimi */
  @IsOptional()
  @IsBoolean()
  encrypt?: boolean;

  /** Sonoff: ko'p kanalli API */
  @IsOptional()
  @IsBoolean()
  outlets?: boolean;

  // --- modbus_tcp / modbus_rtu ---
  @IsOptional()
  @IsIn(['tcp', 'rtu'])
  framing?: 'tcp' | 'rtu';

  @IsOptional()
  @IsIn(['coil', 'register'])
  mode?: 'coil' | 'register';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  @Type(() => Number)
  register?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  @Type(() => Number)
  registerOn?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  @Type(() => Number)
  registerOff?: number;

  @IsOptional()
  @IsBoolean()
  registerReadback?: boolean;

  @IsOptional()
  @IsIn(['none', 'even', 'odd'])
  parity?: 'none' | 'even' | 'odd';

  @IsOptional()
  @IsIn([1, 2])
  @Type(() => Number)
  stopBits?: 1 | 2;

  // --- usb_hid ---
  /** "USBRelay" platasining seriya raqami (bir nechta plata bo'lsa) */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,16}$/)
  serialNumber?: string;
}

/**
 * Stolning rele (chiroq) sozlamalari.
 * Barcha maydonlar ixtiyoriy — faqat yuborilganlari yangilanadi; null yuborilsa
 * qiymat tozalanadi. Drayver va manzil MOSLIGI (masalan http uchun onUrl+offUrl
 * majburiyligi, mqtt uchun config.topic) servisda tekshiriladi — xato i18n
 * kaliti bilan qaytishi uchun (`lights.invalidHost` / `lights.invalidConfig`).
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

  /** Basic/digest uchun "user:parol", home_assistant uchun Bearer token */
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

  /** Drayverga xos sozlamalar; null — butunlay tozalash */
  @IsOptional()
  @ValidateNested()
  @Type(() => LightConfigDto)
  config?: LightConfigDto | null;
}

/** Bir nechta stolni BIR MARTADA sozlash (masalan 8 kanalli plata -> 8 stol) */
export class UpdateTableLightItemDto extends UpdateTableLightDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  tableId: number;
}

export class UpdateTableLightsBulkDto {
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => UpdateTableLightItemDto)
  tables: UpdateTableLightItemDto[];
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

/**
 * Master boshqaruv: klubning BARCHA chiroqlarini birdaniga yoqish/o'chirish
 * yoki avtomatikaga qaytarish (on=null).
 */
export class LightMasterDto {
  @IsOptional()
  @IsBoolean()
  on?: boolean | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  @Type(() => Number)
  minutes?: number = 60;
}

/** Qurilmani sinash: relega yoqish/o'chirish buyrug'ini yuborish */
export class LightTestDto {
  @IsBoolean()
  on: boolean;
}

/** Klubning chiroq rejimi va vaqt qoidalari */
export class UpdateLightSettingsDto {
  @IsEnum(LightMode)
  mode: LightMode;

  /** Sessiya pauzada bo'lganda chiroq o'chirilsinmi (standart: yoniq qoladi) */
  @IsOptional()
  @IsBoolean()
  offOnPause?: boolean;

  /** Sessiya tugagach chiroq shuncha soniya yoniq qoladi (grace) */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  @Type(() => Number)
  offDelaySec?: number;

  /** Bron boshlanishidan shuncha daqiqa oldin yoqiladi */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  @Type(() => Number)
  preOnMinutes?: number;

  /** Majburiy qayta qo'llash oralig'i (soniya) */
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(3600)
  @Type(() => Number)
  forceSyncSec?: number;

  /** Qurilmadan haqiqiy holatni o'qib tekshirish */
  @IsOptional()
  @IsBoolean()
  verify?: boolean;
}

/** Diagnostika jurnalini o'qish (`GET /lights/events`) */
export class LightEventsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  tableId?: number;
}

/** LAN da qurilma qidirishni boshlash (`POST /lights/discover`) */
export class LightDiscoverDto {
  /** '192.168.1' — berilmasa agent o'z IPv4 idan /24 ni oladi */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  subnet?: string;
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
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  commandRevision?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  tableId: number;

  @IsBoolean()
  ok: boolean;

  /** Qo'llangan (kerakli) MANTIQIY holat — xatoda null bo'lishi mumkin */
  @IsOptional()
  @IsBoolean()
  on?: boolean | null;

  /** Qurilmadan O'QILGAN haqiqiy holat (verify) — o'qilmasa null */
  @IsOptional()
  @IsBoolean()
  actual?: boolean | null;

  /** Nechinchi urinishda bajarildi (diagnostika) */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  attempts?: number;

  /** Qurilma javob bergan vaqt, ms (diagnostika) */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  @Type(() => Number)
  latencyMs?: number;

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

/**
 * Qidiruvda topilgan bitta qurilma: tarmoqdagi rele (`host`) yoki kompyuterga
 * ulangan plata (`serialPort` — COM port, `serialNumber` — USB HID plata ID).
 */
export class DiscoveredDeviceDto {
  /** '192.168.1.51' — USB/COM qurilmada bo'lmaydi */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  host?: string;

  /** COM port ('COM3', '/dev/ttyUSB0') */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  serialPort?: string;

  /** USB HID plata ID */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  serialNumber?: string;

  /** Tuya/Sonoff qurilma ID si (ustada oldindan to'ldiriladi) */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,64}$/)
  id?: string;

  /** Tuya protokol versiyasi ('3.3') */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  version?: string;

  /** Sonoff: eWeLink LAN (shifrlangan) rejimi */
  @IsOptional()
  @IsBoolean()
  encrypt?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  mac?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  /** Skaner taxmin qilgan drayver */
  @IsOptional()
  @IsEnum(LightDriver)
  driver?: LightDriver;

  /** Qurilmadagi rele kanallari soni */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32)
  @Type(() => Number)
  channels?: number;
}

/** Agent -> server: qidiruv natijasi (POST /api/bridge/discovered) */
export class BridgeDiscoveredDto {
  /** Qaysi vazifaning natijasi (server bergan `tasks[].id`) */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  taskId?: string;

  /**
   * Agent HAQIQATDA skanerlagan pastki tarmoq ('192.168.1').
   * Vazifada subnet berilmasa agent uni o'z IPv4 idan oladi — panel qaysi
   * tarmoq tekshirilganini ko'rsata olishi uchun natija bilan birga qaytadi.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  subnet?: string;

  @IsArray()
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type(() => DiscoveredDeviceDto)
  devices: DiscoveredDeviceDto[];
}
