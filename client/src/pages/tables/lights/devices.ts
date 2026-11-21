import type { LightHubDiscovered } from '../../../offline/desktop';
import type {
  DiscoveredDevice,
  LightDeviceConfig,
  LightDriver,
  TableLightBulkItem,
  TableLightConfig,
} from '../../../types';

/**
 * QURILMALAR — chiroq sozlamalarining QURILMA bo'yicha ko'rinishi.
 *
 * Serverda sozlama STOL bo'yicha saqlanadi (har stolda drayver, manzil, kanal).
 * Klubda esa odatda bitta qurilma (masalan 8 kanalli plata yoki 4 kanalli Sonoff)
 * bir nechta stolga xizmat qiladi. Bu modul:
 *   - stollarni qurilmalarga GURUHLAYDI (bitta plata — bitta karta);
 *   - qurilma tahririni (kanal -> stol jadvali) serverga BITTA so'rovga aylantiradi
 *     (PUT /lights/tables — hammasi bitta tranzaksiyada).
 *
 * Kanallar foydalanuvchiga 1 dan ko'rsatiladi (platadagi yozuv bilan bir xil),
 * serverda esa 0 dan saqlanadi.
 */

export type DeviceKindId =
  | 'tuya'
  | 'sonoff'
  | 'shelly'
  | 'tasmota'
  | 'esphome'
  | 'modbus_tcp'
  | 'modbus_rtu'
  | 'usb_lcus'
  | 'usb_hid';

export type DeviceField =
  | 'host'
  | 'tuya'
  | 'sonoff'
  | 'shellyGen'
  | 'password'
  | 'entity'
  | 'modbus'
  | 'framing'
  | 'serialPort'
  | 'serialLine'
  | 'serialNumber';

export interface DeviceKind {
  id: DeviceKindId;
  /** Brend nomi — tarjima qilinmaydi */
  brand: string;
  /** Tavsif tarjima kaliti (lights.kind_<id>) */
  wireless: boolean;
  /** Kanal soni chegarasi */
  maxChannels: number;
  fields: readonly DeviceField[];
}

export const DEVICE_KINDS: readonly DeviceKind[] = [
  { id: 'tuya', brand: 'Tuya / Smart Life', wireless: true, maxChannels: 8, fields: ['host', 'tuya'] },
  { id: 'sonoff', brand: 'Sonoff (eWeLink)', wireless: true, maxChannels: 4, fields: ['host', 'sonoff'] },
  { id: 'shelly', brand: 'Shelly', wireless: true, maxChannels: 4, fields: ['host', 'shellyGen', 'password'] },
  { id: 'tasmota', brand: 'Tasmota', wireless: true, maxChannels: 8, fields: ['host', 'password'] },
  { id: 'esphome', brand: 'ESPHome', wireless: true, maxChannels: 1, fields: ['host', 'entity', 'password'] },
  { id: 'modbus_tcp', brand: 'Modbus TCP / Ethernet', wireless: false, maxChannels: 32, fields: ['host', 'modbus', 'framing'] },
  { id: 'modbus_rtu', brand: 'Modbus RTU (RS485)', wireless: false, maxChannels: 32, fields: ['serialPort', 'serialLine', 'modbus'] },
  { id: 'usb_lcus', brand: 'USB rele (CH340 / LCUS)', wireless: false, maxChannels: 8, fields: ['serialPort'] },
  { id: 'usb_hid', brand: 'USB rele (HID, USBRelay)', wireless: false, maxChannels: 8, fields: ['serialNumber'] },
];

export const deviceKind = (id: DeviceKindId): DeviceKind =>
  DEVICE_KINDS.find((kind) => kind.id === id) ?? DEVICE_KINDS[0];

