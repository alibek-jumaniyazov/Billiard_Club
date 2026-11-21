const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const dgram = require('node:dgram');
const { createServer } = require('node:http');

const { sonoffDriver, sonoffChannels } = require('../lib/drivers/sonoff');
const mdns = require('../lib/mdns');
const httpDevice = require('../lib/http-device');
const { executeDevice, logicalState } = require('../lib/control');

/* ------------------------------------------------------------------ */
/*  Yordamchilar                                                       */
/* ------------------------------------------------------------------ */

// Test-only qiymat (haqiqiy qurilma kaliti emas)
const DEVICE_KEY = 'test-only-0000-4000-8000-devicekey00';
const DEVICE_ID = '1000abcdef';

/** Mock Sonoff: har bir so'rov { url, headers, body } bo'lib yoziladi */
async function sonoffMock(t, handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    const entry = { method: req.method, url: req.url, headers: req.headers, rawHeaders: req.rawHeaders, body };
    requests.push(entry);
    const reply = await handler(entry, req, res);
    if (reply === undefined) return; // handler javobni o'zi yozdi (yoki ulanishni uzdi)
    res.setHeader('Content-Type', 'application/json');
    res.end(typeof reply === 'string' ? reply : JSON.stringify(reply));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { host: `127.0.0.1:${server.address().port}`, requests };
}

function makeCtx(extra = {}) {
  const logs = [];
  return { timeoutMs: 1000, log: (level, message) => logs.push(`${level} ${message}`), sleep: async () => {}, logs, ...extra };
}

// Hujjatdagi sxema (SonoffLAN local.py encrypt/decrypt) — drayverdan MUSTAQIL
const md5 = (text) => crypto.createHash('md5').update(text, 'utf8').digest();
function seal(value, key, trailer = '') {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', md5(key), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value) + trailer, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), data: data.toString('base64') };
}
function unseal(body, key) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', md5(key), Buffer.from(body.iv, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(body.data, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

/* ------------------------------------------------------------------ */
/*  Sonoff DIY                                                         */
/* ------------------------------------------------------------------ */

test('sonoff driver is auto-registered and follows the driver contract', () => {
  const drivers = require('../lib/drivers');
  const driver = drivers.getDriver('sonoff');
  assert.ok(driver);
  assert.equal(driver.readback({ config: {} }), true);
  assert.equal(driver.readback({ config: { encrypt: true } }), false);
  assert.equal(driver.lockKey({ host: '192.168.1.50:8081' }), 'sonoff:192.168.1.50');
  assert.equal(driver.lockKey({ host: '' }), null);
  assert.deepEqual(sonoffChannels({ channel: 1, config: { channels: [3, 1, 40, -1, 'x', 0, 2, 4, 5, 6, 7, 8] } }), [1, 3, 0, 2, 4, 5, 6, 7, 8]);
});

test('DIY single channel: /zeroconf/switch command, /zeroconf/info readback', async (t) => {
  let state = 'off';
  const { host, requests } = await sonoffMock(t, (req) => {
    if (req.url === '/zeroconf/switch') {
      state = req.body.data.switch;
      return { seq: 2, error: 0 };
    }
    if (req.url === '/zeroconf/info') {
      return { seq: 3, error: 0, data: { switch: state, startup: 'stay', pulse: 'off', pulseWidth: 500, fwVersion: '3.7.6', deviceid: DEVICE_ID } };
    }
    return { seq: 1, error: 422 };
  });
  const device = { tableId: 1, tableNumber: 1, driver: 'sonoff', host, channel: 0, config: { deviceId: DEVICE_ID } };
  const ctx = makeCtx();

  await sonoffDriver.write(device, true, ctx);
  assert.deepEqual(await sonoffDriver.read(device, ctx, {}), [true]);
  await sonoffDriver.write(device, false, ctx);
  assert.deepEqual(await sonoffDriver.read(device, ctx, {}), [false]);

  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, '/zeroconf/switch');
  assert.deepEqual(requests[0].body, { deviceid: DEVICE_ID, data: { switch: 'on' } });
  assert.match(requests[0].headers['content-type'], /application\/json/);
  // Qurilma veb-serveri bitta ulanishni ushlab qolmasin
  assert.equal(requests[0].headers.connection, 'close');
  // Kanonik sarlavha nomlari (embedded parser harfga sezgir bo'lishi mumkin), ortiqchasi yo'q
  const names = requests[0].rawHeaders.filter((_value, index) => index % 2 === 0);
  assert.deepEqual(names.sort(), ['Connection', 'Content-Length', 'Content-Type', 'Host']);
  assert.equal(requests[1].url, '/zeroconf/info');
  assert.deepEqual(requests[1].body, { deviceid: DEVICE_ID, data: {} });
  assert.deepEqual(requests[2].body.data, { switch: 'off' });
});

