const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const drivers = require('../lib/drivers');
const { LightHub } = require('../lib/hub');

/**
 * CHIROQ MARKAZI — internetsiz ishlash ssenariylari.
 *
 * Haqiqiy rele o'rniga "fake" drayver: har buyruq `writes` ga yoziladi.
 * Soat sun'iy (clock.t) — grace, bron va qo'lda boshqaruv muddatlarini
 * soniyalab kutmasdan tekshiramiz.
 */

const relays = new Map(); // tableId -> fizik holat
const writes = [];
drivers.register({
  name: 'test_fake',
  readback: () => true,
  lockKey: (device) => `fake:${device.host}`,
  async write(device, physical) {
    writes.push({ tableId: device.tableId, on: physical });
    relays.set(device.tableId, physical);
  },
  async read(device) {
    return [relays.has(device.tableId) ? relays.get(device.tableId) : null];
  },
});

const T = Date.parse('2026-11-21T18:00:00Z');
const MIN = 60_000;

function device(tableId, model = {}) {
  return {
    tableId, tableNumber: tableId, tableName: `Stol ${tableId}`, driver: 'test_fake', host: `relay-${tableId}`,
    channel: 0, inverted: false, auth: null, onUrl: null, offUrl: null, config: null,
    desired: model.desired ?? false, commandRevision: `rev-${tableId}`,
    model: model.model === null ? undefined : {
      session: null, lastEndAt: null, overrideOn: null, overrideUntil: null, reservations: [], ...model.model,
    },
  };
}

function cloud(at, devices, rules = { offOnPause: false, offDelaySec: 0, preOnMinutes: 0 }) {
  return { version: `v-${at}`, serverNow: new Date(at).toISOString(), forceSyncMs: 3_600_000, verify: false, rules, devices };
}

function setup(t, options = {}) {
  const clock = { t: T };
  relays.clear();
  writes.length = 0;
  const hub = new LightHub({ now: () => clock.t, sleep: async () => {}, ...options });
  hub.start();
  t.after(() => hub.stop());
  return { hub, clock };
}

async function settle(hub) {
  await hub.reconcile();
  return Object.fromEntries(Array.from(relays.entries()));
}

test('internetsiz boshlangan o‘yin: chiroq darhol yonadi, eski bulut surati uni o‘chirmaydi', async (t) => {
  const { hub, clock } = setup(t);
  hub.applyCloudData(cloud(T, [device(1), device(2)]));
  assert.deepEqual(await settle(hub), { 1: false, 2: false });

  // Internet yo'q: kassir 1-stolda o'yin boshladi (navbatda)
  clock.t = T + 5 * MIN;
  hub.cloud.online = false;
  hub.pushView({ fetchedAt: T, tables: [
    { tableId: 1, session: 'active', since: T + 5 * MIN, pending: true },
    { tableId: 2, session: null, since: null, pending: false },
  ] });
  assert.deepEqual(await settle(hub), { 1: true, 2: false });

  // Internet qaytdi, lekin navbat hali yuborilmagan: yangi bulut surati 1-stolni
  // "bo'sh" deydi — chiroq O'CHMASLIGI kerak
  clock.t = T + 6 * MIN;
  hub.applyCloudData(cloud(T + 6 * MIN, [device(1), device(2)]));
  assert.deepEqual(await settle(hub), { 1: true, 2: false });

  // Navbat yuborildi — bulut o'yinni tasdiqladi, kassa ham yangilandi
  hub.applyCloudData(cloud(T + 6 * MIN + 1000, [device(1, { model: { session: 'active' } }), device(2)]));
  hub.pushView({ fetchedAt: T + 6 * MIN + 1500, tables: [
    { tableId: 1, session: 'active', since: T + 5 * MIN, pending: false },
    { tableId: 2, session: null, since: null, pending: false },
  ] });
  assert.deepEqual(await settle(hub), { 1: true, 2: false });
});