/** Qurilma tahriri (forma holati) */
export interface DeviceDraft {
  kind: DeviceKindId;
  host: string;
  /** Tuya Device ID / eWeLink deviceid */
  deviceId: string;
  /**
   * Maxfiy qiymat: Tuya local key, Sonoff devicekey yoki rele paroli.
   * Bo'sh qoldirilsa SAQLANGAN qiymat o'zgarmaydi (serverga yuborilmaydi).
   */
  secret: string;
  /** Serverda maxfiy qiymat allaqachon saqlangan */
  hasSecret: boolean;
  tuyaVersion: '3.1' | '3.3' | '3.4' | '3.5';
  sonoffEncrypt: boolean;
  /** Ko'p kanalli Sonoff (4CH, Dual) — /zeroconf/switches (outlet) API */
  sonoffOutlets: boolean;
  shellyGen: 1 | 2;
  entity: string;
  unitId: number;
  modbusMode: 'coil' | 'register';
  framing: 'tcp' | 'rtu';
  serialPort: string;
  baudRate: number;
  parity: 'none' | 'even' | 'odd';
  serialNumber: string;
  inverted: boolean;
  /** Indeks — kanal (0 dan), qiymat — stol ID si (null — bo'sh) */
  channels: Array<number | null>;
}

export const emptyDraft = (kind: DeviceKindId, channelCount = 1): DeviceDraft => ({
  kind,
  host: '',
  deviceId: '',
  secret: '',
  hasSecret: false,
  tuyaVersion: '3.3',
  sonoffEncrypt: false,
  sonoffOutlets: kind === 'sonoff' && channelCount > 1,
  shellyGen: 2,
  entity: '',
  unitId: 1,
  modbusMode: 'coil',
  framing: 'tcp',
  serialPort: '',
  baudRate: 9600,
  parity: 'none',
  serialNumber: '',
  inverted: false,
  channels: Array.from({ length: Math.max(1, Math.min(channelCount, deviceKind(kind).maxChannels)) }, () => null),
});

/* ------------------------------------------------------------------ */
/*  Stol sozlamasi -> qurilma                                          */
/* ------------------------------------------------------------------ */

/** Stol sozlamasi qaysi qurilma turiga tegishli (ustada tahrirlab bo'lmasa null) */
export const kindOfTable = (row: Pick<TableLightConfig, 'driver' | 'config'>): DeviceKindId | null => {
  switch (row.driver) {
    case 'tuya': return 'tuya';
    case 'sonoff': return 'sonoff';
    case 'shelly_gen1':
    case 'shelly_gen2': return 'shelly';
    case 'tasmota': return 'tasmota';
    case 'esphome': return 'esphome';
    case 'modbus_tcp': return 'modbus_tcp';
    case 'modbus_rtu': return 'modbus_rtu';
    case 'usb_hid': return 'usb_hid';
    case 'serial': return row.config?.preset === 'lcus' ? 'usb_lcus' : null;
    default: return null; // mqtt, home_assistant, http, tcp, maxsus serial — stol bo'yicha sozlanadi
  }
};

const lower = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** Bitta qurilmaning kaliti: shu kalitli stollar bitta kartada ko'rsatiladi */
export const deviceKey = (row: Pick<TableLightConfig, 'driver' | 'host' | 'config'>): string | null => {
  const kind = kindOfTable(row);
  const config = row.config ?? {};
  switch (kind) {
    case 'tuya': return config.deviceId ? `tuya:${lower(config.deviceId)}` : null;
    case 'sonoff': return `sonoff:${lower(row.host)}`;
    case 'shelly': return `shelly:${lower(row.host)}`;
    case 'tasmota': return `tasmota:${lower(row.host)}`;
    case 'esphome': return `esphome:${lower(row.host)}:${lower(config.entity)}`;
    case 'modbus_tcp': return `modbus_tcp:${lower(row.host)}:${config.unitId ?? 1}`;
    case 'modbus_rtu': return `modbus_rtu:${lower(config.serialPort)}:${config.unitId ?? 1}`;
    case 'usb_lcus': return `usb_lcus:${lower(config.serialPort)}`;
    case 'usb_hid': return `usb_hid:${lower(config.serialNumber)}`;
    default: return null;
  }
};