test('hub-style execution confirms a DIY relay by readback, also for normally-closed wiring', async (t) => {
  let state = 'on';
  const { host } = await sonoffMock(t, (req) => {
    if (req.url === '/zeroconf/switch') state = req.body.data.switch;
    return req.url === '/zeroconf/info' ? { seq: 1, error: 0, data: { switch: state } } : { seq: 1, error: 0 };
  });
  const entry = { tableId: 2, tableNumber: 2, driver: 'sonoff', host, channel: 0, inverted: true, desired: true, config: {} };
  const ctx = makeCtx();
  const result = await executeDevice(entry, {
    verify: true,
    forced: false,
    readback: sonoffDriver.readback(entry),
    sleep: async () => {},
    write: (physical) => sonoffDriver.write(entry, physical, ctx),
    read: async (options) => logicalState(await sonoffDriver.read(entry, ctx, options || {}), true, true),
  });
  assert.equal(result.ok, true);
  assert.equal(result.actual, true);
  assert.equal(result.attempts, 1);
  assert.equal(state, 'off'); // inverted: chiroq yoniq = rele uzilgan
});

test('DIY 3.3.x info returns `data` as a JSON string; deviceid defaults to an empty string', async (t) => {
  const { host, requests } = await sonoffMock(t, (req) => (req.url === '/zeroconf/info'
    ? { seq: 7, error: 0, data: JSON.stringify({ switch: 'on', startup: 'off', pulse: 'off', ssid: 'club', otaUnlock: false }) }
    : { seq: 7, error: 0 }));
  const device = { tableId: 3, driver: 'sonoff', host, channel: 0 };
  const ctx = makeCtx();
  await sonoffDriver.write(device, true, ctx);
  assert.deepEqual(requests[0].body, { deviceid: '', data: { switch: 'on' } });
  assert.deepEqual(await sonoffDriver.read(device, ctx, {}), [true]);
});

test('multi-outlet: every table outlet in ONE /zeroconf/switches request, readback per outlet', async (t) => {
  const outlets = ['off', 'off', 'off', 'off'];
  let stringData = false;
  let dropOutlet3 = false;
  const { host, requests } = await sonoffMock(t, (req) => {
    if (req.url === '/zeroconf/switches') {
      for (const item of req.body.data.switches) outlets[item.outlet] = item.switch;
      return { seq: 4, error: 0 };
    }
    if (req.url === '/zeroconf/info') {
      const switches = outlets.map((value, outlet) => ({ switch: value, outlet }))
        .filter((item) => !(dropOutlet3 && item.outlet === 3));
      const data = { switches, configure: [], sledOnline: 'on', fwVersion: '3.4.1' };
      return { seq: 5, error: 0, data: stringData ? JSON.stringify(data) : data };
    }
    return { seq: 5, error: 422 };
  });
  // channel > 0 yoki qo'shimcha kanal — outlets avtomatik yoqiladi
  const device = { tableId: 4, driver: 'sonoff', host, channel: 1, config: { deviceId: DEVICE_ID, channels: [3, 1] } };
  const ctx = makeCtx();

  await sonoffDriver.write(device, true, ctx);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/zeroconf/switches');
  assert.deepEqual(requests[0].body, {
    deviceid: DEVICE_ID,
    data: { switches: [{ switch: 'on', outlet: 1 }, { switch: 'on', outlet: 3 }] },
  });
  assert.deepEqual(outlets, ['off', 'on', 'off', 'on']);
  assert.deepEqual(await sonoffDriver.read(device, ctx, {}), [true, true]);
  stringData = true;
  assert.deepEqual(await sonoffDriver.read(device, ctx, {}), [true, true]);
  dropOutlet3 = true; // qisman javob — tasdiq EMAS
  assert.deepEqual(await sonoffDriver.read(device, ctx, {}), [true, null]);

  // MINIR3: bitta rele, lekin ko'p kanalli protokol — outlets: true qo'lda
  await sonoffDriver.write({ ...device, channel: 0, config: { outlets: true } }, false, ctx);
  assert.deepEqual(requests.at(-1).body.data, { switches: [{ switch: 'off', outlet: 0 }] });

  // outlets: false bilan 0 dan boshqa kanal — jim noto'g'ri releni bosmaymiz
  await assert.rejects(
    sonoffDriver.write({ ...device, channel: 2, config: { outlets: false } }, true, ctx),
    /outlets: false/,
  );
});

