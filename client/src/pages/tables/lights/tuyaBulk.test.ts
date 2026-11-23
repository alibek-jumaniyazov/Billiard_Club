import { describe, expect, it } from 'vitest';
import type { TuyaCloudDevice } from '../../../offline/desktop';
import type { TableLightConfig } from '../../../types';
import { foundDevice, groupDevices, type FoundDevice } from './devices';
import {
  autoFillTables,
  buildTuyaBulkPayload,
  mergeTuyaRows,
  rebaseAfterSave,
  refreshFromLan,
  rowIssue,
  sortByTable,
  tableFromName,
  type TuyaBulkRow,
} from './tuyaBulk';

/**
 * Ommaviy ulash: 8 ta Wi‑Fi automat — 8 ta stol. Xato moslash boshqa stol chirog'ini
 * yoqib yuborardi, shuning uchun nom → stol, kalit, DP va "ulanmagan" qoidalari shu yerda.
 */

const table = (n: number, patch: Partial<TableLightConfig> = {}): TableLightConfig => ({
  tableId: 100 + n, tableNumber: n, tableName: `Stol ${n}`, isActive: true, driver: 'none', host: null,
  channel: 0, inverted: false, hasAuth: false, onUrl: null, offUrl: null, config: null, overrideOn: null,
  overrideUntil: null, state: null, syncedAt: null, error: null, ...patch,
});

const tables = Array.from({ length: 8 }, (_, i) => table(i + 1));
const KEY = (n: number) => `k${n}`.padEnd(16, 'x');
const ID = (n: number) => `bf41049d74f1dd0762${n}nle`;

const lan = (n: number, version = '3.5'): FoundDevice =>
  foundDevice({ driver: 'tuya', host: `192.168.100.${13 + n}`, id: ID(n), version, needs: ['localKey'] })!;
const cloudDevice = (n: number, patch: Partial<TuyaCloudDevice> = {}): TuyaCloudDevice => ({
  id: ID(n), name: `Stol ${n}`, localKey: KEY(n), online: true, switchDp: 16, ...patch,
});

describe('tableFromName', () => {
  it('stol raqamini nomdan oladi, model raqamlarini olmaydi', () => {
    expect(tableFromName('Stol 3', tables)).toBe(103);
    expect(tableFromName('3-stol', tables)).toBe(103);
    expect(tableFromName('стол 7', tables)).toBe(107);
    expect(tableFromName('Table #2', tables)).toBe(102);
    expect(tableFromName(' 5 ', tables)).toBe(105);
    expect(tableFromName('JGQW01-63', tables)).toBeNull();
    expect(tableFromName('Smart Breaker 63A', tables)).toBeNull();
    expect(tableFromName('Stol 12', tables)).toBeNull(); // 12-stol yo'q
    expect(tableFromName('', tables)).toBeNull();
  });
});

