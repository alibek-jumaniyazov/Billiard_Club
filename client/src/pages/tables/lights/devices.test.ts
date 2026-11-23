import { describe, expect, it } from 'vitest';
import type { TableLightConfig } from '../../../types';
import {
  buildBulkPayload,
  draftFromGroup,
  draftIssue,
  emptyDraft,
  fillSequential,
  foundDevice,
  groupDevices,
  isFoundConnected,
  tuyaDpOf,
} from './devices';

/**
 * Qurilma bo'yicha sozlash: bitta 8 kanalli plata yoki 4 kanalli Sonoff bir
 * nechta stolga — bitta so'rov bilan. Xato kanal -> stol o'girishi noto'g'ri
 * stol chirog'ini yoqib yuborardi, shuning uchun har invariant shu yerda.
 */

const row = (tableId: number, patch: Partial<TableLightConfig> = {}): TableLightConfig => ({
  tableId, tableNumber: tableId, tableName: `Stol ${tableId}`, isActive: true, driver: 'none', host: null,
  channel: 0, inverted: false, hasAuth: false, onUrl: null, offUrl: null, config: null, overrideOn: null,
  overrideUntil: null, state: null, syncedAt: null, error: null, ...patch,
});

describe('groupDevices', () => {
  it('bitta platadagi stollar bitta qurilmaga, murakkab drayverlar alohida', () => {
    const { devices, advanced } = groupDevices([
      row(1, { driver: 'modbus_tcp', host: '192.168.1.60', channel: 0, config: { unitId: 1 } }),
      row(2, { driver: 'modbus_tcp', host: '192.168.1.60', channel: 1, config: { unitId: 1 } }),
      row(3, { driver: 'tuya', host: '192.168.1.70', channel: 0, config: { deviceId: 'bfabc123456', version: '3.4' }, hasAuth: true }),
      row(4, { driver: 'mqtt', config: { topic: 'zigbee2mqtt/stol4/set' } }),
      row(5),
    ]);
    expect(devices.map((group) => [group.kind, group.tables.map((item) => item.row.tableId)])).toEqual([
      ['modbus_tcp', [1, 2]],
      ['tuya', [3]],
    ]);
    expect(advanced.map((item) => item.tableId)).toEqual([4]);
  });
});

describe('buildBulkPayload', () => {
  it('kanal -> stol: 0 dan saqlanadi, bitta stol ikki kanalda bo‘lsa qo‘shimcha lampa', () => {
    const draft = { ...emptyDraft('usb_lcus', 4), serialPort: 'COM3', channels: [11, 12, 11, null] };
    // Yangi ulangan stollardan boshqa qurilmaning eski paroli tozalanadi (auth: null)
    expect(buildBulkPayload(draft)).toEqual([
      { tableId: 11, driver: 'serial', host: null, channel: 0, inverted: false, onUrl: null, offUrl: null,
        config: { serialPort: 'COM3', baudRate: 9600, preset: 'lcus', channels: [2] }, auth: null },
      { tableId: 12, driver: 'serial', host: null, channel: 1, inverted: false, onUrl: null, offUrl: null,
        config: { serialPort: 'COM3', baudRate: 9600, preset: 'lcus' }, auth: null },
    ]);
  });

  it('Tuya: kalit faqat kiritilgan bo‘lsa yuboriladi; olib tashlangan stol ulanmagan bo‘ladi', () => {
    const draft = { ...emptyDraft('tuya', 2), host: '192.168.1.70', deviceId: 'bfabc123456', secret: '', hasSecret: true,
      tuyaVersion: '3.4' as const, channels: [3, null] };
    const items = buildBulkPayload(draft, [3, 4]);
    expect(items[0]).toEqual({
      tableId: 3, driver: 'tuya', host: '192.168.1.70', channel: 0, inverted: false, onUrl: null, offUrl: null,
      config: { deviceId: 'bfabc123456', version: '3.4' },
    });
    expect('auth' in items[0]).toBe(false);
    expect(items[1]).toEqual({ tableId: 4, driver: 'none', host: null, onUrl: null, offUrl: null, config: null, auth: null });
    const withKey = buildBulkPayload({ ...draft, secret: '0123456789abcdef' });
    expect(withKey[0].auth).toBe('0123456789abcdef');
  });

  it('Shelly avlodi drayverni tanlaydi; ko‘p kanalli Sonoff outlet API ga o‘tadi', () => {
    expect(buildBulkPayload({ ...emptyDraft('shelly'), host: '10.0.0.5', shellyGen: 1, channels: [1] })[0].driver).toBe('shelly_gen1');
    const sonoff = buildBulkPayload({ ...emptyDraft('sonoff', 4), host: '10.0.0.6', channels: [1, 2, null, null] });
    expect(sonoff[0].config).toEqual({ encrypt: false, outlets: true });
  });
});

