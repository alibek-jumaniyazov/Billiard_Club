import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { ClubBridge } from '../../entities/club-bridge.entity';
import { BRIDGE_ONLY_DRIVERS, LightDriver, LightMode } from '../../entities/enums';
import type { LightDeviceConfig } from '../../entities/light-config.type';
import { Settings } from '../../entities/settings.entity';
import { Table } from '../../entities/table.entity';
import { TableLightEvent } from '../../entities/table-light-event.entity';
import {
  applyLight,
  isPrivateHost,
  isValidHost,
  LightHttpError,
  LightTarget,
  readLight,
} from './drivers/light-driver';
import { LightConfigDto, UpdateLightSettingsDto, UpdateTableLightDto } from './dto/lights.dto';

/** Bitta stol chirog'ining kerakli holati + rele ulanish ma'lumotlari */
export interface LightDeviceState extends LightTarget {
  tableId: number;
  tableNumber: number;
  tableName: string;
  host: string;
  /** Kerakli holat: chiroq yonishi kerakmi */
  desired: boolean;
}

/** Agent (yoki server) hisobotining bitta qatori */
export interface LightReportItem {
  tableId: number;
  ok: boolean;
  /** Agent QO'LLAGAN (kerakli) holat */
  on: boolean | null;
  /** Qurilmadan O'QILGAN haqiqiy holat (verify) — o'qilmagan bo'lsa null */
  actual?: boolean | null;
  /** Nechinchi urinishda bajarildi */
  attempts?: number | null;
  /** Qurilma javobining kechikishi, ms */
  latencyMs?: number | null;
  error?: string | null;
}

/**
 * Diagnostika jurnalidagi hodisa sababi.
 * `table_light_events."source"` ustuni bilan bir xil ro'yxat.
 */
export type LightEventSource =
  | 'session'
  | 'override'
  | 'master'
  | 'test'
  | 'sync'
  | 'drift'
  | 'settings';

/**
 * Klub panelida ko'rsatiladigan stol qatori.
 * DIQQAT: `lightAuth` (rele paroli/tokeni) HECH QACHON qaytarilmaydi — faqat
 * o'rnatilgan-o'rnatilmaganligi (`hasAuth`) bildiriladi. `config` esa qaytadi,
 * chunki unda parol saqlanmaydi (u alohida ustunda).
 */
export interface LightTableConfig {
  tableId: number;
  tableNumber: number;
  tableName: string;
  isActive: boolean;
  driver: LightDriver;
  host: string | null;
  channel: number;
  inverted: boolean;
  hasAuth: boolean;
  onUrl: string | null;
  offUrl: string | null;
  config: LightDeviceConfig | null;
  overrideOn: boolean | null;
  overrideUntil: Date | null;
  state: boolean | null;
  syncedAt: Date | null;
  error: string | null;
}

/** Panel qatori: sozlamalar + joriy kerakli/haqiqiy holat */
export interface LightTableView extends LightTableConfig {
  overrideActive: boolean;
  sessionStatus: string | null;
  desired: boolean;
}

/** Klub agentining (bridge) holati — token HECH QACHON qaytarilmaydi */
export interface LightBridgeStatus {
  exists: boolean;
  name: string | null;
  lastSeenAt: Date | null;
  online: boolean;
  agentVersion: string | null;
}

/** Klub paneli uchun to'liq ko'rinish */
export interface LightOverview {
  mode: LightMode;
  offOnPause: boolean;
  offDelaySec: number;
  preOnMinutes: number;
  forceSyncSec: number;
  verify: boolean;
  serverNow: string;
  forceSyncMs: number;
  bridge: LightBridgeStatus;
  tables: LightTableView[];
}

/** Diagnostika jurnalining bitta qatori (panel uchun) */
export interface LightEventView {
  id: number;
  at: Date;
  tableId: number;
  tableNumber: number;
  tableName: string;
  isOn: boolean | null;
  source: string;
  ok: boolean;
  error: string | null;
  userName: string | null;
}

/** LAN skanerida topilgan qurilma (xotirada, DB ga yozilmaydi) */
export interface DiscoveredDevice {
  host: string;
  mac?: string;
  model?: string;
  name?: string;
  driver?: LightDriver;
  channels?: number;
}

/** Agentga beriladigan vazifa (hozircha faqat qurilma qidirish) */
export interface LightBridgeTask {
  id: string;
  type: 'discover';
  subnet?: string;
}

/** `GET /lights/discover` javobi */
export interface LightDiscoverResult {
  scannedAt: string | null;
  running: boolean;
  /** Agent HAQIQATDA skanerlagan pastki tarmoq ('192.168.1'), noma'lum bo'lsa null */
  subnet: string | null;
  devices: DiscoveredDevice[];
}

/** Uzun-polling uchun bir martalik surat (bridge.controller shuni ishlatadi) */
export interface LightBridgeState {
  settings: ClubLightSettings;
  devices: LightDeviceState[];
  version: string;
  /**
   * Klubda hozir VAQTGA bog'liq o'tish kutilyaptimi (grace/bron oldidan oynasi).
   * Kutilmasa uzun-polling qadamini uzaytirish mumkin — DB yuki kamayadi.
   */
  timeSensitive: boolean;
}

/** Klubning chiroq sozlamalari (kesh qiymati) */
export interface ClubLightSettings {
  mode: LightMode;
  offOnPause: boolean;
  offDelaySec: number;
  preOnMinutes: number;
  forceSyncSec: number;
  verify: boolean;
}

/** Sinov natijasining sababi (klientga tushunarli xabar tanlash uchun) */
export type LightTestReason = 'not_configured' | 'mode_off' | 'unreachable' | 'queued' | null;

/** Relega so'rov timeouti */
const LIGHT_TIMEOUT_MS = 3000;

/** Klub sozlamalari keshi muddati — har sessiya amalida DB ga bormaslik uchun */
const SETTINGS_CACHE_TTL_MS = 30 * 1000;

/**
 * Muvaffaqiyatli qo'llangan holat shuncha vaqtdan keyin majburiy qayta yuboriladi.
 * Endi bu faqat STANDART qiymat — haqiqiy oraliq klub sozlamasidan olinadi
 * (`settings."lightForceSyncSec"`).
 */
export const FORCE_SYNC_MS = 60 * 1000;

/** Qo'lda boshqaruv (override) muddati chegaralari, daqiqada */
const OVERRIDE_MIN_MINUTES = 1;
const OVERRIDE_MAX_MINUTES = 24 * 60;

/** BRIDGE rejimidagi sinov uchun qo'yiladigan override muddati */
const TEST_OVERRIDE_MINUTES = 5;

/** Agent shu vaqt ichida murojaat qilgan bo'lsa "onlayn" hisoblanadi */
const BRIDGE_ONLINE_MS = 60 * 1000;

/** Bir klub uchun bir vaqtda kutayotgan uzun-pollinglar chegarasi */
const MAX_WAITERS_PER_CLUB = 32;

/**
 * Vazifa navbatda shuncha vaqt turadi: agent uni umuman olmasa yoki natija
 * kelmasa, shu muddatdan keyin vazifa "muddati o'tgan" deb hisoblanadi.
 */
const TASK_TTL_MS = 3 * 60 * 1000;

/**
 * Agent vazifani olgandan keyin javob shuncha vaqt kutiladi; kelmasa vazifa
 * agentga QAYTA beriladi (javob yo'lda yo'qolgan yoki agent qayta ishga tushgan).
 */
const TASK_RETAKE_MS = 60 * 1000;

/**
 * Vazifani agentga BERISH mumkin bo'lgan shart (WHERE ga qo'shiladi):
 *  - navbatda vazifa bor va muddati o'tmagan;
 *  - hali umuman berilmagan YOKI berilganiga TASK_RETAKE_MS dan ko'p vaqt o'tgan
 *    (javob yo'lda yo'qolgan / agent qayta ishga tushgan — vazifa qayta beriladi).
 * Satr faqat konstantalardan yig'iladi — unga foydalanuvchi ma'lumoti tushmaydi.
 */
const TASK_TAKEABLE_SQL = `
  AND "pendingTaskId" IS NOT NULL
  AND "pendingTaskAt" > now() - make_interval(secs => ${TASK_TTL_MS / 1000})
  AND ("taskStartedAt" IS NULL
       OR "taskStartedAt" < now() - make_interval(secs => ${TASK_RETAKE_MS / 1000}))`;

/** Saqlanadigan qurilmalar soni chegarasi */
const DISCOVER_MAX_DEVICES = 256;

/** Diagnostika jurnalining saqlash muddati (kun) */
const EVENTS_RETENTION_DAYS = 30;

/** Jurnalni tozalash bo'lagi: bitta ulkan DELETE o'rniga kichik qadamlar */
const EVENTS_CLEANUP_BATCH = 5000;

/** Tozalash sikli hech qachon cheksiz aylanmasin (5000 * 400 = 2 mln qator) */
const EVENTS_CLEANUP_MAX_STEPS = 400;

/** reconcile(): DIRECT klublar shu hajmdagi bo'laklarda parallel yuritiladi */
const RECONCILE_CHUNK = 5;

/** Sekin javob bergan qurilma — debug logga chiqadi */
const SLOW_DEVICE_MS = 2000;

/**
 * Buyruq yuborilgan, lekin qurilma holati baribir kerakli holatga kelmadi.
 * Odatiy sabablari: `inverted` noto'g'ri qo'yilgan yoki mexanik kalit
 * relening holatini ushlab turibdi. Matnda manzil YO'Q (panelga chiqadi).
 */
const DRIFT_REJECTED = "Rele buyruqni qabul qilmadi (holat mos kelmadi)";