test('internetsiz tugagan o‘yin: grace tugaguncha yonadi, keyin o‘z vaqtida o‘chadi', async (t) => {
  const { hub, clock } = setup(t);
  const rules = { offOnPause: false, offDelaySec: 120, preOnMinutes: 0 };
  hub.applyCloudData(cloud(T, [device(1, { model: { session: 'active' } })], rules));
  assert.deepEqual(await settle(hub), { 1: true });

  clock.t = T + 30 * MIN;
  hub.pushView({ fetchedAt: T, tables: [{ tableId: 1, session: null, since: T + 30 * MIN, pending: true }] });
  assert.deepEqual(await settle(hub), { 1: true }, 'grace: 2 daqiqa yonib turadi');

  clock.t = T + 32 * MIN + 1;
  assert.deepEqual(await settle(hub), { 1: false }, 'grace tugadi — o‘chdi');
});

test('internetsiz pauza: "pauzada o‘chsin" qoidasi lokal ishlaydi', async (t) => {
  const { hub, clock } = setup(t);
  const rules = { offOnPause: true, offDelaySec: 0, preOnMinutes: 0 };
  hub.applyCloudData(cloud(T, [device(1, { model: { session: 'active' } })], rules));
  assert.deepEqual(await settle(hub), { 1: true });
  clock.t = T + MIN;
  hub.pushView({ fetchedAt: T, tables: [{ tableId: 1, session: 'paused', since: T + MIN, pending: true }] });
  assert.deepEqual(await settle(hub), { 1: false });
  clock.t = T + 2 * MIN;
  hub.pushView({ fetchedAt: T, tables: [{ tableId: 1, session: 'active', since: T + 2 * MIN, pending: true }] });
  assert.deepEqual(await settle(hub), { 1: true });
});

test('bron oldidan yoqish internetsiz ham o‘z vaqtida ishlaydi (bronlar keshdan)', async (t) => {
  const { hub, clock } = setup(t);
  const rules = { offOnPause: false, offDelaySec: 0, preOnMinutes: 10 };
  hub.applyCloudData(cloud(T, [device(1, { model: { reservations: [new Date(T + 60 * MIN).toISOString()] } })], rules));
  hub.cloud.online = false;
  assert.deepEqual(await settle(hub), { 1: false });
  clock.t = T + 50 * MIN + 1;
  assert.deepEqual(await settle(hub), { 1: true });
});

test('qo‘lda boshqaruv internetsiz: lokal "Avto" bulutdagi eski buyruqni bekor qiladi va muddati to‘g‘ri', async (t) => {
  const { hub, clock } = setup(t);
  // Bulutda qo'lda yoqilgan (60 daqiqaga), stolda o'yin yo'q
  hub.applyCloudData(cloud(T, [device(1, { model: { overrideOn: true, overrideUntil: new Date(T + 60 * MIN).toISOString() } })]));
  assert.deepEqual(await settle(hub), { 1: true });

  hub.cloud.online = false;
  clock.t = T + 5 * MIN;
  hub.setOverride({ tableIds: [1], on: null, minutes: 10 });
  assert.deepEqual(await settle(hub), { 1: false }, 'Avto — o‘yin yo‘q, o‘chadi');
  // Lokal "Avto" 10 daqiqadan keyin ham bulutdagi eski buyruqni qaytarmasligi kerak
  clock.t = T + 30 * MIN;
  assert.deepEqual(await settle(hub), { 1: false });

  // Qo'lda yoqish 5 daqiqaga — muddati tugagach avtomatikaga qaytadi
  hub.setOverride({ tableIds: [1], on: true, minutes: 5 });
  assert.deepEqual(await settle(hub), { 1: true });
  clock.t = T + 36 * MIN;
  assert.deepEqual(await settle(hub), { 1: false });
});

test('o‘yin amali qo‘lda boshqaruvni bekor qiladi (serverdagidek)', async (t) => {
  const { hub, clock } = setup(t);
  hub.applyCloudData(cloud(T, [device(1)]));
  hub.setOverride({ tableIds: [1], on: false, minutes: 60 });
  clock.t = T + MIN;
  hub.pushView({ fetchedAt: T, tables: [{ tableId: 1, session: 'active', since: T + MIN, pending: true }] });
  assert.deepEqual(await settle(hub), { 1: true });
});