describe('mergeTuyaRows', () => {
  it('bulut + qidiruv: IP va versiya tarmoqdan, kalit, DP va nom bulutdan; stol nomdan', () => {
    const rows = mergeTuyaRows({
      cloud: [cloudDevice(2), cloudDevice(1)],
      found: [lan(1), lan(2, '3.4'), lan(3)],
      groups: [],
      tables,
    });
    // Nom bo'yicha tabiiy tartib; nomsiz (faqat tarmoqda topilgan) qator IP si bo'yicha
    expect(rows.map((row) => row.name || row.host)).toEqual(['192.168.100.16', 'Stol 1', 'Stol 2']);
    const s1 = rows.find((row) => row.deviceId === ID(1))!;
    expect(s1).toMatchObject({
      host: '192.168.100.14', version: '3.5', versionFound: true, dp: 16, dpFromCloud: true,
      localKey: KEY(1), keyFromCloud: true, tableId: 101, include: true, inLan: true, inCloud: true,
    });
    expect(rows.find((row) => row.deviceId === ID(2))).toMatchObject({ version: '3.4', tableId: 102 });
    // Faqat tarmoqda topilgan (bulutda yo'q): kalit qo'lda kiritiladi, DP standart 1
    const s3 = rows.find((row) => row.deviceId === ID(3))!;
    expect(s3).toMatchObject({ inCloud: false, localKey: '', dp: 1, tableId: null, include: true });
    expect(rowIssue(s3, rows)).toBe('key');
  });

  it('saqlangan qurilma: stoli, DP va saqlangan kaliti saqlanadi; bulut DP i ustun', () => {
    const saved = groupDevices([
      table(2, { driver: 'tuya', host: '192.168.100.15', hasAuth: true, config: { deviceId: ID(5), version: '3.5' } }),
    ]).devices;
    const rows = mergeTuyaRows({ cloud: [cloudDevice(5, { name: 'Automat' })], found: [], groups: saved, tables });
    expect(rows[0]).toMatchObject({ tableId: 102, savedTableIds: [102], hasSavedKey: true, dp: 16, host: '192.168.100.15' });
    // Bulutsiz: saqlangan DP (1) va saqlangan kalit bilan muammo yo'q
    const offline = mergeTuyaRows({ cloud: [], found: [lan(5)], groups: saved, tables });
    expect(offline[0]).toMatchObject({ dp: 1, localKey: '', tableId: 102, include: true });
    expect(rowIssue(offline[0], offline)).toBeNull();
  });

  it('ko‘p kanalli saqlangan qurilma ommaviy ro‘yxatda o‘zgartirilmaydi', () => {
    const saved = groupDevices([
      table(1, { driver: 'tuya', host: '10.0.0.5', config: { deviceId: ID(7), version: '3.3' } }),
      table(2, { driver: 'tuya', host: '10.0.0.5', channel: 1, config: { deviceId: ID(7), version: '3.3' } }),
    ]).devices;
    const [row] = mergeTuyaRows({ cloud: [cloudDevice(7)], found: [], groups: saved, tables });
    expect(row).toMatchObject({ multi: true, include: false });
    expect(buildTuyaBulkPayload([row])).toEqual([]);
  });
});

describe('autoFillTables va rowIssue', () => {
  it('stoli yo‘q qatorlarga bo‘sh stollar tartib bilan; band stollar va takror tekshiriladi', () => {
    const busy = tables.map((row) => (row.tableNumber === 1 ? { ...row, driver: 'shelly_gen2' as const } : row));
    const rows: TuyaBulkRow[] = mergeTuyaRows({
      cloud: [cloudDevice(1, { name: 'Automat A' }), cloudDevice(2, { name: 'Automat B' }), cloudDevice(3, { name: 'Stol 2' })],
      found: [lan(1), lan(2), lan(3)],
      groups: [],
      tables: busy,
    });
    const filled = autoFillTables(rows, busy);
    // "Stol 2" o'zi 2-stolni oldi; qolganlar 1-stolni (boshqa rele bilan band) o'tkazib, 3 va 4 ni oldi
    expect(filled.map((row) => [row.name, row.tableId])).toEqual([
      ['Automat A', 103],
      ['Automat B', 104],
      ['Stol 2', 102],
    ]);
    expect(filled.every((row) => rowIssue(row, filled) === null)).toBe(true);
    const dup = filled.map((row, i) => (i === 1 ? { ...row, tableId: 103 } : row));
    expect(rowIssue(dup[1], dup)).toBe('dupTable');
    expect(rowIssue({ ...filled[0], host: 'http://x' }, filled)).toBe('host');
    expect(rowIssue({ ...filled[0], dp: 0 }, filled)).toBe('dp');
    expect(rowIssue({ ...filled[0], localKey: 'qisqa' }, filled)).toBe('key');
    expect(rowIssue({ ...filled[0], tableId: null }, filled)).toBe('table');
    expect(rowIssue({ ...filled[0], include: false, host: '' }, filled)).toBeNull();
  });
});