export interface DeviceGroup {
  key: string;
  kind: DeviceKindId;
  /** Kartada ko'rsatiladigan manzil (IP, COM port, ID) */
  address: string;
  /** Guruhdagi birinchi stol sozlamasi — tahrir uchun asos */
  base: TableLightConfig;
  tables: Array<{ row: TableLightConfig; channels: number[] }>;
}

/** Stolning barcha kanallari: asosiy + qo'shimcha (bitta stolda 2–3 lampa) */
export const tableChannels = (row: Pick<TableLightConfig, 'channel' | 'config'>): number[] => {
  const list = [row.channel];
  for (const extra of row.config?.channels ?? []) if (!list.includes(extra)) list.push(extra);
  return list;
};

/** Faol stollarni qurilmalarga guruhlaydi; ustada tahrirlab bo'lmaydiganlari alohida */
export const groupDevices = (rows: TableLightConfig[]): { devices: DeviceGroup[]; advanced: TableLightConfig[] } => {
  const devices = new Map<string, DeviceGroup>();
  const advanced: TableLightConfig[] = [];
  for (const row of rows) {
    if (row.driver === 'none') continue;
    const key = deviceKey(row);
    const kind = kindOfTable(row);
    if (!key || !kind) {
      advanced.push(row);
      continue;
    }
    const address = kind === 'tuya'
      ? (row.host || row.config?.deviceId || '')
      : kind === 'modbus_rtu' || kind === 'usb_lcus'
        ? row.config?.serialPort ?? ''
        : kind === 'usb_hid'
          ? row.config?.serialNumber || 'USB'
          : row.host ?? '';
    const group = devices.get(key) ?? { key, kind, address, base: row, tables: [] };
    group.tables.push({ row, channels: tableChannels(row) });
    devices.set(key, group);
  }
  const list = Array.from(devices.values());
  for (const group of list) group.tables.sort((a, b) => Math.min(...a.channels) - Math.min(...b.channels));
  list.sort((a, b) => a.kind.localeCompare(b.kind) || a.address.localeCompare(b.address));
  return { devices: list, advanced };
};

/** Mavjud qurilma guruhidan tahrir qoralamasi */
export const draftFromGroup = (group: DeviceGroup): DeviceDraft => {
  const base = group.base;
  const config = base.config ?? {};
  const kind = group.kind;
  const maxUsed = Math.max(0, ...group.tables.flatMap((item) => item.channels));
  const draft = emptyDraft(kind, Math.min(maxUsed + 1, deviceKind(kind).maxChannels));
  // Kanal soni kamida ishlatilgan eng katta kanalgacha
  draft.channels = Array.from({ length: Math.max(maxUsed + 1, 1) }, () => null);
  for (const item of group.tables) {
    for (const channel of item.channels) {
      if (channel < draft.channels.length) draft.channels[channel] = item.row.tableId;
    }
  }
  return {
    ...draft,
    host: base.host ?? '',
    deviceId: config.deviceId ?? '',
    hasSecret: group.tables.some((item) => item.row.hasAuth),
    tuyaVersion: config.version ?? '3.3',
    sonoffEncrypt: config.encrypt === true,
    sonoffOutlets: config.outlets === true,
    shellyGen: base.driver === 'shelly_gen1' ? 1 : 2,
    entity: config.entity ?? '',
    unitId: config.unitId ?? 1,
    modbusMode: config.mode ?? 'coil',
    framing: config.framing ?? 'tcp',
    serialPort: config.serialPort ?? '',
    baudRate: config.baudRate ?? 9600,
    parity: config.parity ?? 'none',
    serialNumber: config.serialNumber ?? '',
    inverted: base.inverted,
  };
};

/* ------------------------------------------------------------------ */
/*  Qoralama -> serverga so'rov                                        */
/* ------------------------------------------------------------------ */

export type DraftIssue =
  | 'host'
  | 'tuyaId'
  | 'tuyaKey'
  | 'sonoffKey'
  | 'secretAgain'
  | 'entity'
  | 'serialPort'
  | 'noTables';

const HOST_RE = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?(:\d{1,5})?$/;