test('device error codes become clear Uzbek messages; read never throws', async (t) => {
  let reply = { seq: 1, error: 401 };
  let status = 200;
  const { host } = await sonoffMock(t, (_req, _raw, res) => {
    res.statusCode = status;
    return reply;
  });
  const ctx = makeCtx();
  const device = { tableId: 5, driver: 'sonoff', host, channel: 0, config: {} };

  await assert.rejects(sonoffDriver.write(device, true, ctx), /xato 401.*DIY/);
  reply = { seq: 1, error: 404 };
  await assert.rejects(sonoffDriver.write(device, true, ctx), /deviceId talab qilyapti \(xato 404\)/);
  await assert.rejects(
    sonoffDriver.write({ ...device, config: { deviceId: DEVICE_ID } }, true, ctx),
    /deviceId bu qurilmaga mos emas \(xato 404\)/,
  );
  reply = { seq: 1, error: 422 };
  await assert.rejects(sonoffDriver.write(device, true, ctx), /xato 422.*outlets/);
  reply = { seq: 1, error: 400 };
  await assert.rejects(sonoffDriver.write(device, true, ctx), /xato 400/);
  reply = { seq: 1, error: 503 };
  await assert.rejects(sonoffDriver.write(device, true, ctx), /kod 503/);
  reply = { seq: 1 };
  await assert.rejects(sonoffDriver.write(device, true, ctx), /natija kodi/);
  reply = '<html>not sonoff</html>';
  await assert.rejects(sonoffDriver.write(device, true, ctx), /JSON emas/);
  status = 404;
  reply = { error: 0 };
  await assert.rejects(
    sonoffDriver.write({ ...device, channel: 1 }, true, ctx),
    /ko'p kanalli buyruqni bilmaydi \(HTTP 404\)/,
  );
  status = 500;
  await assert.rejects(sonoffDriver.write(device, true, ctx), /^Error: Sonoff: HTTP 500$/);

  // O'qish xatosi — null (noma'lum), throw EMAS
  status = 200;
  reply = { seq: 1, error: 401 };
  assert.deepEqual(await sonoffDriver.read(device, ctx, {}), [null]);
  assert.deepEqual(await sonoffDriver.read({ ...device, channel: 2, config: { channels: [3] } }, ctx, {}), [null, null]);
  assert.deepEqual(await sonoffDriver.read({ ...device, host: '' }, ctx, {}), [null]);

  // Sozlama xatolari
  await assert.rejects(sonoffDriver.write({ ...device, host: '' }, true, ctx), /host/);
  await assert.rejects(sonoffDriver.write({ ...device, host: 'evil.test/x?' }, true, ctx), /host formati/);
  await assert.rejects(sonoffDriver.write({ ...device, config: { deviceId: 'bad id!' } }, true, ctx), /deviceId formati/);
});

test('busy device that resets the connection is retried (idempotent on/off only)', async (t) => {
  let resets = 2;
  const { host, requests } = await sonoffMock(t, (_req, raw) => {
    if (resets > 0) {
      resets -= 1;
      raw.socket.destroy();
      return undefined;
    }
    return { seq: 1, error: 0 };
  });
  const ctx = makeCtx();
  const device = { tableId: 6, driver: 'sonoff', host, channel: 0, config: {} };
  await sonoffDriver.write(device, true, ctx);
  assert.equal(requests.length, 3);
  assert.ok(requests.every((item) => item.body.data.switch === 'on'));

  resets = 99;
  await assert.rejects(sonoffDriver.write(device, true, ctx), /qurilmaga ulanib bo'lmadi/);
});

test('a silent or half-open device times out (deadline covers the body) and abort stops at once', async (t) => {
  const { host } = await sonoffMock(t, (req, _raw, res) => {
    if (req.url === '/zeroconf/switch') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"seq":1,'); // tana hech qachon tugamaydi
    }
    return undefined; // /zeroconf/info — umuman javob yo'q
  });
  const device = { tableId: 13, driver: 'sonoff', host, channel: 0, config: {} };
  let started = Date.now();
  await assert.rejects(sonoffDriver.write(device, true, makeCtx({ timeoutMs: 150 })), /javob bermadi/);
  assert.ok(Date.now() - started < 1500);
  started = Date.now();
  assert.deepEqual(await sonoffDriver.read(device, makeCtx({ timeoutMs: 150 }), {}), [null]);
  assert.ok(Date.now() - started < 1500);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  started = Date.now();
  await assert.rejects(sonoffDriver.write(device, true, makeCtx({ timeoutMs: 5000, signal: controller.signal })), /Sonoff/);
  assert.ok(Date.now() - started < 1500);
});

