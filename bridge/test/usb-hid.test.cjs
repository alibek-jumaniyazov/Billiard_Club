const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');

const usbHid = require('../lib/usb-hid');
const driver = require('../lib/drivers/usb-hid');

/**
 * USB HID RELE ("USBRelay1/2/4/8") — haqiqiy plata o'rniga soxta `node-hid`.
 *
 * Soxta modul node-hid ning SINXRON API sini takrorlaydi: `devices(vid, pid)` va `HID`
 * klassi (sendFeatureReport / getFeatureReport / close). Har plata — dcttech
 * proshivkasining modeli: 9 baytli feature report buyruqlari (0xFF/0xFD/0xFE/0xFC) va
 * [0x00, ID (5 bayt), 0, 0, holat] javobi — hidapi report ID ni 0-baytda qoldiradi.
 * Hech qanday taymer yo'q: testlar deterministik va tez.
 */

function fakeHid(boards, { ignoreFilter = false } = {}) {
  const calls = { sent: [], opened: [], closed: [] };
  let openHandles = 0;

  class HID {
    constructor(path) {
      if (typeof path !== 'string') throw new TypeError('Device path must be a string');
      const board = boards.find((item) => item.path === path);
      if (!board || board.failOpen) throw new TypeError(`cannot open device with path ${path}`);
      this.board = board;
      this.closed = false;
      openHandles += 1;
      calls.opened.push(path);
    }

    sendFeatureReport(data) {
      if (this.closed) throw new TypeError('Cannot access closed device');
      const bytes = Array.from(data);
      calls.sent.push({ path: this.board.path, bytes });
      if (this.board.failSend) throw new TypeError('could not send feature report to device');
      // Windows: report ID + 8 bayt (FeatureReportByteLength = 9)
      if (bytes.length !== 9 || bytes[0] !== 0) throw new TypeError('feature report noto‘g‘ri');
      const [, cmd, relay] = bytes;
      const bit = relay >= 1 && relay <= this.board.channels ? 1 << (relay - 1) : 0;
      if (cmd === 0xff) this.board.state |= bit;
      else if (cmd === 0xfd) this.board.state &= ~bit & 0xff;
      else if (cmd === 0xfe) this.board.state = (1 << this.board.channels) - 1;
      else if (cmd === 0xfc) this.board.state = 0;
      return bytes.length;
    }

    getFeatureReport(reportId, length) {
      if (this.closed) throw new TypeError('Cannot access closed device');
      if (this.board.failRead) throw new TypeError('could not get feature report from device');
      const id = this.board.idBytes || [...Buffer.from(this.board.id || '', 'latin1'), 0, 0, 0, 0, 0].slice(0, 5);
      return [reportId, ...id, 0, 0, this.board.state].slice(0, length);
    }

    close() {
      // Haqiqiy node-hid ikkinchi close() ni kechiradi — bu yerda esa xato: kod ikki marta yopmasin
      if (this.closed) throw new TypeError('ikki marta yopildi');
      this.closed = true;
      openHandles -= 1;
      calls.closed.push(this.board.path);
    }
  }

  function devices(...args) {
    const list = boards.map((board) => ({
      vendorId: board.vendorId ?? 0x16c0,
      productId: board.productId ?? 0x05df,
      path: board.path,
      serialNumber: board.usbSerial ?? '',
      manufacturer: 'www.dcttech.com',
      product: board.product ?? `USBRelay${board.channels}`,
      release: 0x100,
      interface: 0,
      usagePage: 0xff00,
      usage: 1,
    }));
    if (ignoreFilter || args.length === 0) return list;
    return list.filter((info) => info.vendorId === args[0] && info.productId === args[1]);
  }

  return { HID, devices, calls, openHandles: () => openHandles };
}

function relay(path, id, channels, state = 0, extra = {}) {
  return { path, id, channels, state, ...extra };
}

/** Soxta modulni o'rnatadi; test tugagach asl holatga qaytaradi */
function install(t, boards, options) {
  const fake = fakeHid(boards, options);
  usbHid.__setHidModuleForTests(fake);
  t.after(() => usbHid.__setHidModuleForTests(null));
  return fake;
}