/** Qurilmaga avval ulanmagan stol qo'shilyaptimi */
const addsTables = (draft: DeviceDraft, savedIds: readonly number[]) =>
  draft.channels.some((tableId) => tableId !== null && !savedIds.includes(tableId));

/**
 * Saqlashdan oldin yetishmayotgan maydon (birinchisi) yoki null.
 *
 * Kalit/parol serverda HAR STOL uchun alohida saqlanadi va brauzerga hech
 * qachon qaytmaydi. Shuning uchun qurilmaga YANGI stol qo'shilganda kalitni
 * qayta kiritish kerak — aks holda yangi stolda kalit bo'lmaydi (yoki boshqa
 * qurilmaning eski kaliti qoladi).
 *
 * @param savedIds serverda hozir shu qurilmaga ulangan stollar
 */
export const draftIssue = (draft: DeviceDraft, savedIds: readonly number[] = []): DraftIssue | null => {
  const kind = deviceKind(draft.kind);
  const typed = draft.secret.trim();
  const secretAgain = !typed && draft.hasSecret && addsTables(draft, savedIds);
  if (kind.fields.includes('host') && !HOST_RE.test(draft.host.trim())) return 'host';
  if (draft.kind === 'tuya') {
    // Tuya ID odatda 20–22 belgi; lokal kalit — aniq 16 ta belgi
    if (!/^[A-Za-z0-9]{10,40}$/.test(draft.deviceId.trim())) return 'tuyaId';
    if (typed ? typed.length !== 16 : !draft.hasSecret) return 'tuyaKey';
    if (secretAgain) return 'secretAgain';
  }
  if (draft.kind === 'sonoff' && draft.sonoffEncrypt) {
    if (!/^[A-Za-z0-9]{6,40}$/.test(draft.deviceId.trim())) return 'tuyaId';
    if (!typed && !draft.hasSecret) return 'sonoffKey';
    if (secretAgain) return 'secretAgain';
  }
  if (kind.fields.includes('password') && secretAgain) return 'secretAgain';
  if (draft.kind === 'esphome' && !/^[a-z0-9_]+$/.test(draft.entity.trim().toLowerCase())) return 'entity';
  if (kind.fields.includes('serialPort') && !draft.serialPort.trim()) return 'serialPort';
  if (!draft.channels.some((tableId) => tableId !== null)) return 'noTables';
  return null;
};

/** Qurilma turi -> serverdagi drayver */
export const driverOf = (draft: DeviceDraft): LightDriver => {
  switch (draft.kind) {
    case 'shelly': return draft.shellyGen === 1 ? 'shelly_gen1' : 'shelly_gen2';
    case 'usb_lcus': return 'serial';
    default: return draft.kind as LightDriver;
  }
};

/** Qurilma turiga xos sozlama (kanallardan tashqari) */
const baseConfig = (draft: DeviceDraft): LightDeviceConfig => {
  switch (draft.kind) {
    case 'tuya':
      return { deviceId: draft.deviceId.trim(), version: draft.tuyaVersion };
    case 'sonoff':
      return {
        encrypt: draft.sonoffEncrypt,
        ...(draft.deviceId.trim() ? { deviceId: draft.deviceId.trim() } : {}),
        // Ko'p kanalli Sonoff (4CH, Dual) — outlet bo'yicha API. Aniq bayroq:
        // 4CH da faqat 1-kanal ishlatilsa ham outlet API saqlanib qoladi
        outlets: draft.sonoffOutlets || draft.channels.length > 1,
      };
    case 'esphome':
      return { entity: draft.entity.trim().toLowerCase() };
    case 'modbus_tcp':
      return { unitId: draft.unitId, mode: draft.modbusMode, framing: draft.framing };
    case 'modbus_rtu':
      return {
        serialPort: draft.serialPort.trim(), baudRate: draft.baudRate, parity: draft.parity,
        unitId: draft.unitId, mode: draft.modbusMode,
      };
    case 'usb_lcus':
      return { serialPort: draft.serialPort.trim(), baudRate: draft.baudRate || 9600, preset: 'lcus' };
    case 'usb_hid':
      return draft.serialNumber.trim() ? { serialNumber: draft.serialNumber.trim() } : {};
    default:
      return {};
  }
};

