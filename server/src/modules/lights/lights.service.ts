import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, Not, IsNull, Repository } from 'typeorm';
import { ClubBridge } from '../../entities/club-bridge.entity';
import { LightDriver, LightMode } from '../../entities/enums';
import { Settings } from '../../entities/settings.entity';
import { Table } from '../../entities/table.entity';
import {
  applyLight,
  isPrivateHost,
  isValidHost,
  LightHttpError,
  LightTarget,
} from './drivers/light-driver';
import { UpdateLightSettingsDto, UpdateTableLightDto } from './dto/lights.dto';

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
  on: boolean | null;
  error?: string | null;
}

/**
 * Klub panelida ko'rsatiladigan stol qatori.
 * DIQQAT: `lightAuth` (rele paroli) HECH QACHON qaytarilmaydi — faqat
 * o'rnatilgan-o'rnatilmaganligi (`hasAuth`) bildiriladi.
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
  serverNow: string;
  forceSyncMs: number;
  bridge: LightBridgeStatus;
  tables: LightTableView[];
}

/** Sinov natijasining sababi (klientga tushunarli xabar tanlash uchun) */
export type LightTestReason = 'not_configured' | 'mode_off' | 'unreachable' | 'queued' | null;

/** Relega so'rov timeouti */
const LIGHT_TIMEOUT_MS = 3000;

/** Klub rejimi keshi muddati — har sessiya amalida DB ga bormaslik uchun */
const MODE_CACHE_TTL_MS = 30 * 1000;

/** Muvaffaqiyatli qo'llangan holat shuncha vaqtdan keyin majburiy qayta yuboriladi */
export const FORCE_SYNC_MS = 60 * 1000;

/** Qo'lda boshqaruv (override) muddati chegaralari, daqiqada */
const OVERRIDE_MIN_MINUTES = 1;
const OVERRIDE_MAX_MINUTES = 24 * 60;

/** BRIDGE rejimidagi sinov uchun qo'yiladigan override muddati */
const TEST_OVERRIDE_MINUTES = 5;

/** Agent shu vaqt ichida murojaat qilgan bo'lsa "onlayn" hisoblanadi */
const BRIDGE_ONLINE_MS = 60 * 1000;

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
  overrideOn: boolean | null;
  overrideActive: boolean;
  sessionStatus: string | null;
  offOnPause: boolean;
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

/** Bo'sh satr null ga aylantiriladi (maydonni tozalash uchun) */
const normalizeText = (value: string | null | undefined): string | null => {
  const text = (value ?? '').trim();
  return text === '' ? null : text;
};

/**
 * Stol chiroqlarini boshqarish yadrosi (butunlay OPT-IN, standart rejim 'off').
 *
 * Asosiy g'oya: alohida buyruq navbati YO'Q — "kerakli holat" (desired state)
 * har safar DB dan hisoblanadi:
 *   status='active' sessiya bor          -> yoniq
 *   status='paused'                      -> settings."lightOffOnPause" hal qiladi (standart: yoniq)
 *   sessiya yo'q                         -> o'chiq
 *   tables."lightOverrideUntil" > now()  -> "lightOverrideOn" hammasidan ustun
 * Shu sababli sessiya tranzaksiyalariga (boshlash/pauza/transfer/yakunlash)
 * umuman tegilmaydi — ular AYNAN hozirgidek ishlayveradi.
 *
 * Ikki rejim:
 *   BRIDGE — klubdagi lokal agent GET /api/bridge/state ga o'zi keladi va qo'llaydi;
 *   DIRECT — server relega o'zi murojaat qiladi (faqat lokal IP, SSRF himoyasi).
 *
 * Chiroq bilan bog'liq HECH BIR xato asosiy oqimni to'xtatmaydi: sinxronlash
 * metodlari throw qilmaydi, xatolar logga va tables."lightError" ga yoziladi.
 */
@Injectable()
export class LightsService {
  private readonly logger = new Logger(LightsService.name);