function table(extra = {}) {
  return {
    tableId: 1, tableNumber: 1, driver: 'usb_hid', host: '', channel: 0, inverted: false,
    auth: null, onUrl: null, offUrl: null, config: null, ...extra,
  };
}

const ctx = { timeoutMs: 1000, signal: new AbortController().signal, log: () => {}, sleep: async () => {} };

const frame = (cmd, relayNumber) => [0x00, cmd, relayNumber, 0, 0, 0, 0, 0, 0];
const sentBytes = (fake) => fake.calls.sent.map((call) => call.bytes);

test('reyestr: usb_hid shartnomaga mos, node-hid oldindan yuklanmaydi', () => {
  // eslint-disable-next-line global-require
  const drivers = require('../lib/drivers');
  assert.equal(drivers.getDriver('usb_hid'), driver);
  assert.equal(driver.name, 'usb_hid');
  assert.equal(driver.readback(table()), true);
  // Hamma USB HID platalar bitta navbatda: ID qidirishda boshqa platalar ham ochiladi
  assert.equal(driver.lockKey(table()), 'usbhid');
  assert.equal(driver.lockKey(table({ config: { serialNumber: ' HURTM ' } })), 'usbhid');
  assert.equal(driver.lockKey(table({ config: { serialNumber: '' } })), 'usbhid');
  // Faqat drayverni ro'yxatga olish node-hid ni yuklamasligi kerak (ixtiyoriy native paket)
  assert.equal(Object.keys(require.cache).some((file) => /[\\/]node-hid[\\/]/.test(file)), false);
});

test("1 kanalli plata: yoqish, o'chirish va holatni o'qish (serialNumber shart emas)", async (t) => {
  const board = relay('hid-1', 'HURTM', 1);
  const fake = install(t, [board]);

  await driver.write(table(), true, ctx);
  assert.equal(board.state, 0b1);
  assert.deepEqual(sentBytes(fake), [frame(0xff, 1)]);
  assert.deepEqual(await driver.read(table(), ctx), [true]);

  await driver.write(table(), false, ctx);
  assert.equal(board.state, 0);
  assert.deepEqual(fake.calls.sent.at(-1).bytes, frame(0xfd, 1));
  assert.deepEqual(await driver.read(table(), ctx), [false]);

  assert.equal(fake.openHandles(), 0, 'har amaldan keyin plata yopiladi');
  assert.equal(fake.calls.opened.length, fake.calls.closed.length);
});

test("8 kanalli plata: stolning bir nechta kanali, qo'shni relelarga tegilmaydi", async (t) => {
  const board = relay('hid-8', 'BITFT', 8, 0b0000_0001); // 1-rele boshqa stolniki va yoniq
  const fake = install(t, [board]);
  const device = table({ channel: 2, config: { channels: [5, 7, 2, -1, 1.5, 'x'] } });

  await driver.write(device, true, ctx);
  assert.equal(board.state, 0b1010_0101);
  assert.deepEqual(sentBytes(fake), [frame(0xff, 3), frame(0xff, 6), frame(0xff, 8)]);
  assert.deepEqual(await driver.read(device, ctx), [true, true, true]);

  await driver.write(device, false, ctx);
  assert.equal(board.state, 0b0000_0001, 'boshqa stolning relesi yoniq qoldi');
  assert.deepEqual(await driver.read(device, ctx), [false, false, false]);
  assert.equal(fake.calls.sent.some((call) => call.bytes[1] === 0xfe || call.bytes[1] === 0xfc), false,
    '"hammasini yoqish/o\'chirish" buyrug\'i ishlatilmaydi');
  assert.equal(fake.openHandles(), 0);
});