const usesHost = (kind: DeviceKindId) => deviceKind(kind).fields.includes('host');

/**
 * Qurilma tahririni serverga yuboriladigan ro'yxatga aylantiradi.
 *  - har stolga: shu qurilma + uning kanal(lar)i (bitta stol bir nechta kanalda
 *    bo'lsa — eng kichigi asosiy, qolganlari qo'shimcha lampalar);
 *  - avval shu qurilmada bo'lib, endi olib tashlangan stollar — "ulanmagan".
 *
 * @param previous tahrirdan OLDIN shu qurilmaga ulangan stollar ID lari
 */
export const buildBulkPayload = (draft: DeviceDraft, previous: number[] = []): TableLightBulkItem[] => {
  const byTable = new Map<number, number[]>();
  draft.channels.forEach((tableId, channel) => {
    if (tableId === null) return;
    byTable.set(tableId, [...(byTable.get(tableId) ?? []), channel]);
  });
  const driver = driverOf(draft);
  const secret = draft.secret.trim();
  const items: TableLightBulkItem[] = [];
  for (const [tableId, channels] of byTable) {
    const sorted = [...channels].sort((a, b) => a - b);
    const config = { ...baseConfig(draft), ...(sorted.length > 1 ? { channels: sorted.slice(1) } : {}) };
    items.push({
      tableId,
      driver,
      host: usesHost(draft.kind) ? draft.host.trim() : null,
      channel: sorted[0],
      inverted: draft.inverted,
      onUrl: null,
      offUrl: null,
      config: Object.keys(config).length ? config : null,
      // Maxfiy qiymat kiritilgan bo'lsa — hamma stolga. Kiritilmagan bo'lsa:
      // shu qurilmada avvaldan bor stolda saqlangani qoladi, YANGI qo'shilgan
      // stoldan esa boshqa qurilmadan qolgan eski parol tozalanadi
      ...(secret ? { auth: secret } : previous.includes(tableId) ? {} : { auth: null }),
    });
  }
  for (const tableId of previous) {
    if (byTable.has(tableId)) continue;
    items.push({ tableId, driver: 'none', host: null, onUrl: null, offUrl: null, config: null, auth: null });
  }
  return items;
};

/** Bo'sh kanallarni tanlangan stoldan boshlab ketma-ket to'ldiradi */
export const fillSequential = (
  draft: DeviceDraft,
  tables: Array<{ tableId: number; tableNumber: number }>,
  startTableId: number | null,
): DeviceDraft => {
  const ordered = [...tables].sort((a, b) => a.tableNumber - b.tableNumber);
  const startIndex = Math.max(0, ordered.findIndex((item) => item.tableId === startTableId));
  const used = new Set(draft.channels.filter((id): id is number => id !== null));
  const queue = ordered.slice(startIndex).map((item) => item.tableId).filter((id) => !used.has(id));
  return {
    ...draft,
    channels: draft.channels.map((tableId) => (tableId === null ? queue.shift() ?? null : tableId)),
  };
};

/* ------------------------------------------------------------------ */
/*  Qidiruvda topilgan qurilmalar                                      */
/* ------------------------------------------------------------------ */

export interface FoundDevice {
  key: string;
  /**
   * Ustada tanlanadigan tur. COM port uchun null: port CH340 rele platasi ham,
   * USB-RS485 adapter ham bo'lishi mumkin — turini foydalanuvchi tanlaydi.
   */
  kind: DeviceKindId | null;
  title: string;
  /** IP, COM port yoki plata ID */
  address: string;
  details: string;
  channels: number | null;
  prefill: Partial<DeviceDraft>;
}

const DRIVER_KIND: Readonly<Record<string, DeviceKindId>> = {
  shelly_gen1: 'shelly',
  shelly_gen2: 'shelly',
  tasmota: 'tasmota',
  esphome: 'esphome',
  tuya: 'tuya',
  sonoff: 'sonoff',
  modbus_tcp: 'modbus_tcp',
  usb_hid: 'usb_hid',
};