describe('buildTuyaBulkPayload', () => {
  it('har qurilma o‘z stoliga, DP 16 — dps, kalit faqat bor bo‘lsa; ko‘chgan qurilmaning eski stoli ulanmagan', () => {
    const saved = groupDevices([
      table(2, { driver: 'tuya', host: '192.168.100.15', hasAuth: true, config: { deviceId: ID(1), version: '3.5' } }),
    ]).devices;
    const rows = mergeTuyaRows({ cloud: [cloudDevice(1, { name: 'Stol 1' }), cloudDevice(2)], found: [lan(1), lan(2)], groups: saved, tables });
    // ID(1) 2-stolda saqlangan (shuning uchun ID(2) "Stol 2" nomi bilan 2-stolni ololmadi);
    // foydalanuvchi ID(1) ni 1-stolga ko'chiradi va "avtomatik to'ldirish"ni bosadi
    expect(rows.find((row) => row.deviceId === ID(2))?.tableId).toBeNull();
    const moved = autoFillTables(rows.map((row) => (row.deviceId === ID(1) ? { ...row, tableId: 101 } : row)), tables);
    const items = buildTuyaBulkPayload(moved);
    expect(items).toContainEqual({
      tableId: 101, driver: 'tuya', host: '192.168.100.14', channel: 0, inverted: false, onUrl: null, offUrl: null,
      config: { deviceId: ID(1), version: '3.5', dps: [16] }, auth: KEY(1),
    });
    // 2-stol endi ID(2) niki (nom "Stol 2") — "ulanmagan" yozuvi qo'shilmaydi
    expect(items.find((item) => item.tableId === 102)).toMatchObject({ driver: 'tuya', config: { deviceId: ID(2) } });
    expect(items.filter((item) => item.tableId === 102)).toHaveLength(1);
    // ID(2) ni o'chirib qo'ysak — 2-stol bo'shaydi
    const without = moved.map((row) => (row.deviceId === ID(2) ? { ...row, include: false } : row));
    expect(buildTuyaBulkPayload(without)).toContainEqual({ tableId: 102, driver: 'none', host: null, onUrl: null, offUrl: null, config: null, auth: null });
    // DP 1 — dps yo'q, kalit kiritilmagan — auth yuborilmaydi
    const plain = buildTuyaBulkPayload([{ ...moved[0], dp: 1, localKey: '', tableId: 102 }]);
    expect(plain[0].config).toEqual({ deviceId: moved[0].deviceId, version: moved[0].version });
    expect('auth' in plain[0]).toBe(false);
  });
});

describe('tanlanmagan qurilma himoyasi', () => {
  it('tanlanmagan (topilmagan) saqlangan qurilmaning stoli bo‘sh hisoblanmaydi', () => {
    const withSaved = tables.map((row) =>
      row.tableNumber === 1 ? { ...row, driver: 'tuya' as const, host: '192.168.100.30', hasAuth: true, config: { deviceId: ID(9), version: '3.5' as const } } : row,
    );
    const saved = groupDevices(withSaved).devices;
    const rows = mergeTuyaRows({ cloud: [cloudDevice(1, { name: 'Automat A' })], found: [lan(1)], groups: saved, tables: withSaved });
    // ID(9) — saqlangan, lekin bulutda ham, tarmoqda ham yo'q: tanlanmaydi va 1-stoli tegilmaydi
    expect(rows.find((row) => row.deviceId === ID(9))).toMatchObject({ include: false, savedTableIds: [101] });
    const filled = autoFillTables(rows, withSaved);
    expect(filled.find((row) => row.deviceId === ID(1))?.tableId).toBe(102);
    expect(buildTuyaBulkPayload(filled).some((item) => item.tableId === 101)).toBe(false);
  });
});

describe('refreshFromLan', () => {
  it('IP va versiyani yangilaydi, yangi qurilmani qo‘shadi, kiritilganlarni o‘zgartirmaydi', () => {
    const rows = mergeTuyaRows({ cloud: [cloudDevice(1), cloudDevice(2)], found: [lan(1)], groups: [], tables });
    // ID(2) tarmoqda topilmagan: IP yo'q (bulut IP si — ochiq manzil bo'lsa olinmaydi)
    expect(rows.find((row) => row.deviceId === ID(2))).toMatchObject({ host: '', inLan: false });
    const edited = rows.map((row) => (row.deviceId === ID(1) ? { ...row, tableId: 105, dp: 1 } : row));
    // O'zgarish yo'q — o'sha massiv (React qayta chizmaydi)
    expect(refreshFromLan(edited, [lan(1)])).toBe(edited);

    const upper = foundDevice({ driver: 'tuya', host: '192.168.100.40', id: 'EB12ABcd34EF56gh78', version: '3.4', needs: ['localKey'] })!;
    const next = refreshFromLan(edited, [lan(1), lan(2, '3.4'), upper]);
    expect(next.find((row) => row.deviceId === ID(1))).toMatchObject({ tableId: 105, dp: 1, localKey: KEY(1) });
    expect(next.find((row) => row.deviceId === ID(2))).toMatchObject({ host: '192.168.100.15', version: '3.4', inLan: true });
    // Yangi qurilma oxirida, ID asl yozilishida (kichik harfga o'tkazilmaydi)
    expect(next[next.length - 1]).toMatchObject({ deviceId: 'EB12ABcd34EF56gh78', key: 'eb12abcd34ef56gh78', host: '192.168.100.40', include: true, tableId: null });
  });

  it('avval topilmagan saqlangan qurilma topilsa — tanlanadi va stoli saqlanadi', () => {
    const saved = groupDevices([
      table(4, { driver: 'tuya', host: '192.168.100.30', hasAuth: true, config: { deviceId: ID(4), version: '3.5' } }),
    ]).devices;
    const rows = mergeTuyaRows({ cloud: [], found: [], groups: saved, tables });
    expect(rows[0]).toMatchObject({ include: false, tableId: 104 });
    const [row] = refreshFromLan(rows, [lan(4)]);
    expect(row).toMatchObject({ include: true, tableId: 104, host: '192.168.100.17' });
    expect(rowIssue(row, [row])).toBeNull(); // saqlangan kalit shu stolda qoladi
  });
});

