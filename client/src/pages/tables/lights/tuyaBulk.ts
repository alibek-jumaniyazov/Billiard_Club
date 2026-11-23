/**
 * TUYA QURILMALARINI OMMAVIY ULASH — sof mantiq (UI siz, testlanadi).
 *
 * Har bir Wi‑Fi automat (yoki rele) — alohida qurilma va alohida stol. Ma'lumot uch manbadan
 * birlashtiriladi (qurilma ID si bo'yicha):
 *   - Tuya bulutidan: nom (Smart Life dagi), local key, yoqish DP i (kompyuter dasturi 1.4.3+);
 *   - tarmoq qidiruvidan: IP manzil va protokol versiyasi (qurilmaning o'z e'loni);
 *   - serverdagi saqlangan sozlamadan: qaysi stolga ulangani, saqlangan kalit, DP.
 * Stol nomdan tanlanadi ("Stol 3", "3-stol", "3") yoki bo'sh stollar tartib bilan beriladi.
 * Natija — bitta so'rovli ro'yxat (server uni bitta tranzaksiyada saqlaydi).
 */
import type { TuyaCloudDevice } from '../../../offline/desktop';
import type { TableLightBulkItem, TableLightConfig } from '../../../types';
import { HOST_RE, tuyaDpOf, type DeviceDraft, type DeviceGroup, type FoundDevice } from './devices';

export type TuyaVersion = DeviceDraft['tuyaVersion'];

export interface TuyaBulkRow {
  /** Qurilma ID si (kichik harflarda) — qator kaliti */
  key: string;
  deviceId: string;
  /** Smart Life dagi nom (bo'lmasa bo'sh) */
  name: string;
  host: string;
  version: TuyaVersion;
  /** Versiya qurilmaning tarmoqdagi e'lonidan olingan */
  versionFound: boolean;
  dp: number;
  /** DP bulut modelidan aniqlangan */
  dpFromCloud: boolean;
  /** Kiritilgan yoki bulutdan olingan kalit; bo'sh — saqlangani qoladi */
  localKey: string;
  keyFromCloud: boolean;
  inverted: boolean;
  /** Serverda HOZIR shu qurilmaga ulangan stollar */
  savedTableIds: number[];
  /** Saqlangan stolda kalit bor */
  hasSavedKey: boolean;
  /** Ko'p kanalli yoki 1-kanaldan boshqa kanalli saqlangan qurilma — bu yerda o'zgartirilmaydi */
  multi: boolean;
  inLan: boolean;
  inCloud: boolean;
  online: boolean | null;
  tableId: number | null;
  include: boolean;
}

type TableLike = Pick<TableLightConfig, 'tableId' | 'tableNumber' | 'isActive' | 'driver'>;

const PRIVATE_IP = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

/**
 * Qurilma nomidan stol: "Stol 3", "3-stol", "стол 3", "Table 3", "#3" yoki shunchaki "3".
 * Model nomlaridagi raqamlar ("JGQW01-63", "Smart Breaker 63A") stol deb olinmaydi.
 */
