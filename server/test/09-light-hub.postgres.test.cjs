const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { LightsService } = require('../src/modules/lights/lights.service');
const { Club } = require('../src/entities/club.entity');
const { Table } = require('../src/entities/table.entity');
const { Session } = require('../src/entities/session.entity');
const { Settings } = require('../src/entities/settings.entity');
const { ClubBridge } = require('../src/entities/club-bridge.entity');
const { TableLightEvent } = require('../src/entities/table-light-event.entity');
const { Reservation } = require('../src/entities/reservation.entity');
const { LightDriver, LightMode, SessionStatus } = require('../src/entities/enums');

/**
 * CHIROQ MARKAZI (internetsiz ishlash) — server tomoni:
 *  - bridge javobida klub qoidalari va har stolning XOM holati (o'yin, oxirgi
 *    tugash, qo'lda boshqaruv, bronlar) bor — markaz aloqa uzilganda ham o'zi hisoblaydi;
 *  - yangi rele turlari (Tuya, Sonoff, Modbus RTU, USB HID) saqlanadi va tekshiriladi;
 *  - bir nechta stol bir martada (bitta tranzaksiyada) sozlanadi.
 */

let database;
let nextClub = 0;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

async function fixture(count = 1, settings = {}) {
  const club = await database.getRepository(Club).save({ name: `Light hub ${++nextClub}` });
  await database.getRepository(Settings).save({
    clubId: club.id, timezone: 'Asia/Tashkent', lightMode: LightMode.BRIDGE, ...settings,
  });
  const tables = await database.getRepository(Table).save(Array.from({ length: count }, (_, index) => ({
    clubId: club.id, name: `Stol ${index + 1}`, number: index + 1, pricePerHour: 25000,
  })));
  const service = new LightsService(database, database.getRepository(Table), database.getRepository(Settings),
    database.getRepository(ClubBridge), database.getRepository(TableLightEvent));
  return { club, tables, service };
}

const key = (error) => error?.getResponse?.().key;
const shelly = (channel = 0) => ({ driver: LightDriver.SHELLY_GEN2, host: '192.168.40.20', channel });

test('bridge javobida qoidalar va xom holat bor: o‘yin, oxirgi tugash, qo‘lda boshqaruv, bronlar', { timeout: 15000 }, async () => {
  const { club, tables: [busy, finished, booked], service } = await fixture(3, {
    lightOffOnPause: true, lightOffDelaySec: 120, lightPreOnMinutes: 15,
  });
  for (const [index, table] of [busy, finished, booked].entries()) {
    await service.updateTableDevice(club.id, table.id, shelly(index));
  }
  await database.getRepository(Session).save({
    clubId: club.id, tableId: busy.id, status: SessionStatus.PAUSED, startTime: new Date(Date.now() - 3600_000),
    pausedAt: new Date(), totalPausedMs: 0, pricePerHour: 25000,
  });
  const endedAt = new Date(Date.now() - 30_000);
  await database.getRepository(Session).save({
    clubId: club.id, tableId: finished.id, status: SessionStatus.COMPLETED, startTime: new Date(Date.now() - 3600_000),
    endTime: endedAt, totalPausedMs: 0, pricePerHour: 25000,
  });
  const startsAt = new Date(Date.now() + 3 * 3600_000);
  await database.getRepository(Reservation).save({
    clubId: club.id, tableId: booked.id, customerName: 'Bron', startsAt,
    endsAt: new Date(startsAt.getTime() + 3600_000), status: 'confirmed',
  });
  const overrideUntil = new Date(Date.now() + 20 * 60_000);
  await database.getRepository(Table).update(booked.id, { lightOverrideOn: true, lightOverrideUntil: overrideUntil });

  const state = await service.bridgeState(club.id);
  assert.deepEqual(state.rules, { offOnPause: true, offDelaySec: 120, preOnMinutes: 15 });
  const byTable = new Map(state.devices.map((device) => [device.tableId, device]));
  assert.equal(byTable.get(busy.id).model.session, 'paused');
  assert.equal(byTable.get(busy.id).desired, false, 'pauzada o‘chsin yoqilgan');
  assert.equal(byTable.get(finished.id).model.session, null);
  assert.equal(byTable.get(finished.id).model.lastEndAt, endedAt.toISOString());
  assert.equal(byTable.get(finished.id).desired, true, 'grace ichida');
  assert.deepEqual(byTable.get(booked.id).model.reservations, [startsAt.toISOString()]);
  assert.equal(byTable.get(booked.id).model.overrideOn, true);
  assert.equal(byTable.get(booked.id).model.overrideUntil, overrideUntil.toISOString());
});