describe('draftIssue', () => {
  it('yetishmayotgan maydonni aniq aytadi', () => {
    expect(draftIssue({ ...emptyDraft('tuya'), host: '192.168.1.70', channels: [1] })).toBe('tuyaId');
    expect(draftIssue({ ...emptyDraft('tuya'), host: '192.168.1.70', deviceId: 'bfabc123456', channels: [1] })).toBe('tuyaKey');
    expect(draftIssue({ ...emptyDraft('tuya'), host: '192.168.1.70', deviceId: 'bfabc123456', hasSecret: true, channels: [1] }, [1])).toBeNull();
    // Saqlangan kalitli qurilmaga yangi stol qo'shildi — kalitni qayta kiritish kerak
    expect(draftIssue({ ...emptyDraft('tuya', 2), host: '192.168.1.70', deviceId: 'bfabc123456', hasSecret: true, channels: [1, 2] }, [1])).toBe('secretAgain');
    expect(draftIssue({ ...emptyDraft('shelly', 2), host: '10.0.0.5', hasSecret: true, channels: [1, 2] }, [1])).toBe('secretAgain');
    expect(draftIssue({ ...emptyDraft('shelly', 2), host: '10.0.0.5', hasSecret: false, channels: [1, 2] }, [1])).toBeNull();
    expect(draftIssue({ ...emptyDraft('shelly'), host: 'http://x', channels: [1] })).toBe('host');
    expect(draftIssue({ ...emptyDraft('usb_lcus'), channels: [1] })).toBe('serialPort');
    expect(draftIssue({ ...emptyDraft('usb_hid') })).toBe('noTables');
  });
});

describe('fillSequential va draftFromGroup', () => {
  it('bo‘sh kanallar tanlangan stoldan boshlab ketma-ket to‘ladi (band stollar o‘tkaziladi)', () => {
    const tables = [5, 1, 2, 3, 4].map((id) => ({ tableId: id, tableNumber: id }));
    const draft = { ...emptyDraft('modbus_tcp', 4), channels: [null, 3, null, null] };
    expect(fillSequential(draft, tables, 2).channels).toEqual([2, 3, 4, 5]);
  });

  it('saqlangan qurilma tahrirga to‘g‘ri tiklanadi', () => {
    const { devices } = groupDevices([
      row(7, { driver: 'modbus_rtu', channel: 2, config: { serialPort: 'COM4', unitId: 2, baudRate: 19200, parity: 'even', mode: 'register' } }),
      row(8, { driver: 'modbus_rtu', channel: 0, config: { serialPort: 'COM4', unitId: 2, baudRate: 19200, parity: 'even', mode: 'register', channels: [1] } }),
    ]);
    const draft = draftFromGroup(devices[0]);
    expect(draft.channels).toEqual([8, 8, 7]);
    expect(draft).toMatchObject({ serialPort: 'COM4', unitId: 2, baudRate: 19200, parity: 'even', modbusMode: 'register' });
  });

  it('4 kanalli Sonoff: faqat 1-kanal ishlatilsa ham outlet API saqlanib qoladi', () => {
    const { devices } = groupDevices([
      row(9, { driver: 'sonoff', host: '10.0.0.6', channel: 0, config: { encrypt: false, outlets: true } }),
    ]);
    const draft = draftFromGroup(devices[0]);
    expect(draft.channels).toEqual([9]);
    expect(buildBulkPayload(draft)[0].config).toEqual({ encrypt: false, outlets: true });
  });
});