describe('rebaseAfterSave', () => {
  it('qayta saqlashda ko‘chgan qurilmaning oraliq stoli ham bo‘shaydi', () => {
    const saved = groupDevices([
      table(3, { driver: 'tuya', host: '192.168.100.14', hasAuth: true, config: { deviceId: ID(1), version: '3.5' } }),
    ]).devices;
    const rows = mergeTuyaRows({ cloud: [cloudDevice(1, { name: 'Automat' })], found: [lan(1)], groups: saved, tables });
    // 1) 3-stoldan 4-stolga ko'chirib saqlash: 4 — Tuya, 3 — ulanmagan
    const toFour = rows.map((row) => ({ ...row, tableId: 104 }));
    expect(buildTuyaBulkPayload(toFour).map((item) => [item.tableId, item.driver])).toEqual([[104, 'tuya'], [103, 'none']]);
    // 2) "Orqaga" qaytib yana 3-stolga: endi 4-stol bo'shashi kerak (ikki stol bitta automatda qolmasin)
    const back = rebaseAfterSave(toFour).map((row) => ({ ...row, tableId: 103 }));
    expect(back[0]).toMatchObject({ savedTableIds: [104], hasSavedKey: true, tableId: 103 });
    expect(buildTuyaBulkPayload(back).map((item) => [item.tableId, item.driver])).toEqual([[103, 'tuya'], [104, 'none']]);
  });

  it('tanlangan qurilma olgan stol boshqa qatorda saqlangan hisoblanmaydi', () => {
    const rows: TuyaBulkRow[] = mergeTuyaRows({ cloud: [cloudDevice(1), cloudDevice(2)], found: [lan(1), lan(2)], groups: [], tables }).map(
      (row) => (row.deviceId === ID(2) ? { ...row, include: false, savedTableIds: [101], hasSavedKey: true } : row),
    );
    const rebased = rebaseAfterSave(rows);
    expect(rebased.find((row) => row.deviceId === ID(1))).toMatchObject({ savedTableIds: [101], hasSavedKey: true });
    expect(rebased.find((row) => row.deviceId === ID(2))).toMatchObject({ savedTableIds: [], hasSavedKey: false });
  });
});

describe('tartib', () => {
  it('bir xil nomli automatlar IP bo‘yicha; stol bo‘yicha tartibda stoli yo‘qlar oxirida', () => {
    const same = [3, 1, 2].map((n) => cloudDevice(n, { name: 'Smart Breaker 63A' }));
    const rows = mergeTuyaRows({ cloud: same, found: [lan(3), lan(1), lan(2)], groups: [], tables });
    expect(rows.map((row) => row.host)).toEqual(['192.168.100.14', '192.168.100.15', '192.168.100.16']);
    // Nomdan stol topilmadi — bo'sh stollar shu tartibda beriladi (1, 2, 3)
    expect(autoFillTables(rows, tables).map((row) => row.tableId)).toEqual([101, 102, 103]);

    const mixed = mergeTuyaRows({
      cloud: [cloudDevice(1, { name: 'Stol 5' }), cloudDevice(2, { name: 'Automat' }), cloudDevice(3, { name: 'Stol 2' })],
      found: [lan(1), lan(2), lan(3)],
      groups: [],
      tables,
    });
    const sorted = sortByTable(mixed, tables);
    expect(sorted.map((row) => [row.name, row.tableId])).toEqual([
      ['Stol 2', 102],
      ['Stol 5', 105],
      ['Automat', null],
    ]);
  });
});