  /** clubId -> rejim keshi (30 s) */
  private readonly modeCache = new Map<number, { mode: LightMode; loadedAt: number }>();

  /** DIRECT rejimda bir klub bir vaqtda faqat bir marta sinxronlansin */
  private readonly syncingClubs = new Set<number>();

  /** Cron takrorlanmasin (oldingi yurish tugamagan bo'lsa o'tkazib yuboriladi) */
  private reconcileRunning = false;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Table) private readonly tableRepo: Repository<Table>,
    @InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>,
    @InjectRepository(ClubBridge) private readonly bridgeRepo: Repository<ClubBridge>,
  ) {}

  // ---------------------------------------------------------------------------
  // Kerakli holat (desired state)
  // ---------------------------------------------------------------------------

  /**
   * Klubning chiroq ulangan barcha faol stollari va ularning kerakli holati.
   * Bitta so'rov: stollar + ustidagi active/paused sessiya (LATERAL) + settings.
   * Bir stolda ikkita ochiq sessiya bo'lib qolsa 'active' 'paused' dan ustun.
   */
  async desiredState(clubId: number): Promise<LightDeviceState[]> {
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
              t."lightOverrideOn"                    AS "overrideOn",
              (t."lightOverrideUntil" IS NOT NULL
                 AND t."lightOverrideUntil" > now()) AS "overrideActive",
              s.status                               AS "sessionStatus",
              COALESCE(st."lightOffOnPause", false)  AS "offOnPause"
       FROM tables t
       LEFT JOIN LATERAL (
         SELECT se.status
         FROM sessions se
         WHERE se."tableId" = t.id AND se.status IN ('active', 'paused')
         ORDER BY (se.status = 'active') DESC, se."startTime" DESC
         LIMIT 1
       ) s ON true
       LEFT JOIN settings st ON st."clubId" = t."clubId"
       WHERE t."clubId" = $1
         AND t."isActive" = true
         AND t."lightDriver" <> 'none'
         AND (t."lightHost" IS NOT NULL OR t."lightOnUrl" IS NOT NULL)
       ORDER BY t.id`,
      [clubId],
    );

    return rows.map((row) => ({
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
      desired: this.resolveDesired(row),
    }));
  }

  /**
   * BRIDGE agenti uchun kerakli holat.
   * Klub rejimi 'bridge' bo'lmasa (masalan admin chiroq boshqaruvini butunlay
   * O'CHIRIB qo'ygan yoki 'direct' ga o'tkazgan) — BO'SH ro'yxat qaytadi va agent
   * hech bir relega buyruq yubormaydi. Rejim keshi (30 s) sozlama o'zgarganda
   * darhol bekor qilinadi, shuning uchun agent o'zgarishni tez sezadi.
   */
  async bridgeDesiredState(clubId: number): Promise<LightDeviceState[]> {
    const mode = await this.clubLightMode(clubId);
    if (mode !== LightMode.BRIDGE) return [];
    return this.desiredState(clubId);
  }

  /** Kerakli ro'yxatning barqaror sha1 xeshi — bridge uzun-pollingi shunga tayanadi */
  stateVersion(devices: LightDeviceState[]): string {
    const payload = [...devices]
      .sort((a, b) => a.tableId - b.tableId)
      .map((device) => `${device.tableId}:${device.desired ? 1 : 0}`)
      .join(';');
    return createHash('sha1').update(payload).digest('hex');
  }

  /** Klub chiroq rejimi (30 s kesh) — sozlamalar yo'q yoki xato bo'lsa 'off' */
  async clubLightMode(clubId: number): Promise<LightMode> {
    const cached = this.modeCache.get(clubId);
    if (cached && Date.now() - cached.loadedAt < MODE_CACHE_TTL_MS) return cached.mode;

    try {
      const settings = await this.settingsRepo.findOne({
        where: { clubId },
        select: { id: true, lightMode: true },
      });
      const mode = settings?.lightMode ?? LightMode.OFF;
      this.modeCache.set(clubId, { mode, loadedAt: Date.now() });
      return mode;
    } catch (err) {
      // DB xatosi chiroq tufayli asosiy oqimga chiqmasin — eski kesh yoki 'off'
      this.logger.error(`Chiroq rejimi o'qilmadi (club=${clubId}): ${(err as Error).message}`);
      return cached?.mode ?? LightMode.OFF;
    }
  }

  /** Rejim sozlamasi o'zgarganda keshni darhol bekor qilish uchun */
  invalidateModeCache(clubId: number): void {
    this.modeCache.delete(clubId);
  }

  // ---------------------------------------------------------------------------
  // Klub paneli: ko'rinish va sozlamalar
  // ---------------------------------------------------------------------------

  /**
   * Panel uchun to'liq ko'rinish: klub rejimi, agent holati va BARCHA stollar
   * (chiroq ulanmaganlari ham — ularni shu yerdan sozlash mumkin).
   * Rejim keshdan emas, DB dan o'qiladi — panel doim yangi qiymatni ko'rsatsin.
   */
  async overview(clubId: number): Promise<LightOverview> {
    const settings = await this.settingsRepo.findOne({ where: { clubId } });

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
              t."lightOverrideOn"                    AS "overrideOn",
              t."lightOverrideUntil"                 AS "overrideUntil",
              (t."lightOverrideUntil" IS NOT NULL
                 AND t."lightOverrideUntil" > now()) AS "overrideActive",
              t."lightState"                         AS "state",
              t."lightSyncedAt"                      AS "syncedAt",
              t."lightError"                         AS "error",
              s.status                               AS "sessionStatus",
              COALESCE(st."lightOffOnPause", false)  AS "offOnPause"
       FROM tables t
       LEFT JOIN LATERAL (
         SELECT se.status
         FROM sessions se
         WHERE se."tableId" = t.id AND se.status IN ('active', 'paused')
         ORDER BY (se.status = 'active') DESC, se."startTime" DESC
         LIMIT 1
       ) s ON true
       LEFT JOIN settings st ON st."clubId" = t."clubId"
       WHERE t."clubId" = $1
       ORDER BY t.number, t.id`,
      [clubId],
    );

    return {
      mode: settings?.lightMode ?? LightMode.OFF,
      offOnPause: settings?.lightOffOnPause ?? false,
      serverNow: new Date().toISOString(),
      forceSyncMs: FORCE_SYNC_MS,
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
   * Klubning chiroq rejimi sozlamalari. Sozlamalar yozuvi bo'lmasa yaratiladi
   * (settings.service dagi kabi, parallel so'rovga chidamli).
   */
  async updateSettings(
    clubId: number,
    dto: UpdateLightSettingsDto,
  ): Promise<{ mode: LightMode; offOnPause: boolean }> {
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
    // NOT NULL ustun: @IsOptional() literal `null` ni ham o'tkazib yuboradi,
    // shuning uchun `!= null` (undefined ham, null ham e'tiborsiz qoldiriladi)
    if (dto.offOnPause != null) settings.lightOffOnPause = dto.offOnPause;
    const saved = await this.settingsRepo.save(settings);

    // Kesh darhol bekor qilinadi, so'ng fon rejimida moslashtirish (kutilmaydi)
    this.invalidateModeCache(clubId);
    void this.syncClub(clubId);

    return { mode: saved.lightMode, offOnPause: saved.lightOffOnPause };
  }

  /**
   * Stolning rele sozlamalari. Faqat yuborilgan maydonlar yangilanadi;
   * bo'sh satr yoki null — qiymatni tozalaydi.
   * Manzil FORMATI shu yerda tekshiriladi; DIRECT rejimdagi "faqat lokal IP"
   * cheklovi buyruq yuborilayotganda (applyDevice) qo'llanadi — rejim keyin
   * o'zgarishi mumkinligi uchun.
   */
  async updateTableDevice(
    clubId: number,
    tableId: number,
    dto: UpdateTableLightDto,
  ): Promise<LightTableConfig> {
    // Ulanish maydonlari (auth/host/URL lar) entityda `select: false` — bu yerda
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
    };

    if (next.host && !isValidHost(next.host)) {
      throw new BadRequestException({ key: 'lights.invalidHost' });
    }
    if (next.driver === LightDriver.HTTP) {
      // Shablon URL lar majburiy: yoqish ham, o'chirish ham kerak
      if (!this.isValidTemplateUrl(next.onUrl) || !this.isValidTemplateUrl(next.offUrl)) {
        throw new BadRequestException({ key: 'lights.invalidHost' });
      }
    } else if (next.driver !== LightDriver.NONE && !next.host) {
      throw new BadRequestException({ key: 'lights.invalidHost' });
    }

    table.lightDriver = next.driver;
    table.lightHost = next.host;
    table.lightChannel = next.channel;
    table.lightInverted = next.inverted;
    table.lightAuth = next.auth;
    table.lightOnUrl = next.onUrl;
    table.lightOffUrl = next.offUrl;
    // Sozlama o'zgardi — oldingi holat/xato endi ishonchsiz, qayta sinxronlanadi
    table.lightState = null;
    table.lightSyncedAt = null;
    table.lightError = null;

    const saved = await this.tableRepo.save(table);
    // Javob kutilmaydi — chiroq hech qachon so'rovni sekinlashtirmasligi kerak
    void this.syncTable(clubId, tableId);
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
  async syncTable(clubId: number, tableId: number): Promise<void> {
    try {
      const mode = await this.clubLightMode(clubId);
      if (mode !== LightMode.DIRECT) return;

      const devices = await this.desiredState(clubId);
      const device = devices.find((item) => item.tableId === tableId);
      if (!device) return;

      await this.applyDevice(device);
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
    await this.syncTable(clubId, tableId);
  }

  /**
   * DIRECT rejimda klubning barcha chiroqlarini moslashtiradi.
   * Oxirgi ma'lum holat kerakli holatga teng va yaqinda muvaffaqiyatli qo'llangan
   * bo'lsa — qayta yuborilmaydi (rele bekorga bezovta qilinmasin), aks holda
   * qayta qo'llanadi. Har FORCE_SYNC_MS da bir marta majburiy takrorlanadi.
   */
  async syncClub(clubId: number): Promise<void> {
    if (this.syncingClubs.has(clubId)) return;
    this.syncingClubs.add(clubId);
    try {
      const mode = await this.clubLightMode(clubId);
      if (mode !== LightMode.DIRECT) return;

      const devices = await this.desiredState(clubId);
      if (devices.length === 0) return;

      const known = await this.lastKnownStates(clubId);
      const now = Date.now();

      const pending = devices.filter((device) => {
        const state = known.get(device.tableId);
        const syncedAt = state?.lightSyncedAt ? new Date(state.lightSyncedAt).getTime() : 0;
        // Holat mos va yaqinda muvaffaqiyatli qo'llangan bo'lsa — tegilmaydi
        return !(
          !state?.lightError &&
          state?.lightState === device.desired &&
          now - syncedAt < FORCE_SYNC_MS
        );
      });
      if (pending.length === 0) return;

      // Parallel: javob bermaydigan bitta rele qolganlarini kutdirib qo'ymasin
      await Promise.allSettled(pending.map((device) => this.applyDevice(device)));
    } catch (err) {
      this.logger.error(`Klub chiroqlarini sinxronlash xatosi (club=${clubId}): ${(err as Error).message}`);
    } finally {
      this.syncingClubs.delete(clubId);
    }
  }

  /**
   * Har 30 soniyada FAQAT lightMode='direct' klublarni moslashtiradi.
   * BRIDGE rejimidagi klublar bu yerda umuman qatnashmaydi — ular uchun agent
   * o'zi uzun-polling qiladi. Butun tanasi try/catch ichida.
   */
  @Cron('*/30 * * * * *')
  async reconcile(): Promise<void> {
    if (this.reconcileRunning) return;
    this.reconcileRunning = true;
    try {
      const rows: Array<{ clubId: number }> = await this.dataSource.query(
        `SELECT s."clubId" AS "clubId" FROM settings s WHERE s."lightMode" = 'direct'`,
      );
      for (const row of rows) {
        // syncClub o'zi ichida xatolarni yutadi — sikl to'xtamaydi
        await this.syncClub(Number(row.clubId));
      }
    } catch (err) {
      this.logger.error(`Chiroq reconcile xatosi: ${(err as Error).message}`);
    } finally {
      this.reconcileRunning = false;
    }
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
  ): Promise<Table> {
    // toConfig() dagi `hasAuth` to'g'ri hisoblanishi uchun maxfiy ustun ham o'qiladi
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
    // Javob kutilmaydi — chiroq hech qachon so'rovni sekinlashtirmasligi kerak
    void this.syncTable(clubId, tableId);
    return saved;
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
  ): Promise<{ ok: boolean; error: string | null; reason: LightTestReason }> {
    // DIRECT rejimda relega basic-auth kerak — maxfiy ustunni ataylab o'qiymiz
    const table = await this.findTableWithAuth(clubId, tableId);
    if (!table) throw new NotFoundException({ key: 'tables.notFound' });
    if (table.lightDriver === LightDriver.NONE) {
      return {
        ok: false,
        error: 'Bu stolda chiroq sozlanmagan (drayver: none)',
        reason: 'not_configured',
      };
    }

    const mode = await this.clubLightMode(clubId);
    if (mode === LightMode.OFF) {
      return { ok: false, error: "Chiroq boshqaruvi o'chirilgan (rejim: off)", reason: 'mode_off' };
    }

    if (mode === LightMode.DIRECT) {
      const error = await this.applyDevice(this.toDevice(table, on));
      return { ok: error === null, error, reason: error === null ? null : 'unreachable' };
    }

    // BRIDGE: buyruqni agentga override orqali yetkazamiz
    await this.setOverride(clubId, tableId, on, TEST_OVERRIDE_MINUTES);
    return { ok: table.lightError === null, error: table.lightError, reason: 'queued' };
  }

  // ---------------------------------------------------------------------------
  // Hisobot (agent -> server)
  // ---------------------------------------------------------------------------

  /**
   * Agent (yoki DIRECT rejimdagi server) hisobotini stol yozuvlariga yozadi.
   * Boshqa klubning stoli yuborilsa — jimgina o'tkazib yuboriladi (clubId filtri).
   */
  async applyReport(clubId: number, results: LightReportItem[]): Promise<number> {
    let accepted = 0;
    for (const item of results) {
      const tableId = Number(item.tableId);
      if (!Number.isInteger(tableId) || tableId <= 0) continue;
      const ok = await this.recordResult(
        clubId,
        tableId,
        item.ok,
        item.on ?? null,
        item.ok ? null : item.error ?? "Noma'lum xato",
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
      this.logger.warn(`Bridge holatini yangilab bo'lmadi (id=${bridge.id}): ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Ichki yordamchilar
  // ---------------------------------------------------------------------------

  /**
   * Stol yozuvi + yopiq ulanish maydonlari (`lightAuth`, `lightHost`, shablon
   * URL lar) — ular entityda `select: false`, ya'ni oddiy findOne ularni
   * qaytarmaydi. Faqat chiroq oqimining ichida ishlatiladi: bu yerdan olingan
   * entity API javobiga TO'G'RIDAN-TO'G'RI berilmaydi, doim toConfig() orqali
   * (u parolni emas, faqat `hasAuth` ni chiqaradi) uzatiladi.
   */
  private async findTableWithAuth(clubId: number, tableId: number): Promise<Table | null> {
    return this.tableRepo
      .createQueryBuilder('t')
      .addSelect(['t.lightAuth', 't.lightHost', 't.lightOnUrl', 't.lightOffUrl'])
      .where('t.id = :tableId', { tableId })
      .andWhere('t.clubId = :clubId', { clubId })
      .getOne();
  }

  /** Kerakli holat qoidasi: override -> sessiya -> pauza sozlamasi */
  private resolveDesired(row: {
    overrideActive: boolean;
    overrideOn: boolean | null;
    sessionStatus: string | null;
    offOnPause: boolean;
  }): boolean {
    if (row.overrideActive && row.overrideOn !== null) return row.overrideOn;
    if (row.sessionStatus === 'active') return true;
    if (row.sessionStatus === 'paused') return !row.offOnPause;
    return false;
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
      desired,
    };
  }

  /**
   * DIRECT rejimda bitta qurilmaga buyruq yuboradi va natijani yozib qo'yadi.
   * Throw qilmaydi — xato matnini qaytaradi (null = muvaffaqiyat).
   */
  private async applyDevice(device: LightDeviceState): Promise<string | null> {
    const hosts = this.hostsOf(device);
    if (hosts.length === 0) {
      return this.fail(device.tableId, "Rele manzili noto'g'ri yoki ko'rsatilmagan");
    }
    for (const host of hosts) {
      if (!isValidHost(host)) {
        return this.fail(device.tableId, `Manzil formati noto'g'ri: ${host}`);
      }
      // SSRF himoyasi: server faqat lokal tarmoqqa chiqadi
      if (!isPrivateHost(host)) {
        return this.fail(device.tableId, `Faqat lokal tarmoq manzili ruxsat etiladi: ${host}`);
      }
    }

    try {
      await applyLight(device, device.desired, LIGHT_TIMEOUT_MS);
      // Qurilma allaqachon clubId bo'yicha filtrlangan ro'yxatdan kelgan
      await this.recordResult(null, device.tableId, true, device.desired, null);
      return null;
    } catch (err) {
      // Qurilma javobining TANASI faqat serverning logiga tushadi — u
      // tables."lightError" orqali panelga chiqib ketmasligi kerak
      if (err instanceof LightHttpError && err.body) {
        this.logger.warn(`Rele javobi (table=${device.tableId}): ${err.body}`);
      }
      return this.fail(device.tableId, (err as Error).message);
    }
  }

  /** Xatoni yozib, o'sha matnni qaytaradi */
  private async fail(tableId: number, message: string): Promise<string> {
    this.logger.warn(`Chiroq xatosi (table=${tableId}): ${message}`);
    await this.recordResult(null, tableId, false, null, message);
    return message;
  }

  /**
   * tables."lightState"/"lightSyncedAt"/"lightError" ni yangilaydi.
   * clubId berilsa — o'sha klub bilan cheklanadi (agent hisoboti uchun).
   * DB xatosi yutiladi: chiroq hech qachon asosiy oqimni buzmaydi.
   */
  private async recordResult(
    clubId: number | null,
    tableId: number,
    ok: boolean,
    on: boolean | null,
    error: string | null,
  ): Promise<boolean> {
    try {
      const result = await this.tableRepo.update(
        { id: tableId, ...(clubId !== null ? { clubId } : {}) },
        ok
          ? { lightState: on, lightSyncedAt: new Date(), lightError: null }
          : { lightError: (error ?? "Noma'lum xato").slice(0, 300) },
      );
      return (result.affected ?? 0) > 0;
    } catch (err) {
      this.logger.error(`Chiroq holatini yozib bo'lmadi (table=${tableId}): ${(err as Error).message}`);
      return false;
    }
  }

  /** Stollarning oxirgi ma'lum holati (syncClub da ortiqcha so'rovlarni oldini olish uchun) */
  private async lastKnownStates(
    clubId: number,
  ): Promise<Map<number, { lightState: boolean | null; lightSyncedAt: Date | null; lightError: string | null }>> {
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
        { lightState: row.lightState, lightSyncedAt: row.lightSyncedAt, lightError: row.lightError },
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

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