test('consecutive requests to one device keep the documented 200 ms gap', async (t) => {
  const { host } = await sonoffMock(t, (req) => (req.url === '/zeroconf/info'
    ? { seq: 1, error: 0, data: { switch: 'on' } } : { seq: 1, error: 0 }));
  const waits = [];
  const ctx = makeCtx({ sleep: async (ms) => { waits.push(ms); } });
  const device = { tableId: 8, driver: 'sonoff', host, channel: 0, config: {} };
  await sonoffDriver.write(device, true, ctx);
  await sonoffDriver.read(device, ctx, {});
  assert.ok(waits.length >= 1);
  const last = waits.at(-1);
  assert.ok(last > 0 && last <= 200, `kutish ${last} ms`);
});

/* ------------------------------------------------------------------ */
/*  eWeLink LAN (shifrlangan)                                          */
/* ------------------------------------------------------------------ */

test('encrypted LAN mode: AES-128-CBC body keyed by md5(devicekey); encrypted replies are decrypted', async (t) => {
  let state = 'off';
  const outlets = ['off', 'off'];
  const { host, requests } = await sonoffMock(t, (req) => {
    const body = req.body;
    // Qurilma kalitni bilmasa shifrni ocholmaydi
    let data;
    try {
      data = unseal(body, DEVICE_KEY);
    } catch {
      return { seq: 9, error: 401 };
    }
    req.plain = data;
    if (req.url === '/zeroconf/switch') {
      state = data.switch;
      return { seq: 10, error: 0 };
    }
    if (req.url === '/zeroconf/switches') {
      for (const item of data.switches) outlets[item.outlet] = item.switch;
      return { seq: 11, error: 0 };
    }
    if (req.url === '/zeroconf/getState') {
      // Ba'zi proshivkalar JSON oxiriga \x02 qo'shadi (SonoffLAN #1160)
      const sealed = seal({ switch: state, startup: 'off', switches: outlets.map((value, outlet) => ({ switch: value, outlet })) }, DEVICE_KEY, '\u0002\u0002');
      return { seq: 12, error: 0, encrypt: true, ...sealed };
    }
    return { seq: 13, error: 422 };
  });
  const ctx = makeCtx();
  const device = {
    tableId: 9, tableNumber: 9, driver: 'sonoff', host, channel: 0, auth: ` ${DEVICE_KEY} `,
    config: { encrypt: true, deviceId: DEVICE_ID },
  };
  assert.equal(sonoffDriver.readback(device), false);

  await sonoffDriver.write(device, true, ctx);
  const first = requests[0];
  assert.equal(first.url, '/zeroconf/switch');
  assert.deepEqual(Object.keys(first.body).sort(), ['data', 'deviceid', 'encrypt', 'iv', 'selfApikey', 'sequence']);
  assert.equal(first.body.deviceid, DEVICE_ID);
  assert.equal(first.body.selfApikey, '123');
  assert.equal(first.body.encrypt, true);
  assert.match(first.body.sequence, /^\d{13,}$/);
  assert.equal(Buffer.from(first.body.iv, 'base64').length, 16);
  assert.deepEqual(first.plain, { switch: 'on' });
  assert.equal(state, 'on');

  // Best-effort o'qish (readback=false, lekin ochish sxemasi ishlaydi)
  assert.deepEqual(await sonoffDriver.read(device, ctx, {}), [true]);
  assert.ok(Number(requests[1].body.sequence) > Number(first.body.sequence));
  assert.notEqual(requests[1].body.iv, first.body.iv);

  const multi = { ...device, channel: 1, config: { ...device.config, channels: [0] } };
  await sonoffDriver.write(multi, true, ctx);
  assert.equal(requests.at(-1).url, '/zeroconf/switches');
  assert.deepEqual(requests.at(-1).plain, { switches: [{ switch: 'on', outlet: 1 }, { switch: 'on', outlet: 0 }] });
  assert.deepEqual(await sonoffDriver.read(multi, ctx, {}), [true, true]);

  // Noto'g'ri kalit: qurilma rad etadi — xato matnida kalit YO'Q
  const wrongKey = 'test-only-wrong-key-value';
  await assert.rejects(sonoffDriver.write({ ...device, auth: wrongKey }, true, ctx), (err) => {
    assert.match(err.message, /devicekey/);
    assert.ok(!err.message.includes(wrongKey));
    return true;
  });
  assert.deepEqual(await sonoffDriver.read({ ...device, auth: wrongKey }, ctx, {}), [null]);

  // Kalit hech qayerda logga chiqmaydi
  for (const line of ctx.logs) {
    assert.ok(!line.includes(DEVICE_KEY) && !line.includes(wrongKey), line);
  }
});