test("2 kanalli plata: platada yo'q kanal — aniq xato, hech qanday buyruq yuborilmaydi", async (t) => {
  const board = relay('hid-2', 'QAAMZ', 2, 0b01);
  const fake = install(t, [board]);
  const device = table({ channel: 1, config: { channels: [2] } });

  await assert.rejects(driver.write(device, true, ctx), /USBRelay2 platasida 2 ta rele bor — 3-rele yo'q/);
  await assert.rejects(driver.write(table({ channel: -1 }), true, ctx), /kanal raqami noto'g'ri \(-1\)/);
  assert.equal(fake.calls.sent.length, 0);
  assert.equal(board.state, 0b01);
  // O'qishda mavjud kanal holati qaytadi, platada yo'g'i — null
  assert.deepEqual(await driver.read(device, ctx), [false, null]);

  await driver.write(table({ channel: 1, config: { channels: [0] } }), true, ctx);
  assert.equal(board.state, 0b11);
  assert.equal(fake.openHandles(), 0);
});

test("bir nechta plata: serialNumber siz — xato, serialNumber bilan — faqat o'sha plata", async (t) => {
  const a = relay('hid-a', 'AAAAA', 2);
  const b = relay('hid-b', 'BBBBB', 8);
  const fake = install(t, [a, b]);

  await assert.rejects(driver.write(table(), true, ctx), (err) => {
    assert.match(err.message, /2 ta USB rele platasi ulangan \(AAAAA, BBBBB\)/);
    assert.match(err.message, /"serialNumber"/);
    return true;
  });
  assert.equal(fake.calls.sent.length, 0);

  await driver.write(table({ channel: 3, config: { serialNumber: 'BBBBB' } }), true, ctx);
  assert.equal(b.state, 0b1000);
  assert.equal(a.state, 0);
  assert.ok(fake.calls.sent.every((call) => call.path === 'hid-b'));

  // Kichik harf bilan kiritilgan ID ham topiladi
  await driver.write(table({ channel: 1, config: { serialNumber: 'aaaaa' } }), true, ctx);
  assert.equal(a.state, 0b10);
  assert.equal(b.state, 0b1000);

  assert.deepEqual(await driver.read(table({ channel: 1, config: { serialNumber: 'AAAAA', channels: [0] } }), ctx),
    [true, false]);
  assert.deepEqual(await driver.read(table({ channel: 3, config: { serialNumber: 'BBBBB' } }), ctx), [true]);
  assert.deepEqual(await driver.read(table(), ctx), [null], 'serialNumber siz qaysi plata ekanini taxmin qilmaydi');

  await assert.rejects(
    driver.write(table({ config: { serialNumber: 'ZZZZZ' } }), true, ctx),
    /"ZZZZZ" ID li plata topilmadi \(ulanganlar: AAAAA, BBBBB\)/,
  );
  assert.equal(fake.openHandles(), 0);
  assert.equal(fake.calls.opened.length, fake.calls.closed.length);
});

test('bir xil ID li ikki plata — xato, hech biriga yozilmaydi', async (t) => {
  const fake = install(t, [relay('hid-a', 'HURTM', 2), relay('hid-b', 'HURTM', 2)]);
  const device = table({ config: { serialNumber: 'HURTM' } });

  await assert.rejects(driver.write(device, true, ctx), /"HURTM" ID li 2 ta plata ulangan/);
  assert.deepEqual(await driver.read(device, ctx), [null]);
  assert.equal(fake.calls.sent.length, 0);
  assert.equal(fake.openHandles(), 0);
});

test('ochilmaydigan plata boshqasiga xalaqit bermaydi; yagona plata ochilmasa — asl sabab', async (t) => {
  const broken = relay('hid-x', 'XXXXX', 2, 0, { failOpen: true });
  const good = relay('hid-y', 'YYYYY', 2);
  const fake = install(t, [broken, good]);

  await driver.write(table({ config: { serialNumber: 'YYYYY' } }), true, ctx);
  assert.equal(good.state, 0b01);
  await assert.rejects(driver.write(table(), true, ctx), /2 ta USB rele platasi ulangan \(\?, YYYYY\)/);
  await assert.rejects(
    driver.write(table({ config: { serialNumber: 'XXXXX' } }), true, ctx),
    /"XXXXX" ID li plata topilmadi \(ulanganlar: \?, YYYYY\); ochilmagan plata bor: platani ochib bo'lmadi/,
  );
  assert.equal(fake.openHandles(), 0);

  install(t, [broken]);
  await assert.rejects(driver.write(table(), true, ctx),
    /^Error: usb_hid: platani ochib bo'lmadi — cannot open device with path hid-x$/);
  await assert.rejects(driver.write(table({ config: { serialNumber: 'XXXXX' } }), true, ctx),
    /platani ochib bo'lmadi — cannot open device/);
});

test('buyruq yuborilmasa — xato, plata baribir yopiladi', async (t) => {
  const fake = install(t, [relay('hid-1', 'HURTM', 2, 0, { failSend: true })]);
  await assert.rejects(driver.write(table(), true, ctx),
    /1-relega buyruq yuborilmadi — could not send feature report to device/);
  assert.equal(fake.calls.sent.length, 1, 'birinchi xatodan keyin boshqa buyruq yuborilmaydi');
  assert.equal(fake.openHandles(), 0);
});

test("holatni o'qib bo'lmasa read() null qaytaradi, xato tashlamaydi", async (t) => {
  const board = relay('hid-1', 'HURTM', 2, 0b11, { failRead: true });
  const fake = install(t, [board]);
  const logs = [];
  const values = await driver.read(table({ config: { channels: [1] } }), {
    ...ctx, log: (level, message) => logs.push({ level, message }),
  });
  assert.deepEqual(values, [null, null]);
  assert.equal(logs[0].level, 'debug');
  assert.match(logs[0].message, /holati o'qilmadi — usb_hid: plata holatini o'qib bo'lmadi/);

  // serialNumber bilan: ID o'qilmasa plata tanilmaydi — yozish asl sabab bilan rad etiladi
  await assert.rejects(driver.write(table({ config: { serialNumber: 'HURTM' } }), true, ctx),
    /plata holatini o'qib bo'lmadi — could not get feature report/);
  // serialNumber siz yagona plataga yozish baribir ishlaydi
  await driver.write(table(), false, ctx);
  assert.equal(board.state, 0b10);
  assert.equal(fake.openHandles(), 0);
});

test("plata yo'q: aniq xato; shu VID/PID dagi boshqa qurilmalar va begona VID e'tiborsiz", async (t) => {
  const fake = install(t, [
    { path: 'hid-vusb', id: 'ABCDE', channels: 2, state: 0, product: 'DigiUSB' },
    { path: 'hid-foreign', id: 'ABCDE', channels: 2, state: 0, vendorId: 0x1234 },
  ], { ignoreFilter: true });

  await assert.rejects(driver.write(table(), true, ctx), /USB rele platasi topilmadi \(USBRelay1\/2\/4\/8, 16C0:05DF\)/);
  assert.deepEqual(await driver.read(table(), ctx), [null]);
  assert.deepEqual(await usbHid.discoverHidRelays({ log: () => {} }), []);
  assert.equal(fake.calls.opened.length, 0, 'begona qurilma ochilmaydi ham');
});

test("node-hid o'rnatilmagan: tushunarli xato, read null, qidiruv bo'sh ro'yxat", async (t) => {
  const missing = new Error("Cannot find module 'node-hid'\nRequire stack:\n- lib/usb-hid.js");
  missing.code = 'MODULE_NOT_FOUND';
  usbHid.__setHidModuleForTests(missing);
  t.after(() => usbHid.__setHidModuleForTests(null));

  await assert.rejects(driver.write(table(), true, ctx), (err) => {
    assert.match(err.message, /USB HID rele uchun `node-hid` paketi kerak/);
    assert.match(err.message, /`npm install node-hid`/);
    assert.match(err.message, /\(Cannot find module 'node-hid'\)$/);
    assert.doesNotMatch(err.message, /Require stack/);
    return true;
  });
  assert.deepEqual(await driver.read(table({ config: { channels: [1] } }), ctx), [null, null]);
  assert.deepEqual(await usbHid.discoverHidRelays({ log: () => {} }), []);
  assert.equal(usbHid.isAvailable(), false);
});

test("node-hid o'rnatilmagan: haqiqiy kechiktirilgan require yo'li, xato eslab qolinadi", async (t) => {
  const originalLoad = Module._load;
  let attempts = 0;
  Module._load = function patchedLoad(request, ...rest) {
    if (request === 'node-hid') {
      attempts += 1;
      const err = new Error("Cannot find module 'node-hid'\nRequire stack:\n- lib/usb-hid.js");
      err.code = 'MODULE_NOT_FOUND';
      throw err;
    }
    return originalLoad.call(this, request, ...rest);
  };
  t.after(() => {
    Module._load = originalLoad;
    usbHid.__setHidModuleForTests(null);
  });
  usbHid.__setHidModuleForTests(null);

  const logs = [];
  assert.deepEqual(await usbHid.discoverHidRelays({ log: (level, message) => logs.push({ level, message }) }), []);
  assert.equal(logs[0].level, 'debug');
  await assert.rejects(driver.write(table(), true, ctx), /npm install node-hid.*Cannot find module 'node-hid'/);
  await assert.rejects(driver.write(table(), true, ctx), /npm install node-hid/);
  assert.equal(attempts, 1, 'yuklash xatosi eslab qolinadi — har buyruqda qayta require qilinmaydi');
});

test("qidiruv: shartnoma shaklidagi ro'yxat, relelarga tegilmaydi", async (t) => {
  const fake = install(t, [
    relay('hid-a', 'AAAAA', 2, 0b01),
    relay('hid-b', 'BBBBB', 8),
    { path: 'hid-c', idBytes: [0x01, 0xff, 0x00, 0x00, 0x00], channels: 4, state: 0 }, // buzilgan ID
    { path: 'hid-d', id: 'DDDDD', channels: 1, state: 0, failOpen: true },
    { path: 'hid-e', id: 'EEEEE', channels: 2, state: 0, product: 'NotARelay' },
  ]);
  const logs = [];
  const found = await usbHid.discoverHidRelays({ log: (level, message) => logs.push({ level, message }) });
  const entry = (id, channels) => ({
    driver: 'usb_hid', id, serialNumber: id, name: `USBRelay${channels}`, channels,
    model: `USBRelay${channels}`, needs: ['bindChannels'],
  });
  assert.deepEqual(found, [entry('AAAAA', 2), entry('BBBBB', 8), entry(null, 4), entry(null, 1)]);
  assert.equal(fake.calls.sent.length, 0, 'qidiruv relelarni almashtirmaydi');
  assert.equal(fake.openHandles(), 0);
  assert.ok(logs.some((item) => item.level === 'error' && /USBRelay1.*ochib bo'lmadi/.test(item.message)));
});

test("qidiruv: takroriy ID ogohlantiriladi; xato, to'xtatish va log xatosida ham throw yo'q", async (t) => {
  install(t, [relay('hid-a', 'HURTM', 2), relay('hid-b', 'HURTM', 2)]);
  const logs = [];
  const found = await usbHid.discoverHidRelays({ log: (level, message) => logs.push({ level, message }) });
  assert.deepEqual(found.map((item) => item.serialNumber), ['HURTM', 'HURTM']);
  assert.ok(logs.some((item) => item.level === 'error' && /"HURTM" ID li 2 ta plata topildi/.test(item.message)));
  // Log funksiyasining o'zi xato bersa ham natija qaytadi
  assert.equal((await usbHid.discoverHidRelays({ log: () => { throw new Error('log'); } })).length, 2);

  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await usbHid.discoverHidRelays({ signal: controller.signal }), []);
  assert.deepEqual(await usbHid.discoverHidRelays(null), found);

  // node-hid native qismi yuklanmasa (devices() xato beradi) — bo'sh ro'yxat va tushunarli xato
  usbHid.__setHidModuleForTests({
    HID: class {},
    devices() { throw new Error('No native build was found for platform=win32 arch=x64'); },
  });
  const errors = [];
  assert.deepEqual(await usbHid.discoverHidRelays({ log: (level, message) => errors.push(message) }), []);
  assert.match(errors[0], /No native build was found/);
  await assert.rejects(driver.write(table(), true, ctx),
    /HID qurilmalar ro'yxatini olib bo'lmadi \(node-hid\) — No native build was found/);
});

test("feature report: hidapi (report ID bilan) va report ID siz javob, buzilgan ID", () => {
  const id = [0x41, 0x42, 0x43, 0x44, 0x45];
  assert.deepEqual(usbHid.parseFeatureReport([0, ...id, 0, 0, 0x05]), { id: 'ABCDE', state: 5 });
  assert.deepEqual(usbHid.parseFeatureReport(Buffer.from([0, ...id, 0, 0, 0x81])), { id: 'ABCDE', state: 0x81 });
  assert.deepEqual(usbHid.parseFeatureReport([...id, 0, 0, 0x03]), { id: 'ABCDE', state: 3 });
  assert.deepEqual(usbHid.parseFeatureReport([0, 0x41, 0x42, 0, 0, 0, 0, 0, 1]), { id: 'AB', state: 1 });
  assert.deepEqual(usbHid.parseFeatureReport([0, 0x41, 0x0a, 0x43, 0x44, 0x45, 0, 0, 1]), { id: null, state: 1 });
  assert.equal(usbHid.parseFeatureReport([1, ...id, 0, 0, 1]), null);
  assert.equal(usbHid.parseFeatureReport([0, 1, 2]), null);
  assert.equal(usbHid.parseFeatureReport(null), null);
  assert.equal(usbHid.parseFeatureReport('ABCDEFGHI'), null);

  assert.deepEqual(usbHid.commandFrame(3, true), [0x00, 0xff, 3, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(usbHid.commandFrame(8, false), [0x00, 0xfd, 8, 0, 0, 0, 0, 0, 0]);
  assert.equal(usbHid.relayCountFromProduct('USBRelay8'), 8);
  assert.equal(usbHid.relayCountFromProduct('USBRelay4\u0000'), 4);
  assert.equal(usbHid.relayCountFromProduct('USBRelay9'), 0);
  assert.equal(usbHid.relayCountFromProduct('USBRelay16'), 0);
  assert.equal(usbHid.relayCountFromProduct(undefined), 0);
});

test("control.executeDevice bilan to'liq sikl: inverted rele, holat o'qib tasdiqlanadi", async (t) => {
  // eslint-disable-next-line global-require
  const { executeDevice, logicalState } = require('../lib/control');
  const board = relay('hid-1', 'HURTM', 1, 0b1); // fizik yoniq = mantiqan o'chiq (inverted)
  install(t, [board]);
  const device = { ...table({ inverted: true, config: { serialNumber: 'HURTM' } }), desired: true };

  const result = await executeDevice(device, {
    verify: true,
    readback: driver.readback(device),
    forced: true,
    sleep: async () => {},
    write: (physical) => driver.write(device, physical, ctx),
    read: async (options) => logicalState(await driver.read(device, ctx, options || {}), device.inverted, device.desired),
  });
  assert.equal(result.ok, true);
  assert.equal(result.actual, true);
  assert.equal(result.attempts, 1);
  assert.equal(board.state, 0, "inverted: mantiqan yoqish = fizik o'chirish");
});

test('node-hid 3 (HIDAsync): amallar alohida oqimda, javob bermagan plata vaqt chegarasida xato beradi', async (t) => {
  const board = relay('hid-async', 'ASYNC', 2);
  const fake = fakeHid([board]);
  let hang = false;
  // Haqiqiy node-hid 3 dagi kabi: static open() va Promise qaytaradigan metodlar
  class HIDAsync {
    static async open(path) {
      const device = new HIDAsync();
      device.inner = new fake.HID(path);
      return device;
    }

    async sendFeatureReport(data) {
      if (hang) return new Promise(() => {});
      return this.inner.sendFeatureReport(data);
    }

    async getFeatureReport(id, length) {
      return Buffer.from(this.inner.getFeatureReport(id, length));
    }

    async close() {
      this.inner.close();
    }
  }
  usbHid.__setHidModuleForTests({ ...fake, HIDAsync });
  t.after(() => usbHid.__setHidModuleForTests(null));

  await driver.write(table({ channel: 1 }), true, ctx);
  assert.equal(board.state, 0b10);
  assert.deepEqual(await driver.read(table({ channel: 1 }), ctx), [true]);
  assert.equal(fake.openHandles(), 0, 'har amaldan keyin plata yopiladi');

  hang = true;
  const started = Date.now();
  await assert.rejects(driver.write(table(), true, ctx), /javob bermadi/);
  assert.ok(Date.now() - started < 5000, 'qotib qolmaydi');
  assert.equal(fake.openHandles(), 0, 'xatoda ham yopiladi');
});
