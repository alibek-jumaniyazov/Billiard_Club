'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const dgram = require('node:dgram');
const http = require('node:http');
const net = require('node:net');
const zlib = require('node:zlib');

const protocol = require('../lib/tuya-protocol');
const tuyaDriver = require('../lib/drivers/tuya');
const { LightHub } = require('../lib/hub');
const drivers = require('../lib/drivers');
const { discoverTuya, decodeBroadcast, toDevice, buildDevInfoRequest } = require('../lib/tuya-discover');
const {
  fetchTuyaCloudDevices, signRequest, pickSwitchDp, entriesFromModel, entriesFromSpecs,
} = require('../lib/tuya-cloud');

/**
 * TUYA LOKAL PROTOKOLI — soxta (mock) qurilma bilan uchdan-uchgacha testlar.
 *
 * Soxta qurilma protokolning QURILMA tomonini lib/tuya-protocol.js dan FOYDALANMASDAN,
 * to'g'ridan-to'g'ri node:crypto bilan amalga oshiradi: 3.1, 3.3, 3.4 (HMAC + sessiya
 * kaliti), 3.5 (6699 / AES-GCM). Har bir mijoz kadrining tuzilishi va JSON shakli
 * qurilma tomonda tekshiriladi (`violations` bo'sh bo'lishi kerak).
 * Golden-vektorlar tashqi manbalardan: CRC32 tekshiruv qiymati, FIPS-197, GCM
 * spetsifikatsiyasi, haqiqiy qurilma kadri, Tuya rasmiy hujjatidagi imzo misollari.
 */

const LOCAL_KEY = 'Ab3$kL9#mN2@pQ7!';
const EMPTY = Buffer.alloc(0);

/* ------------------------------------------------------------------ */
/*  Mustaqil yordamchilar (lib dan foydalanmaydi)                      */
/* ------------------------------------------------------------------ */

