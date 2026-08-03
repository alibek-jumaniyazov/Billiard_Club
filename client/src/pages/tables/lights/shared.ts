import type { CSSProperties } from 'react';
import { TOKENS } from '../../../theme/tokens';
import type { LightDeviceConfig, LightDriver, TableLightConfig } from '../../../types';

/**
 * Chiroq panelining umumiy yordamchilari — Drawer va uning kichik
 * panellari (TableLightCard, LightDiscoverPanel, LightEventsPanel)
 * shu yerdagi uslub, drayver ro'yxati va qoralama mantiqidan foydalanadi.
 */

/* ------------------------------------------------------------------ Uslub */

/** Bo'lim yuzasi — ManageTablesDrawer dagi qator uslubi bilan bir xil */
export const panelStyle: CSSProperties = {
  padding: 14,
  background: TOKENS.color.bg.bg1,
  border: `1px solid ${TOKENS.color.border.subtle}`,
  borderRadius: TOKENS.radius.md,
};

/** Stol raqami uchun oltin kvadrat */
export const numberStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: TOKENS.radius.sm,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  color: TOKENS.color.gold.base,
  background: TOKENS.color.gold.subtle,
  border: `1px solid ${TOKENS.color.gold.line}`,
};

/* --------------------------------------------------------------- Drayver */

/** Faqat lokal agent (bridge) bajara oladigan drayverlar */
export const BRIDGE_ONLY_DRIVERS: readonly LightDriver[] = ['mqtt', 'tcp', 'modbus_tcp', 'serial'];

export const isBridgeOnly = (driver: LightDriver): boolean =>
  BRIDGE_ONLY_DRIVERS.includes(driver);

/**
 * Serverga saqlash uchun FAQAT `host` yetarli bo'lgan drayverlar.
 * Qolganlari qo'shimcha maydon talab qiladi (esphome — `config.entity`,
 * home_assistant — `config.entityId`, http — onUrl/offUrl, mqtt/tcp/... — o'z
 * maydonlari), shuning uchun ular topilgan qurilmadan TO'G'RIDAN-TO'G'RI
 * biriktirilmaydi — avval stol kartasida to'ldiriladi (aks holda PUT 400 beradi).
 */
export const HOST_ONLY_DRIVERS: readonly LightDriver[] = [
  'shelly_gen1',
  'shelly_gen2',
  'tasmota',
];

export const canAssignDirectly = (driver: LightDriver): boolean =>
  HOST_ONLY_DRIVERS.includes(driver);

/**
 * Drayver ro'yxati. Brend nomlari (Shelly/Tasmota/ESPHome/Home Assistant)
 * TARJIMA QILINMAYDI — ular `brand` orqali berilgan.
 */
export const DRIVER_OPTIONS: readonly { value: LightDriver; i18nKey?: string; brand?: string }[] = [
  { value: 'none', i18nKey: 'tables.lightsDriverNone' },
  { value: 'shelly_gen1', brand: 'Shelly Gen1' },
  { value: 'shelly_gen2', brand: 'Shelly Gen2 / Plus / Pro' },
  { value: 'tasmota', brand: 'Tasmota' },
  { value: 'esphome', brand: 'ESPHome' },
  { value: 'home_assistant', brand: 'Home Assistant' },
  { value: 'mqtt', i18nKey: 'tables.lightsDriverMqtt' },
  { value: 'tcp', i18nKey: 'tables.lightsDriverTcp' },
  { value: 'modbus_tcp', i18nKey: 'tables.lightsDriverModbus' },
  { value: 'serial', i18nKey: 'tables.lightsDriverSerial' },
  { value: 'http', i18nKey: 'tables.lightsDriverHttp' },
];

/** Diagnostika hodisasi sababining tarjima kaliti */
export const EVENT_SOURCE_KEYS: Readonly<Record<string, string>> = {
  session: 'tables.lightsEventSourceSession',
  override: 'tables.lightsEventSourceOverride',
  master: 'tables.lightsEventSourceMaster',
  test: 'tables.lightsEventSourceTest',
  sync: 'tables.lightsEventSourceSync',
  drift: 'tables.lightsEventSourceDrift',
  settings: 'tables.lightsEventSourceSettings',
};

/** Master boshqaruv muddati (daqiqa) */
export const MASTER_DURATIONS: readonly number[] = [30, 60, 120];

/** Drayverga MOS maydonlar — kartada faqat shular ko'rsatiladi */
export interface DriverFields {
  /** Rele manzili (IP yoki host:port) */
  host: boolean;
  /** Rele kanali */
  channel: boolean;
  /** onUrl/offUrl shablonlari */
  urls: boolean;
  /** Home Assistant `entityId` */
  entityId: boolean;
  /** ESPHome `entity` */
  entity: boolean;
  /** MQTT topic/payload maydonlari */
  mqtt: boolean;
  /** Modbus unitId/coil */
  modbus: boolean;
  /** Xom baytlar (hex/ascii) — tcp va serial */
  raw: boolean;
  /** Serial port va tezlik */
  serial: boolean;
  /** Parol/token maydoni ko'rsatiladimi */
  auth: boolean;
  /** Parol o'rniga Home Assistant tokeni */
  authHa: boolean;
}