test('encrypted mode requires deviceId and devicekey, without echoing the key', async () => {
  const ctx = makeCtx();
  const device = { tableId: 10, driver: 'sonoff', host: '127.0.0.1:9', channel: 0, auth: DEVICE_KEY, config: { encrypt: true } };
  await assert.rejects(sonoffDriver.write(device, true, ctx), (err) => {
    assert.match(err.message, /deviceId kiritilmagan/);
    assert.ok(!err.message.includes(DEVICE_KEY));
    return true;
  });
  await assert.rejects(
    sonoffDriver.write({ ...device, auth: '  ', config: { encrypt: true, deviceId: DEVICE_ID } }, true, ctx),
    /devicekey\) kiritilmagan/,
  );
});

/* ------------------------------------------------------------------ */
/*  Tasmota paroli                                                     */
/* ------------------------------------------------------------------ */

test('Tasmota sends user/password as URL-encoded query params (no Authorization header needed) and never leaks them', async (t) => {
  const password = 'p@ss w&rd=1';
  let power = 'OFF';
  const seen = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://tasmota.test');
    seen.push(url);
    res.setHeader('Content-Type', 'application/json');
    // Eski Tasmota: Authorization sarlavhasi e'tiborsiz — faqat URL parametrlari
    const open = url.searchParams.get('open') === '1';
    if (!open && (url.searchParams.get('user') !== 'admin' || url.searchParams.get('password') !== password)) {
      res.statusCode = 401;
      res.end('{"WARNING":"Need user=<username>&password=<password>"}');
      return;
    }
    const command = url.searchParams.get('cmnd');
    if (command === 'Power2 ON') power = 'ON';
    if (command === 'Power2 OFF') power = 'OFF';
    res.end(JSON.stringify({ POWER2: power }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const host = `127.0.0.1:${server.address().port}`;
  const ctx = makeCtx();
  const device = { tableId: 11, tableNumber: 11, driver: 'tasmota', host, channel: 1, auth: password };

  await httpDevice.apply(device, true, 1, ctx);
  assert.equal(power, 'ON');
  assert.equal(await httpDevice.read(device, 1, ctx), true);
  assert.equal(seen[0].pathname, '/cm');
  assert.equal(seen[0].searchParams.get('cmnd'), 'Power2 ON');

  // "user:parol" shakli ham (parolda ":" bo'lishi mumkin)
  await httpDevice.apply({ ...device, auth: `admin:${password}` }, false, 1, ctx);
  assert.equal(power, 'OFF');

  // Noto'g'ri parol — HTTP 401, matnda parol yo'q
  await assert.rejects(httpDevice.apply({ ...device, auth: 'wrong-secret' }, true, 1, ctx), (err) => {
    assert.equal(err.message, 'HTTP 401');
    return true;
  });
  assert.equal(await httpDevice.read({ ...device, auth: 'wrong-secret' }, 1, ctx), null);

  // Parolsiz qurilma — user/password umuman yuborilmaydi
  const before = seen.length;
  await assert.rejects(httpDevice.apply({ ...device, auth: null }, true, 1, ctx), /HTTP 401/);
  assert.equal(seen[before].searchParams.has('user'), false);
  assert.equal(seen[before].searchParams.has('password'), false);

  for (const line of ctx.logs) {
    assert.ok(!line.includes('p@ss') && !line.includes('password=') && !line.includes('wrong-secret'), line);
  }
});

test('Tasmota: an error whose text contains the credentialed URL is never surfaced', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => { throw new TypeError(`Failed to parse URL from ${url}`); };
  const device = { tableId: 12, driver: 'tasmota', host: '127.0.0.1:9', channel: 0, auth: 'secret-pass' };
  await assert.rejects(httpDevice.apply(device, true, 0, makeCtx()), (err) => {
    assert.ok(!err.message.includes('secret-pass') && !err.message.includes('password='), err.message);
    return true;
  });
});

/* ------------------------------------------------------------------ */
/*  mDNS                                                               */
/* ------------------------------------------------------------------ */

/**
 * Qo'lda yig'ilgan DNS javobi (siqish ko'rsatkichlari bilan):
 *   PTR  _ewelink._tcp.local -> eWeLink_1000abcdef.<ptr: xizmat>
 *   SRV  <ptr: nusxa> 0 0 8081 eWeLink_1000abcdef.<ptr: "local">
 *   TXT  <ptr: nusxa> txtvers=1 id=... type=diy_plug data1={...switches...}
 *   A    <ptr: SRV target> 192.168.1.50
 *   AAAA <ptr: SRV target> fe80::1 (e'tiborsiz)
 */
function handBuiltEwelinkResponse() {
  const bytes = [];
  const u16 = (value) => bytes.push((value >> 8) & 0xff, value & 0xff);
  const u32 = (value) => { u16((value >>> 16) & 0xffff); u16(value & 0xffff); };
  const label = (text) => { const buf = Buffer.from(text, 'utf8'); bytes.push(buf.length, ...buf); };
  const pointer = (offset) => u16(0xc000 | offset);
  const rdata = (write) => {
    const at = bytes.length;
    u16(0);
    const start = bytes.length;
    write();
    const length = bytes.length - start;
    bytes[at] = (length >> 8) & 0xff;
    bytes[at + 1] = length & 0xff;
  };

  // Sarlavha: ID 0, QR=1 AA=1, 0 savol, 1 javob, 0 vakolat, 4 qo'shimcha
  u16(0); u16(0x8400); u16(0); u16(1); u16(0); u16(4);

  const serviceAt = bytes.length;
  label('_ewelink'); label('_tcp');
  const localAt = bytes.length;
  label('local'); bytes.push(0);
  u16(12); u16(1); u32(4500);
  let instanceAt = -1;
  rdata(() => { instanceAt = bytes.length; label('eWeLink_1000abcdef'); pointer(serviceAt); });

  let targetAt = -1;
  pointer(instanceAt); u16(33); u16(0x8001); u32(120);
  rdata(() => { u16(0); u16(0); u16(8081); targetAt = bytes.length; label('eWeLink_1000abcdef'); pointer(localAt); });

  pointer(instanceAt); u16(16); u16(0x8001); u32(4500);
  rdata(() => {
    for (const entry of ['txtvers=1', 'id=1000abcdef', 'type=diy_plug', 'apivers=1', 'seq=12',
      'data1={"switches":[{"switch":"on","outlet":0},{"switch":"off","outlet":1}],"sledOnline":"on"}',
      'ID=duplicate-ignored', 'flag']) label(entry);
  });

  pointer(targetAt); u16(1); u16(0x8001); u32(120);
  rdata(() => bytes.push(192, 168, 1, 50));

  pointer(targetAt); u16(28); u16(0x8001); u32(120);
  rdata(() => { u16(0xfe80); for (let i = 0; i < 6; i += 1) u16(0); u16(1); });

  return Buffer.from(bytes);
}

/** Siqishsiz oddiy javob (xaritalash testlari uchun) */
function plainResponse(records) {
  const name = (text) => mdns.encodeName(text);
  const parts = [];
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(records.length, 6);
  parts.push(header);
  for (const record of records) {
    let data;
    if (record.type === 12) data = name(record.data);
    else if (record.type === 33) {
      const head = Buffer.alloc(6);
      head.writeUInt16BE(record.data.port, 4);
      data = Buffer.concat([head, name(record.data.target)]);
    } else if (record.type === 16) {
      data = Buffer.concat(record.data.map((entry) => Buffer.concat([Buffer.from([Buffer.byteLength(entry)]), Buffer.from(entry)])));
    } else if (record.type === 1) data = Buffer.from(record.data.split('.').map(Number));
    const meta = Buffer.alloc(10);
    meta.writeUInt16BE(record.type, 0);
    meta.writeUInt16BE(1, 2);
    meta.writeUInt32BE(record.ttl ?? 120, 4);
    meta.writeUInt16BE(data.length, 8);
    parts.push(name(record.name), meta, data);
  }
  return Buffer.concat(parts);
}

test('mDNS query encoding: PTR questions, QU bit, ID 0', () => {
  const query = mdns.encodeQuery(['_ewelink._tcp.local', '_shelly._tcp.local.'], { unicastResponse: true });
  assert.equal(query.readUInt16BE(0), 0);
  assert.equal(query.readUInt16BE(2), 0);
  assert.equal(query.readUInt16BE(4), 2);
  const expected = Buffer.concat([
    Buffer.from([8]), Buffer.from('_ewelink'), Buffer.from([4]), Buffer.from('_tcp'),
    Buffer.from([5]), Buffer.from('local'), Buffer.from([0, 0, 12, 0x80, 1]),
  ]);
  assert.deepEqual(query.subarray(12, 12 + expected.length), expected);
  const parsed = mdns.parseMessage(query);
  assert.equal(parsed.response, false);
  assert.deepEqual(parsed.questions, [
    { name: '_ewelink._tcp.local', type: 12, class: 1, unicastResponse: true },
    { name: '_shelly._tcp.local', type: 12, class: 1, unicastResponse: true },
  ]);
  const plain = mdns.parseMessage(mdns.encodeQuery([{ name: 'x\\.y._http._tcp.local', type: 33 }]));
  assert.deepEqual(plain.questions[0], { name: 'x\\.y._http._tcp.local', type: 33, class: 1, unicastResponse: false });
});

test('mDNS response parsing follows compression pointers and maps an eWeLink DIY relay', () => {
  const message = mdns.parseMessage(handBuiltEwelinkResponse());
  assert.equal(message.response, true);
  assert.equal(message.authoritative, true);
  assert.equal(message.answers.length, 1);
  assert.equal(message.additionals.length, 4);
  assert.equal(message.answers[0].type, mdns.TYPE.PTR);
  assert.equal(message.answers[0].name, '_ewelink._tcp.local');
  assert.equal(message.answers[0].data, 'eWeLink_1000abcdef._ewelink._tcp.local');
  const [srv, txt, a, aaaa] = message.additionals;
  assert.equal(srv.name, 'eWeLink_1000abcdef._ewelink._tcp.local');
  assert.equal(srv.cacheFlush, true);
  assert.deepEqual(srv.data, { priority: 0, weight: 0, port: 8081, target: 'eWeLink_1000abcdef.local' });
  assert.equal(txt.data.id, '1000abcdef'); // takroriy "ID=" e'tiborsiz (birinchisi yutadi)
  assert.equal(txt.data.flag, '');
  assert.equal(a.name, 'eWeLink_1000abcdef.local');
  assert.equal(a.data, '192.168.1.50');
  assert.equal(aaaa.data, 'fe80:0:0:0:0:0:0:1');

  const instances = mdns.collectInstances([{ message, address: '192.168.1.99' }], ['_ewelink._tcp.local.']);
  assert.equal(instances.length, 1);
  assert.deepEqual({ ...instances[0], txt: undefined }, {
    service: '_ewelink._tcp.local', instance: 'eWeLink_1000abcdef', host: 'eWeLink_1000abcdef.local',
    ip: '192.168.1.50', port: 8081, txt: undefined,
  });
  assert.equal(instances[0].txt.type, 'diy_plug');
  assert.deepEqual(mdns.mapRelayInstance(instances[0]), {
    driver: 'sonoff', host: '192.168.1.50', id: '1000abcdef', model: 'diy_plug', encrypt: false, channels: 2, needs: [],
  });
});

test('mDNS maps encrypted eWeLink, Shelly Gen2+/Gen1, ESPHome; skips iHost and goodbye records', () => {
  const packet = plainResponse([
    // Shifrlangan 4CH: A yozuvi yo'q — paket manbasi IP si; port 8081 emas
    { name: '_ewelink._tcp.local', type: 12, data: 'eWeLink_10001a2b3c._ewelink._tcp.local' },
    { name: 'eWeLink_10001a2b3c._ewelink._tcp.local', type: 33, data: { port: 8082, target: 'eWeLink_10001a2b3c.local' } },
    { name: 'eWeLink_10001a2b3c._ewelink._tcp.local', type: 16, data: ['txtvers=1', 'id=10001a2b3c', 'type=strip', 'encrypt=true', 'iv=AAAAAAAAAAAAAAAAAAAAAA==', 'data1=bm90LWpzb24='] },
    // iHost — rele emas
    { name: '_ewelink._tcp.local', type: 12, data: 'ihost-1001aaaaaa._ewelink._tcp.local' },
    { name: 'ihost-1001aaaaaa._ewelink._tcp.local', type: 33, data: { port: 8081, target: 'ihost.local' } },
    { name: 'ihost.local', type: 1, data: '192.168.1.60' },
    // Shelly Gen3 va Gen4 — ikkalasi Gen2 RPC
    { name: '_shelly._tcp.local', type: 12, data: 'shelly1g3-aabbcc._shelly._tcp.local' },
    { name: 'shelly1g3-aabbcc._shelly._tcp.local', type: 33, data: { port: 80, target: 'shelly1g3-aabbcc.local' } },
    { name: 'shelly1g3-aabbcc._shelly._tcp.local', type: 16, data: ['gen=3', 'app=S1G3', 'ver=1.4.4'] },
    { name: 'shelly1g3-aabbcc.local', type: 1, data: '192.168.1.71' },
    { name: '_shelly._tcp.local', type: 12, data: 'shelly2pmg4-ddeeff._shelly._tcp.local' },
    { name: 'shelly2pmg4-ddeeff._shelly._tcp.local', type: 33, data: { port: 80, target: 'shelly2pmg4-ddeeff.local' } },
    { name: 'shelly2pmg4-ddeeff._shelly._tcp.local', type: 16, data: ['gen=4', 'app=S2PMG4'] },
    { name: 'shelly2pmg4-ddeeff.local', type: 1, data: '192.168.1.72' },
    // ESPHome: native API 6053, boshqaruv esa 80-port
    { name: '_esphomelib._tcp.local', type: 12, data: 'table-relay-3._esphomelib._tcp.local' },
    { name: 'table-relay-3._esphomelib._tcp.local', type: 33, data: { port: 6053, target: 'table-relay-3.local' } },
    { name: 'table-relay-3._esphomelib._tcp.local', type: 16, data: ['version=2024.6.0', 'platform=ESP32'] },
    { name: 'table-relay-3.local', type: 1, data: '192.168.1.80' },
    // "Xayr" (TTL=0) — hisobga olinmaydi
    { name: '_shelly._tcp.local', type: 12, data: 'shellyplus1-gone._shelly._tcp.local', ttl: 0 },
  ]);
  const gen1 = plainResponse([
    { name: '_shelly._tcp.local', type: 12, data: 'shelly1-old._shelly._tcp.local' },
    { name: 'shelly1-old._shelly._tcp.local', type: 33, data: { port: 80, target: 'shelly1-old.local' } },
    { name: 'shelly1-old._shelly._tcp.local', type: 16, data: ['gen=1'] },
    { name: 'shelly1-old.local', type: 1, data: '192.168.1.73' },
  ]);
  const instances = mdns.collectInstances([
    { message: mdns.parseMessage(packet), address: '192.168.1.55' },
    { message: mdns.parseMessage(gen1), address: '192.168.1.73' },
  ], mdns.RELAY_SERVICES);
  const devices = instances.map((item) => mdns.mapRelayInstance(item)).filter(Boolean);
  assert.deepEqual(devices, [
    { driver: 'sonoff', host: '192.168.1.55:8082', id: '10001a2b3c', model: 'strip', encrypt: true, channels: 4, needs: ['deviceKey'] },
    { driver: 'shelly_gen2', host: '192.168.1.71', name: 'shelly1g3-aabbcc', model: 'S1G3', needs: [] },
    { driver: 'shelly_gen2', host: '192.168.1.72', name: 'shelly2pmg4-ddeeff', model: 'S2PMG4', needs: [] },
    { driver: 'shelly_gen1', host: '192.168.1.73', name: 'shelly1-old', needs: [] },
    { driver: 'esphome', host: '192.168.1.80', name: 'table-relay-3', needs: ['entity'] },
  ]);
});

test('mDNS parser rejects pointer loops and truncated packets', () => {
  const loop = Buffer.from([0, 0, 0x84, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0xc0, 12, 0, 12, 0, 1]);
  assert.throws(() => mdns.parseMessage(loop), /ko'rsatkich/);
  const full = handBuiltEwelinkResponse();
  assert.throws(() => mdns.parseMessage(full.subarray(0, full.length - 3)), /mDNS/);
  assert.throws(() => mdns.parseMessage(Buffer.alloc(5)), /qisqa/);
});

test('queryMdns sends a PTR query and resolves instances from a unicast reply', async (t) => {
  const responder = dgram.createSocket('udp4');
  await new Promise((resolve) => responder.bind(0, '127.0.0.1', resolve));
  t.after(() => responder.close());
  const queries = [];
  const reply = handBuiltEwelinkResponse();
  responder.on('message', (msg, rinfo) => {
    const query = mdns.parseMessage(msg);
    queries.push(query);
    if (query.questions.some((item) => item.name === '_ewelink._tcp.local' && item.type === mdns.TYPE.PTR)) {
      responder.send(reply, rinfo.port, rinfo.address);
    }
  });
  const started = Date.now();
  const instances = await mdns.queryMdns({
    services: ['_ewelink._tcp.local'],
    timeoutMs: 300,
    destination: { address: '127.0.0.1', port: responder.address().port },
  });
  assert.ok(Date.now() - started < 2000);
  assert.ok(queries.length >= 1);
  // Tasodifiy portdan — "QU" (unicast javob) so'raladi
  assert.equal(queries[0].questions[0].unicastResponse, true);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].ip, '192.168.1.50');
  assert.equal(instances[0].port, 8081);
});

test('queryMdns honours abort and discoverMdnsRelays never throws', async (t) => {
  const silent = dgram.createSocket('udp4');
  await new Promise((resolve) => silent.bind(0, '127.0.0.1', resolve));
  t.after(() => silent.close());
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  const started = Date.now();
  const result = await mdns.queryMdns({
    services: ['_shelly._tcp.local'],
    timeoutMs: 5000,
    signal: controller.signal,
    destination: { address: '127.0.0.1', port: silent.address().port },
  });
  assert.deepEqual(result, []);
  assert.ok(Date.now() - started < 1500);

  const aborted = new AbortController();
  aborted.abort();
  const logs = [];
  assert.deepEqual(await mdns.discoverMdnsRelays({ signal: aborted.signal, log: (level, message) => logs.push({ level, message }) }), []);
  assert.ok(logs.every((entry) => entry.level === 'debug'));
});