function refCrc32(buffer) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buffer);
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function be32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function ecbEnc(key, data, pad = true) {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(pad);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/** Qat'iy PKCS7 — noto'g'ri kalitda deyarli doim throw */
function ecbDec(key, data) {
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function ecbDecRaw(key, data) {
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function md5hex(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

function xor16(a, b) {
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) out[i] = a[i] ^ b[i];
  return out;
}

function header(version) {
  return Buffer.concat([Buffer.from(version, 'latin1'), Buffer.alloc(12)]);
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function isModern(version) {
  return version === '3.4' || version === '3.5';
}

/** Qurilma kadri 55AA: retcode bilan; 3.4 da HMAC-SHA256, aks holda CRC32 */
function deviceFrame55(seq, cmd, payload, { retcode = 0, hmacKey = null } = {}) {
  const ret = retcode === null ? EMPTY : be32(retcode);
  const body = Buffer.concat([
    be32(0x55aa), be32(seq), be32(cmd), be32(ret.length + payload.length + (hmacKey ? 36 : 8)), ret, payload,
  ]);
  const check = hmacKey ? hmac(hmacKey, body) : be32(refCrc32(body));
  return Buffer.concat([body, check, be32(0xaa55)]);
}

/** Qurilma kadri 6699: retcode shifr ichida, AAD = sarlavhaning 4..18 baytlari */
function deviceFrame66(seq, cmd, payload, key, { retcode = 0 } = {}) {
  const plain = retcode === null ? payload : Buffer.concat([be32(retcode), payload]);
  const head = Buffer.concat([be32(0x6699), Buffer.alloc(2), be32(seq), be32(cmd), be32(12 + plain.length + 16)]);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
  cipher.setAAD(head.subarray(4));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([head, iv, ciphertext, cipher.getAuthTag(), be32(0x9966)]);
}

/** 3.3 qurilmalari STATUS sarlavhasining 12 baytiga nol bo'lmagan qiymat yozadi */
const STATUS_HEADER_33 = Buffer.concat([Buffer.from('3.3', 'latin1'), Buffer.from('00000000000052cd00000001', 'hex')]);
const GARBAGE = Buffer.from('deadbeef00', 'hex');

function randomDeviceId() {
  return `bf${crypto.randomBytes(9).toString('hex')}`;
}

/* ------------------------------------------------------------------ */
/*  Soxta Tuya qurilmasi                                               */
/* ------------------------------------------------------------------ */

class MockTuya {
  /**
   * @param {string} version '3.1' | '3.3' | '3.4' | '3.5'
   * @param {object} options
   *   dps            boshlang'ich holat
   *   silent         hech narsaga javob bermaydi
   *   chunks         'tiny' (3 baytli bo'laklar) | 'coalesce' (barcha kadrlar bitta yozuvda)
   *   garbage        har yuborishdan oldin tanilmaydigan baytlar
   *   pushOnConnect  ulanish/sessiyadan keyin darhol so'ralmagan STATUS
   *   headerOnQuery  3.3: DP_QUERY javobi ham "3.3" sarlavhali
   *   device22       3.3: DP_QUERY ga "json obj data unvalid" (retcode 1)
   *   maxDps         bir xabarda shundan ko'p DP kelsa — javobsiz
   *   wrongKey       kalit mos kelmasa: 'respond' (o'z kaliti bilan javob) | 'close'
   */
  constructor(version, options = {}) {
    this.version = version;
    this.options = options;
    this.localKey = LOCAL_KEY;
    this.deviceId = randomDeviceId();
    this.dps = { ...(options.dps || { 1: false }) };
    this.controls = [];
    this.queries = 0;
    this.device22Queries = 0;
    this.sessions = 0;
    this.wrongKeyHits = 0;
    this.violations = [];
    this.sockets = new Set();
    this.server = net.createServer((socket) => this.onConnection(socket));
  }

  async listen() {
    await new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
    this.port = this.server.address().port;
    this.host = `127.0.0.1:${this.port}`;
    return this;
  }

  close() {
    for (const socket of this.sockets) socket.destroy();
    this.server.close();
  }

  violation(text) {
    this.violations.push(text);
  }

  get realKey() {
    return Buffer.from(this.localKey, 'latin1');
  }

  onConnection(socket) {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => {});
    const state = {
      buffer: EMPTY, key: this.realKey, seq: 1000, localNonce: null, remoteNonce: null, ready: !isModern(this.version),
    };
    if (this.options.pushOnConnect && !isModern(this.version)) {
      this.send(socket, [this.statusFrame(state, this.options.pushOnConnect)]);
    }
    socket.on('data', (chunk) => {
      if (this.options.silent) return;
      state.buffer = Buffer.concat([state.buffer, chunk]);
      for (let frame = this.takeFrame(state); frame; frame = this.takeFrame(state)) {
        try {
          this.handle(socket, state, frame);
        } catch (err) {
          this.violation(`ishlov xatosi: ${err.message}`);
        }
      }
    });
  }

  takeFrame(state) {
    const buf = state.buffer;
    if (buf.length < 4) return null;
    const prefix = buf.readUInt32BE(0);
    let total;
    if (prefix === 0x55aa) {
      if (buf.length < 16) return null;
      total = 16 + buf.readUInt32BE(12);
    } else if (prefix === 0x6699) {
      if (buf.length < 18) return null;
      total = 18 + buf.readUInt32BE(14) + 4;
    } else {
      this.violation(`mijoz kadri noto'g'ri prefiks bilan: ${buf.subarray(0, 4).toString('hex')}`);
      state.buffer = EMPTY;
      return null;
    }
    if (buf.length < total) return null;
    state.buffer = buf.subarray(total);
    return buf.subarray(0, total);
  }

  /** Mijoz kadrini ochadi: { seq, cmd, body }; kalit mos kelmasa err.auth */
  open(frame, state) {
    if (this.version === '3.5') {
      if (frame.readUInt32BE(0) !== 0x6699) this.violation('3.5: 6699 kadr kutilgan');
      if (frame.readUInt16BE(4) !== 0) this.violation('6699: noma’lum maydon nol emas');
      if (frame.readUInt32BE(frame.length - 4) !== 0x9966) this.violation('6699: suffix noto‘g‘ri');
      const seq = frame.readUInt32BE(6);
      const cmd = frame.readUInt32BE(10);
      const iv = frame.subarray(18, 30);
      const tag = frame.subarray(frame.length - 20, frame.length - 4);
      const ciphertext = frame.subarray(30, frame.length - 20);
      if (frame.readUInt32BE(14) !== 12 + ciphertext.length + 16) this.violation('6699: length noto‘g‘ri');
      try {
        const decipher = crypto.createDecipheriv('aes-128-gcm', state.key, iv);
        decipher.setAAD(frame.subarray(4, 18));
        decipher.setAuthTag(tag);
        return { seq, cmd, body: Buffer.concat([decipher.update(ciphertext), decipher.final()]) };
      } catch {
        throw Object.assign(new Error('auth'), { auth: true, info: { seq, cmd } });
      }
    }
    if (frame.readUInt32BE(0) !== 0x55aa) this.violation(`${this.version}: 55AA kadr kutilgan`);
    if (frame.readUInt32BE(frame.length - 4) !== 0xaa55) this.violation('55AA: suffix noto‘g‘ri');
    const seq = frame.readUInt32BE(4);
    const cmd = frame.readUInt32BE(8);
    const endLen = this.version === '3.4' ? 36 : 8;
    const signed = frame.subarray(0, frame.length - endLen);
    const check = frame.subarray(frame.length - endLen, frame.length - 4);
    const body = frame.subarray(16, frame.length - endLen);
    if (this.version === '3.4') {
      if (!hmac(state.key, signed).equals(check)) {
        throw Object.assign(new Error('auth'), { auth: true, info: { seq, cmd, body } });
      }
    } else if (check.readUInt32BE(0) !== refCrc32(signed)) {
      this.violation('CRC32 noto‘g‘ri');
    }
    return { seq, cmd, body };
  }

  handle(socket, state, frame) {
    let opened;
    try {
      opened = this.open(frame, state);
    } catch (err) {
      if (err.auth) {
        this.onWrongKey(socket, state, err.info);
        return;
      }
      throw err;
    }
    const { seq, cmd, body } = opened;
    if (isModern(this.version)) {
      if (cmd === 3) {
        this.negotiateStart(socket, state, seq, body);
        return;
      }
      if (cmd === 5) {
        this.negotiateFinish(socket, state, body);
        return;
      }
      if (!state.ready) {
        this.violation(`sessiyasiz buyruq (cmd ${cmd})`);
        return;
      }
    }
    const request = this.decodeRequest(cmd, body, state);
    if (!request) {
      this.onWrongKey(socket, state, { seq, cmd });
      return;
    }
    if (cmd === 10 || cmd === 16) this.query(socket, state, seq, cmd, request);
    else if (cmd === 13 && !isModern(this.version)) this.device22Query(socket, state, seq, request);
    else if (cmd === 7 || cmd === 13) this.control(socket, state, seq, cmd, request);
    else this.violation(`kutilmagan buyruq cmd ${cmd}`);
  }

  /** Buyruq payloadini versiyaga qarab ochadi; kalit mos kelmasa null */
  decodeRequest(cmd, body, state) {
    let text;
    if (this.version === '3.1') {
      if (cmd === 7) {
        if (body.subarray(0, 3).toString('latin1') !== '3.1') {
          this.violation('3.1 CONTROL: "3.1" sarlavhasi yo‘q');
          return null;
        }
        const signature = body.subarray(3, 19).toString('latin1');
        const b64 = body.subarray(19);
        const expected = md5hex(Buffer.concat([Buffer.from('data='), b64, Buffer.from('||lpv=3.1||'), state.key])).slice(8, 24);
        if (signature !== expected) return null;
        try {
          text = ecbDec(state.key, Buffer.from(b64.toString('latin1'), 'base64')).toString('utf8');
        } catch {
          return null;
        }
      } else {
        text = body.toString('utf8');
      }
    } else if (this.version === '3.3') {
      let data = body;
      if (cmd === 7 || cmd === 13) {
        if (!body.subarray(0, 15).equals(header('3.3'))) {
          this.violation(`3.3 cmd ${cmd}: "3.3" sarlavhasi yo‘q`);
          return null;
        }
        data = body.subarray(15);
      } else if (body.subarray(0, 3).toString('latin1') === '3.3') {
        this.violation('3.3 DP_QUERY sarlavha bilan yuborildi');
      }
      try {
        text = ecbDec(state.key, data).toString('utf8');
      } catch {
        return null;
      }
    } else {
      let plain = body;
      if (this.version === '3.4') {
        try {
          plain = ecbDec(state.key, body);
        } catch {
          return null;
        }
      }
      if (cmd === 13) {
        if (!plain.subarray(0, 15).equals(header(this.version))) {
          this.violation(`${this.version} CONTROL_NEW: sarlavha shifr ichida emas`);
          return null;
        }
        plain = plain.subarray(15);
      }
      text = plain.toString('utf8');
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return null;
    }
    if (/\s/.test(text)) this.violation(`JSON da bo'sh joy bor: ${text}`);
    return json;
  }

  negotiateStart(socket, state, seq, body) {
    let nonce = body;
    if (this.version === '3.4') {
      try {
        nonce = ecbDec(this.realKey, body);
      } catch {
        this.violation('3.4 sessiya: nonce ochilmadi');
        return;
      }
    }
    if (nonce.length !== 16) this.violation(`sessiya nonce uzunligi ${nonce.length}`);
    state.localNonce = nonce;
    state.remoteNonce = crypto.randomBytes(16);
    // badSessionHmac: kalit to'g'ri, lekin HMAC boshqa nonce uchun (eskirgan/soxta javob)
    const proof = hmac(this.realKey, this.options.badSessionHmac ? crypto.randomBytes(16) : nonce);
    const answer = Buffer.concat([state.remoteNonce, proof]);
    const frame = this.version === '3.4'
      ? deviceFrame55(seq, 4, ecbEnc(this.realKey, answer), { hmacKey: this.realKey })
      : deviceFrame66(state.seq++, 4, answer, this.realKey);
    this.send(socket, [frame]);
  }

  negotiateFinish(socket, state, body) {
    let check = body;
    if (this.version === '3.4') {
      try {
        check = ecbDec(this.realKey, body);
      } catch {
        this.violation('3.4 sessiya: FINISH ochilmadi');
        return;
      }
    }
    if (!state.remoteNonce || !check.equals(hmac(this.realKey, state.remoteNonce))) {
      this.violation('sessiya: FINISH HMAC noto‘g‘ri');
      return;
    }
    const mixed = xor16(state.localNonce, state.remoteNonce);
    // 3.5: GCM shifr matni = matn XOR AES(K, IV || 00000002) — GCM API siz, mustaqil hisob
    state.key = this.version === '3.4'
      ? ecbEnc(this.realKey, mixed, false)
      : xor16(mixed, ecbEnc(this.realKey, Buffer.concat([state.localNonce.subarray(0, 12), be32(2)]), false));
    state.ready = true;
    this.sessions += 1;
    if (this.options.pushOnConnect) this.send(socket, [this.statusFrame(state, this.options.pushOnConnect)]);
  }

  control(socket, state, seq, cmd, json) {
    let dps;
    if (isModern(this.version)) {
      if (cmd !== 13) this.violation(`${this.version}: CONTROL_NEW kutilgan, keldi cmd ${cmd}`);
      if (Object.keys(json).join(',') !== 'protocol,t,data' || json.protocol !== 5 || !Number.isInteger(json.t)) {
        this.violation(`CONTROL_NEW shakli: ${JSON.stringify(json)}`);
      }
      dps = json.data && json.data.dps;
    } else {
      if (cmd !== 7) this.violation(`${this.version}: CONTROL kutilgan, keldi cmd ${cmd}`);
      if (Object.keys(json).join(',') !== 'devId,uid,t,dps' || json.devId !== this.deviceId
        || json.uid !== this.deviceId || !/^\d{10}$/.test(json.t)) {
        this.violation(`CONTROL shakli: ${JSON.stringify(json)}`);
      }
      dps = json.dps;
    }
    if (!dps || typeof dps !== 'object') {
      this.violation('CONTROL da dps yo‘q');
      return;
    }
    this.controls.push(dps);
    if (this.options.maxDps && Object.keys(dps).length > this.options.maxDps) return; // javobsiz
    // Faqat o'qiladigan DP (masalan, automatdagi kVt·soat hisoblagichi): qurilma tasdiqlaydi, lekin qiymat o'zgarmaydi
    const applied = { ...dps };
    for (const dp of this.options.readOnly || []) delete applied[String(dp)];
    Object.assign(this.dps, applied);
    this.send(socket, Object.keys(applied).length
      ? [this.ackFrame(state, seq, cmd), this.statusFrame(state, applied)]
      : [this.ackFrame(state, seq, cmd)]);
  }

  query(socket, state, seq, cmd, json) {
    this.queries += 1;
    if (isModern(this.version)) {
      if (cmd !== 16 || Object.keys(json).length) this.violation(`DP_QUERY_NEW shakli: cmd ${cmd} ${JSON.stringify(json)}`);
    } else if (cmd !== 10 || Object.keys(json).join(',') !== 'gwId,devId,uid,t'
      || json.gwId !== this.deviceId || json.devId !== this.deviceId || json.uid !== this.deviceId) {
      this.violation(`DP_QUERY shakli: cmd ${cmd} ${JSON.stringify(json)}`);
    }
    if (this.options.device22) {
      this.send(socket, [deviceFrame55(seq, 10, ecbEnc(state.key, Buffer.from('json obj data unvalid')), { retcode: 1 })]);
      return;
    }
    this.send(socket, [this.queryFrame(state, seq)]);
  }

  device22Query(socket, state, seq, json) {
    this.device22Queries += 1;
    const requested = json.dps || {};
    if (Object.keys(json).join(',') !== 'devId,uid,t,dps' || Object.values(requested).some((value) => value !== null)) {
      this.violation(`device22 so'rovi shakli: ${JSON.stringify(json)}`);
    }
    const values = {};
    for (const dp of Object.keys(requested)) values[dp] = this.dps[dp];
    this.send(socket, [this.ackFrame(state, seq, 13), this.statusFrame(state, values)]);
  }

  ackFrame(state, seq, cmd) {
    if (this.version === '3.5') return deviceFrame66(state.seq++, cmd, EMPTY, state.key);
    if (this.version === '3.4') return deviceFrame55(seq, cmd, ecbEnc(state.key, EMPTY), { hmacKey: state.key });
    return deviceFrame55(seq, cmd, EMPTY);
  }

  statusFrame(state, dps) {
    const t = Math.floor(Date.now() / 1000);
    if (this.version === '3.5') {
      return deviceFrame66(state.seq++, 8, Buffer.concat([header('3.5'), jsonBytes({ protocol: 4, t, data: { dps } })]), state.key);
    }
    if (this.version === '3.4') {
      const plain = Buffer.concat([header('3.4'), jsonBytes({ protocol: 4, t, data: { dps } })]);
      return deviceFrame55(state.seq++, 8, ecbEnc(state.key, plain), { hmacKey: state.key });
    }
    const json = jsonBytes({ devId: this.deviceId, dps, t });
    if (this.version === '3.3') return deviceFrame55(state.seq++, 8, Buffer.concat([STATUS_HEADER_33, ecbEnc(state.key, json)]));
    const b64 = Buffer.from(ecbEnc(state.key, json).toString('base64'), 'latin1');
    const signature = md5hex(Buffer.concat([Buffer.from('data='), b64, Buffer.from('||lpv=3.1||'), state.key])).slice(8, 24);
    return deviceFrame55(state.seq++, 8, Buffer.concat([Buffer.from('3.1'), Buffer.from(signature, 'latin1'), b64]));
  }

  queryFrame(state, seq) {
    if (this.version === '3.5') return deviceFrame66(state.seq++, 16, jsonBytes({ dps: this.dps }), state.key);
    if (this.version === '3.4') return deviceFrame55(seq, 16, ecbEnc(state.key, jsonBytes({ dps: this.dps })), { hmacKey: state.key });
    const json = jsonBytes({ devId: this.deviceId, dps: this.dps });
    if (this.version === '3.3') {
      const encrypted = ecbEnc(state.key, json);
      return deviceFrame55(seq, 10, this.options.headerOnQuery ? Buffer.concat([header('3.3'), encrypted]) : encrypted);
    }
    return deviceFrame55(seq, 10, json); // 3.1: ochiq JSON
  }

  /** Kalit mos kelmadi: haqiqiy qurilmadek o'z kaliti bilan javob beradi yoki ulanishni uzadi */
  onWrongKey(socket, state, info) {
    this.wrongKeyHits += 1;
    if (this.options.wrongKey === 'close') {
      socket.destroy();
      return;
    }
    const real = this.realKey;
    if (this.version === '3.4') {
      if (info.cmd !== 3) {
        socket.destroy();
        return;
      }
      // HMAC ni tekshirmaydigan qurilma: nonce ni O'Z kaliti bilan ochib javob beradi
      let nonce = crypto.randomBytes(16);
      try {
        nonce = ecbDecRaw(real, info.body).subarray(0, 16);
      } catch {
        /* tasodifiy qoladi */
      }
      const answer = Buffer.concat([crypto.randomBytes(16), hmac(real, nonce)]);
      this.send(socket, [deviceFrame55(info.seq, 4, ecbEnc(real, answer), { hmacKey: real })]);
      return;
    }
    if (this.version === '3.5') {
      this.send(socket, [deviceFrame66(state.seq++, info.cmd, Buffer.from('data format error'), real, { retcode: 1 })]);
      return;
    }
    const text = ecbEnc(real, Buffer.from('data format error'));
    this.send(socket, [deviceFrame55(info.seq, info.cmd, this.version === '3.3' ? Buffer.concat([header('3.3'), text]) : text, { retcode: 1 })]);
  }

  send(socket, frames) {
    const parts = this.options.garbage ? [GARBAGE, ...frames] : frames;
    if (this.options.chunks === 'tiny') {
      // 3 baytli bo'laklar; bir nechta yuborish navbatda (bo'laklar aralashib ketmasin)
      const outbox = this.outbox || (this.outbox = new Map());
      const queue = outbox.get(socket) || { data: EMPTY, running: false };
      queue.data = Buffer.concat([queue.data, ...parts]);
      outbox.set(socket, queue);
      const pump = () => {
        if (socket.destroyed || !queue.data.length) {
          queue.running = false;
          return;
        }
        socket.write(queue.data.subarray(0, 3));
        queue.data = queue.data.subarray(3);
        setImmediate(pump);
      };
      if (!queue.running) {
        queue.running = true;
        pump();
      }
      return;
    }
    if (this.options.chunks === 'coalesce') {
      socket.write(Buffer.concat(parts));
      return;
    }
    for (const part of parts) socket.write(part);
  }
}

async function startMock(t, version, options) {
  const mock = await new MockTuya(version, options).listen();
  t.after(() => mock.close());
  return mock;
}

function tableFor(mock, { channel = 0, channels, dps, auth } = {}) {
  const config = { deviceId: mock.deviceId, version: mock.version };
  if (channels) config.channels = channels;
  if (dps) config.dps = dps;
  return {
    tableId: 3,
    tableNumber: 3,
    driver: 'tuya',
    host: mock.host,
    channel,
    inverted: false,
    auth: auth === undefined ? mock.localKey : auth,
    onUrl: null,
    offUrl: null,
    config,
  };
}

function makeCtx(overrides = {}) {
  const logs = [];
  return {
    timeoutMs: 2000,
    log: (level, message) => logs.push(`${level}: ${message}`),
    sleep: async () => {},
    logs,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Golden-vektorlar (tashqi manbalar)                                 */
/* ------------------------------------------------------------------ */

test('golden: CRC32 (IEEE) tekshiruv qiymati va zlib bilan solishtirish', () => {
  assert.equal(protocol.crc32(Buffer.from('123456789')), 0xcbf43926);
  if (typeof zlib.crc32 === 'function') {
    for (let i = 0; i < 40; i += 1) {
      const buffer = crypto.randomBytes(i * 7);
      assert.equal(protocol.crc32(buffer), zlib.crc32(buffer));
    }
  }
});

test('golden: haqiqiy qurilmaning HEART_BEAT javobi — retcode va CRC joylashuvi', () => {
  // tuyapi testlaridagi qurilma kadri; CRC32 si zlib bilan mustaqil tasdiqlangan
  const frame = Buffer.from('000055aa00000000000000090000000c00000000b051ab030000aa55', 'hex');
  const msg = protocol.unpackFrame(frame);
  assert.equal(msg.cmd, 9);
  assert.equal(msg.seqno, 0);
  assert.equal(msg.retcode, 0);
  assert.equal(msg.payload.length, 0);
  assert.equal(msg.checkOk, true);
  assert.ok(protocol.pack55AA({ seqno: 0, cmd: 9, retcode: 0 }).equals(frame));
  // Mijoz kadri retcodesiz; CRC zlib.crc32 bilan oldindan hisoblangan
  assert.equal(
    protocol.pack55AA({ seqno: 1, cmd: 9 }).toString('hex'),
    '000055aa00000001000000090000000872e818610000aa55',
  );
});

test('golden: AES-128-ECB (FIPS-197 C.1) va PKCS7 to‘ldirish', () => {
  const key = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
  const block = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  assert.equal(protocol.aesEcbEncrypt(key, block, false).toString('hex'), '69c4e0d86a7b0430d8cdb78070b4c55a');
  const padded = protocol.aesEcbEncrypt(key, Buffer.alloc(16));
  assert.equal(padded.length, 32); // to'liq blokka yana bitta to'ldirish bloki
  assert.ok(protocol.aesEcbDecrypt(key, padded).equals(Buffer.alloc(16)));
});

test('golden: AES-128-GCM (GCM spetsifikatsiyasi, 2-test holati)', () => {
  const { ciphertext, tag } = protocol.gcmEncrypt(Buffer.alloc(16), Buffer.alloc(12), Buffer.alloc(16));
  assert.equal(ciphertext.toString('hex'), '0388dace60b6a392f328c2b971b2fe78');
  assert.equal(tag.toString('hex'), 'ab6e47d42cec13bdf53a67b21257bddf');
});

test('golden: UDP kaliti = md5("yGAdlopoPVldABfn")', () => {
  assert.equal(protocol.UDP_KEY.toString('hex'), '6c1ec8e2bb9bb59ab50b0daf649b410a');
});

test('golden: sessiya kaliti — 3.4 AES-ECB, 3.5 GCM shifr matni (CTR hisoblagichi 2)', () => {
  const key = Buffer.from(LOCAL_KEY, 'latin1');
  const local = Buffer.from('0123456789abcdef');
  const remote = Buffer.from('fedcba9876543210');
  const mixed = xor16(local, remote);
  assert.ok(protocol.deriveSessionKey('3.4', key, local, remote).equals(ecbEnc(key, mixed, false)));
  const counterBlock = ecbEnc(key, Buffer.concat([local.subarray(0, 12), be32(2)]), false);
  assert.ok(protocol.deriveSessionKey('3.5', key, local, remote).equals(xor16(mixed, counterBlock)));
});

test('golden: Tuya OpenAPI imzosi — rasmiy hujjatdagi ikkala misol', () => {
  const common = {
    clientId: '1KAD46OrT9HafiKdsXeg',
    secret: '4OHBOnWOqaEC1mWXOpVL3yV50s0qGSRC',
    t: '1588925778000',
    nonce: '5138cc3a9033d69856923fd07b491173',
    method: 'GET',
    signHeaders: [['area_id', '29a33e8796834b1efa6'], ['call_id', '8afdb70ab2ed11eb85290242ac130003']],
  };
  assert.equal(
    signRequest({ ...common, url: '/v1.0/token?grant_type=1' }),
    '9E48A3E93B302EEECC803C7241985D0A34EB944F40FB573C7B5C2A82158AF13E',
  );
  assert.equal(
    signRequest({ ...common, accessToken: '3f4eda2bdec17232f67c0b188af3eec1', url: '/v2.0/apps/schema/users?page_no=1&page_size=50' }),
    'AE4481C692AA80B25F3A7E12C3A5FD9BBF6251539DD78E565A1A72A508A88784',
  );
});

/* ------------------------------------------------------------------ */
/*  Kadrlar va JSON shakllari                                          */
/* ------------------------------------------------------------------ */

test('JSON shakllari tinytuya payload_dict bilan bir xil va bo‘sh joysiz', () => {
  const now = 1_700_000_000_123;
  const id = 'bf1234567890abcdefgh';
  assert.equal(
    JSON.stringify(protocol.controlPayload('3.3', id, { 1: true }, now)),
    `{"devId":"${id}","uid":"${id}","t":"1700000000","dps":{"1":true}}`,
  );
  assert.equal(
    JSON.stringify(protocol.controlPayload('3.5', id, { 1: false, 2: false }, now)),
    '{"protocol":5,"t":1700000000,"data":{"dps":{"1":false,"2":false}}}',
  );
  assert.equal(
    JSON.stringify(protocol.queryPayload('3.1', id, now)),
    `{"gwId":"${id}","devId":"${id}","uid":"${id}","t":"1700000000"}`,
  );
  assert.equal(JSON.stringify(protocol.queryPayload('3.4', id, now)), '{}');
  assert.equal(
    JSON.stringify(protocol.device22Payload(id, ['1', '2'], now)),
    `{"devId":"${id}","uid":"${id}","t":"1700000000","dps":{"1":null,"2":null}}`,
  );
});

test('kadrlar: 3.3 sarlavhasi shifrdan tashqarida, DP_QUERY sarlavhasiz, 3.1 md5 imzosi', () => {
  const key = Buffer.from(LOCAL_KEY, 'latin1');
  const body = Buffer.from('{"dps":{"1":true}}');
  const control = protocol.encodeMessage({ version: '3.3', key, seqno: 5, cmd: 7, payload: body });
  const payload = Buffer.concat([header('3.3'), ecbEnc(key, body)]);
  const signed = Buffer.concat([be32(0x55aa), be32(5), be32(7), be32(payload.length + 8), payload]);
  assert.ok(control.equals(Buffer.concat([signed, be32(refCrc32(signed)), be32(0xaa55)])));

  const query = protocol.encodeMessage({ version: '3.3', key, seqno: 6, cmd: 10, payload: body });
  assert.ok(query.subarray(16, query.length - 8).equals(ecbEnc(key, body)));

  const legacy = protocol.encodeMessage({ version: '3.1', key, seqno: 7, cmd: 7, payload: body });
  const b64 = Buffer.from(ecbEnc(key, body).toString('base64'), 'latin1');
  const signature = md5hex(Buffer.concat([Buffer.from('data='), b64, Buffer.from('||lpv=3.1||'), key])).slice(8, 24);
  assert.equal(legacy.subarray(16, legacy.length - 8).toString('latin1'), `3.1${signature}${b64.toString('latin1')}`);
});

test('payload talqini: oddiy matn o‘tadi, boshqaruv belgilari/U+FFFD — ochilmagan, dps data.dps dan ham', () => {
  assert.deepEqual(protocol.decodePayload(Buffer.from('{"dps":{"1":true},"devId":"fdFD"}'), '3.5'), {
    text: '{"dps":{"1":true},"devId":"fdFD"}',
  });
  assert.deepEqual(protocol.decodePayload(Buffer.concat([Buffer.from('{}'), Buffer.alloc(3)]), '3.5'), { text: '{}' });
  assert.deepEqual(protocol.decodePayload(Buffer.from([0x7b, 0x01, 0x7d]), '3.5'), { error: 'decrypt' });
  assert.deepEqual(protocol.decodePayload(Buffer.from([0x7b, 0xff, 0xfe, 0x7d]), '3.5'), { error: 'decrypt' });
  const parsed = protocol.interpretText('{"protocol":4,"t":1,"data":{"dps":{"20":"true"}}}');
  assert.deepEqual(parsed.dps, { 20: 'true' });
  assert.equal(protocol.interpretText('json obj data unvalid').invalid, true);
  assert.deepEqual([true, 'ON', 'false', 1, 0, 'memory', null].map(protocol.dpBoolean), [true, true, false, true, false, null, null]);
  // Hisoblagich qiymati (masalan, automatning DP 1 — kVt·soat) "yoniq" deb o'qilmaydi
  assert.deepEqual([2011, -1, 0.5, Number.NaN].map(protocol.dpBoolean), [null, null, null, null]);
});

test('kadr ajratgich: har qanday bo‘linish nuqtasi, ketma-ket kadrlar va axlat baytlar', () => {
  const key = Buffer.from(LOCAL_KEY, 'latin1');
  const a = deviceFrame55(1, 7, EMPTY);
  const b = deviceFrame66(2, 8, Buffer.from('{"dps":{"1":true}}'), key);
  const stream = Buffer.concat([Buffer.from('0102', 'hex'), a, Buffer.from('ff0000', 'hex'), b]);
  for (let cut = 0; cut <= stream.length; cut += 1) {
    const first = protocol.splitFrames(stream.subarray(0, cut));
    const second = protocol.splitFrames(Buffer.concat([first.rest, stream.subarray(cut)]));
    const frames = [...first.frames, ...second.frames];
    assert.equal(frames.length, 2, `bo'linish ${cut}`);
    assert.ok(frames[0].equals(a) && frames[1].equals(b), `bo'linish ${cut}`);
  }
  // Baytma-bayt
  let rest = EMPTY;
  const frames = [];
  for (const byte of stream) {
    const result = protocol.splitFrames(Buffer.concat([rest, Buffer.from([byte])]));
    frames.push(...result.frames);
    rest = result.rest;
  }
  assert.equal(frames.length, 2);
  const decoded = protocol.unpackFrame(frames[1], { key });
  assert.equal(decoded.cmd, 8);
  assert.equal(decoded.retcode, 0);
  assert.equal(decoded.payload.toString(), '{"dps":{"1":true}}');
});

/* ------------------------------------------------------------------ */
/*  Drayver: yozish va o'qish (har bir versiya)                        */
/* ------------------------------------------------------------------ */

test('drayver reyestrda: readback bor, navbat kaliti qurilma bo‘yicha', () => {
  assert.equal(drivers.getDriver('tuya'), tuyaDriver);
  assert.equal(tuyaDriver.readback({}), true);
  assert.equal(
    tuyaDriver.lockKey({ host: '192.168.1.50:6668', config: { deviceId: 'bf1234567890abcdefgh' } }),
    'tuya:192.168.1.50:bf1234567890abcdefgh',
  );
  assert.equal(
    tuyaDriver.lockKey({ host: '192.168.1.50', config: { deviceId: 'bf1234567890abcdefgh' } }),
    'tuya:192.168.1.50:bf1234567890abcdefgh',
  );
});

/** Tuya JGQW01-63 (PowBay) energiya hisoblagichli automat: DP 1 — kVt·soat, yoqish — DP 16 */
const BREAKER_DPS = { 1: 2011, 9: 0, 11: false, 12: true, 13: 0, 16: true, 19: 'JRXLB_Protector', 61: 'on', 101: true };

test('automat (JGQW01): standart DP 1 hisoblagich — aniq xato; config.dps [16] bilan yoqiladi va o‘chiriladi', async (t) => {
  const mock = await startMock(t, '3.5', { dps: { ...BREAKER_DPS }, readOnly: [1, 9, 13, 19] });
  const ctx = makeCtx();
  // Eski sozlama (DP ko'rsatilmagan): qiymat "yoniq" deb o'qilmaydi, sababi `reason` da
  const legacy = await tuyaDriver.read(tableFor(mock), ctx);
  assert.deepEqual(legacy, [null]);
  assert.match(legacy.reason, /DP 1 bu qurilmada yoqish-o'chirish kanali emas \(qiymati: 2011\).*odatda 16/);
  // Chiroq markazi sinovi: "holat mos kelmadi" emas — aniq sabab
  const hub = new LightHub({ sleep: async () => {} });
  const result = await hub.testDevice(tableFor(mock), false);
  assert.equal(result.ok, false);
  assert.match(result.error, /DP 1 bu qurilmada yoqish-o'chirish kanali emas/);
  assert.equal(mock.dps['1'], 2011, 'hisoblagich DP siga yozuv qiymatni o‘zgartirmaydi');
  mock.controls.length = 0;
  const device = tableFor(mock, { dps: [16] });
  await tuyaDriver.write(device, false, ctx);
  assert.deepEqual(await tuyaDriver.read(device, ctx), [false]);
  await tuyaDriver.write(device, true, ctx);
  assert.deepEqual(await tuyaDriver.read(device, ctx), [true]);
  assert.deepEqual(mock.controls, [{ 16: false }, { 16: true }]);
  // Boshqa DP larga (12 — energiyani nolga tushirish, 11 — oldindan to'lov) tegilmadi
  assert.equal(mock.dps['12'], true);
  assert.equal(mock.dps['11'], false);
  assert.equal(mock.dps['1'], 2011);
  assert.deepEqual(mock.violations, []);
});

test('Tuya bulut: yoqish DP — model va spetsifikatsiyadan, xavfli mantiqiy DP lar tanlanmaydi', () => {
  // JGQW01-63 ning bulutdagi "thing model"i (qisqartirilgan): switch — 16, lekin 11/12/34/101 ham mantiqiy
  const model = {
    model: JSON.stringify({
      services: [{
        properties: [
          { abilityId: 1, code: 'forward_energy_total', accessMode: 'ro', typeSpec: { type: 'value' } },
          { abilityId: 11, code: 'prepayment_switch', accessMode: 'rw', typeSpec: { type: 'bool' } },
          { abilityId: 12, code: 'clear_energy', accessMode: 'rw', typeSpec: { type: 'bool' } },
          { abilityId: 16, code: 'switch', accessMode: 'rw', typeSpec: { type: 'bool' } },
          { abilityId: 34, code: 'factory_reset', accessMode: 'rw', typeSpec: { type: 'bool' } },
          { abilityId: 61, code: 'relay_status', accessMode: 'rw', typeSpec: { type: 'enum' } },
          { abilityId: 101, code: 'lcd_switch', accessMode: 'rw', typeSpec: { type: 'bool' } },
        ],
      }],
    }),
  };
  assert.equal(pickSwitchDp(entriesFromModel(model)), 16);
  // Ko'p kanalli rele spetsifikatsiyasi: switch_1 = DP 1
  const specs = {
    category: 'kg',
    functions: [
      { code: 'switch_2', dp_id: 2, type: 'Boolean' },
      { code: 'switch_1', dp_id: 1, type: 'Boolean' },
      { code: 'countdown_1', dp_id: 9, type: 'Integer' },
    ],
  };
  assert.equal(pickSwitchDp(entriesFromSpecs(specs)), 1);
  // Faqat o'qiladigan "switch" yoki noma'lum kodlar — taxmin qilinmaydi
  assert.equal(pickSwitchDp(entriesFromModel({ model: { services: [{ properties: [
    { abilityId: 5, code: 'switch', accessMode: 'ro', typeSpec: { type: 'bool' } },
    { abilityId: 12, code: 'clear_energy', accessMode: 'rw', typeSpec: { type: 'bool' } },
  ] }] } })), undefined);
  assert.equal(pickSwitchDp(entriesFromModel({ model: 'buzuq json' })), undefined);
  assert.equal(pickSwitchDp(entriesFromSpecs(null)), undefined);
});

test('DP xaritasi: kanal + 1 yoki config.dps; noto‘g‘ri DP — aniq xato', () => {
  assert.deepEqual(tuyaDriver.tuyaDps({ channel: 0, config: {} }), [1]);
  assert.deepEqual(tuyaDriver.tuyaDps({ channel: 2, config: { channels: [0, 2, 5] } }), [3, 1, 6]);
  assert.deepEqual(tuyaDriver.tuyaDps({ channel: 0, config: { channels: [1], dps: [20] } }), [20, 2]);
  assert.deepEqual(tuyaDriver.tuyaDps({ channel: 0, config: { dps: ['21'] } }), [21]);
  assert.throws(() => tuyaDriver.tuyaDps({ channel: 0, config: { dps: [0] } }), /DP raqami noto'g'ri/);
  assert.throws(() => tuyaDriver.tuyaDps({ channel: 0, config: { dps: ['abc'] } }), /DP raqami noto'g'ri/);
  assert.throws(() => tuyaDriver.tuyaDps({ channel: 255, config: {} }), /DP raqami noto'g'ri/);
});

test('sozlama tekshiruvi: kalit, deviceId, versiya va manzil xatolari o‘zbekcha', async () => {
  const base = {
    tableId: 1, driver: 'tuya', host: '127.0.0.1:1', channel: 0, auth: LOCAL_KEY,
    config: { deviceId: 'bf1234567890abcdefgh', version: '3.3' },
  };
  const ctx = makeCtx();
  await assert.rejects(tuyaDriver.write({ ...base, auth: null }, true, ctx), /local key kiritilmagan/);
  await assert.rejects(tuyaDriver.write({ ...base, auth: 'qisqa' }, true, ctx), /16 ta belgidan/);
  await assert.rejects(tuyaDriver.write({ ...base, config: { version: '3.3' } }, true, ctx), /deviceId\) kiritilmagan/);
  await assert.rejects(tuyaDriver.write({ ...base, config: { deviceId: 'bad id!' } }, true, ctx), /deviceId\) noto'g'ri/);
  await assert.rejects(tuyaDriver.write({ ...base, config: { ...base.config, version: '3.2' } }, true, ctx), /versiyasi noto'g'ri/);
  await assert.rejects(tuyaDriver.read({ ...base, host: '' }, ctx), /manzili \(IP\) kiritilmagan/);
  await assert.rejects(tuyaDriver.read({ ...base, host: 'http://x' }, ctx), /manzili noto'g'ri/);
  for (const line of ctx.logs) assert.ok(!line.includes(LOCAL_KEY));
});

test('3.3: bitta DP — yoqish, o‘chirish va holatni o‘qish', async (t) => {
  const mock = await startMock(t, '3.3', { dps: { 1: false, 2: true } });
  const device = tableFor(mock);
  const ctx = makeCtx();
  await tuyaDriver.write(device, true, ctx);
  assert.equal(mock.dps['1'], true);
  assert.deepEqual(await tuyaDriver.read(device, ctx), [true]);
  await tuyaDriver.write(device, false, ctx);
  assert.deepEqual(await tuyaDriver.read(device, ctx), [false]);
  assert.deepEqual(mock.controls, [{ 1: true }, { 1: false }]);
  assert.equal(mock.dps['2'], true); // boshqa DP ga tegilmadi
  assert.deepEqual(mock.violations, []);
  for (const line of ctx.logs) assert.ok(!line.includes(LOCAL_KEY), 'local key logga chiqmasin');
});

test('3.3: ko‘p kanalli stol — barcha DP lar BITTA CONTROL xabarida', async (t) => {
  const mock = await startMock(t, '3.3', { dps: { 1: false, 2: false, 3: false, 4: true }, headerOnQuery: true });
  const device = tableFor(mock, { channel: 0, channels: [1, 2] });
  const ctx = makeCtx();
  await tuyaDriver.write(device, true, ctx);
  assert.deepEqual(mock.controls, [{ 1: true, 2: true, 3: true }]);
  assert.deepEqual(await tuyaDriver.read(device, ctx), [true, true, true]);
  await tuyaDriver.write(device, false, ctx);
  assert.equal(mock.controls.length, 2);
  assert.deepEqual(mock.dps, { 1: false, 2: false, 3: false, 4: true });
  assert.deepEqual(await tuyaDriver.read(device, ctx), [false, false, false]);
  assert.deepEqual(mock.violations, []);
});

test('3.4: sessiya kaliti, HMAC kadrlar va config.dps bilan ko‘p DP', async (t) => {
  const mock = await startMock(t, '3.4', { dps: { 1: true, 20: false, 21: false } });
  const device = tableFor(mock, { channels: [1], dps: [20, 21] });
  const ctx = makeCtx();
  await tuyaDriver.write(device, true, ctx);
  assert.deepEqual(mock.controls, [{ 20: true, 21: true }]);
  assert.deepEqual(await tuyaDriver.read(device, ctx), [true, true]);
  await tuyaDriver.write(device, false, ctx);
  assert.deepEqual(await tuyaDriver.read(device, ctx), [false, false]);
  assert.equal(mock.dps['1'], true);
  assert.equal(mock.sessions, 4); // har buyruq — yangi ulanish va yangi sessiya
  assert.deepEqual(mock.violations, []);
});

test('3.5: 6699 kadr (AES-GCM), bitta va ko‘p DP', async (t) => {
  const mock = await startMock(t, '3.5', { dps: { 1: false, 2: false } });
  const ctx = makeCtx();
  const single = tableFor(mock);
  await tuyaDriver.write(single, true, ctx);
  assert.deepEqual(await tuyaDriver.read(single, ctx), [true]);
  const multi = tableFor(mock, { channels: [1] });
  await tuyaDriver.write(multi, false, ctx);
  assert.deepEqual(mock.controls, [{ 1: true }, { 1: false, 2: false }]);
  assert.deepEqual(await tuyaDriver.read(multi, ctx), [false, false]);
  await tuyaDriver.write(multi, true, ctx);
  assert.deepEqual(await tuyaDriver.read(multi, ctx), [true, true]);
  assert.deepEqual(mock.violations, []);
});

test('3.1: CONTROL base64 + md5 imzo bilan, holat ochiq JSON', async (t) => {
  const mock = await startMock(t, '3.1', { dps: { 1: false, 2: false } });
  const device = tableFor(mock, { channels: [1] });
  const ctx = makeCtx();
  await tuyaDriver.write(device, true, ctx);
  assert.deepEqual(mock.controls, [{ 1: true, 2: true }]);
  assert.deepEqual(await tuyaDriver.read(device, ctx), [true, true]);
  await tuyaDriver.write(device, false, ctx);
  assert.deepEqual(await tuyaDriver.read(device, ctx), [false, false]);
  assert.deepEqual(mock.violations, []);
});

test('noto‘g‘ri local key — aniq xato, kalit xato matnida yo‘q (3.3, 3.4, 3.5)', async (t) => {
  const wrong = 'WrongKey12345678';
  const undecodable = /javobni ochib bo'lmadi — local key/;
  const rejectedKey = /local key noto'g'ri — qurilma kalitni tasdiqlamadi/;
  const dropped = /qurilma ulanishni uzdi — local key/;
  const cases = [
    ['3.3', 'respond', undecodable], // qurilma o'z kaliti bilan xato qaytaradi (retcode 1)
    ['3.4', 'respond', rejectedKey], // sessiya javobidagi HMAC mos kelmaydi
    ['3.4', 'close', dropped],
    ['3.5', 'respond', rejectedKey], // GCM tegi mos kelmaydi
    ['3.5', 'close', dropped],
  ];
  for (const [version, wrongKey, expected] of cases) {
    // eslint-disable-next-line no-await-in-loop
    const mock = await startMock(t, version, { wrongKey });
    const device = tableFor(mock, { auth: wrong });
    const label = `${version}/${wrongKey}`;
    // eslint-disable-next-line no-await-in-loop
    await assert.rejects(tuyaDriver.write(device, true, makeCtx()), (err) => {
      assert.match(err.message, expected, label);
      assert.ok(!err.message.includes(wrong) && !err.message.includes(LOCAL_KEY), label);
      return true;
    });
    // eslint-disable-next-line no-await-in-loop
    await assert.rejects(tuyaDriver.read(device, makeCtx()), expected, label);
    assert.equal(mock.dps['1'], false, label);
    assert.ok(mock.wrongKeyHits >= 2, label);
    assert.deepEqual(mock.violations, [], label);
  }
});

test('sessiya javobidagi HMAC mijoz nonce iga mos kelmasa — rad etiladi (3.4, 3.5)', async (t) => {
  for (const version of ['3.4', '3.5']) {
    // eslint-disable-next-line no-await-in-loop
    const mock = await startMock(t, version, { badSessionHmac: true });
    // eslint-disable-next-line no-await-in-loop
    await assert.rejects(
      tuyaDriver.write(tableFor(mock), true, makeCtx()),
      /local key noto'g'ri — qurilma kalitni tasdiqlamadi/,
      version,
    );
    assert.equal(mock.sessions, 0, version); // FINISH yuborilmagan
    assert.deepEqual(mock.controls, [], version);
  }
});

test('qurilma javob bermasa — butun almashuv uchun timeout', async (t) => {
  const mock = await startMock(t, '3.3', { silent: true });
  const started = Date.now();
  await assert.rejects(tuyaDriver.write(tableFor(mock), true, makeCtx({ timeoutMs: 300 })), /javob kelmadi \(timeout\)/);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 250 && elapsed < 2000, `o'tgan vaqt ${elapsed} ms`);

  const mock34 = await startMock(t, '3.4', { silent: true });
  await assert.rejects(
    tuyaDriver.read(tableFor(mock34), makeCtx({ timeoutMs: 250 })),
    /sessiya kaliti kelishilmadi \(timeout\)/,
  );
});

test('to‘xtatish signali (AbortSignal) almashuvni darhol uzadi', async (t) => {
  const mock = await startMock(t, '3.5', { silent: true });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  const started = Date.now();
  await assert.rejects(
    tuyaDriver.write(tableFor(mock), true, makeCtx({ timeoutMs: 5000, signal: controller.signal })),
    /so'rov to'xtatildi/,
  );
  assert.ok(Date.now() - started < 1500);
  await assert.rejects(tuyaDriver.read(tableFor(mock), makeCtx({ signal: controller.signal })), /so'rov to'xtatildi/);
});

test('TCP bo‘laklari: bo‘lingan, birlashgan kadrlar, axlat baytlar va so‘ralmagan STATUS', async (t) => {
  const cases = [['3.3', 'tiny'], ['3.4', 'coalesce'], ['3.5', 'tiny'], ['3.1', 'coalesce'], ['3.4', 'tiny']];
  for (const [version, chunks] of cases) {
    // eslint-disable-next-line no-await-in-loop
    const mock = await startMock(t, version, { chunks, garbage: true, pushOnConnect: { 101: 5 }, dps: { 1: false, 2: false } });
    const device = tableFor(mock, { channels: [1] });
    const ctx = makeCtx();
    // eslint-disable-next-line no-await-in-loop
    await tuyaDriver.write(device, true, ctx);
    // eslint-disable-next-line no-await-in-loop
    assert.deepEqual(await tuyaDriver.read(device, ctx), [true, true], `${version}/${chunks}`);
    assert.deepEqual(mock.violations, [], `${version}/${chunks}`);
    assert.ok(ctx.logs.some((line) => line.includes('tanilmadi')), `${version}/${chunks}: axlat baytlar tashlandi`);
  }
});

test('device22: DP_QUERY ga "data unvalid" — CONTROL_NEW + null DP lar bilan qayta so‘raladi', async (t) => {
  const mock = await startMock(t, '3.3', { device22: true, dps: { 1: true, 2: false } });
  const device = tableFor(mock, { channels: [1] });
  assert.deepEqual(await tuyaDriver.read(device, makeCtx()), [true, false]);
  assert.equal(mock.queries, 1);
  assert.equal(mock.device22Queries, 1);
  assert.deepEqual(mock.violations, []);
});

test('bir vaqtda bitta DP oladigan qurilma: keyingi urinishda DP lar alohida yuboriladi', async (t) => {
  const mock = await startMock(t, '3.3', { maxDps: 1, dps: { 1: false, 2: false } });
  const device = tableFor(mock, { channels: [1] });
  t.after(() => tuyaDriver.singleDpDevices.clear());
  await assert.rejects(tuyaDriver.write(device, true, makeCtx({ timeoutMs: 300 })), /timeout/);
  assert.ok(tuyaDriver.singleDpDevices.has(tuyaDriver.lockKey(device)));
  await tuyaDriver.write(device, true, makeCtx());
  assert.deepEqual(mock.dps, { 1: true, 2: true });
  assert.deepEqual(mock.controls, [{ 1: true, 2: true }, { 1: true }, { 2: true }]);
  assert.deepEqual(mock.violations, []);
});

test('protokol: STATUS da yo‘q DP — null, DP qiymatlari matn/son ko‘rinishida ham tushuniladi', async (t) => {
  const mock = await startMock(t, '3.5', { dps: { 1: 'true', 2: 0, 3: 'memory' } });
  const device = tableFor(mock, { channels: [1, 2, 3] });
  const ctx = makeCtx();
  assert.deepEqual(await tuyaDriver.read(device, ctx), [true, false, null, null]);
  assert.ok(ctx.logs.some((line) => line.includes("to'liq emas")));
});

/* ------------------------------------------------------------------ */
/*  UDP qidiruv                                                        */
/* ------------------------------------------------------------------ */

const UDP_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn').digest();
const BROADCAST = {
  ip: '192.168.1.77',
  gwId: 'bf0011223344556677aa',
  active: 2,
  ability: 0,
  mode: 0,
  encrypt: true,
  productKey: 'keyjup78v54myhan',
  version: '3.3',
};

test('UDP: 3.3 e’loni (55AA + AES-ECB, udpkey) ochiladi va qurilma yozuviga aylanadi', () => {
  const packet = deviceFrame55(0, 0x13, ecbEnc(UDP_KEY, jsonBytes(BROADCAST)));
  assert.deepEqual(decodeBroadcast(packet), BROADCAST);
  assert.deepEqual(toDevice(decodeBroadcast(packet), { address: '192.168.1.77' }, 6667), {
    driver: 'tuya',
    host: '192.168.1.77',
    id: BROADCAST.gwId,
    version: '3.3',
    model: 'keyjup78v54myhan',
    name: undefined,
    needs: ['localKey'],
  });
});

test('UDP: 3.1 ochiq JSON, 3.5 6699 (retcode bilan/siz, NUL lar), ilova so‘rovi va axlat', () => {
  const v31 = { ...BROADCAST, version: '3.1' };
  assert.deepEqual(decodeBroadcast(deviceFrame55(0, 0x12, jsonBytes(v31))), v31);

  const v35 = { ...BROADCAST, version: '3.5' };
  assert.deepEqual(decodeBroadcast(deviceFrame66(0, 0x13, jsonBytes(v35), UDP_KEY)), v35);
  const withNul = Buffer.concat([jsonBytes(v35), Buffer.alloc(3)]);
  assert.deepEqual(decodeBroadcast(deviceFrame66(0, 0x13, withNul, UDP_KEY, { retcode: null })), v35);

  // Bizning (yoki Smart Life ilovasining) REQ_DEVINFO so'rovi — qurilma emas
  const request = buildDevInfoRequest('192.168.1.10');
  assert.deepEqual(decodeBroadcast(request), { from: 'app', ip: '192.168.1.10' });
  assert.equal(toDevice(decodeBroadcast(request), { address: '192.168.1.10' }, 7000), null);
  assert.equal(request.readUInt32BE(10), 0x25); // REQ_DEVINFO

  assert.equal(decodeBroadcast(crypto.randomBytes(64)), null);
  assert.equal(decodeBroadcast(deviceFrame55(0, 0x13, ecbEnc(Buffer.alloc(16), jsonBytes(BROADCAST)))), null);
});

function freeUdpPort() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

test('UDP qidiruv: port tinglanadi, takror e’lonlar birlashadi, soketlar yopiladi', async () => {
  const port = await freeUdpPort();
  const packet = deviceFrame55(0, 0x13, ecbEnc(UDP_KEY, jsonBytes(BROADCAST)));
  const noise = deviceFrame55(0, 0x13, ecbEnc(UDP_KEY, jsonBytes({ from: 'app', ip: '127.0.0.1' })));
  const sender = dgram.createSocket('udp4');
  const timer = setInterval(() => {
    sender.send(packet, port, '127.0.0.1');
    sender.send(noise, port, '127.0.0.1');
  }, 20);
  let devices;
  try {
    devices = await discoverTuya({
      ports: [port], address: '127.0.0.1', timeoutMs: 400, requestDevInfo: false, log: () => {},
    });
  } finally {
    clearInterval(timer);
    sender.close();
  }
  assert.deepEqual(devices, [{
    driver: 'tuya',
    host: '127.0.0.1',
    id: BROADCAST.gwId,
    version: '3.3',
    model: BROADCAST.productKey,
    name: undefined,
    needs: ['localKey'],
  }]);
  // Soket yopilgan: o'sha portni qayta egallash mumkin
  const again = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    again.once('error', reject);
    again.bind(port, '127.0.0.1', resolve);
  });
  again.close();

  // To'xtatilgan signal — darhol bo'sh ro'yxat
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await discoverTuya({ signal: controller.signal, ports: [port], requestDevInfo: false }), []);
});

/* ------------------------------------------------------------------ */
/*  Tuya bulut (soxta OpenAPI server)                                  */
/* ------------------------------------------------------------------ */

const ACCESS_ID = 'p9x7c4kqv2mzw8rjt5ab';
const ACCESS_SECRET = 'f3a9c1d7e5b24680a1b3c5d7e9f0a2b4';
const TOKEN = 'tok_8d2f6a1c9e7b';
const EMPTY_SHA256 = crypto.createHash('sha256').update('').digest('hex');

/** Imzoni hujjatdagi formula bo'yicha mustaqil tekshiradigan soxta Tuya OpenAPI */
async function fakeCloud(t, { skewMs = 0 } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    const query = Array.from(url.searchParams.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const signUrl = query ? `${url.pathname}?${query}` : url.pathname;
    const token = req.headers.access_token || '';
    const str = `${ACCESS_ID}${token}${req.headers.t}GET\n${EMPTY_SHA256}\n\n${signUrl}`;
    const expected = crypto.createHmac('sha256', ACCESS_SECRET).update(str).digest('hex').toUpperCase();
    const serverNow = Date.now() + skewMs;
    calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), token, headers: req.headers });
    const reply = (body) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ t: serverNow, ...body }));
    };
    if (Math.abs(Number(req.headers.t) - serverNow) > 300_000) {
      reply({ success: false, code: 1013, msg: 'request time is invalid' });
      return;
    }
    if (req.headers.client_id !== ACCESS_ID || req.headers.sign_method !== 'HMAC-SHA256' || req.headers.sign !== expected) {
      reply({ success: false, code: 1004, msg: 'sign invalid' });
      return;
    }
    if (url.pathname === '/v1.0/token') {
      if (token || url.searchParams.get('grant_type') !== '1') {
        reply({ success: false, code: 1109, msg: 'param is illegal' });
        return;
      }
      reply({ success: true, result: { access_token: TOKEN, expire_time: 7200, refresh_token: 'r', uid: 'dev' } });
      return;
    }
    if (token !== TOKEN) {
      reply({ success: false, code: 1010, msg: 'token invalid' });
      return;
    }
    const d1 = {
      id: 'bf1111111111aaaaaaaa', name: ' 1-stol ', local_key: 'k1k1k1k1k1k1k1k1', ip: '84.54.70.12', product_name: 'Smart Switch', online: true, category: 'dlq',
    };
    const d2 = {
      id: 'bf2222222222bbbbbbbb', name: '2-stol', local_key: 'k2k2k2k2k2k2k2k2', ip: '192.168.1.42', product_name: '2CH Relay', online: false,
    };
    const d3 = { id: 'bf3333333333cccccccc', name: '3-stol', local_key: 'k3k3k3k3k3k3k3k3', product_name: 'Relay' };
    if (url.pathname === '/v1.0/iot-01/associated-users/devices') {
      if (url.searchParams.get('size') !== '50') {
        reply({ success: false, code: 1109, msg: 'param is illegal' });
        return;
      }
      if (!url.searchParams.get('last_row_key')) {
        reply({ success: true, result: { devices: [d1, d2], has_more: true, last_row_key: 'ROW2', total: 3 } });
      } else {
        reply({ success: true, result: { devices: [d3, d1], has_more: false, last_row_key: 'ROW3', total: 3 } });
      }
      return;
    }
    if (url.pathname === '/v1.0/users/az1234uid/devices') {
      reply({ success: true, result: [d2] });
      return;
    }
    // d1 — energiya hisoblagichli automat (model: switch = DP 16); d2 — 2 kanalli rele (spetsifikatsiya)
    if (url.pathname === '/v2.0/cloud/thing/bf1111111111aaaaaaaa/model') {
      reply({
        success: true,
        result: {
          modelId: 'e1mq6ysc',
          model: JSON.stringify({ services: [{ properties: [
            { abilityId: 1, code: 'forward_energy_total', accessMode: 'ro', typeSpec: { type: 'value' } },
            { abilityId: 12, code: 'clear_energy', accessMode: 'rw', typeSpec: { type: 'bool' } },
            { abilityId: 16, code: 'switch', accessMode: 'rw', typeSpec: { type: 'bool' } },
          ] }] }),
        },
      });
      return;
    }
    if (url.pathname === '/v1.1/devices/bf2222222222bbbbbbbb/specifications') {
      reply({ success: true, result: { category: 'kg', functions: [{ code: 'switch_1', dp_id: 1, type: 'Boolean' }] } });
      return;
    }
    reply({ success: false, code: 1108, msg: 'uri path invalid' });
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, calls };
}