test('yangi bron (bron oldidan yoqish yoqilgan) versiyani o‘zgartiradi — markaz uni darhol oladi', { timeout: 15000 }, async () => {
  const { club, tables: [table], service } = await fixture(1, { lightPreOnMinutes: 10 });
  await service.updateTableDevice(club.id, table.id, shelly());
  const before = await service.bridgeState(club.id);
  const startsAt = new Date(Date.now() + 5 * 3600_000);
  await database.getRepository(Reservation).save({
    clubId: club.id, tableId: table.id, customerName: 'Kech', startsAt,
    endsAt: new Date(startsAt.getTime() + 3600_000), status: 'pending',
  });
  const afterAdd = await service.bridgeState(club.id);
  assert.notEqual(afterAdd.version, before.version);
  assert.equal(afterAdd.devices[0].desired, false, 'bron hali uzoq — chiroq o‘chiq, lekin markaz bilib turadi');
});

test('8 kanalli plata bir martada 4 ta stolga ulanadi; takroriy kanal butun so‘rovni bekor qiladi', { timeout: 15000 }, async () => {
  const { club, tables, service } = await fixture(5);
  const board = (tableId, channel) => ({
    tableId, driver: LightDriver.MODBUS_TCP, host: '192.168.40.50', channel, config: { unitId: 1, mode: 'register' },
  });
  const saved = await service.updateTableDevices(club.id, tables.slice(0, 4).map((table, index) => board(table.id, index)));
  assert.deepEqual(saved.map((item) => item.channel), [0, 1, 2, 3]);
  assert.equal(saved[2].config.mode, 'register');

  // 5-stolga 2-kanalni ham bermoqchi bo'lamiz — 3-stol egallagan
  await assert.rejects(
    () => service.updateTableDevices(club.id, [board(tables[4].id, 2)]),
    (err) => key(err) === 'lights.outputInUse' && err.getResponse().args.table === 3,
  );
  // Ro'yxat ichida takror: hech biri saqlanmasligi kerak
  await assert.rejects(
    () => service.updateTableDevices(club.id, [
      { tableId: tables[4].id, driver: LightDriver.SHELLY_GEN1, host: '192.168.40.60', channel: 0 },
      { tableId: tables[3].id, driver: LightDriver.SHELLY_GEN1, host: '192.168.40.60', channel: 0 },
    ]),
    (err) => key(err) === 'lights.outputInUse',
  );
  const fifth = await database.getRepository(Table).findOneByOrFail({ id: tables[4].id });
  assert.equal(fifth.lightDriver, LightDriver.NONE, 'xato bo‘lsa birorta stol ham o‘zgarmaydi');
  await assert.rejects(
    () => service.updateTableDevices(club.id, [board(tables[4].id, 5), board(tables[4].id, 6)]),
    (err) => key(err) === 'lights.duplicateTable',
  );
});