/** MQTT mavzusida joker belgilar bo'lmasligi kerak (bu buyruq mavzusi) */
const MQTT_TOPIC_INVALID_RE = /[#+]/;

/** ESPHome switch obyekti nomi */
const ESPHOME_ENTITY_RE = /^[a-z0-9_]+$/;

/** Home Assistant entity id ('switch.stol_3') */
const HA_ENTITY_ID_RE = /^[a-z_]+\.[a-z0-9_]+$/;

/** Hex satri: ajratkichlar olib tashlangandan keyin juft sonli hex raqamlar */
const HEX_SEPARATOR_RE = /[\s:-]/g;
const HEX_BODY_RE = /^[0-9a-f]+$/i;

/** desiredState SQL natijasining xom qatori */
interface DesiredRow {
  tableId: number;
  tableNumber: number;
  tableName: string;
  driver: LightDriver;
  host: string | null;
  channel: number;
  inverted: boolean;
  auth: string | null;
  onUrl: string | null;
  offUrl: string | null;
  config: LightDeviceConfig | null;
  overrideOn: boolean | null;
  overrideActive: boolean;
  sessionStatus: string | null;
  offOnPause: boolean;
  graceActive: boolean;
  preOnActive: boolean;
  offDelaySec: number;
  preOnMinutes: number;
}

/**
 * overview() SQL natijasining xom qatori (panel uchun — BARCHA stollar).
 * `auth` (rele paroli) ATAYLAB tanlanmaydi — panelga hech qachon chiqmaydi.
 */
interface PanelRow extends Omit<DesiredRow, 'auth'> {
  isActive: boolean;
  hasAuth: boolean;
  overrideUntil: Date | null;
  state: boolean | null;
  syncedAt: Date | null;
  error: string | null;
}

/** `club_bridges` dagi qidiruv natijasi qatori (panel uchun) */
interface BridgeTaskRow {
  lastDiscoverAt: Date | null;
  /** `{ subnet, devices }` — agent yuborgan oxirgi natija */
  lastDiscover: { subnet?: string | null; devices?: unknown[] } | null;
  /** Navbatda muddati o'tmagan vazifa turibdimi */
  running: boolean;
}

/** Bo'sh satr null ga aylantiriladi (maydonni tozalash uchun) */
const normalizeText = (value: string | null | undefined): string | null => {
  const text = (value ?? '').trim();
  return text === '' ? null : text;
};

/**
 * Stol chiroqlarini boshqarish yadrosi (butunlay OPT-IN, standart rejim 'off').
 *
 * Asosiy g'oya: alohida buyruq navbati YO'Q — "kerakli holat" (desired state)
 * har safar DB dan hisoblanadi (ustuvorlik yuqoridan pastga):
 *   1. tables."lightOverrideUntil" > now()  -> "lightOverrideOn" hammasidan ustun
 *   2. status='active' sessiya             -> yoniq
 *   3. status='paused' sessiya             -> settings."lightOffOnPause" hal qiladi
 *   4. grace: oxirgi yakunlangan sessiya   -> "lightOffDelaySec" soniya yoniq qoladi
 *   5. bron oldidan                        -> "lightPreOnMinutes" daqiqa oldin yonadi
 *   6. aks holda                           -> o'chiq
 * Shu sababli sessiya tranzaksiyalariga (boshlash/pauza/transfer/yakunlash)
 * umuman tegilmaydi — ular AYNAN hozirgidek ishlayveradi.
 *
 * Ikki rejim:
 *   BRIDGE — klubdagi lokal agent GET /api/bridge/state ga o'zi keladi va qo'llaydi;
 *   DIRECT — server relega o'zi murojaat qiladi (faqat lokal IP, SSRF himoyasi).
 *
 * Chiroq bilan bog'liq HECH BIR xato asosiy oqimni to'xtatmaydi: sinxronlash
 * metodlari throw qilmaydi, xatolar logga va tables."lightError" ga yoziladi.
 * Faqat controllerdan chaqiriladigan metodlar (updateTableDevice, setOverride,
 * testDevice, ...) validatsiya xatolarini throw qiladi.
 */
@Injectable()
export class LightsService {
  private readonly logger = new Logger(LightsService.name);

  /** clubId -> sozlamalar keshi (30 s): rejim + forceSyncSec + verify birga */
  private readonly settingsCache = new Map<
    number,
    { value: ClubLightSettings; loadedAt: number }
  >();

  /** DIRECT rejimda bir klub bir vaqtda faqat bir marta sinxronlansin */
  private readonly syncingClubs = new Set<number>();

  /**
   * clubId -> uyg'otishni kutayotgan resolverlar.
   * Holat o'zgarganda (`pokeClub`) shu klubning uzun-pollinglari DARHOL uyg'onadi,
   * ya'ni o'yin boshlanishi bilan chiroq ~50 ms ichida yonadi.
   */
  private readonly waiters = new Map<number, Set<() => void>>();

  /**
   * Rele buyruqni QABUL QILMAGAN stollar: `${clubId}:${tableId}` -> qachongacha
   * drift uchun qayta qo'llash urinilmaydi.
   *
   * Sababi: `inverted` noto'g'ri qo'yilgan yoki mexanik kalit relening holatini
   * ushlab turgan bo'lsa, "qo'lla -> o'qi -> mos emas -> qayta qo'lla" sikli har
   * majburiy sinxronizatsiyada takrorlanib, qurilmani ham, jurnalni ham behuda
   * yuklardi. Endi bir oynada faqat BIR marta qayta qo'llanadi.
   */
  private readonly driftGuard = new Map<string, number>();

  /** Cron takrorlanmasin (oldingi yurish tugamagan bo'lsa o'tkazib yuboriladi) */
  private reconcileRunning = false;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Table) private readonly tableRepo: Repository<Table>,
    @InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>,
    @InjectRepository(ClubBridge) private readonly bridgeRepo: Repository<ClubBridge>,
    @InjectRepository(TableLightEvent)
    private readonly eventRepo: Repository<TableLightEvent>,
  ) {}

  // ---------------------------------------------------------------------------
  // Kerakli holat (desired state)
  // ---------------------------------------------------------------------------

  /**
   * Klubning chiroq ulangan barcha faol stollari va ularning kerakli holati.
   * Bitta so'rov: stollar + ustidagi active/paused sessiya + oxirgi yakunlangan
   * sessiya (grace) + yaqinlashayotgan bron (pre-on) + settings.
   * Bir stolda ikkita ochiq sessiya bo'lib qolsa 'active' 'paused' dan ustun.
   *
   * DIQQAT: grace va pre-on VAQT o'tishi bilan o'zgaradi, shuning uchun bu
   * so'rov uzun-polling ichida har soniyada qayta bajariladi (bridge.controller)
   * va DIRECT rejimdagi cron ham (30 s) buni ushlaydi.
   */
  async desiredState(clubId: number): Promise<LightDeviceState[]> {
    return (await this.desiredRows(clubId)).map((row) => this.toDeviceState(row));
  }

  /**
   * Kerakli holat so'rovining XOM qatorlari.
   * `desiredState` va `bridgeState` shu yerdan foydalanadi — ikkinchisiga
   * qatorlardagi `graceActive`/`preOnActive` ham kerak (uzun-polling qadamini
   * tanlash uchun), shuning uchun so'rov alohida metodga ajratilgan.
   */
  private async desiredRows(clubId: number): Promise<DesiredRow[]> {
    const rows: DesiredRow[] = await this.dataSource.query(
      `SELECT t.id                                   AS "tableId",
              t.number                               AS "tableNumber",
              t.name                                 AS "tableName",
              t."lightDriver"                        AS "driver",
              t."lightHost"                          AS "host",
              t."lightChannel"                       AS "channel",
              t."lightInverted"                      AS "inverted",
              t."lightAuth"                          AS "auth",
              t."lightOnUrl"                         AS "onUrl",
              t."lightOffUrl"                        AS "offUrl",
              t."lightConfig"                        AS "config",
              t."lightOverrideOn"                    AS "overrideOn",
              (t."lightOverrideUntil" IS NOT NULL
                 AND t."lightOverrideUntil" > now()) AS "overrideActive",
              s.status                               AS "sessionStatus",
              COALESCE(st."lightOffOnPause", false)  AS "offOnPause",
              (fin."endTime" IS NOT NULL AND COALESCE(st."lightOffDelaySec", 0) > 0
                 AND fin."endTime" > now() - make_interval(secs => COALESCE(st."lightOffDelaySec", 0)))
                                                     AS "graceActive",
              (res.id IS NOT NULL AND COALESCE(st."lightPreOnMinutes", 0) > 0)
                                                     AS "preOnActive",
              COALESCE(st."lightOffDelaySec", 0)     AS "offDelaySec",
              COALESCE(st."lightPreOnMinutes", 0)    AS "preOnMinutes"
       FROM tables t
       LEFT JOIN settings st ON st."clubId" = t."clubId"
       LEFT JOIN LATERAL (
         SELECT se.status
         FROM sessions se
         WHERE se."tableId" = t.id AND se.status IN ('active', 'paused')
         ORDER BY (se.status = 'active') DESC, se."startTime" DESC
         LIMIT 1
       ) s ON true
       LEFT JOIN LATERAL (
         SELECT se."endTime"
         FROM sessions se
         WHERE se."tableId" = t.id
           -- Grace o'chiq bo'lsa (standart: 0) bu qidiruv umuman kerak emas:
           -- PG shartni "One-Time Filter" ga aylantirib LATERAL ni o'tkazib yuboradi
           AND COALESCE(st."lightOffDelaySec", 0) > 0
           AND se.status IN ('completed', 'cancelled')
           AND se."endTime" IS NOT NULL
         ORDER BY se."endTime" DESC
         LIMIT 1
       ) fin ON true
       LEFT JOIN LATERAL (
         SELECT r.id
         FROM reservations r
         WHERE r."tableId" = t.id
           -- "Bron oldidan yoqish" o'chiq bo'lsa bronlar ham qidirilmaydi
           AND COALESCE(st."lightPreOnMinutes", 0) > 0
           AND r.status IN ('pending', 'confirmed')
           AND r."startsAt" > now()
           AND r."startsAt" <= now() + make_interval(mins => COALESCE(st."lightPreOnMinutes", 0))
         LIMIT 1
       ) res ON true
       WHERE t."clubId" = $1
         AND t."isActive" = true
         AND t."lightDriver" <> 'none'
         AND (t."lightHost" IS NOT NULL
              OR t."lightOnUrl" IS NOT NULL
              OR t."lightConfig" IS NOT NULL)
       ORDER BY t.id`,
      [clubId],
    );

    return rows;
  }

  /** Xom qatordan agent/DIRECT rejim uchun qurilma tavsifi */
  private toDeviceState(row: DesiredRow): LightDeviceState {
    return {
      tableId: Number(row.tableId),
      tableNumber: Number(row.tableNumber),
      tableName: row.tableName,
      driver: row.driver,
      host: row.host ?? '',
      channel: Number(row.channel),
      inverted: row.inverted,
      auth: row.auth,
      onUrl: row.onUrl,
      offUrl: row.offUrl,
      config: row.config ?? null,
      desired: this.resolveDesired(row),
    };
  }

  /**
   * Uzun-polling uchun BITTA suratga olish: sozlamalar + qurilmalar + version +
   * `timeSensitive`.
   *
   * `timeSensitive` — klubda hozir VAQTGA bog'liq o'tish kutilyaptimi (grace
   * oynasi ochiq yoki bron oldidan yoqish oynasi ichida bron bor). Kutilmasa
   * uzun-polling kerakli holatni har soniyada emas, kamroq qayta hisoblaydi:
   * DB dagi har qanday o'zgarish baribir `pokeClub` bilan DARHOL uyg'otadi,
   * shuning uchun javob tezligi yomonlashmaydi, 24/7 DB yuki esa kamayadi.
   */
  async bridgeState(clubId: number): Promise<LightBridgeState> {
    const settings = await this.clubLightSettings(clubId);
    const tag = this.settingsTag(settings);

    // Rejim 'bridge' bo'lmasa agentga bo'sh ro'yxat beriladi (relega tegilmaydi)
    if (settings.mode !== LightMode.BRIDGE) {
      return { settings, devices: [], version: this.stateVersion([], tag), timeSensitive: false };
    }

    const rows = await this.desiredRows(clubId);
    const devices = rows.map((row) => this.toDeviceState(row));
    return {
      settings,
      devices,
      version: this.stateVersion(devices, tag),
      // Override MUDDATI tugashi ham vaqtga bog'liq o'tish: u tugagach DB da hech
      // narsa o'zgarmaydi va `pokeClub` chaqirilmaydi, shuning uchun bunday klubda
      // qadam qisqartirilmasa chiroq avtomatik holatga kech qaytardi
      timeSensitive: rows.some((row) => row.graceActive || row.preOnActive || row.overrideActive),
    };
  }

  /**
   * Uzun-polling versiyasiga qo'shiladigan sozlama "belgisi": rejim, majburiy
   * sinxronizatsiya oralig'i va verify o'zgarsa ham agent yangi javob oladi.
   */
  settingsTag(settings: ClubLightSettings): string {
    return `${settings.mode}:${settings.forceSyncSec}:${settings.verify ? 1 : 0}`;
  }

  /**
   * Kerakli ro'yxatning barqaror sha1 xeshi — bridge uzun-pollingi shunga tayanadi.
   * Xeshga faqat `desired` emas, ULANISH maydonlari ham kiradi: admin manzilni
   * yoki drayverni o'zgartirsa ham agent darhol yangi ro'yxatni oladi.
   * `extra` — ro'yxatdan tashqaridagi qiymatlar (forceSyncMs, verify).
   */
  stateVersion(devices: LightDeviceState[], extra = ''): string {
    const payload = [...devices]
      .sort((a, b) => a.tableId - b.tableId)
      .map((device) =>
        [
          device.tableId,
          device.desired ? 1 : 0,
          device.driver,
          device.host,
          device.channel,
          device.inverted ? 1 : 0,
          device.auth ?? '',
          device.onUrl ?? '',
          device.offUrl ?? '',
          device.config ? JSON.stringify(device.config) : '',
        ].join('|'),
      )
      .join(';');
    return createHash('sha1').update(`${extra}#${payload}`).digest('hex');
  }

  /**
   * Klubning chiroq sozlamalari (30 s kesh): rejim, pauza qoidasi, grace,
   * bron oldidan yoqish, majburiy sinxronizatsiya oralig'i va verify.
   * HECH QACHON throw qilmaydi — DB xatosi bo'lsa eski kesh yoki standart qiymat.
   */
  async clubLightSettings(clubId: number): Promise<ClubLightSettings> {
    const cached = this.settingsCache.get(clubId);
    if (cached && Date.now() - cached.loadedAt < SETTINGS_CACHE_TTL_MS) return cached.value;

    try {
      const settings = await this.settingsRepo.findOne({
        where: { clubId },
        select: {
          id: true,
          lightMode: true,
          lightOffOnPause: true,
          lightOffDelaySec: true,
          lightPreOnMinutes: true,
          lightForceSyncSec: true,
          lightVerify: true,
        },
      });
      const value = this.toClubSettings(settings);
      this.settingsCache.set(clubId, { value, loadedAt: Date.now() });
      return value;
    } catch (err) {
      // DB xatosi chiroq tufayli asosiy oqimga chiqmasin — eski kesh yoki standart
      this.logger.error(`Chiroq sozlamalari o'qilmadi (club=${clubId}): ${(err as Error).message}`);
      return cached?.value ?? this.toClubSettings(null);
    }
  }

  /** Klub chiroq rejimi — sozlamalar yo'q yoki xato bo'lsa 'off' */
  async clubLightMode(clubId: number): Promise<LightMode> {
    return (await this.clubLightSettings(clubId)).mode;
  }

  /** Sozlama o'zgarganda keshni darhol bekor qilish uchun */
  invalidateModeCache(clubId: number): void {
    this.settingsCache.delete(clubId);
  }

  // ---------------------------------------------------------------------------
  // Tezkor uyg'otish (instant wake)
  // ---------------------------------------------------------------------------

  /**
   * Klub holati o'zgardi — shu klubning uzun-pollinglarini DARHOL uyg'otadi.
   * HECH QACHON throw qilmaydi (sessiya oqimidan ham chaqirilishi mumkin).
   *
   * Ko'p instansiyali deploy uchun bu YAGONA mexanizm emas: uzun-polling baribir
   * har POLL_STEP_MS da kerakli holatni qayta hisoblaydi — uyg'otish faqat
   * kechikishni qisqartiradi.
   */
  pokeClub(clubId: number): void {
    try {
      const bucket = this.waiters.get(clubId);
      if (!bucket || bucket.size === 0) return;
      // Avval ro'yxatdan olib tashlaymiz: resolverlar ichida qayta yozilmasin
      this.waiters.delete(clubId);
      for (const wake of [...bucket]) {
        try {
          wake();
        } catch {
          // Bitta kutuvchining xatosi qolganlarini uyg'otishga halaqit bermasin
        }
      }
    } catch (err) {
      this.logger.warn(`Uyg'otish xatosi (club=${clubId}): ${(err as Error).message}`);
    }
  }

  /**
   * Uyg'otishni yoki `ms` tugashini kutadi (qaysi biri avval bo'lsa).
   * Chegaradan ortiq kutuvchi bo'lsa oddiy taymer bilan kutiladi — bitta klub
   * cheksiz resolverlar to'plab qo'ymasin.
   */
  waitForChange(clubId: number, ms: number): Promise<void> {
    const delay = Math.max(0, ms);
    return new Promise<void>((resolve) => {
      let bucket = this.waiters.get(clubId);
      if (bucket && bucket.size >= MAX_WAITERS_PER_CLUB) {
        const plain = setTimeout(resolve, delay);
        if (typeof plain.unref === 'function') plain.unref();
        return;
      }
      if (!bucket) {
        bucket = new Set<() => void>();
        this.waiters.set(clubId, bucket);
      }

      const owned = bucket;
      let timer: NodeJS.Timeout | undefined;
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        owned.delete(finish);
        // Faqat O'ZIMIZNING to'plamimiz bo'sh qolgan bo'lsa kalitni tozalaymiz
        if (owned.size === 0 && this.waiters.get(clubId) === owned) this.waiters.delete(clubId);
        resolve();
      };

      owned.add(finish);
      timer = setTimeout(finish, delay);
      // Node jarayoni faqat shu taymer uchun tirik turmasin
      if (typeof timer.unref === 'function') timer.unref();
    });
  }

  // ---------------------------------------------------------------------------
  // Klub paneli: ko'rinish va sozlamalar
  // ---------------------------------------------------------------------------

  /**
   * Panel uchun to'liq ko'rinish: klub rejimi, agent holati va BARCHA stollar
   * (chiroq ulanmaganlari ham — ularni shu yerdan sozlash mumkin).
   * Sozlamalar keshdan emas, DB dan o'qiladi — panel doim yangi qiymatni ko'rsatsin.
   */
  async overview(clubId: number): Promise<LightOverview> {
    const settings = await this.settingsRepo.findOne({ where: { clubId } });
    const resolved = this.toClubSettings(settings);

    const rows: PanelRow[] = await this.dataSource.query(
      `SELECT t.id                                   AS "tableId",
              t.number                               AS "tableNumber",
              t.name                                 AS "tableName",
              t."isActive"                           AS "isActive",
              t."lightDriver"                        AS "driver",
              t."lightHost"                          AS "host",
              t."lightChannel"                       AS "channel",
              t."lightInverted"                      AS "inverted",
              (t."lightAuth" IS NOT NULL)            AS "hasAuth",
              t."lightOnUrl"                         AS "onUrl",
              t."lightOffUrl"                        AS "offUrl",
              t."lightConfig"                        AS "config",
              t."lightOverrideOn"                    AS "overrideOn",
              t."lightOverrideUntil"                 AS "overrideUntil",
              (t."lightOverrideUntil" IS NOT NULL
                 AND t."lightOverrideUntil" > now()) AS "overrideActive",
              t."lightState"                         AS "state",
              t."lightSyncedAt"                      AS "syncedAt",
              t."lightError"                         AS "error",
              s.status                               AS "sessionStatus",
              COALESCE(st."lightOffOnPause", false)  AS "offOnPause",
              (fin."endTime" IS NOT NULL AND COALESCE(st."lightOffDelaySec", 0) > 0
                 AND fin."endTime" > now() - make_interval(secs => COALESCE(st."lightOffDelaySec", 0)))
                                                     AS "graceActive",
              (res.id IS NOT NULL AND COALESCE(st."lightPreOnMinutes", 0) > 0)
                                                     AS "preOnActive",
              COALESCE(st."lightOffDelaySec", 0)     AS "offDelaySec",
              COALESCE(st."lightPreOnMinutes", 0)    AS "preOnMinutes"
       FROM tables t
       LEFT JOIN settings st ON st."clubId" = t."clubId"
       LEFT JOIN LATERAL (
         SELECT se.status
         FROM sessions se
         WHERE se."tableId" = t.id AND se.status IN ('active', 'paused')
         ORDER BY (se.status = 'active') DESC, se."startTime" DESC
         LIMIT 1
       ) s ON true
       LEFT JOIN LATERAL (
         SELECT se."endTime"
         FROM sessions se
         WHERE se."tableId" = t.id
           -- Grace o'chiq bo'lsa sessiyalar jadvaliga umuman kirilmaydi
           AND COALESCE(st."lightOffDelaySec", 0) > 0
           AND se.status IN ('completed', 'cancelled')
           AND se."endTime" IS NOT NULL
         ORDER BY se."endTime" DESC
         LIMIT 1
       ) fin ON true
       LEFT JOIN LATERAL (
         SELECT r.id
         FROM reservations r
         WHERE r."tableId" = t.id
           -- "Bron oldidan yoqish" o'chiq bo'lsa bronlar ham qidirilmaydi
           AND COALESCE(st."lightPreOnMinutes", 0) > 0
           AND r.status IN ('pending', 'confirmed')
           AND r."startsAt" > now()
           AND r."startsAt" <= now() + make_interval(mins => COALESCE(st."lightPreOnMinutes", 0))
         LIMIT 1
       ) res ON true
       WHERE t."clubId" = $1
       ORDER BY t.number, t.id`,
      [clubId],
    );

    return {
      mode: resolved.mode,
      offOnPause: resolved.offOnPause,
      offDelaySec: resolved.offDelaySec,
      preOnMinutes: resolved.preOnMinutes,
      forceSyncSec: resolved.forceSyncSec,
      verify: resolved.verify,
      serverNow: new Date().toISOString(),
      forceSyncMs: resolved.forceSyncSec * 1000,
      bridge: await this.bridgeStatus(clubId),
      tables: rows.map((row) => ({
        tableId: Number(row.tableId),
        tableNumber: Number(row.tableNumber),
        tableName: row.tableName,
        isActive: row.isActive,
        driver: row.driver,
        host: row.host,
        channel: Number(row.channel),
        inverted: row.inverted,
        hasAuth: row.hasAuth,
        onUrl: row.onUrl,
        offUrl: row.offUrl,
        config: row.config ?? null,
        overrideOn: row.overrideOn,
        overrideUntil: row.overrideUntil,
        overrideActive: row.overrideActive,
        state: row.state,
        syncedAt: row.syncedAt,
        error: row.error,
        sessionStatus: row.sessionStatus,
        desired: this.resolveDesired(row),
      })),
    };
  }

  /** Klub agentining holati (token qaytarilmaydi) */
  async bridgeStatus(clubId: number): Promise<LightBridgeStatus> {
    const bridge = await this.bridgeRepo.findOne({ where: { clubId } });
    if (!bridge) {
      return { exists: false, name: null, lastSeenAt: null, online: false, agentVersion: null };
    }
    const lastSeenMs = bridge.lastSeenAt ? new Date(bridge.lastSeenAt).getTime() : 0;
    return {
      exists: true,
      name: bridge.name,
      lastSeenAt: bridge.lastSeenAt,
      online: bridge.isActive && Date.now() - lastSeenMs < BRIDGE_ONLINE_MS,
      agentVersion: bridge.agentVersion,
    };
  }

  /**
   * Klubning chiroq sozlamalari. Sozlamalar yozuvi bo'lmasa yaratiladi
   * (settings.service dagi kabi, parallel so'rovga chidamli).
   */
  async updateSettings(
    clubId: number,
    dto: UpdateLightSettingsDto,
  ): Promise<ClubLightSettings> {
    let settings = await this.settingsRepo.findOne({ where: { clubId } });
    if (!settings) {
      try {
        settings = await this.settingsRepo.save({ clubId });
      } catch (err) {
        settings = await this.settingsRepo.findOne({ where: { clubId } });
        if (!settings) throw err;
      }
    }

    settings.lightMode = dto.mode;
    // NOT NULL ustunlar: @IsOptional() literal `null` ni ham o'tkazib yuboradi,
    // shuning uchun `!= null` (undefined ham, null ham e'tiborsiz qoldiriladi)
    if (dto.offOnPause != null) settings.lightOffOnPause = dto.offOnPause;
    if (dto.offDelaySec != null) settings.lightOffDelaySec = dto.offDelaySec;
    if (dto.preOnMinutes != null) settings.lightPreOnMinutes = dto.preOnMinutes;
    if (dto.forceSyncSec != null) settings.lightForceSyncSec = dto.forceSyncSec;
    if (dto.verify != null) settings.lightVerify = dto.verify;
    const saved = await this.settingsRepo.save(settings);

    // Kesh darhol bekor qilinadi, agentlar uyg'otiladi, so'ng fon rejimida
    // moslashtirish (kutilmaydi — sozlama saqlash chiroq tufayli sekinlashmasin)
    this.invalidateModeCache(clubId);
    this.pokeClub(clubId);
    void this.syncClub(clubId, 'settings');

    return this.toClubSettings(saved);
  }

  /**
   * Stolning rele sozlamalari. Faqat yuborilgan maydonlar yangilanadi;
   * bo'sh satr yoki null — qiymatni tozalaydi.
   * Manzil FORMATI va drayverga xos maydonlar shu yerda tekshiriladi; DIRECT
   * rejimdagi "faqat lokal IP" cheklovi buyruq yuborilayotganda (applyDevice)
   * qo'llanadi — rejim keyin o'zgarishi mumkinligi uchun.
   */
  async updateTableDevice(
    clubId: number,
    tableId: number,
    dto: UpdateTableLightDto,
  ): Promise<LightTableConfig> {
    // Ulanish maydonlari (auth/host/URL/config) entityda `select: false` — bu yerda
    // ataylab qo'shib o'qiymiz: yuborilmagan maydon eski qiymatida qolsin va
    // javobdagi `hasAuth` to'g'ri hisoblansin
    const table = await this.findTableWithAuth(clubId, tableId);
    if (!table) throw new NotFoundException({ key: 'tables.notFound' });

    // `channel`/`inverted` — NOT NULL ustunlar: `!= null` (undefined ham, null
    // ham eski qiymatni qoldiradi). Qolganlari nullable — ular `!== undefined`
    // bo'yicha tozalanishi mumkin (normalizeText null ni ham qabul qiladi).
    const next = {
      driver: dto.driver ?? table.lightDriver,
      host: dto.host !== undefined ? normalizeText(dto.host) : table.lightHost,
      channel: dto.channel != null ? dto.channel : table.lightChannel,
      inverted: dto.inverted != null ? dto.inverted : table.lightInverted,
      auth: dto.auth !== undefined ? normalizeText(dto.auth) : table.lightAuth,
      onUrl: dto.onUrl !== undefined ? normalizeText(dto.onUrl) : table.lightOnUrl,
      offUrl: dto.offUrl !== undefined ? normalizeText(dto.offUrl) : table.lightOffUrl,
      config:
        dto.config !== undefined
          ? this.sanitizeConfig(dto.config)
          : this.sanitizeConfig(table.lightConfig),
    };

    if (next.host && !isValidHost(next.host)) {
      throw new BadRequestException({ key: 'lights.invalidHost' });
    }

    // Klub 'direct' rejimida bo'lsa MQTT/TCP/Modbus/serial drayverlarini
    // saqlashga ruxsat berilmaydi — bulut server ularni bajara olmaydi
    if (
      next.driver !== LightDriver.NONE &&
      BRIDGE_ONLY_DRIVERS.includes(next.driver) &&
      (await this.clubLightMode(clubId)) === LightMode.DIRECT
    ) {
      throw new BadRequestException({ key: 'lights.driverBridgeOnly' });
    }

    this.assertDeviceConfig(next.driver, next.host, next.onUrl, next.offUrl, next.config);

    table.lightDriver = next.driver;
    table.lightHost = next.host;
    table.lightChannel = next.channel;
    table.lightInverted = next.inverted;
    table.lightAuth = next.auth;
    table.lightOnUrl = next.onUrl;
    table.lightOffUrl = next.offUrl;
    table.lightConfig = next.config;
    // Sozlama o'zgardi — oldingi holat/xato endi ishonchsiz, qayta sinxronlanadi
    table.lightState = null;
    table.lightSyncedAt = null;
    table.lightError = null;

    const saved = await this.tableRepo.save(table);
    // Sozlama o'zgardi (masalan `inverted` to'g'rilandi) — drift "tinch qo'yish"
    // belgisi ham bekor qilinadi, aks holda tuzatish keyingi oynagacha kutardi
    this.driftGuard.delete(this.driftKey(clubId, tableId));
    // Javob kutilmaydi — chiroq hech qachon so'rovni sekinlashtirmasligi kerak
    this.pokeClub(clubId);
    void this.syncTable(clubId, tableId, 'settings');
    return this.toConfig(saved);
  }

  // ---------------------------------------------------------------------------
  // Sinxronlash (DIRECT rejim)
  // ---------------------------------------------------------------------------

  /**
   * Bitta stolning chirog'ini kerakli holatga keltiradi.
   * BRIDGE rejimida darhol qaytadi — agent holatni o'zi olib qo'llaydi.
   * HECH QACHON throw qilmaydi (sessiya amallaridan fire-and-forget chaqirish uchun).
   */
  async syncTable(
    clubId: number,
    tableId: number,
    source: LightEventSource = 'session',
    userId: number | null = null,
  ): Promise<void> {
    try {
      const settings = await this.clubLightSettings(clubId);
      if (settings.mode !== LightMode.DIRECT) return;

      const devices = await this.desiredState(clubId);
      const device = devices.find((item) => item.tableId === tableId);
      if (!device) return;

      await this.applyDevice(clubId, device, {
        source,
        userId,
        verify: settings.verify,
        forceSyncMs: settings.forceSyncSec * 1000,
      });
    } catch (err) {
      this.logger.error(
        `Chiroqni sinxronlash xatosi (club=${clubId}, table=${tableId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Sessiya amali (boshlash / pauza / davom ettirish / transfer / yakunlash /
   * bekor qilish) sodir bo'lgach chaqiriladi.
   *
   * Avval QO'LDA BOSHQARUV (override) bekor qilinadi, keyin chiroq avtomatik
   * holatga keltiriladi. Sababi: kassir bo'sh stolda chiroqni qo'lda o'chirsa,
   * override 30 daqiqa amal qilardi va shu oraliqda BOSHLANGAN o'yin davomida
   * stol qorong'i qolardi. Sessiya amali — foydalanuvchining aniq niyati,
   * shuning uchun undan keyin doim avtomatika ustun turadi.
   *
   * HECH QACHON throw qilmaydi (sessiya oqimidan fire-and-forget chaqiriladi).
   */
  async onSessionChanged(clubId: number, tableId: number): Promise<void> {
    try {
      // Faqat override o'rnatilgan bo'lsa yoziladi — ortiqcha UPDATE qilinmaydi
      await this.tableRepo.update(
        { id: tableId, clubId, lightOverrideUntil: Not(IsNull()) },
        { lightOverrideOn: null, lightOverrideUntil: null },
      );
    } catch (err) {
      this.logger.error(
        `Chiroq override'ini bekor qilib bo'lmadi (club=${clubId}, table=${tableId}): ${(err as Error).message}`,
      );
    }
    // Agent uzun-pollingi DARHOL uyg'onsin — o'yin boshlanishi bilan chiroq yonadi
    this.pokeClub(clubId);
    await this.syncTable(clubId, tableId, 'session');
  }

  /**
   * DIRECT rejimda klubning barcha chiroqlarini moslashtiradi.
   * Oxirgi ma'lum holat kerakli holatga teng va yaqinda muvaffaqiyatli qo'llangan
   * bo'lsa — qayta yuborilmaydi (rele bekorga bezovta qilinmasin), aks holda
   * qayta qo'llanadi. Majburiy takrorlash oralig'i klub sozlamasidan
   * (`lightForceSyncSec`) olinadi.
   */
  async syncClub(clubId: number, source: LightEventSource = 'sync'): Promise<void> {
    if (this.syncingClubs.has(clubId)) return;
    this.syncingClubs.add(clubId);
    try {
      const settings = await this.clubLightSettings(clubId);
      if (settings.mode !== LightMode.DIRECT) return;

      const devices = await this.desiredState(clubId);
      if (devices.length === 0) return;

      const known = await this.lastKnownStates(clubId);
      const now = Date.now();
      const forceSyncMs = settings.forceSyncSec * 1000;

      const pending = devices.filter((device) => {
        const state = known.get(device.tableId);
        const syncedAt = state?.lightSyncedAt ? new Date(state.lightSyncedAt).getTime() : 0;
        // Holat mos va yaqinda muvaffaqiyatli qo'llangan bo'lsa — tegilmaydi
        return !(
          !state?.lightError &&
          state?.lightState === device.desired &&
          now - syncedAt < forceSyncMs
        );
      });
      if (pending.length === 0) return;

      // Parallel: javob bermaydigan bitta rele qolganlarini kutdirib qo'ymasin
      await Promise.allSettled(
        pending.map((device) =>
          this.applyDevice(clubId, device, {
            source,
            userId: null,
            verify: settings.verify,
            forceSyncMs,
          }),
        ),
      );
    } catch (err) {
      this.logger.error(
        `Klub chiroqlarini sinxronlash xatosi (club=${clubId}): ${(err as Error).message}`,
      );
    } finally {
      this.syncingClubs.delete(clubId);
    }
  }

  /**
   * Har 30 soniyada FAQAT lightMode='direct' klublarni moslashtiradi.
   * BRIDGE rejimidagi klublar bu yerda umuman qatnashmaydi — ular uchun agent
   * o'zi uzun-polling qiladi. Grace/bron oldidan yoqish vaqtga bog'liq bo'lgani
   * uchun bu cron ularni ham ushlaydi. Butun tanasi try/catch ichida.
   */
  @Cron('*/30 * * * * *')
  async reconcile(): Promise<void> {
    if (this.reconcileRunning) return;
    this.reconcileRunning = true;
    try {
      const rows: Array<{ clubId: number }> = await this.dataSource.query(
        `SELECT s."clubId" AS "clubId" FROM settings s WHERE s."lightMode" = 'direct'`,
      );
      // Klublar 5 talik bo'laklarda PARALLEL yuritiladi: javob bermaydigan bitta
      // klub (rele osilib qolgan) qolganlarini kechiktirib qo'ymasin.
      // Bo'lak hajmi cheklangan — bir vaqtda ochiladigan ulanishlar ko'paymasin.
      for (let index = 0; index < rows.length; index += RECONCILE_CHUNK) {
        const chunk = rows.slice(index, index + RECONCILE_CHUNK);
        // syncClub o'zi ichida xatolarni yutadi — allSettled qo'shimcha himoya
        await Promise.allSettled(chunk.map((row) => this.syncClub(Number(row.clubId), 'sync')));
      }
    } catch (err) {
      this.logger.error(`Chiroq reconcile xatosi: ${(err as Error).message}`);
    } finally {
      this.reconcileRunning = false;
    }
  }

  /**
   * Kunlik tozalash: diagnostika jurnalining 30 kundan eski yozuvlari,
   * muddati o'tgan agent vazifalari va xotiradagi eskirgan belgilar o'chiriladi.
   *
   * O'chirish 5000 talik BO'LAKLARDA bajariladi: bitta ulkan DELETE uzoq
   * tranzaksiya ochib, jadvalni bloklab turardi. Filtr "at" bo'yicha —
   * unga migratsiyada alohida indeks qo'shilgan (seq scan bo'lmasin).
   * Butun tanasi try/catch ichida — hech qachon jarayonni to'xtatmaydi.
   */
  @Cron('0 20 3 * * *')
  async cleanupEvents(): Promise<void> {
    try {
      let total = 0;
      for (let step = 0; step < EVENTS_CLEANUP_MAX_STEPS; step += 1) {
        const result: unknown = await this.dataSource.query(
          `DELETE FROM table_light_events
           WHERE id IN (
             SELECT id FROM table_light_events
             WHERE "at" < now() - make_interval(days => $1)
             LIMIT $2
           )`,
          [EVENTS_RETENTION_DAYS, EVENTS_CLEANUP_BATCH],
        );
        // node-postgres DELETE uchun [rows, affected] qaytaradi
        const affected = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
        total += affected;
        // Bo'lak to'lmadi — eski yozuv qolmadi
        if (affected < EVENTS_CLEANUP_BATCH) break;
      }
      if (total > 0) {
        this.logger.log(`Chiroq jurnali tozalandi: ${total} ta eski yozuv o'chirildi`);
      }
    } catch (err) {
      this.logger.error(`Chiroq jurnalini tozalash xatosi: ${(err as Error).message}`);
    }
    await this.pruneExpiredTasks();
    this.pruneDriftGuard();
  }

  // ---------------------------------------------------------------------------
  // Qo'lda boshqaruv va sinov
  // ---------------------------------------------------------------------------

  /**
   * Qo'lda boshqaruv (override): on=null bo'lsa bekor qilinadi va chiroq
   * avtomatik (sessiyaga bog'liq) holatga qaytadi. Aks holda `minutes` davomida
   * berilgan qiymat ustun turadi. Sinxronlash kutilmaydi (fire-and-forget).
   */
  async setOverride(
    clubId: number,
    tableId: number,
    on: boolean | null,
    minutes: number,
    userId: number | null = null,
  ): Promise<Table> {
    // toConfig() dagi `hasAuth`/`config` to'g'ri qaytishi uchun yopiq ustunlar ham o'qiladi
    const table = await this.findTableWithAuth(clubId, tableId);
    if (!table) throw new NotFoundException({ key: 'tables.notFound' });

    if (on === null) {
      table.lightOverrideOn = null;
      table.lightOverrideUntil = null;
    } else {
      const safeMinutes = Math.min(
        Math.max(Math.round(Number(minutes) || 0), OVERRIDE_MIN_MINUTES),
        OVERRIDE_MAX_MINUTES,
      );
      table.lightOverrideOn = on;
      table.lightOverrideUntil = new Date(Date.now() + safeMinutes * 60_000);
    }

    const saved = await this.tableRepo.save(table);

    // Qo'lda aralashuv — DOIM jurnalga yoziladi (rejimdan qat'i nazar)
    void this.logEvent({
      clubId,
      tableId,
      isOn: on,
      source: 'override',
      ok: true,
      error: null,
      userId,
    });

    // Agent darhol uyg'onsin, javob esa kutilmaydi
    this.pokeClub(clubId);
    void this.syncTable(clubId, tableId, 'override', userId);
    return saved;
  }

  /**
   * Master boshqaruv: klubning BARCHA chiroq ulangan faol stollariga bir vaqtda
   * override qo'yadi (on=true/false) yoki hammasini avtomatikaga qaytaradi
   * (on=null). Zalni yopish/ochish paytida bitta tugma bilan boshqarish uchun.
   * Qaytadi: nechta stol o'zgardi.
   */
  async setOverrideAll(
    clubId: number,
    on: boolean | null,
    minutes: number,
    userId: number | null = null,
  ): Promise<number> {
    const safeMinutes = Math.min(
      Math.max(Math.round(Number(minutes) || 0), OVERRIDE_MIN_MINUTES),
      OVERRIDE_MAX_MINUTES,
    );

    // Faqat chiroq sozlangan faol stollar (qolganlarida override ma'nosiz)
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `SELECT t.id
       FROM tables t
       WHERE t."clubId" = $1 AND t."isActive" = true AND t."lightDriver" <> 'none'
       ORDER BY t.id`,
      [clubId],
    );
    const ids = rows.map((row) => Number(row.id));
    if (ids.length === 0) return 0;

    await this.tableRepo.update(
      { clubId, isActive: true, lightDriver: Not(LightDriver.NONE) },
      on === null
        ? { lightOverrideOn: null, lightOverrideUntil: null }
        : {
            lightOverrideOn: on,
            lightOverrideUntil: new Date(Date.now() + safeMinutes * 60_000),
          },
    );

    // Bitta insert bilan barcha stollar uchun jurnal yozuvi
    void this.logEvents(
      ids.map((tableId) => ({
        clubId,
        tableId,
        isOn: on,
        source: 'master' as LightEventSource,
        ok: true,
        error: null,
        userId,
      })),
    );

    this.pokeClub(clubId);
    void this.syncClub(clubId, 'master');
    return ids.length;
  }

  /**
   * Qurilmani sinash.
   *  - DIRECT: server relega o'zi murojaat qiladi, natija DARHOL qaytadi.
   *  - BRIDGE: bulut server lokal tarmoqqa chiqa olmaydi, shuning uchun sinov
   *    5 daqiqalik override qo'yish orqali bajariladi: kerakli holat o'zgaradi ->
   *    version o'zgaradi -> agent uzun-pollingdan darhol uyg'onib qo'llaydi.
   *    Javobda agentning OXIRGI hisoboti qaytariladi; haqiqiy natija bir necha
   *    soniyadan keyin stol yozuvida (lightState/lightError) ko'rinadi.
   */
  async testDevice(
    clubId: number,
    tableId: number,
    on: boolean,
    userId: number | null = null,
  ): Promise<{ ok: boolean; error: string | null; reason: LightTestReason }> {
    // DIRECT rejimda relega auth/config kerak — yopiq ustunlarni ataylab o'qiymiz
    const table = await this.findTableWithAuth(clubId, tableId);
    if (!table) throw new NotFoundException({ key: 'tables.notFound' });
    if (table.lightDriver === LightDriver.NONE) {
      return {
        ok: false,
        error: 'Bu stolda chiroq sozlanmagan (drayver: none)',
        reason: 'not_configured',
      };
    }

    const settings = await this.clubLightSettings(clubId);
    if (settings.mode === LightMode.OFF) {
      return { ok: false, error: "Chiroq boshqaruvi o'chirilgan (rejim: off)", reason: 'mode_off' };
    }

    if (settings.mode === LightMode.DIRECT) {
      const error = await this.applyDevice(clubId, this.toDevice(table, on), {
        source: 'test',
        userId,
        verify: settings.verify,
        always: true,
        forceSyncMs: settings.forceSyncSec * 1000,
      });
      // Sinovdan keyin qurilma holati kerakli holatdan farq qilishi mumkin —
      // paneldagi/agentdagi kuzatuvchilar buni darhol ko'rsin
      this.pokeClub(clubId);
      return { ok: error === null, error, reason: error === null ? null : 'unreachable' };
    }

    // BRIDGE: buyruqni agentga override orqali yetkazamiz
    await this.setOverride(clubId, tableId, on, TEST_OVERRIDE_MINUTES, userId);
    return { ok: table.lightError === null, error: table.lightError, reason: 'queued' };
  }

  // ---------------------------------------------------------------------------
  // Diagnostika jurnali
  // ---------------------------------------------------------------------------

  /**
   * Oxirgi hodisalar (eng yangisi birinchi). Faqat shu klubning yozuvlari.
   * `limit` controllerda 1..200 oralig'ida tekshiriladi, bu yerda ham cheklanadi.
   */
  async events(clubId: number, limit = 50, tableId?: number): Promise<LightEventView[]> {
    const safeLimit = Math.min(Math.max(Math.round(Number(limit) || 0), 1), 200);
    const params: unknown[] = [clubId];
    let filter = '';
    if (tableId != null && Number.isInteger(tableId) && tableId > 0) {
      params.push(tableId);
      filter = ` AND e."tableId" = $${params.length}`;
    }
    params.push(safeLimit);

    const rows: LightEventView[] = await this.dataSource.query(
      `SELECT e.id            AS "id",
              e."at"          AS "at",
              e."tableId"     AS "tableId",
              t.number        AS "tableNumber",
              t.name          AS "tableName",
              e."isOn"        AS "isOn",
              e."source"      AS "source",
              e."ok"          AS "ok",
              e."error"       AS "error",
              u.name          AS "userName"
       FROM table_light_events e
       JOIN tables t ON t.id = e."tableId"
       LEFT JOIN users u ON u.id = e."userId"
       WHERE e."clubId" = $1${filter}
       ORDER BY e."at" DESC, e.id DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      id: Number(row.id),
      at: row.at,
      tableId: Number(row.tableId),
      tableNumber: Number(row.tableNumber),
      tableName: row.tableName,
      isOn: row.isOn,
      source: row.source,
      ok: row.ok,
      error: row.error,
      userName: row.userName,
    }));
  }

  // ---------------------------------------------------------------------------
  // Qurilma qidirish (discover) — navbat va natija `club_bridges` jadvalida
  //
  // Ilgari ular jarayon XOTIRASIDA edi: ko'p instansiyali deployda vazifa
  // boshqa instansiyaga kelgan agentga yetib bormasdi, panel esa `queued: true`
  // deb ko'rsatardi. Endi navbat DB da va vazifa TASDIQLANMAGUNCHA saqlanadi:
  // natija kelmasa yoki javob yo'qolsa u agentga qayta beriladi.
  // ---------------------------------------------------------------------------

  /**
   * Qidiruvni navbatga qo'yadi. Skanni faqat klubdagi agent bajara oladi
   * (bulut server LAN ni ko'rmaydi), shuning uchun agent umuman ulanmagan bo'lsa
   * vazifa yaratilmaydi.
   */
  async queueDiscover(
    clubId: number,
    subnet?: string,
  ): Promise<{ queued: boolean; bridgeOnline: boolean }> {
    const bridge = await this.bridgeStatus(clubId);
    if (!bridge.exists) return { queued: false, bridgeOnline: false };

    const clean = normalizeText(subnet)?.slice(0, 20) ?? null;
    await this.dataSource.query(
      `UPDATE club_bridges
       SET "pendingTaskId" = $2,
           "pendingTaskType" = 'discover',
           "pendingTaskSubnet" = $3,
           "pendingTaskAt" = now(),
           -- Yangi vazifa: oldingi "olingan" belgisi tozalanadi
           "taskStartedAt" = NULL
       WHERE "clubId" = $1`,
      [clubId, randomBytes(8).toString('hex'), clean],
    );

    // Agent uzun-pollingi darhol uyg'onsin — vazifa bir zumda yetib boradi
    this.pokeClub(clubId);
    return { queued: true, bridgeOnline: bridge.online };
  }

  /**
   * Klub uchun agent olishi kerak bo'lgan vazifa bormi (uzun-pollingni uzish uchun).
   * HECH QACHON throw qilmaydi — uzun-polling siklidan chaqiriladi.
   */
  async hasPendingTasks(clubId: number): Promise<boolean> {
    try {
      const rows: Array<{ id: number }> = await this.dataSource.query(
        `SELECT b.id FROM club_bridges b
         WHERE b."clubId" = $1 ${TASK_TAKEABLE_SQL}
         LIMIT 1`,
        [clubId],
      );
      return rows.length > 0;
    } catch (err) {
      this.logger.warn(
        `Vazifa navbatini o'qib bo'lmadi (club=${clubId}): ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Vazifalarni agentga BERADI. Vazifa navbatdan O'CHIRILMAYDI — faqat
   * `taskStartedAt` qo'yiladi: javob yo'lda yo'qolsa (yoki agent qayta ishga
   * tushsa) vazifa TASK_RETAKE_MS dan keyin qayta beriladi. Navbatdan chiqishi
   * uchun natija kelishi (`saveDiscovered`) yoki muddati o'tishi kerak.
   *
   * UPDATE ... RETURNING atomar: ikkita instansiya bir vaqtda so'rasa ham
   * vazifa faqat bittasiga tegadi.
   */
  async takeTasks(clubId: number): Promise<LightBridgeTask[]> {
    try {
      const rows: Array<{
        pendingTaskId: string;
        pendingTaskType: string | null;
        pendingTaskSubnet: string | null;
      }> = await this.dataSource.query(
        `UPDATE club_bridges
         SET "taskStartedAt" = now()
         WHERE "clubId" = $1 ${TASK_TAKEABLE_SQL}
         RETURNING "pendingTaskId", "pendingTaskType", "pendingTaskSubnet"`,
        [clubId],
      );
      return rows
        // Hozircha yagona tur — notanish turdagi yozuv agentga berilmaydi
        // (u muddati o'tguncha navbatda qoladi va keyin tozalanadi)
        .filter((row) => (row.pendingTaskType ?? 'discover') === 'discover')
        .map((row) => ({
          id: row.pendingTaskId,
          type: 'discover' as const,
          ...(row.pendingTaskSubnet ? { subnet: row.pendingTaskSubnet } : {}),
        }));
    } catch (err) {
      this.logger.warn(`Vazifani berib bo'lmadi (club=${clubId}): ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Agent yuborgan qidiruv natijasi. Natija `club_bridges."lastDiscover"` ga
   * yoziladi (vaqtinchalik yordamchi ma'lumot, `{ subnet, devices }` shaklida)
   * va shu bilan vazifa navbatdan CHIQADI.
   *
   * Vazifa FAQAT `taskId` aynan mos kelganda yopiladi. `taskId` yuborilmasa
   * (eski agent yoki qayta ishga tushgan agent) navbatdagi vazifaga UMUMAN
   * tegilmaydi — aks holda natija kelgan lahzada admin qo'ygan YANGI qidiruv
   * jimgina o'chib ketardi va skan hech qachon boshlanmasdi.
   */
  async saveDiscovered(
    clubId: number,
    taskId: string | undefined,
    subnet: string | null,
    devices: DiscoveredDevice[],
  ): Promise<number> {
    const limited = devices.slice(0, DISCOVER_MAX_DEVICES);
    try {
      await this.dataSource.query(
        `UPDATE club_bridges
         SET "lastDiscoverAt" = now(),
             "lastDiscover" = $2::jsonb,
             -- Vazifa faqat AYNAN shu natija tegishli bo'lsa yopiladi
             "pendingTaskId" = CASE WHEN "pendingTaskId" = $3::varchar
                                    THEN NULL ELSE "pendingTaskId" END,
             "pendingTaskType" = CASE WHEN "pendingTaskId" = $3::varchar
                                    THEN NULL ELSE "pendingTaskType" END,
             "pendingTaskSubnet" = CASE WHEN "pendingTaskId" = $3::varchar
                                    THEN NULL ELSE "pendingTaskSubnet" END,
             "pendingTaskAt" = CASE WHEN "pendingTaskId" = $3::varchar
                                    THEN NULL ELSE "pendingTaskAt" END,
             "taskStartedAt" = CASE WHEN "pendingTaskId" = $3::varchar
                                    THEN NULL ELSE "taskStartedAt" END
         WHERE "clubId" = $1`,
        [clubId, JSON.stringify({ subnet: subnet ?? null, devices: limited }), taskId ?? null],
      );
    } catch (err) {
      this.logger.warn(
        `Qidiruv natijasini saqlab bo'lmadi (club=${clubId}): ${(err as Error).message}`,
      );
      return 0;
    }
    return limited.length;
  }

  /** Panel uchun qidiruv holati va oxirgi natija */
  async discoverResult(clubId: number): Promise<LightDiscoverResult> {
    const empty: LightDiscoverResult = {
      scannedAt: null,
      running: false,
      subnet: null,
      devices: [],
    };
    try {
      const rows: BridgeTaskRow[] = await this.dataSource.query(
        `SELECT b."lastDiscoverAt", b."lastDiscover",
                -- "ishlamoqda": navbatda muddati o'tmagan vazifa turibdi
                (b."pendingTaskId" IS NOT NULL
                   AND b."pendingTaskAt" > now() - make_interval(secs => $2)) AS "running"
         FROM club_bridges b
         WHERE b."clubId" = $1`,
        [clubId, TASK_TTL_MS / 1000],
      );
      const row = rows[0];
      if (!row) return empty;

      const payload = row.lastDiscover ?? null;
      const devices = Array.isArray(payload?.devices)
        ? (payload.devices as DiscoveredDevice[]).slice(0, DISCOVER_MAX_DEVICES)
        : [];
      return {
        scannedAt: row.lastDiscoverAt ? new Date(row.lastDiscoverAt).toISOString() : null,
        running: row.running === true,
        subnet: payload?.subnet ?? null,
        devices,
      };
    } catch (err) {
      this.logger.warn(
        `Qidiruv natijasini o'qib bo'lmadi (club=${clubId}): ${(err as Error).message}`,
      );
      return empty;
    }
  }

  // ---------------------------------------------------------------------------
  // Hisobot (agent -> server)
  // ---------------------------------------------------------------------------

  /**
   * Agent (yoki DIRECT rejimdagi server) hisobotini stol yozuvlariga yozadi.
   * Boshqa klubning stoli yuborilsa — jimgina o'tkazib yuboriladi (clubId filtri).
   *
   * `actual` (qurilmadan O'QILGAN holat) berilgan bo'lsa `lightState` aynan shu
   * qiymatga yoziladi; u agent qo'llagan holatdan farq qilsa hodisa 'drift'
   * sifatida jurnalga tushadi. Har bir hisobot uchun ortiqcha yozuv YOZILMAYDI —
   * jurnalga faqat holat o'zgargan yoki xato paydo bo'lgan qatorlar tushadi.
   */
  async applyReport(clubId: number, results: LightReportItem[]): Promise<number> {
    let accepted = 0;
    for (const item of results) {
      const tableId = Number(item.tableId);
      if (!Number.isInteger(tableId) || tableId <= 0) continue;

      const actual = item.actual ?? null;
      const on = item.ok ? (actual !== null ? actual : item.on ?? null) : null;
      // 'drift' — qurilmadagi haqiqiy holat kerakli holatdan farq qilgan
      const drifted = item.ok && actual !== null && item.on != null && actual !== item.on;

      if (typeof item.latencyMs === 'number' && item.latencyMs >= SLOW_DEVICE_MS) {
        this.logger.debug(
          `Rele sekin javob berdi (table=${tableId}): ${item.latencyMs} ms, ` +
            `urinishlar: ${item.attempts ?? 1}`,
        );
      }

      const ok = await this.recordResult(
        clubId,
        tableId,
        item.ok,
        on,
        item.ok ? null : this.withAttempts(item.error, item.attempts),
        { source: drifted ? 'drift' : 'sync', userId: null },
      );
      if (ok) accepted += 1;
    }
    return accepted;
  }

  // ---------------------------------------------------------------------------
  // Bridge tokeni
  // ---------------------------------------------------------------------------

  /**
   * Klub uchun yangi bridge tokeni chiqaradi (mavjud yozuv bo'lsa yangilanadi —
   * eski token darhol kuchini yo'qotadi). Xom token DB ga YOZILMAYDI, faqat
   * sha256 xeshi; token UI da bir marta ko'rsatiladi va boshqa tiklanmaydi.
   */
  async issueToken(clubId: number, name?: string): Promise<{ token: string; bridge: ClubBridge }> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);

    let bridge = await this.bridgeRepo.findOne({ where: { clubId } });
    if (bridge) {
      bridge.tokenHash = tokenHash;
      bridge.isActive = true;
      // Yangi token = yangi o'rnatish: eski agent ko'rsatkichlari tozalanadi
      bridge.lastSeenAt = null;
      bridge.agentVersion = null;
      bridge.lastIp = null;
      if (name) bridge.name = name.slice(0, 100);
    } else {
      bridge = this.bridgeRepo.create({
        clubId,
        tokenHash,
        ...(name ? { name: name.slice(0, 100) } : {}),
      });
    }

    const saved = await this.bridgeRepo.save(bridge);
    return { token, bridge: saved };
  }

  /** Xom tokenni sha256 xeshi bo'yicha topish (faqat faol bridge) */
  async findByToken(rawToken: string): Promise<ClubBridge | null> {
    const token = rawToken?.trim();
    if (!token) return null;
    return this.bridgeRepo.findOne({ where: { tokenHash: this.hashToken(token), isActive: true } });
  }

  /** Agent "tirikligi" belgilari — xatosi hech qachon so'rovni buzmaydi */
  async touchBridge(
    bridge: ClubBridge,
    agentVersion?: string | null,
    ip?: string | null,
  ): Promise<void> {
    try {
      await this.bridgeRepo.update(bridge.id, {
        lastSeenAt: new Date(),
        ...(agentVersion ? { agentVersion: agentVersion.slice(0, 30) } : {}),
        ...(ip ? { lastIp: ip.slice(0, 60) } : {}),
      });
    } catch (err) {
      this.logger.warn(
        `Bridge holatini yangilab bo'lmadi (id=${bridge.id}): ${(err as Error).message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Ichki yordamchilar
  // ---------------------------------------------------------------------------

  /**
   * Stol yozuvi + yopiq ulanish maydonlari (`lightAuth`, `lightHost`, shablon
   * URL lar, `lightConfig`) — ular entityda `select: false`, ya'ni oddiy findOne
   * ularni qaytarmaydi. Faqat chiroq oqimining ichida ishlatiladi: bu yerdan
   * olingan entity API javobiga TO'G'RIDAN-TO'G'RI berilmaydi, doim toConfig()
   * orqali (u parolni emas, faqat `hasAuth` ni chiqaradi) uzatiladi.
   */
  private async findTableWithAuth(clubId: number, tableId: number): Promise<Table | null> {
    return this.tableRepo
      .createQueryBuilder('t')
      .addSelect(['t.lightAuth', 't.lightHost', 't.lightOnUrl', 't.lightOffUrl', 't.lightConfig'])
      .where('t.id = :tableId', { tableId })
      .andWhere('t.clubId = :clubId', { clubId })
      .getOne();
  }

  /**
   * Kerakli holat qoidasi (ustuvorlik yuqoridan pastga):
   * override -> active -> paused -> grace -> bron oldidan -> o'chiq.
   */
  private resolveDesired(row: {
    overrideActive: boolean;
    overrideOn: boolean | null;
    sessionStatus: string | null;
    offOnPause: boolean;
    graceActive: boolean;
    preOnActive: boolean;
  }): boolean {
    if (row.overrideActive && row.overrideOn !== null) return row.overrideOn;
    if (row.sessionStatus === 'active') return true;
    if (row.sessionStatus === 'paused') return !row.offOnPause;
    if (row.graceActive) return true;
    if (row.preOnActive) return true;
    return false;
  }

  /** Sozlamalar yozuvidan (yoki uning yo'qligidan) kesh qiymatini yig'ish */
  private toClubSettings(settings: Settings | null | undefined): ClubLightSettings {
    return {
      mode: settings?.lightMode ?? LightMode.OFF,
      offOnPause: settings?.lightOffOnPause ?? false,
      offDelaySec: settings?.lightOffDelaySec ?? 0,
      preOnMinutes: settings?.lightPreOnMinutes ?? 0,
      forceSyncSec: settings?.lightForceSyncSec ?? FORCE_SYNC_MS / 1000,
      verify: settings?.lightVerify ?? true,
    };
  }

  /** Stol yozuvidan panel uchun xavfsiz ko'rinish (lightAuth qaytarilmaydi) */
  toConfig(table: Table): LightTableConfig {
    return {
      tableId: table.id,
      tableNumber: table.number,
      tableName: table.name,
      isActive: table.isActive,
      driver: table.lightDriver,
      host: table.lightHost,
      channel: table.lightChannel,
      inverted: table.lightInverted,
      hasAuth: table.lightAuth !== null,
      onUrl: table.lightOnUrl,
      offUrl: table.lightOffUrl,
      config: table.lightConfig ?? null,
      overrideOn: table.lightOverrideOn,
      overrideUntil: table.lightOverrideUntil,
      state: table.lightState,
      syncedAt: table.lightSyncedAt,
      error: table.lightError,
    };
  }

  /** driver='http' shabloni: http/https sxemasi va to'g'ri host bo'lishi shart */
  private isValidTemplateUrl(template: string | null): boolean {
    if (!template) return false;
    try {
      const parsed = new URL(template);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      return isValidHost(parsed.host);
    } catch {
      return false;
    }
  }

  /**
   * `lightConfig` ni tozalash: faqat tanilgan maydonlar, bo'sh satrlar olib
   * tashlanadi. Hech qanday ma'noli maydon qolmasa null qaytadi (jsonb ustuni
   * bo'sh obyekt bilan to'lib ketmasin).
   */
  private sanitizeConfig(
    raw: LightConfigDto | LightDeviceConfig | null | undefined,
  ): LightDeviceConfig | null {
    if (!raw || typeof raw !== 'object') return null;

    const text = (value: unknown, max: number): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const clean = value.trim();
      return clean === '' ? undefined : clean.slice(0, max);
    };
    const int = (value: unknown): number | undefined => {
      if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
      return value;
    };

    const config: LightDeviceConfig = {};

    if (Array.isArray(raw.channels)) {
      const channels: number[] = [];
      for (const item of raw.channels) {
        const value = Number(item);
        if (!Number.isInteger(value) || value < 0 || value > 32) continue;
        if (!channels.includes(value)) channels.push(value);
        if (channels.length >= 8) break;
      }
      if (channels.length > 0) config.channels = channels;
    }

    const entityId = text(raw.entityId, 120)?.toLowerCase();
    if (entityId) config.entityId = entityId;
    const entity = text(raw.entity, 60)?.toLowerCase();
    if (entity) config.entity = entity;

    const topic = text(raw.topic, 200);
    if (topic) config.topic = topic;
    const onPayload = text(raw.onPayload, 200);
    if (onPayload) config.onPayload = onPayload;
    const offPayload = text(raw.offPayload, 200);
    if (offPayload) config.offPayload = offPayload;
    const stateTopic = text(raw.stateTopic, 200);
    if (stateTopic) config.stateTopic = stateTopic;
    const stateOnValue = text(raw.stateOnValue, 200);
    if (stateOnValue) config.stateOnValue = stateOnValue;
    if (typeof raw.retain === 'boolean') config.retain = raw.retain;
    if (raw.qos === 0 || raw.qos === 1) config.qos = raw.qos;

    const unitId = int(raw.unitId);
    if (unitId !== undefined && unitId >= 0 && unitId <= 247) config.unitId = unitId;
    const coil = int(raw.coil);
    if (coil !== undefined && coil >= 0 && coil <= 65535) config.coil = coil;

    const onHex = text(raw.onHex, 512);
    if (onHex) config.onHex = onHex;
    const offHex = text(raw.offHex, 512);
    if (offHex) config.offHex = offHex;
    const onAscii = text(raw.onAscii, 256);
    if (onAscii) config.onAscii = onAscii;
    const offAscii = text(raw.offAscii, 256);
    if (offAscii) config.offAscii = offAscii;
    const expectHex = text(raw.expectHex, 512);
    if (expectHex) config.expectHex = expectHex;

    const serialPort = text(raw.serialPort, 120);
    if (serialPort) config.serialPort = serialPort;
    const baudRate = int(raw.baudRate);
    // Chegara agentnikiga TENG (921600): ilgari 1 000 000 gacha saqlanardi-yu,
    // agent uni jimgina qisqartirardi — saqlangan qiymat aldab qo'yardi
    if (baudRate !== undefined && baudRate >= 300 && baudRate <= 921_600) {
      config.baudRate = baudRate;
    }

    if (typeof raw.verify === 'boolean') config.verify = raw.verify;

    return Object.keys(config).length > 0 ? config : null;
  }

  /**
   * Drayverga MOS maydonlar to'liq to'ldirilganini tekshiradi.
   * Xato kalitlari: `lights.invalidHost` (manzil/URL), `lights.invalidConfig`
   * (drayverga xos maydonlar).
   */
  private assertDeviceConfig(
    driver: LightDriver,
    host: string | null,
    onUrl: string | null,
    offUrl: string | null,
    config: LightDeviceConfig | null,
  ): void {
    if (driver === LightDriver.NONE) return;

    const invalidHost = (): never => {
      throw new BadRequestException({ key: 'lights.invalidHost' });
    };
    const invalidConfig = (): never => {
      throw new BadRequestException({ key: 'lights.invalidConfig' });
    };

    // Hex/ASCII juftliklari: yoqish va o'chirish uchun kamida bittadan shakl kerak
    const hasBytes = (hex?: string, ascii?: string): boolean =>
      (!!hex && this.isValidHex(hex)) || (!!ascii && ascii.length > 0);

    switch (driver) {
      case LightDriver.HTTP:
        // Shablon URL lar majburiy: yoqish ham, o'chirish ham kerak
        if (!this.isValidTemplateUrl(onUrl) || !this.isValidTemplateUrl(offUrl)) invalidHost();
        return;

      case LightDriver.HOME_ASSISTANT:
        if (!host) invalidHost();
        if (!config?.entityId || !HA_ENTITY_ID_RE.test(config.entityId)) invalidConfig();
        break;

      case LightDriver.ESPHOME:
        if (!host) invalidHost();
        if (!config?.entity || !ESPHOME_ENTITY_RE.test(config.entity)) invalidConfig();
        break;

      case LightDriver.MQTT: {
        const topic = config?.topic ?? '';
        if (!topic || topic.length > 200 || MQTT_TOPIC_INVALID_RE.test(topic)) invalidConfig();
        // `stateTopic` ham xuddi shunday tekshiriladi: joker belgili obuna
        // ('#'/'+') begona stolning xabarini shu stolning holati deb qabul
        // qilishga olib kelardi (agent obunani aynan shu satr bilan ochadi)
        const stateTopic = config?.stateTopic ?? '';
        if (stateTopic && (stateTopic.length > 200 || MQTT_TOPIC_INVALID_RE.test(stateTopic))) {
          invalidConfig();
        }
        break;
      }

      case LightDriver.MODBUS_TCP:
        if (!host) invalidHost();
        // unitId/coil chegaralari sanitizeConfig da qo'llangan (default: unitId=1, coil=channel)
        break;

      case LightDriver.TCP:
        // Xom TCP da port majburiy — qurilma standart HTTP portida turmaydi
        if (!host || !host.includes(':')) invalidHost();
        if (
          !hasBytes(config?.onHex, config?.onAscii) ||
          !hasBytes(config?.offHex, config?.offAscii)
        ) {
          invalidConfig();
        }
        break;

      case LightDriver.SERIAL:
        if (!config?.serialPort) invalidConfig();
        if (
          !hasBytes(config?.onHex, config?.onAscii) ||
          !hasBytes(config?.offHex, config?.offAscii)
        ) {
          invalidConfig();
        }
        break;

      default:
        // shelly_gen1 / shelly_gen2 / tasmota — faqat manzil kerak
        if (!host) invalidHost();
        break;
    }

    // Hex satrlari berilgan bo'lsa shakli tekshiriladi (drayverdan qat'i nazar)
    for (const hex of [config?.onHex, config?.offHex, config?.expectHex]) {
      if (hex && !this.isValidHex(hex)) invalidConfig();
    }
  }

  /** 'A0 01:01-A2' ko'rinishidagi hex satri to'g'rimi (juft sonli hex raqamlar) */
  private isValidHex(value: string): boolean {
    const body = value.replace(HEX_SEPARATOR_RE, '');
    return body.length > 0 && body.length % 2 === 0 && HEX_BODY_RE.test(body);
  }

  /** Stol yozuvidan qurilma tavsifini yig'ish (sinov uchun desired qo'lda beriladi) */
  private toDevice(table: Table, desired: boolean): LightDeviceState {
    return {
      tableId: table.id,
      tableNumber: table.number,
      tableName: table.name,
      driver: table.lightDriver,
      host: table.lightHost ?? '',
      channel: table.lightChannel,
      inverted: table.lightInverted,
      auth: table.lightAuth,
      onUrl: table.lightOnUrl,
      offUrl: table.lightOffUrl,
      config: table.lightConfig ?? null,
      desired,
    };
  }

  /**
   * DIRECT rejimda bitta qurilmaga buyruq yuboradi va natijani yozib qo'yadi.
   * Throw qilmaydi — xato matnini qaytaradi (null = muvaffaqiyat).
   *
   * `verify` yoqilgan bo'lsa buyruqdan keyin qurilmadan HAQIQIY holat o'qiladi:
   * u kerakli holatdan farq qilsa (drift) buyruq BIR marta qayta yuboriladi va
   * jurnalga 'drift' yozuvi tushadi (faqat holat oldingisidan farq qilsa).
   * Qayta yuborishdan keyin ham mos kelmasa — rele buyruqni qabul qilmagan
   * hisoblanadi: xato yoziladi va shu forceSync oynasida boshqa urinilmaydi.
   */
  private async applyDevice(
    clubId: number,
    device: LightDeviceState,
    options: {
      source: LightEventSource;
      userId?: number | null;
      verify: boolean;
      always?: boolean;
      /** Drift uchun qayta qo'llash oynasi (ms) — klub sozlamasidan */
      forceSyncMs?: number;
    },
  ): Promise<string | null> {
    const event = {
      source: options.source,
      userId: options.userId ?? null,
      always: options.always,
    };

    const hosts = this.hostsOf(device);
    if (hosts.length === 0) {
      return this.fail(clubId, device.tableId, "Rele manzili noto'g'ri yoki ko'rsatilmagan", event);
    }
    for (const host of hosts) {
      // DIQQAT: xato matniga MANZIL qo'shilmaydi — u tables."lightError" ga
      // yoziladi va GET /tables, GET /lights orqali kassirga ham ko'rinardi.
      // To'liq matn (manzil bilan) faqat server logiga chiqadi.
      if (!isValidHost(host)) {
        return this.fail(clubId, device.tableId, "Rele manzili noto'g'ri formatda", event, {
          detail: `manzil: ${host}`,
        });
      }
      // SSRF himoyasi: server faqat lokal tarmoqqa chiqadi
      if (!isPrivateHost(host)) {
        return this.fail(
          clubId,
          device.tableId,
          'Faqat lokal tarmoq manzili ruxsat etiladi',
          event,
          { detail: `manzil: ${host}` },
        );
      }
    }

    const guardKey = this.driftKey(clubId, device.tableId);
    const guardMs = options.forceSyncMs ?? FORCE_SYNC_MS;
    // Qo'lda sinov — foydalanuvchining aniq niyati: "tinch qo'yish" belgisi
    // bekor qilinadi va urinish YANGIDAN boshlanadi (admin `inverted` ni
    // to'g'rilagan bo'lishi mumkin)
    if (options.always) this.driftGuard.delete(guardKey);
    const startedAt = Date.now();
    try {
      await applyLight(device, device.desired, LIGHT_TIMEOUT_MS);

      let applied = device.desired;
      // Holatni o'qib tekshirish: stol sozlamasi klub sozlamasidan ustun
      if (device.config?.verify ?? options.verify) {
        const actual = await readLight(device, LIGHT_TIMEOUT_MS);
        if (actual !== null && actual !== device.desired) {
          // Drift jurnalga FAQAT holat oldingi ma'lum holatdan farq qilganda
          // yoziladi — aks holda har majburiy sinxronizatsiyada (30 s) bir xil
          // yozuv to'planardi
          await this.logDriftIfChanged(clubId, device.tableId, actual);

          if (Date.now() < (this.driftGuard.get(guardKey) ?? 0)) {
            // Shu oynada allaqachon qayta qo'llangan va rele qabul qilmagan —
            // ketma-ket ikkinchi apply+read qilinmaydi (cheksiz sikl oldini olish)
            return this.fail(clubId, device.tableId, DRIFT_REJECTED, event, { state: actual });
          }

          // Bir marta qayta qo'llanadi
          await applyLight(device, device.desired, LIGHT_TIMEOUT_MS);
          const recheck = await readLight(device, LIGHT_TIMEOUT_MS);
          if (recheck !== null && recheck !== device.desired) {
            // Rele buyruqni qabul qilmadi: `inverted` noto'g'ri qo'yilgan yoki
            // mexanik kalit holatni ushlab turibdi. Keyingi oynagacha tinch qo'yamiz.
            this.driftGuard.set(guardKey, Date.now() + guardMs);
            return this.fail(clubId, device.tableId, DRIFT_REJECTED, event, { state: recheck });
          }
          applied = recheck ?? device.desired;
          this.driftGuard.delete(guardKey);
        } else if (actual !== null) {
          applied = actual;
          this.driftGuard.delete(guardKey);
        }
      }

      const latency = Date.now() - startedAt;
      if (latency >= SLOW_DEVICE_MS) {
        this.logger.debug(`Rele sekin javob berdi (table=${device.tableId}): ${latency} ms`);
      }

      await this.recordResult(clubId, device.tableId, true, applied, null, event);
      return null;
    } catch (err) {
      // Qurilma javobining TANASI faqat serverning logiga tushadi — u
      // tables."lightError" orqali panelga chiqib ketmasligi kerak
      if (err instanceof LightHttpError && err.body) {
        this.logger.warn(`Rele javobi (table=${device.tableId}): ${err.body}`);
      }
      return this.fail(clubId, device.tableId, (err as Error).message, event);
    }
  }

  /**
   * 'drift' hodisasini FAQAT haqiqiy o'zgarishda jurnalga yozadi: qurilmadan
   * o'qilgan holat oldingi ma'lum holat (`tables."lightState"`) bilan bir xil
   * bo'lsa yozuv qo'shilmaydi. HECH QACHON throw qilmaydi.
   */
  private async logDriftIfChanged(
    clubId: number,
    tableId: number,
    actual: boolean,
  ): Promise<void> {
    try {
      const previous = await this.tableRepo.findOne({
        where: { id: tableId, clubId },
        select: { id: true, lightState: true },
      });
      if (!previous || previous.lightState === actual) return;
      await this.logEvent({
        clubId,
        tableId,
        isOn: actual,
        source: 'drift',
        ok: true,
        error: null,
        userId: null,
      });
    } catch (err) {
      this.logger.warn(
        `Drift yozuvini qo'shib bo'lmadi (table=${tableId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Xatoni yozib, o'sha matnni qaytaradi.
   * `extra.detail` — FAQAT server logiga qo'shiladigan tafsilot (masalan rele
   * manzili); u DB ga va API javoblariga hech qachon chiqmaydi.
   * `extra.state` — xato bilan birga yozib qo'yiladigan haqiqiy holat (drift).
   */
  private async fail(
    clubId: number,
    tableId: number,
    message: string,
    event: { source: LightEventSource; userId: number | null; always?: boolean },
    extra?: { detail?: string; state?: boolean | null },
  ): Promise<string> {
    this.logger.warn(
      `Chiroq xatosi (table=${tableId}): ${message}${extra?.detail ? ` [${extra.detail}]` : ''}`,
    );
    await this.recordResult(clubId, tableId, false, null, message, event, extra?.state);
    return message;
  }

  /**
   * tables."lightState"/"lightSyncedAt"/"lightError" ni yangilaydi va MA'NOLI
   * o'zgarishda diagnostika jurnaliga yozuv qo'shadi.
   *
   * Jurnalga yoziladigan hollar: holat haqiqatan o'zgardi, YANGI xato paydo
   * bo'ldi yoki `always` bayrog'i qo'yilgan (qo'lda sinov). Har bir majburiy
   * sinxronizatsiyada yozuv qo'shilmaydi — aks holda jadval behuda to'lardi.
   *
   * `failedState` — xato bo'lsa ham qurilmadan O'QILGAN holat ma'lum bo'lsa
   * (drift) u yozib qo'yiladi: shunda keyingi yurishda "o'zgarish" deb
   * hisoblanmaydi va bir xil hodisa qayta-qayta jurnalga tushmaydi.
   *
   * DB xatosi yutiladi: chiroq hech qachon asosiy oqimni buzmaydi.
   */
  private async recordResult(
    clubId: number,
    tableId: number,
    ok: boolean,
    on: boolean | null,
    error: string | null,
    event: { source: LightEventSource; userId: number | null; always?: boolean } | null = null,
    failedState?: boolean | null,
  ): Promise<boolean> {
    const message = (error ?? "Noma'lum xato").slice(0, 300);
    try {
      const previous = await this.tableRepo.findOne({
        where: { id: tableId, clubId },
        select: { id: true, lightState: true, lightError: true },
      });
      if (!previous) return false;

      await this.tableRepo.update(
        { id: tableId, clubId },
        ok
          ? { lightState: on, lightSyncedAt: new Date(), lightError: null }
          : {
              lightError: message,
              ...(failedState !== undefined ? { lightState: failedState } : {}),
            },
      );

      if (event) {
        const changed = ok ? previous.lightState !== on : previous.lightError !== message;
        if (changed || event.always) {
          void this.logEvent({
            clubId,
            tableId,
            isOn: ok ? on : null,
            source: event.source,
            ok,
            error: ok ? null : message,
            userId: event.userId,
          });
        }
      }
      return true;
    } catch (err) {
      this.logger.error(
        `Chiroq holatini yozib bo'lmadi (table=${tableId}): ${(err as Error).message}`,
      );
      return false;
    }
  }

  /** Bitta jurnal yozuvi — HECH QACHON throw qilmaydi */
  private async logEvent(entry: {
    clubId: number;
    tableId: number;
    isOn: boolean | null;
    source: LightEventSource;
    ok: boolean;
    error: string | null;
    userId: number | null;
  }): Promise<void> {
    await this.logEvents([entry]);
  }

  /** Bir nechta jurnal yozuvi (master boshqaruv) — HECH QACHON throw qilmaydi */
  private async logEvents(
    entries: Array<{
      clubId: number;
      tableId: number;
      isOn: boolean | null;
      source: LightEventSource;
      ok: boolean;
      error: string | null;
      userId: number | null;
    }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    try {
      await this.eventRepo.insert(
        entries.map((entry) => ({
          clubId: entry.clubId,
          tableId: entry.tableId,
          isOn: entry.isOn,
          source: entry.source,
          ok: entry.ok,
          error: entry.error ? entry.error.slice(0, 300) : null,
          userId: entry.userId,
        })),
      );
    } catch (err) {
      // Jurnal — diagnostika vositasi: uni yozib bo'lmasa ham chiroq ishlayveradi
      this.logger.warn(`Chiroq jurnaliga yozib bo'lmadi: ${(err as Error).message}`);
    }
  }

  /** Xato matniga urinishlar sonini qo'shish (300 belgi chegarasida) */
  private withAttempts(error: string | null | undefined, attempts?: number | null): string {
    const base = (error ?? "Noma'lum xato").trim() || "Noma'lum xato";
    if (typeof attempts !== 'number' || attempts <= 1) return base.slice(0, 300);
    return `${base} (urinishlar: ${attempts})`.slice(0, 300);
  }

  /** Stollarning oxirgi ma'lum holati (syncClub da ortiqcha so'rovlarni oldini olish uchun) */
  private async lastKnownStates(clubId: number): Promise<
    Map<
      number,
      { lightState: boolean | null; lightSyncedAt: Date | null; lightError: string | null }
    >
  > {
    const rows: Array<{
      id: number;
      lightState: boolean | null;
      lightSyncedAt: Date | null;
      lightError: string | null;
    }> = await this.dataSource.query(
      `SELECT t.id, t."lightState", t."lightSyncedAt", t."lightError"
       FROM tables t
       WHERE t."clubId" = $1 AND t."isActive" = true AND t."lightDriver" <> 'none'`,
      [clubId],
    );
    return new Map(
      rows.map((row) => [
        Number(row.id),
        {
          lightState: row.lightState,
          lightSyncedAt: row.lightSyncedAt,
          lightError: row.lightError,
        },
      ]),
    );
  }

  /**
   * Qurilma murojaat qiladigan manzillar ro'yxati (tekshirish uchun).
   * driver='http' bo'lsa shablon URL laridan hostlar ajratiladi; URL noto'g'ri
   * yoki sxemasi http/https bo'lmasa — bo'sh ro'yxat (ya'ni rad etiladi).
   */
  private hostsOf(device: LightDeviceState): string[] {
    if (device.driver !== LightDriver.HTTP) {
      return device.host ? [device.host] : [];
    }
    const templates = [device.onUrl, device.offUrl].filter((url): url is string => !!url);
    if (templates.length === 0) return [];

    const hosts: string[] = [];
    for (const template of templates) {
      try {
        const parsed = new URL(template);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];
        hosts.push(parsed.host);
      } catch {
        return [];
      }
    }
    return hosts;
  }

  /**
   * Muddati o'tgan vazifalarni navbatdan tozalash (agent umuman javob bermagan).
   * Vazifa allaqachon `TASK_TAKEABLE_SQL` sharti bilan berilmay qo'yiladi — bu
   * shunchaki jadvalni toza saqlash uchun. HECH QACHON throw qilmaydi.
   */
  private async pruneExpiredTasks(): Promise<void> {
    try {
      await this.dataSource.query(
        `UPDATE club_bridges
         SET "pendingTaskId" = NULL, "pendingTaskType" = NULL,
             "pendingTaskSubnet" = NULL, "pendingTaskAt" = NULL, "taskStartedAt" = NULL
         WHERE "pendingTaskId" IS NOT NULL
           AND "pendingTaskAt" <= now() - make_interval(secs => $1)`,
        [TASK_TTL_MS / 1000],
      );
    } catch (err) {
      this.logger.warn(`Eski vazifalarni tozalab bo'lmadi: ${(err as Error).message}`);
    }
  }

  /** Drift belgisining kaliti */
  private driftKey(clubId: number, tableId: number): string {
    return `${clubId}:${tableId}`;
  }

  /** Muddati o'tgan drift belgilarini xotiradan olib tashlash */
  private pruneDriftGuard(): void {
    const now = Date.now();
    for (const [key, until] of this.driftGuard) {
      if (until <= now) this.driftGuard.delete(key);
    }
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