export function tableFromName(name: string, tables: readonly TableLike[]): number | null {
  const text = name.trim().toLowerCase();
  if (!text) return null;
  const match =
    /^#?\s*(\d{1,3})\s*$/.exec(text) ??
    /(?:^|[^a-zа-я])(?:stol|стол|table|bilyard|billiard|бильярд)\s*[-#№.]?\s*(\d{1,3})(?!\d)/i.exec(text) ??
    /(?:^|\D)(\d{1,3})\s*[-–.]?\s*(?:stol|стол|table)(?![a-zа-я])/i.exec(text);
  if (!match) return null;
  const number = Number(match[1]);
  const row = tables.find((item) => item.isActive && item.tableNumber === number);
  return row ? row.tableId : null;
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

interface LanHit {
  /** Qurilma e'lonidagi ID (asl yozilishi bilan) */
  deviceId: string;
  host: string;
  version?: TuyaVersion;
}

/** Tarmoqda topilgan Tuya qurilmalari: kichik harfli ID → IP va versiya */
function lanIndex(found: readonly FoundDevice[]): Map<string, LanHit> {
  const lan = new Map<string, LanHit>();
  for (const item of found) {
    const id = item.kind === 'tuya' ? item.prefill.deviceId?.trim() : '';
    if (id && !lan.has(id.toLowerCase())) lan.set(id.toLowerCase(), { deviceId: id, host: item.address, version: item.prefill.tuyaVersion });
  }
  return lan;
}

/** Faqat tarmoqda topilgan (bulutda ham, serverda ham yo'q) qurilma qatori */
const lanOnlyRow = (key: string, hit: LanHit): TuyaBulkRow => ({
  key,
  deviceId: hit.deviceId,
  name: '',
  host: hit.host,
  version: hit.version ?? '3.3',
  versionFound: Boolean(hit.version),
  dp: 1,
  dpFromCloud: false,
  localKey: '',
  keyFromCloud: false,
  inverted: false,
  savedTableIds: [],
  hasSavedKey: false,
  multi: false,
  inLan: true,
  inCloud: false,
  online: null,
  tableId: null,
  include: true,
});

/** Bulut, qidiruv va saqlangan sozlamalarni bitta ro'yxatga birlashtiradi */
export function mergeTuyaRows(input: {
  cloud: readonly TuyaCloudDevice[];
  found: readonly FoundDevice[];
  groups: readonly DeviceGroup[];
  tables: readonly TableLike[];
}): TuyaBulkRow[] {
  const lan = lanIndex(input.found);
  const saved = new Map<string, DeviceGroup>();
  for (const group of input.groups) {
    const id = group.kind === 'tuya' ? group.base.config?.deviceId?.trim() : '';
    if (id) saved.set(id.toLowerCase(), group);
  }
  const cloud = new Map<string, TuyaCloudDevice>();
  for (const device of input.cloud) {
    const id = device.id?.trim();
    if (id && !cloud.has(id.toLowerCase())) cloud.set(id.toLowerCase(), device);
  }

  const keys = [...cloud.keys(), ...lan.keys(), ...saved.keys()].filter((key, index, list) => list.indexOf(key) === index);
  const rows: TuyaBulkRow[] = keys.map((key) => {
    const fromCloud = cloud.get(key);
    const fromLan = lan.get(key);
    const group = saved.get(key);
    if (fromLan && !fromCloud && !group) return lanOnlyRow(key, fromLan);
    const deviceId = fromCloud?.id.trim() ?? group?.base.config?.deviceId?.trim() ?? fromLan?.deviceId ?? key;
    const savedTableIds = group ? group.tables.map((item) => item.row.tableId) : [];
    const multi = group ? group.tables.length > 1 || group.tables.some((item) => item.channels.some((channel) => channel !== 0)) : false;
    const cloudIp = fromCloud?.ip && PRIVATE_IP.test(fromCloud.ip) ? fromCloud.ip : '';
    const dpCloud = typeof fromCloud?.switchDp === 'number' && fromCloud.switchDp >= 1 && fromCloud.switchDp <= 255 ? fromCloud.switchDp : null;
    const name = fromCloud?.name?.trim() ?? '';
    return {
      key,
      deviceId,
      name,
      host: fromLan?.host ?? (cloudIp || group?.base.host || ''),
      version: fromLan?.version ?? group?.base.config?.version ?? '3.3',
      versionFound: Boolean(fromLan?.version),
      dp: dpCloud ?? (group ? tuyaDpOf(group.base) : 1),
      dpFromCloud: dpCloud !== null,
      localKey: fromCloud?.localKey?.length === 16 ? fromCloud.localKey : '',
      keyFromCloud: fromCloud?.localKey?.length === 16,
      inverted: group?.base.inverted ?? false,
      savedTableIds,
      hasSavedKey: group ? group.tables.some((item) => item.row.hasAuth) : false,
      multi,
      inLan: Boolean(fromLan),
      inCloud: Boolean(fromCloud),
      online: fromCloud ? fromCloud.online === true : null,
      tableId: savedTableIds[0] ?? null,
      include: !multi && Boolean(fromCloud || fromLan),
    };
  });

  // Nom bo'yicha; bir xil nomlilar (masalan, hammasi "Smart Breaker") — IP va ID bo'yicha, tartib doim bir xil
  rows.sort(
    (a, b) =>
      naturalCompare(a.name || a.host || a.deviceId, b.name || b.host || b.deviceId) ||
      naturalCompare(a.host, b.host) ||
      naturalCompare(a.key, b.key),
  );

  // Nomdan stol (saqlangan stoli yo'q qatorlar uchun); bitta stol ikki marta berilmaydi
  const used = new Set(rows.map((row) => row.tableId).filter((id): id is number => id !== null));
  for (const row of rows) {
    if (row.tableId !== null || row.multi) continue;
    const byName = tableFromName(row.name, input.tables);
    if (byName !== null && !used.has(byName)) {
      row.tableId = byName;
      used.add(byName);
    }
  }
  return rows;
}

/**
 * Ro'yxatni stol raqami bo'yicha tartiblaydi — ekran stollar tartibini takrorlaydi.
 * Stoli yo'q yoki tanlanmagan qatorlar oxirida, o'zaro avvalgi tartibida qoladi.
 */
export function sortByTable(rows: readonly TuyaBulkRow[], tables: readonly TableLike[]): TuyaBulkRow[] {
  const numberOf = new Map(tables.map((row) => [row.tableId, row.tableNumber]));
  const rank = (row: TuyaBulkRow) =>
    row.include && row.tableId !== null ? numberOf.get(row.tableId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }) => row);
}