test('yangi rele turlari: Tuya kalitsiz saqlanmaydi, USB HID manzilsiz ham agentga boradi', { timeout: 15000 }, async () => {
  const { club, tables: [tuya, sonoff, rtu, hid], service } = await fixture(4);
  await assert.rejects(
    () => service.updateTableDevice(club.id, tuya.id, {
      driver: LightDriver.TUYA, host: '192.168.40.70', config: { deviceId: 'bf1234567890abcdefgh', version: '3.4' },
    }),
    (err) => key(err) === 'lights.invalidConfig',
  );
  const savedTuya = await service.updateTableDevice(club.id, tuya.id, {
    driver: LightDriver.TUYA, host: '192.168.40.70', auth: '0123456789abcdef',
    config: { deviceId: 'bf1234567890abcdefgh', version: '3.4' },
  });
  assert.equal(savedTuya.hasAuth, true);
  assert.equal('auth' in savedTuya, false, 'lokal kalit javobda qaytmaydi');

  await assert.rejects(
    () => service.updateTableDevice(club.id, sonoff.id, { driver: LightDriver.SONOFF, host: '192.168.40.71', config: { encrypt: true } }),
    (err) => key(err) === 'lights.invalidConfig',
  );
  await service.updateTableDevice(club.id, sonoff.id, { driver: LightDriver.SONOFF, host: '192.168.40.71' });
  await service.updateTableDevice(club.id, rtu.id, {
    driver: LightDriver.MODBUS_RTU, config: { serialPort: 'COM5', baudRate: 9600, parity: 'none', unitId: 2 },
  });
  await service.updateTableDevice(club.id, hid.id, { driver: LightDriver.USB_HID, channel: 1 });

  const state = await service.bridgeState(club.id);
  const drivers = new Map(state.devices.map((device) => [device.tableId, device]));
  assert.equal(drivers.get(tuya.id).auth, '0123456789abcdef', 'agentga kalit boradi (token bilan himoyalangan)');
  assert.equal(drivers.get(rtu.id).config.serialPort, 'COM5');
  assert.ok(drivers.has(hid.id), 'manzilsiz USB HID stol ham ro‘yxatda');
  assert.equal(drivers.get(sonoff.id).driver, LightDriver.SONOFF);

  // To'g'ridan-to'g'ri (DIRECT) rejimda bulut lokal drayverlarni bajara olmaydi
  await database.getRepository(Settings).update({ clubId: club.id }, { lightMode: LightMode.DIRECT });
  service.invalidateModeCache(club.id);
  await assert.rejects(
    () => service.updateTableDevice(club.id, hid.id, { driver: LightDriver.USB_HID, channel: 2 }),
    (err) => key(err) === 'lights.driverBridgeOnly',
  );
});

test('qidiruv natijasi: USB/COM platalar va Tuya/Sonoff ID saqlanadi, manzilsiz yozuv tashlanadi', { timeout: 15000 }, async () => {
  const { club, service } = await fixture(1);
  await service.issueToken(club.id, 'Sinov agenti', null);
  const accepted = await service.saveDiscovered(club.id, undefined, '192.168.40', [
    { host: '192.168.40.70', driver: LightDriver.TUYA, id: 'bf1234567890abcdefgh', version: '3.4', name: 'Stol rele' },
    { host: '192.168.40.71', driver: LightDriver.SONOFF, id: '1000abcdef', encrypt: true, channels: 4 },
    { serialPort: 'COM5', driver: LightDriver.SERIAL, name: 'USB-SERIAL CH340' },
    { driver: LightDriver.USB_HID, channels: 8, name: 'USBRelay8' },
    // Manzilsiz va noto'g'ri ID li yozuvlar
    { name: 'manzilsiz', driver: LightDriver.TASMOTA },
    { host: '192.168.40.72', id: 'bad id!', model: 'x'.repeat(80) },
  ]);
  assert.equal(accepted, 5);
  const result = await service.discoverResult(club.id);
  const byName = (value) => result.devices.find((device) => device.name === value || device.host === value);
  assert.deepEqual(byName('Stol rele'), {
    host: '192.168.40.70', id: 'bf1234567890abcdefgh', version: '3.4', name: 'Stol rele', driver: LightDriver.TUYA,
  });
  assert.equal(byName('192.168.40.71').encrypt, true);
  assert.equal(byName('USB-SERIAL CH340').serialPort, 'COM5');
  assert.equal(byName('USBRelay8').channels, 8);
  assert.equal(byName('192.168.40.72').id, undefined, 'faqat harf-raqamli ID');
  assert.equal(byName('192.168.40.72').model.length, 60);
  assert.equal(result.subnet, '192.168.40');
});