const NO_FIELDS: DriverFields = {
  host: false,
  channel: false,
  urls: false,
  entityId: false,
  entity: false,
  mqtt: false,
  modbus: false,
  raw: false,
  serial: false,
  auth: false,
  authHa: false,
};

/** Drayver bo'yicha ko'rsatiladigan maydonlar to'plami */
export const driverFields = (driver: LightDriver): DriverFields => {
  switch (driver) {
    case 'shelly_gen1':
    case 'shelly_gen2':
    case 'tasmota':
      return { ...NO_FIELDS, host: true, channel: true, auth: true };
    case 'esphome':
      return { ...NO_FIELDS, host: true, entity: true, auth: true };
    case 'home_assistant':
      return { ...NO_FIELDS, host: true, entityId: true, auth: true, authHa: true };
    case 'mqtt':
      return { ...NO_FIELDS, mqtt: true };
    case 'modbus_tcp':
      return { ...NO_FIELDS, host: true, channel: true, modbus: true };
    case 'tcp':
      return { ...NO_FIELDS, host: true, raw: true };
    case 'serial':
      return { ...NO_FIELDS, raw: true, serial: true };
    case 'http':
      return { ...NO_FIELDS, channel: true, urls: true, auth: true };
    default:
      return NO_FIELDS;
  }
};

/* -------------------------------------------------------------- Qoralama */

/** Bitta stolning tahrirlanayotgan sozlamalari (serverga shu maydonlar yuboriladi) */
export interface TableDraft {
  driver: LightDriver;
  host: string;
  channel: number;
  inverted: boolean;
  /** Yangi parol/token — BO'SH bo'lsa serverdagi qiymat o'zgarmaydi */
  auth: string;
  onUrl: string;
  offUrl: string;
  /** Drayverga xos sozlamalar (parolsiz) */
  config: LightDeviceConfig;
  /** `config.channels` matn ko'rinishida: '1, 2' */
  channelsText: string;
}

export const channelsToText = (channels: number[] | undefined): string =>
  Array.isArray(channels) ? channels.join(', ') : '';

/** '1, 2; 3' -> [1, 2, 3] — 0..32 oralig'idagi ≤8 ta noyob butun son */
export const parseChannels = (text: string): number[] => {
  const out: number[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    if (!part) continue;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 32) continue;
    if (!out.includes(n)) out.push(n);
    if (out.length >= 8) break;
  }
  return out;
};

export const toDraft = (row: TableLightConfig): TableDraft => ({
  driver: row.driver,
  host: row.host ?? '',
  channel: row.channel,
  inverted: row.inverted,
  auth: '',
  onUrl: row.onUrl ?? '',
  offUrl: row.offUrl ?? '',
  config: { ...(row.config ?? {}) },
  channelsText: channelsToText(row.config?.channels),
});

export const buildDrafts = (tables: TableLightConfig[]): Record<number, TableDraft> =>
  Object.fromEntries(tables.map((row) => [row.tableId, toDraft(row)]));

const text = (value: string | undefined): string | undefined => {
  const s = (value ?? '').trim();
  return s.length > 0 ? s : undefined;
};

/**
 * Qoralamadan serverga yuboriladigan `config` — faqat JORIY drayverga tegishli
 * va bo'sh bo'lmagan maydonlar qoladi. Hech qanday parol bu yerga yozilmaydi.
 */
export const draftConfig = (draft: TableDraft): LightDeviceConfig | null => {
  const f = driverFields(draft.driver);
  const src = draft.config;
  const cfg: LightDeviceConfig = {};

  const channels = parseChannels(draft.channelsText);
  if (channels.length > 0) cfg.channels = channels;
  if (typeof src.verify === 'boolean') cfg.verify = src.verify;

  if (f.entityId && text(src.entityId)) cfg.entityId = text(src.entityId);
  if (f.entity && text(src.entity)) cfg.entity = text(src.entity);

  if (f.mqtt) {
    if (text(src.topic)) cfg.topic = text(src.topic);
    if (text(src.onPayload)) cfg.onPayload = text(src.onPayload);
    if (text(src.offPayload)) cfg.offPayload = text(src.offPayload);
    if (text(src.stateTopic)) cfg.stateTopic = text(src.stateTopic);
    if (text(src.stateOnValue)) cfg.stateOnValue = text(src.stateOnValue);
    if (src.retain === true) cfg.retain = true;
    if (src.qos === 1) cfg.qos = 1;
  }

  if (f.modbus) {
    if (typeof src.unitId === 'number') cfg.unitId = src.unitId;
    if (typeof src.coil === 'number') cfg.coil = src.coil;
  }

  if (f.raw) {
    if (text(src.onHex)) cfg.onHex = text(src.onHex);
    if (text(src.offHex)) cfg.offHex = text(src.offHex);
    if (text(src.onAscii)) cfg.onAscii = text(src.onAscii);
    if (text(src.offAscii)) cfg.offAscii = text(src.offAscii);
    if (text(src.expectHex)) cfg.expectHex = text(src.expectHex);
  }

  if (f.serial) {
    if (text(src.serialPort)) cfg.serialPort = text(src.serialPort);
    if (typeof src.baudRate === 'number') cfg.baudRate = src.baudRate;
  }

  return Object.keys(cfg).length > 0 ? cfg : null;
};