describe('foundDevice / isFoundConnected', () => {
  it('qidiruv natijasi ustaga to‘g‘ri tayyorlanadi', () => {
    expect(foundDevice({ driver: 'tuya', host: '192.168.1.70', id: 'bfabc123456', version: '3.4', name: 'Stol rele' })).toMatchObject({
      kind: 'tuya', address: '192.168.1.70', prefill: { host: '192.168.1.70', deviceId: 'bfabc123456', tuyaVersion: '3.4' },
    });
    expect(foundDevice({ driver: 'sonoff', host: '192.168.1.80', id: '1000abcdef', encrypt: true, channels: 4 })?.prefill).toMatchObject({
      sonoffEncrypt: true, sonoffOutlets: true, channels: [null, null, null, null],
    });
    // COM port: turini foydalanuvchi tanlaydi (CH340 rele yoki RS485)
    expect(foundDevice({ driver: 'serial', serialPort: 'COM5', name: 'USB-SERIAL CH340' })).toMatchObject({ kind: null, prefill: { serialPort: 'COM5' } });
    expect(foundDevice({ driver: 'usb_hid', serialNumber: 'QAAMZ', channels: 8 })?.prefill.channels).toHaveLength(8);
    expect(foundDevice({ driver: 'shelly_gen1', host: '10.0.0.9' })?.prefill.shellyGen).toBe(1);
    expect(foundDevice({ driver: 'http' })).toBeNull();
  });

  it('ulangan qurilma qayta taklif qilinmaydi', () => {
    const { devices } = groupDevices([
      row(1, { driver: 'tuya', host: '192.168.1.70', config: { deviceId: 'bfabc123456' } }),
      row(2, { driver: 'serial', config: { serialPort: 'COM3', preset: 'lcus' } }),
      row(3, { driver: 'shelly_gen2', host: '10.0.0.5' }),
    ]);
    const connected = (device: Parameters<typeof foundDevice>[0]) => isFoundConnected(foundDevice(device)!, devices);
    expect(connected({ driver: 'tuya', host: '192.168.1.99', id: 'BFABC123456' })).toBe(true);
    expect(connected({ driver: 'serial', serialPort: 'com3' })).toBe(true);
    expect(connected({ driver: 'serial', serialPort: 'COM4' })).toBe(false);
    expect(connected({ driver: 'shelly_gen2', host: '10.0.0.5' })).toBe(true);
    expect(connected({ driver: 'tasmota', host: '10.0.0.6' })).toBe(false);
    expect(connected({ driver: 'usb_hid', serialNumber: 'QAAMZ' })).toBe(false);
    // ID siz sozlangan yagona plata — topilgan plata shu
    const single = groupDevices([row(4, { driver: 'usb_hid', channel: 0 })]).devices;
    expect(isFoundConnected(foundDevice({ driver: 'usb_hid', serialNumber: 'QAAMZ' })!, single)).toBe(true);
  });
});

describe('Tuya boshqaruv DP', () => {
  it('automat (DP 16): har stolga config.dps yuboriladi; standart 1 da dps yo‘q', () => {
    const draft = {
      ...emptyDraft('tuya', 1),
      host: '192.168.100.14',
      deviceId: 'bf41049d74f1dd07625nle',
      secret: '0123456789abcdef',
      tuyaVersion: '3.5' as const,
      tuyaDp: 16,
      channels: [2],
    };
    expect(draftIssue(draft)).toBeNull();
    const [item] = buildBulkPayload(draft);
    expect(item.config).toEqual({ deviceId: 'bf41049d74f1dd07625nle', version: '3.5', dps: [16] });
    const [plain] = buildBulkPayload({ ...draft, tuyaDp: 1 });
    expect(plain.config).toEqual({ deviceId: 'bf41049d74f1dd07625nle', version: '3.5' });
  });

  it('ko‘p kanalli qurilma: kanal k → DP + k; saqlangandan qayta tiklanadi', () => {
    const draft = {
      ...emptyDraft('tuya', 3),
      host: '192.168.1.40',
      deviceId: 'bf1111111111aaaaaaaa',
      secret: '0123456789abcdef',
      tuyaDp: 20,
      channels: [5, 6, 5],
    };
    const items = buildBulkPayload(draft);
    const table5 = items.find((item) => item.tableId === 5);
    const table6 = items.find((item) => item.tableId === 6);
    expect(table5?.config).toMatchObject({ channels: [2], dps: [20, 22] });
    expect(table6?.config).toMatchObject({ dps: [21] });
    expect(tuyaDpOf({ channel: 1, config: { dps: [21] } })).toBe(20);
    expect(tuyaDpOf({ channel: 0, config: {} })).toBe(1);
    expect(tuyaDpOf({ channel: 3, config: { dps: [2] } })).toBe(1);
  });

  it('noto‘g‘ri DP — aniq muammo', () => {
    const base = { ...emptyDraft('tuya', 1), host: '192.168.1.5', deviceId: 'bf41049d74f1dd07625nle', secret: '0123456789abcdef', channels: [1] };
    expect(draftIssue({ ...base, tuyaDp: 0 })).toBe('tuyaDp');
    expect(draftIssue({ ...base, tuyaDp: 256 })).toBe('tuyaDp');
    expect(draftIssue({ ...base, tuyaDp: 1.5 })).toBe('tuyaDp');
    expect(draftIssue({ ...base, tuyaDp: 255 })).toBeNull();
  });
});