test('Tuya bulut: token, sahifalash, LAN IP filtri va takrorlarni birlashtirish', async (t) => {
  const cloud = await fakeCloud(t);
  const devices = await fetchTuyaCloudDevices({
    accessId: ACCESS_ID, accessSecret: ACCESS_SECRET, region: 'eu', baseUrl: cloud.baseUrl,
  });
  assert.deepEqual(devices, [
    {
      id: 'bf1111111111aaaaaaaa', name: '1-stol', localKey: 'k1k1k1k1k1k1k1k1', productName: 'Smart Switch', online: true, category: 'dlq', switchDp: 16,
    },
    {
      id: 'bf2222222222bbbbbbbb', name: '2-stol', localKey: 'k2k2k2k2k2k2k2k2', productName: '2CH Relay', online: false, ip: '192.168.1.42', switchDp: 1,
    },
    { id: 'bf3333333333cccccccc', name: '3-stol', localKey: 'k3k3k3k3k3k3k3k3', productName: 'Relay', online: false },
  ]);
  assert.deepEqual(cloud.calls.slice(0, 3).map((call) => call.path), [
    '/v1.0/token', '/v1.0/iot-01/associated-users/devices', '/v1.0/iot-01/associated-users/devices',
  ]);
  // DP aniqlash: model, kerak bo'lsa spetsifikatsiya (parallel, tartib muhim emas)
  assert.deepEqual(cloud.calls.slice(3).map((call) => call.path).sort(), [
    '/v1.1/devices/bf2222222222bbbbbbbb/specifications',
    '/v1.1/devices/bf3333333333cccccccc/specifications',
    '/v2.0/cloud/thing/bf1111111111aaaaaaaa/model',
    '/v2.0/cloud/thing/bf2222222222bbbbbbbb/model',
    '/v2.0/cloud/thing/bf3333333333cccccccc/model',
  ]);
  assert.equal(cloud.calls[0].token, '');
  assert.equal(cloud.calls[2].query.last_row_key, 'ROW2');
  for (const call of cloud.calls) {
    assert.match(call.headers.t, /^\d{13}$/);
    assert.equal(call.headers.secret, undefined, 'secret sarlavhada yuborilmasin');
  }

  const byUser = await fetchTuyaCloudDevices({
    accessId: ACCESS_ID, accessSecret: ACCESS_SECRET, region: 'eu', userId: 'az1234uid', baseUrl: cloud.baseUrl, detectDp: false,
  });
  assert.deepEqual(byUser.map((device) => device.id), ['bf2222222222bbbbbbbb']);
});