/**
 * Moslash bosqichida tarmoq qayta qidirilgach: mavjud qatorlarda IP va versiya yangilanadi
 * (kiritilgan kalit, stol va DP o'zgarmaydi), yangi topilgan qurilmalar ro'yxat oxiriga
 * qo'shiladi. Avval hech qayerda topilmagan saqlangan qurilma endi topilsa — tanlanadi
 * (birinchi ro'yxatdagi qoida bilan bir xil). O'zgarish bo'lmasa — o'sha massiv qaytadi.
 */
export function refreshFromLan(rows: TuyaBulkRow[], found: readonly FoundDevice[]): TuyaBulkRow[] {
  const lan = lanIndex(found);
  let changed = false;
  const next = rows.map((row) => {
    const hit = lan.get(row.key);
    if (!hit) return row;
    const version = hit.version ?? row.version;
    if (row.inLan && row.host === hit.host && row.version === version) return row;
    changed = true;
    return {
      ...row,
      host: hit.host,
      version,
      versionFound: row.versionFound || Boolean(hit.version),
      inLan: true,
      include: row.include || (!row.multi && !row.inLan && !row.inCloud),
    };
  });
  const known = new Set(rows.map((row) => row.key));
  for (const [key, hit] of lan) {
    if (known.has(key)) continue;
    changed = true;
    next.push(lanOnlyRow(key, hit));
  }
  return changed ? next : rows;
}

/**
 * Saqlangandan keyin ro'yxatni serverdagi yangi holatga keltiradi: tanlangan qurilmalar endi
 * o'z stollarida (kaliti bilan) saqlangan, ulardan olingan stollar boshqa qatorlarda "saqlangan"
 * hisoblanmaydi. Shunda "Orqaga" qaytib qayta saqlaganda eski stol ulanib qolmaydi.
 */