test('24 soatdan eski ma’lumot bilan relelarga tegilmaydi', async (t) => {
  const { hub, clock } = setup(t);
  hub.applyCloudData(cloud(T, [device(1, { model: { session: 'active' } })]));
  clock.t = T + 25 * 60 * MIN;
  hub.cloud.online = false;
  await hub.reconcile();
  assert.equal(writes.length, 0);
});

test('eski server (model yo‘q) — avvalgidek tayyor `desired` qo‘llanadi', async (t) => {
  const { hub } = setup(t);
  const data = cloud(T, [device(1, { desired: true, model: null }), device(2, { desired: false, model: null })]);
  delete data.rules;
  hub.applyCloudData(data);
  assert.deepEqual(await settle(hub), { 1: true, 2: false });
});

test('token bekor qilingan bo‘lsa relelarga tegilmaydi (ikki agent bir-biri bilan urishmasin)', async (t) => {
  const { hub } = setup(t);
  hub.applyCloudData(cloud(T, [device(1, { model: { session: 'active' } })]));
  hub.cloud.authFailed = true;
  await hub.reconcile();
  assert.equal(writes.length, 0);
});

test('qayta ishga tushganda diskdagi holat tiklanadi, parol shifrlangan holda saqlanadi', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'billiard-hub-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const stateFile = join(directory, 'state.json');
  const codec = {
    seal: (text) => Buffer.from(`sealed:${text}`).toString('base64'),
    open: (text) => Buffer.from(text, 'base64').toString().replace(/^sealed:/, ''),
  };
  const clock = { t: T };
  relays.clear();
  const first = new LightHub({ now: () => clock.t, sleep: async () => {}, stateFile, secretCodec: codec });
  first.start();
  first.applyCloudData(cloud(T, [{ ...device(1, { model: { session: 'active' } }), auth: 'admin:maxfiy' }]));
  await first.stop();
  const onDisk = readFileSync(stateFile, 'utf8');
  assert.ok(!onDisk.includes('maxfiy'), 'parol diskda ochiq turmasligi kerak');

  const second = new LightHub({ now: () => clock.t, sleep: async () => {}, stateFile, secretCodec: codec });
  second.start();
  t.after(() => second.stop());
  assert.equal(second.devices.get(1).auth, 'admin:maxfiy');
  clock.t = T + MIN;
  assert.deepEqual(await settle(second), { 1: true });
});

test('bitta plataga buyruqlar navbat bilan ketadi (bir vaqtda faqat bittasi)', async (t) => {
  const { hub } = setup(t);
  let active = 0;
  let maxActive = 0;
  drivers.register({
    name: 'test_board',
    readback: () => false,
    lockKey: () => 'board:1',
    async write() {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
    },
    async read() { return []; },
  });
  const board = (id) => ({ ...device(id, { model: { session: 'active' } }), driver: 'test_board' });
  hub.applyCloudData(cloud(T, [board(1), board(2), board(3), board(4)]));
  await hub.reconcile();
  assert.equal(maxActive, 1);
});

test('qidiruv natijasi serverga: USB/COM plata va Tuya ID yuboriladi, uzun matn qirqiladi', () => {
  const { discoveredForServer } = require('../lib/hub');
  assert.deepEqual(discoveredForServer({ driver: 'usb_hid', serialNumber: ' QAAMZ ', channels: 8, extra: 'x' }), {
    serialNumber: 'QAAMZ', driver: 'usb_hid', channels: 8,
  });
  assert.deepEqual(discoveredForServer({ driver: 'serial', serialPort: 'COM5', model: 'm'.repeat(90) }), {
    serialPort: 'COM5', model: 'm'.repeat(60), driver: 'serial',
  });
  assert.deepEqual(discoveredForServer({ host: '10.0.0.7', driver: 'tuya', id: 'bf12345678', version: '3.4', encrypt: false }), {
    host: '10.0.0.7', id: 'bf12345678', version: '3.4', encrypt: false, driver: 'tuya',
  });
  // Noma'lum drayver va harf-raqam bo'lmagan ID yuborilmaydi (server butun natijani rad etardi)
  assert.deepEqual(discoveredForServer({ host: '10.0.0.8', driver: 'shelly_gen9', id: 'a b', channels: 99 }), { host: '10.0.0.8' });
});