test('Tuya bulut: noto‘g‘ri secret, soat farqi, region va kirish tekshiruvi', async (t) => {
  const cloud = await fakeCloud(t);
  const wrongSecret = 'ffffffffffffffffffffffffffffffff';
  await assert.rejects(
    fetchTuyaCloudDevices({ accessId: ACCESS_ID, accessSecret: wrongSecret, region: 'eu', baseUrl: cloud.baseUrl }),
    (err) => {
      assert.match(err.message, /kod 1004/);
      assert.ok(!err.message.includes(wrongSecret));
      return true;
    },
  );

  // Kompyuter soati 1 soat orqada: server vaqti bilan bir marta qayta urinadi
  const skewed = await fakeCloud(t, { skewMs: 3_600_000 });
  const devices = await fetchTuyaCloudDevices({
    accessId: ACCESS_ID, accessSecret: ACCESS_SECRET, region: 'us', baseUrl: skewed.baseUrl,
  });
  assert.equal(devices.length, 3);

  await assert.rejects(fetchTuyaCloudDevices({ accessId: ACCESS_ID, accessSecret: ACCESS_SECRET, region: 'mars' }), /region noto'g'ri/);
  await assert.rejects(fetchTuyaCloudDevices({ accessSecret: ACCESS_SECRET, region: 'eu' }), /Access ID kiritilmagan/);
  await assert.rejects(
    fetchTuyaCloudDevices({ accessId: ACCESS_ID, accessSecret: ACCESS_SECRET, region: 'eu', userId: 'bad uid/..' }),
    /uid\) noto'g'ri/,
  );
});