export function rebaseAfterSave(rows: readonly TuyaBulkRow[]): TuyaBulkRow[] {
  const taken = new Set(rows.filter((row) => row.include && row.tableId !== null).map((row) => row.tableId as number));
  return rows.map((row) => {
    if (row.include && row.tableId !== null) return { ...row, savedTableIds: [row.tableId], hasSavedKey: true };
    const kept = row.savedTableIds.filter((id) => !taken.has(id));
    return kept.length === row.savedTableIds.length ? row : { ...row, savedTableIds: kept, hasSavedKey: row.hasSavedKey && kept.length > 0 };
  });
}

/**
 * Stoli yo'q tanlangan qatorlarga bo'sh stollarni tartib bilan beradi. Bo'sh stol —
 * faol, chirog'i ulanmagan va shu ro'yxatda band emas (yoki shu ro'yxatda TANLANGAN
 * qurilmaniki). Tanlanmagan qurilmaning stoli band hisoblanadi — u o'zgartirilmaydi.
 */
export function autoFillTables(rows: readonly TuyaBulkRow[], tables: readonly TableLike[]): TuyaBulkRow[] {
  const ownTables = new Set(rows.filter((row) => row.include).flatMap((row) => row.savedTableIds));
  const chosen = new Set(rows.filter((row) => row.include && row.tableId !== null).map((row) => row.tableId as number));
  const free = tables
    .filter((row) => row.isActive && (row.driver === 'none' || ownTables.has(row.tableId)) && !chosen.has(row.tableId))
    .sort((a, b) => a.tableNumber - b.tableNumber)
    .map((row) => row.tableId);
  return rows.map((row) => {
    if (!row.include || row.tableId !== null || row.multi) return row;
    const next = free.shift();
    return next === undefined ? row : { ...row, tableId: next };
  });
}

export type TuyaBulkIssue = 'host' | 'key' | 'dp' | 'table' | 'dupTable' | null;

/** Qator xatosi (birinchisi) yoki null */
export function rowIssue(row: TuyaBulkRow, rows: readonly TuyaBulkRow[]): TuyaBulkIssue {
  if (!row.include) return null;
  if (!HOST_RE.test(row.host.trim())) return 'host';
  const key = row.localKey.trim();
  const keepsSaved = row.hasSavedKey && row.tableId !== null && row.savedTableIds.includes(row.tableId);
  if (key ? key.length !== 16 : !keepsSaved) return 'key';
  if (!Number.isInteger(row.dp) || row.dp < 1 || row.dp > 255) return 'dp';
  if (row.tableId === null) return 'table';
  if (rows.some((other) => other !== row && other.include && other.tableId === row.tableId)) return 'dupTable';
  return null;
}

/**
 * Serverga yuboriladigan ro'yxat: har tanlangan qurilma — o'z stoliga (1-kanal, DP standartdan
 * farq qilsa `dps`). Shu qurilmalarning avvalgi stollari endi hech kimga berilmagan bo'lsa —
 * "ulanmagan" bo'ladi. Kalit kiritilmagan bo'lsa yuborilmaydi (saqlangani qoladi).
 */
export function buildTuyaBulkPayload(rows: readonly TuyaBulkRow[]): TableLightBulkItem[] {
  const items: TableLightBulkItem[] = [];
  const assigned = new Set<number>();
  for (const row of rows) {
    if (!row.include || row.tableId === null || assigned.has(row.tableId)) continue;
    assigned.add(row.tableId);
    const key = row.localKey.trim();
    items.push({
      tableId: row.tableId,
      driver: 'tuya',
      host: row.host.trim(),
      channel: 0,
      inverted: row.inverted,
      onUrl: null,
      offUrl: null,
      config: { deviceId: row.deviceId.trim(), version: row.version, ...(row.dp !== 1 ? { dps: [row.dp] } : {}) },
      ...(key ? { auth: key } : {}),
    });
  }
  for (const row of rows) {
    if (!row.include) continue;
    for (const tableId of row.savedTableIds) {
      if (assigned.has(tableId)) continue;
      assigned.add(tableId);
      items.push({ tableId, driver: 'none', host: null, onUrl: null, offUrl: null, config: null, auth: null });
    }
  }
  return items;
}