const TUYA_VERSIONS = ['3.1', '3.3', '3.4', '3.5'] as const;
const isTuyaVersion = (value: unknown): value is DeviceDraft['tuyaVersion'] =>
  typeof value === 'string' && (TUYA_VERSIONS as readonly string[]).includes(value);

const emptyChannels = (count: number | null): Partial<DeviceDraft> =>
  count ? { channels: Array.from({ length: count }, () => null) } : {};

/** Kompyuter (markaz) yoki agent qidiruvi natijasini ustaga mos shaklga keltiradi */
export function foundDevice(device: LightHubDiscovered | DiscoveredDevice): FoundDevice | null {
  const item = device as LightHubDiscovered;
  const driver = item.driver ?? '';
  const host = (item.host ?? '').trim();
  const channels = typeof item.channels === 'number' && item.channels > 0 ? Math.min(Math.round(item.channels), 32) : null;
  const details = [item.model, item.mac, item.version ? `v${item.version}` : ''].filter(Boolean).join(' · ');
  const title = item.name || item.model || host || item.serialPort || item.serialNumber || '—';

  if (driver === 'serial') {
    const port = (item.serialPort ?? '').trim();
    if (!port) return null;
    return { key: `serial:${port.toLowerCase()}`, kind: null, title, address: port, details, channels: null, prefill: { serialPort: port } };
  }
  if (driver === 'usb_hid') {
    const serial = (item.serialNumber ?? '').trim();
    return {
      key: `usb_hid:${serial.toLowerCase() || 'default'}`,
      kind: 'usb_hid',
      title,
      address: serial || 'USB',
      details,
      channels,
      prefill: { serialNumber: serial, ...emptyChannels(channels ? Math.min(channels, 8) : null) },
    };
  }
  if (!host) return null;
  const kind = DRIVER_KIND[driver] ?? null;
  const prefill: Partial<DeviceDraft> = {
    host,
    ...emptyChannels(kind && channels ? Math.min(channels, deviceKind(kind).maxChannels) : null),
  };
  if (driver === 'shelly_gen1') prefill.shellyGen = 1;
  if (driver === 'shelly_gen2') prefill.shellyGen = 2;
  if (kind === 'tuya') {
    if (item.id) prefill.deviceId = item.id;
    if (isTuyaVersion(item.version)) prefill.tuyaVersion = item.version;
  }
  if (kind === 'sonoff') {
    if (item.id) prefill.deviceId = item.id;
    if (typeof item.encrypt === 'boolean') prefill.sonoffEncrypt = item.encrypt;
    if ((channels ?? 1) > 1) prefill.sonoffOutlets = true;
  }
  return { key: `${kind ?? 'host'}:${host.toLowerCase()}`, kind, title, address: host, details, channels, prefill };
}

const hostOnly = (value: string | null | undefined) => lower(value).replace(/:\d+$/, '');

/** Topilgan qurilma allaqachon biror stolga ulanganmi */
export function isFoundConnected(found: FoundDevice, groups: DeviceGroup[]): boolean {
  return groups.some((group) => {
    const config = group.base.config ?? {};
    if (found.key.startsWith('serial:')) {
      return (group.kind === 'usb_lcus' || group.kind === 'modbus_rtu') && lower(config.serialPort) === lower(found.address);
    }
    if (found.kind === 'usb_hid') {
      // ID siz sozlangan plata — "kompyuterdagi yagona plata": topilgani shu
      return group.kind === 'usb_hid'
        && (!config.serialNumber || lower(config.serialNumber) === lower(found.prefill.serialNumber));
    }
    if (found.kind === 'tuya' && found.prefill.deviceId && group.kind === 'tuya') {
      return lower(config.deviceId) === lower(found.prefill.deviceId);
    }
    return !!group.base.host && hostOnly(group.base.host) === hostOnly(found.address);
  });
}
