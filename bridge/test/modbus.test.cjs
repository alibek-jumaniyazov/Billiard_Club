'use strict';

/**
 * MODBUS — Modbus TCP (MBAP), RTU-over-TCP va RTU-over-serial testlari.
 *
 * Haqiqiy plata o'rniga: arzon rele platasi modeli (RelayBoard — Modbus "slave"),
 * mock TCP serverlar (sanoat platasi / "transparent" RS485↔Ethernet konverter) va
 * soxta `serialport` klassi (USB-RS485 adapter + shinadagi platalar).
 * Barcha timeoutlar qisqa (≤ 400 ms) — fayl bir necha soniyada tugaydi.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const rtu = require('../lib/modbus-rtu');
const modbus = require('../lib/modbus');
const serial = require('../lib/serial');
const modbusDrivers = require('../lib/drivers/modbus');
const { executeDevice, logicalState } = require('../lib/control');

const modbusTcp = modbusDrivers.definitions.find((definition) => definition.name === 'modbus_tcp');
const modbusRtu = modbusDrivers.definitions.find((definition) => definition.name === 'modbus_rtu');
const GAP = modbusDrivers.RTU_GAP_MS;

/** "01 05 00 00" -> Buffer */
function hex(text) {
  return Buffer.from(text.replace(/\s+/g, ''), 'hex');
}

/* ------------------------------------------------------------------ */
/*  Rele platasi modeli (Modbus slave)                                 */
/* ------------------------------------------------------------------ */

/**
 * Arzon rele platasi:
 *   coil i     <-> rele i      (FC01 o'qish, FC05 yozish FF00/0000)
 *   register r <-> rele r - 1  (FC06 yozish onValue/offValue, FC03 o'qish)
 *   status 'bit'  — FC03 holatni 0x0001 / 0x0000 qaytaradi
 *   status 'echo' — FC03 oxirgi yozilgan qiymatni qaytaradi
 */
class RelayBoard {
  constructor({ relays = 8, onValue = 0x0100, offValue = 0x0200, status = 'bit' } = {}) {
    this.relays = new Array(relays).fill(false);
    this.onValue = onValue;
    this.offValue = offValue;
    this.status = status;
    this.written = new Map();
    this.requests = [];
  }

  /** So'rov PDU -> javob PDU (xato javobi ham) */
  handle(pdu) {
    const fc = pdu[0];
    this.requests.push(rtu.toHex(pdu));
    const fail = (code) => Buffer.from([fc | 0x80, code]);
    if (pdu.length < 5) return fail(3);
    const address = pdu.readUInt16BE(1);
    const value = pdu.readUInt16BE(3);
    switch (fc) {
      case 0x01: {
        if (value < 1 || address + value > this.relays.length) return fail(2);
        const out = Buffer.alloc(2 + Math.ceil(value / 8));
        out[0] = 0x01;
        out[1] = out.length - 2;
        for (let i = 0; i < value; i += 1) if (this.relays[address + i]) out[2 + (i >> 3)] |= 1 << (i & 7);
        return out;
      }
      case 0x03: {
        if (value !== 1 || address < 1 || address > this.relays.length) return fail(2);
        const out = Buffer.alloc(4);
        out[0] = 0x03;
        out[1] = 2;
        out.writeUInt16BE(this.status === 'bit' ? Number(this.relays[address - 1]) : this.written.get(address) ?? 0, 2);
        return out;
      }
      case 0x05: {
        if (address >= this.relays.length) return fail(2);
        if (value !== 0xff00 && value !== 0x0000) return fail(3);
        this.relays[address] = value === 0xff00;
        return Buffer.from(pdu);
      }
      case 0x06: {
        if (address < 1 || address > this.relays.length) return fail(2);
        if (value === this.onValue) this.relays[address - 1] = true;
        else if (value === this.offValue) this.relays[address - 1] = false;
        else return fail(3);
        this.written.set(address, value);
        return Buffer.from(pdu);
      }
      default:
        return fail(1);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Mock serverlar va soxta SerialPort                                 */
/* ------------------------------------------------------------------ */

/**
 * Bo'laklarni ketma-ket yuboradi. `inFlight` OXIRGI bo'lakdan OLDIN kamayadi —
 * mijoz javobni to'liq olib keyingi so'rovni yuborganda "parallel" deb hisoblanmasin.
 */
function emitParts(parts, delayMs, emit, alive, stats) {
  stats.inFlight += 1;
  stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
  let index = 0;
  const next = () => {
    if (!alive()) {
      stats.inFlight -= 1;
      return;
    }
    const part = parts[index];
    index += 1;
    const last = index >= parts.length;
    if (last) stats.inFlight -= 1;
    emit(part);
    if (!last) setTimeout(next, 1);
  };
  setTimeout(next, delayMs);
}

async function listen(t, onSocket) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setNoDelay(true);
    onSocket(socket);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  return `127.0.0.1:${server.address().port}`;
}

/** Mock Modbus TCP (MBAP) qurilma. `silent` — so'rovni oladi, lekin javob bermaydi */
async function startMbapServer(t, boards, { silent = false, delayMs = 3 } = {}) {
  const stats = { inFlight: 0, maxInFlight: 0, frames: [] };
  const host = await listen(t, (socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 7 && buffer.length >= 6 + buffer.readUInt16BE(4)) {
        const total = 6 + buffer.readUInt16BE(4);
        const frame = buffer.subarray(0, total);
        buffer = buffer.subarray(total);
        stats.frames.push(rtu.toHex(frame));
        const board = boards.get(frame[6]);
        if (silent || !board) continue;
        const reply = board.handle(frame.subarray(7));
        const head = Buffer.alloc(7);
        frame.copy(head, 0, 0, 4); // tranzaksiya + protokol raqami
        head.writeUInt16BE(reply.length + 1, 4);
        head[6] = frame[6];
        emitParts([Buffer.concat([head, reply])], delayMs, (part) => socket.write(part), () => !socket.destroyed, stats);
      }
    });
  });
  return { host, stats };
}

/**
 * Mock "transparent" RS485↔Ethernet konverter: TCP dan kelgan RTU kadrni platalarga
 * uzatadi; javob oldidan shovqin baytlari va javobning o'zi BO'LAKLAB keladi.
 * `partial` — javobning faqat boshi keladi, keyin jimlik.
 */
async function startRtuTcpServer(t, boards, { silent = false, partial = false, delayMs = 3 } = {}) {
  const stats = { inFlight: 0, maxInFlight: 0, frames: [] };
  const host = await listen(t, (socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 8) { // FC01/03/05/06 so'rov kadri doim 8 bayt
        const frame = buffer.subarray(0, 8);
        buffer = buffer.subarray(8);
        stats.frames.push(rtu.toHex(frame));
        const board = boards.get(frame[0]);
        if (silent || !board || rtu.crc16(frame) !== 0) continue; // buzilgan kadrga plata jim
        const reply = rtu.buildFrame(frame[0], board.handle(frame.subarray(1, 6)));
        const parts = [hex('00 FF')];
        if (partial) parts.push(reply.subarray(0, 4));
        else parts.push(reply.subarray(0, 3), reply.subarray(3));
        emitParts(parts, delayMs, (part) => socket.write(part), () => !socket.destroyed, stats);
      }
    });
  });
  return { host, stats };
}

/**
 * Soxta `serialport`: USB-RS485 adapter va shinadagi platalar (unitId -> RelayBoard).
 * Javob: shovqin bayti (RS485 yo'nalishi almashganda) + kadr ikki bo'lakda.
 *   bus.injectBeforeReply — keyingi javobdan OLDIN keladigan begona kadr
 *   bus.rewrite(reply)    — plata javobini o'zgartirish (noto'g'ri aks-sado)
 */
function fakeSerialBus(boards, { delayMs = 2 } = {}) {
  const bus = {
    instances: [], frames: [], inFlight: 0, maxInFlight: 0, flushes: 0, injectBeforeReply: null, rewrite: null,
  };

  class FakeSerialPort extends EventEmitter {
    constructor(options, callback) {
      super();
      this.options = { ...options };
      this.isOpen = false;
      bus.instances.push(this);
      setImmediate(() => {
        this.isOpen = true;
        if (callback) callback(null);
      });
    }

    write(data, callback) {
      const frame = Buffer.from(data);
      bus.frames.push(frame);
      setImmediate(() => {
        if (callback) callback(null);
      });
      this.reply(frame);
      return true;
    }

    reply(frame) {
      if (frame.length < 5 || rtu.crc16(frame) !== 0) return; // RTU emas (masalan LCUS baytlari)
      const board = boards.get(frame[0]);
      if (!board) return; // bunday plata yo'q — jimlik
      let response = rtu.buildFrame(frame[0], board.handle(frame.subarray(1, frame.length - 2)));
      if (bus.rewrite) response = bus.rewrite(response);
      const parts = [hex('00')];
      if (bus.injectBeforeReply) {
        parts.push(bus.injectBeforeReply);
        bus.injectBeforeReply = null;
      }
      parts.push(response.subarray(0, 3), response.subarray(3));
      emitParts(parts, delayMs, (part) => this.emit('data', part), () => this.isOpen, bus);
    }

    drain(callback) {
      setImmediate(() => {
        if (callback) callback(null);
      });
    }

    flush(callback) {
      bus.flushes += 1;
      setImmediate(() => {
        if (callback) callback(null);
      });
    }

    close(callback) {
      if (!this.isOpen) {
        if (callback) callback(new Error('Port is not open'));
        return;
      }
      this.isOpen = false;
      setImmediate(() => {
        this.emit('close');
        if (callback) callback(null);
      });
    }

    static async list() {
      return [{ path: 'COM7', manufacturer: 'FTDI', vendorId: '0403', productId: '6001' }];
    }
  }

  return { FakeSerialPort, bus };
}

function useFakeSerial(t, boards, options) {
  const { FakeSerialPort, bus } = fakeSerialBus(boards, options);
  serial.__setSerialPortModuleForTests(FakeSerialPort);
  t.after(() => serial.__setSerialPortModuleForTests(null));
  return bus;
}

/* ------------------------------------------------------------------ */
/*  Yordamchilar                                                       */
/* ------------------------------------------------------------------ */

function makeCtx(extra = {}) {
  const sleeps = [];
  const logs = [];
  return {
    timeoutMs: 400,
    log: (level, message) => logs.push(`${level}: ${message}`),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    sleeps,
    logs,
    ...extra,
  };
}

/** LightHub.withLock bilan bir xil navbat (hub.js ga bog'lanmaslik uchun nusxa) */
function makeLock() {
  const locks = new Map();
  return (key, fn) => {
    if (!key) return fn();
    const previous = locks.get(key) || Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    locks.set(key, tail);
    void tail.then(() => {
      if (locks.get(key) === tail) locks.delete(key);
    });
    return run;
  };
}

function tcpDevice(host, config = {}, extra = {}) {
  return {
    tableId: 1, tableNumber: 1, driver: 'modbus_tcp', host, channel: 0, inverted: false,
    auth: null, onUrl: null, offUrl: null, config, ...extra,
  };
}

function rtuDevice(config = {}, extra = {}) {
  return {
    tableId: 1, tableNumber: 1, driver: 'modbus_rtu', host: '', channel: 0, inverted: false,
    auth: null, onUrl: null, offUrl: null, config, ...extra,
  };
}

/* ------------------------------------------------------------------ */
/*  RTU kadrlari                                                       */
/* ------------------------------------------------------------------ */

test('CRC16 (Modbus): katalog tekshiruv qiymati va hujjatlardagi tayyor kadrlar', () => {
  // CRC katalogi (reveng) — CRC-16/MODBUS: check("123456789") = 0x4B37
  assert.equal(rtu.crc16(Buffer.from('123456789', 'ascii')), 0x4b37);

  const vectors = [
    ['01 05 00 00 FF 00', '8C 3A'], // coil 0 ON (FC05)
    ['01 05 00 00 00 00', 'CD CA'], // coil 0 OFF
    ['11 03 00 6B 00 03', '76 87'], // Simply Modbus — FC03 namunasi
    ['11 05 00 AC FF 00', '4E 8B'], // Simply Modbus — FC05 namunasi
    ['11 06 00 01 00 03', '9A 9B'], // Simply Modbus — FC06 namunasi
    ['01 06 00 01 01 00', 'D9 9A'], // "Modbus RTU relay" platasi: 1-rele ochish (0x0100)
    ['01 06 00 01 02 00', 'D9 6A'], // "Modbus RTU relay" platasi: 1-rele yopish (0x0200)
    ['01 03 00 01 00 01', 'D5 CA'], // 1-rele holatini o'qish (FC03)
    ['01 03 02 00 01', '79 84'], //    javob: ochiq (0x0001)
  ];
  for (const [body, crc] of vectors) {
    const bytes = hex(body);
    const frame = rtu.buildFrame(bytes[0], bytes.subarray(1));
    assert.equal(rtu.toHex(frame), `${body} ${crc}`);
    assert.equal(rtu.crc16(frame), 0, 'CRC qo‘shilgan kadrning qoldig‘i 0 bo‘ladi');
  }

  // Jadval usuli mustaqil bitma-bit hisob bilan bir xil (deterministik tasodifiy baytlar)
  const bitwise = (buffer) => {
    let crc = 0xffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    return crc;
  };
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed & 0xff;
  };
  for (let n = 0; n < 300; n += 1) {
    const buffer = Buffer.from(Array.from({ length: 1 + (n % 60) }, random));
    assert.equal(rtu.crc16(buffer), bitwise(buffer));
  }
});

test('RTU javobini ajratish: bo‘laklar, oldidagi axlat, xato javobi, buzilgan CRC, begona kadr', () => {
  const expect = { unitId: 1, functionCode: 0x03, accept: (pdu) => pdu[1] === 2 };
  const reply = hex('01 03 02 00 01 79 84');

  // 1) Bayt-baytlab: oxirgi bayt kelguncha "hali to'liq emas"
  for (let n = 1; n < reply.length; n += 1) assert.equal(rtu.parseResponse(reply.subarray(0, n), expect), null);
  const whole = rtu.parseResponse(reply, expect);
  assert.equal(rtu.toHex(whole.pdu), '03 02 00 01');
  assert.equal(whole.exception, null);

  // 2) Oldida axlat; "01 03" kadr boshiga o'xshaydi — nomzod tekshiriladi va tashlanadi
  const noisy = Buffer.concat([hex('00 FF 01 03'), reply]);
  assert.equal(rtu.parseResponse(noisy.subarray(0, 7), expect), null);
  const found = rtu.parseResponse(noisy, expect);
  assert.equal(found.start, 4);
  assert.equal(rtu.toHex(found.pdu), '03 02 00 01');

  // 3) Xato javobi: [unitId][fc | 0x80][kod][CRC]
  const exception = rtu.parseResponse(Buffer.concat([hex('00'), rtu.buildFrame(1, hex('86 02'))]), {
    unitId: 1, functionCode: 0x06,
  });
  assert.equal(exception.exception, 2);
  assert.equal(rtu.toHex(exception.pdu), '86 02');

  // 4) Buzilgan CRC qabul qilinmaydi; ortidan to'g'ri kadr kelsa — o'sha olinadi
  const corrupted = Buffer.from(reply);
  corrupted[4] ^= 0x01;
  assert.equal(rtu.parseResponse(corrupted, expect), null);
  assert.equal(rtu.toHex(rtu.parseResponse(Buffer.concat([corrupted, reply]), expect).pdu), '03 02 00 01');

  // 5) Boshqa unitId yoki boshqa funksiya — e'tiborsiz
  assert.equal(rtu.parseResponse(rtu.buildFrame(2, hex('03 02 00 01')), expect), null);
  assert.equal(rtu.parseResponse(rtu.buildFrame(1, hex('04 02 00 01')), expect), null);

  // 6) FC06 aks-sadosi: eski javob (boshqa registr) tashlanadi, kerakli manzilniki olinadi
  const echo = { unitId: 1, functionCode: 0x06, accept: (pdu) => pdu.readUInt16BE(1) === 2 };
  const stale = rtu.buildFrame(1, hex('06 00 01 01 00'));
  const fresh = rtu.buildFrame(1, hex('06 00 02 01 00'));
  assert.equal(rtu.parseResponse(stale, echo), null);
  assert.equal(rtu.toHex(rtu.parseResponse(Buffer.concat([stale, fresh]), echo).pdu), '06 00 02 01 00');
});

test('register holatini talqin qilish: sozlangan qiymat, keyin 1/0 holat, boshqasi — noma‘lum', () => {
  const { registerState } = modbusDrivers;
  const values = { on: 0x0100, off: 0x0200 };
  assert.equal(registerState(0x0100, values), true);
  assert.equal(registerState(0x0200, values), false);
  assert.equal(registerState(0x0001, values), true);
  assert.equal(registerState(0x0000, values), false);
  assert.equal(registerState(0x0300, values), null);
  assert.equal(registerState(null, values), null);
  // Sozlangan qiymatlar 1/0 qoidasidan ustun
  assert.equal(registerState(0, { on: 0, off: 1 }), true);
  assert.equal(registerState(1, { on: 0, off: 1 }), false);
});

/* ------------------------------------------------------------------ */
/*  Modbus TCP (MBAP)                                                  */
/* ------------------------------------------------------------------ */

test('Modbus TCP, coil rejimi: bir nechta kanal, holatni o‘qish, unitId, eski API', async (t) => {
  const board = new RelayBoard();
  const { host, stats } = await startMbapServer(t, new Map([[3, board]]));
  const ctx = makeCtx();
  const device = tcpDevice(host, { unitId: 3, channels: [2, 5] }); // coil 0, 2, 5

  assert.equal(modbusTcp.readback(device), true);
  await modbusTcp.write(device, true, ctx);
  assert.deepEqual(board.relays.slice(0, 6), [true, false, true, false, false, true]);
  assert.deepEqual(await modbusTcp.read(device, ctx, {}), [true, true, true]);
  await modbusTcp.write(device, false, ctx);
  assert.deepEqual(await modbusTcp.read(device, ctx, {}), [false, false, false]);

  assert.match(stats.frames[0], /^[0-9A-F]{2} [0-9A-F]{2} 00 00 00 06 03 05 00 00 FF 00$/);
  assert.deepEqual(ctx.sleeps, [], 'Modbus TCP da RTU tanaffusi yo‘q');

  // `config.coil` — asosiy kanal manzili
  await modbusTcp.write(tcpDevice(host, { unitId: 3, coil: 7 }), true, ctx);
  assert.equal(board.relays[7], true);

  // Eski funksiyalar (writeCoil/readCoil) avvalgi imzo bilan ishlaydi
  await modbus.writeCoil({ host, unitId: 3, coil: 4, value: true, timeoutMs: 400 });
  assert.equal(await modbus.readCoil({ host, unitId: 3, coil: 4, timeoutMs: 400 }), true);
});

test('Modbus TCP, register rejimi: 0x0100/0x0200, channel + 1, readback ixtiyoriy', async (t) => {
  const board = new RelayBoard();
  const plain = new RelayBoard({ relays: 32, onValue: 1, offValue: 0, status: 'echo' });
  const { host, stats } = await startMbapServer(t, new Map([[1, board], [2, plain]]));
  const ctx = makeCtx();

  // channel 1 -> registr 2; qo'shimcha kanal 3 -> registr 4
  const device = tcpDevice(host, { mode: 'register', channels: [3] }, { channel: 1 });
  assert.equal(modbusTcp.readback(device), false);
  await modbusTcp.write(device, true, ctx);
  assert.deepEqual(board.requests, ['06 00 02 01 00', '06 00 04 01 00']);
  assert.deepEqual([board.relays[1], board.relays[3]], [true, true]);

  // readback o'chiq: tarmoqqa so'rov yubormasdan har kanal uchun null
  const sent = stats.frames.length;
  assert.deepEqual(await modbusTcp.read(device, ctx, {}), [null, null]);
  assert.equal(stats.frames.length, sent);

  // readback yoqilgan: FC03 -> 0x0001 / 0x0000
  const verified = tcpDevice(host, { mode: 'register', channels: [3], registerReadback: true }, { channel: 1 });
  assert.equal(modbusTcp.readback(verified), true);
  assert.deepEqual(await modbusTcp.read(verified, ctx, {}), [true, true]);
  await modbusTcp.write(verified, false, ctx);
  assert.deepEqual(board.requests.slice(-2), ['06 00 02 02 00', '06 00 04 02 00']);
  assert.deepEqual(await modbusTcp.read(verified, ctx, {}), [false, false]);

  // Boshqa plata: aniq registr va 1/0 qiymatlar (hex matn ham qabul qilinadi)
  const custom = tcpDevice(host, {
    unitId: 2, mode: 'register', register: 16, registerOn: 1, registerOff: '0x0000', registerReadback: true,
  });
  await modbusTcp.write(custom, true, ctx);
  assert.equal(plain.requests.at(-1), '06 00 10 00 01');
  assert.deepEqual(await modbusTcp.read(custom, ctx, {}), [true]);
  await modbusTcp.write(custom, false, ctx);
  assert.deepEqual(await modbusTcp.read(custom, ctx, {}), [false]);
});

test('qurilma xato kodi (exception) o‘zbekcha xabarga aylanadi; o‘qishda — null', async (t) => {
  const board = new RelayBoard({ relays: 4 });
  const { host } = await startMbapServer(t, new Map([[1, board]]));
  const ctx = makeCtx();
  await assert.rejects(modbusTcp.write(tcpDevice(host, { coil: 9 }), true, ctx), /modbus: manzil \(coil\) noto'g'ri/);
  await assert.rejects(
    modbusTcp.write(tcpDevice(host, { mode: 'register', register: 9 }), true, ctx),
    /modbus: manzil \(register\) noto'g'ri/,
  );
  await assert.rejects(
    modbusTcp.write(tcpDevice(host, { mode: 'register', registerOn: 0x0300 }), true, ctx),
    /modbus: qiymat noto'g'ri/,
  );
  // Qurilma javob berdi (xato kodi bilan) — keyingi kanal baribir so'raladi
  assert.deepEqual(await modbusTcp.read(tcpDevice(host, { coil: 9, channels: [1] }), ctx, {}), [null, false]);
});

test('write + tasdiqlash sikli (control.executeDevice): NC rele, register rejimi', async (t) => {
  const board = new RelayBoard();
  const { host } = await startMbapServer(t, new Map([[1, board]]));
  const ctx = makeCtx();
  const device = {
    ...tcpDevice(host, { mode: 'register', registerReadback: true }), inverted: true, desired: true,
  };
  const result = await executeDevice(device, {
    verify: true, forced: false, sleep: async () => {}, readback: modbusTcp.readback(device),
    write: (physical) => modbusTcp.write(device, physical, ctx),
    read: async (options) => logicalState(await modbusTcp.read(device, ctx, options || {}), true, true),
  });
  assert.equal(result.ok, true);
  assert.equal(result.actual, true);
  assert.equal(board.relays[0], false, 'NC rele: yoqish uchun fizik "o‘chiq" yoziladi');
  assert.equal(board.requests[0], '06 00 01 02 00');
});

/* ------------------------------------------------------------------ */
/*  RTU-over-TCP                                                       */
/* ------------------------------------------------------------------ */

test('RTU-over-TCP (transparent konverter): shovqin, bo‘lakli javob, coil va register', async (t) => {
  const board = new RelayBoard();
  const { host, stats } = await startRtuTcpServer(t, new Map([[5, board]]));
  const ctx = makeCtx();

  const coils = tcpDevice(host, { framing: 'rtu', unitId: 5, channels: [1] });
  await modbusTcp.write(coils, true, ctx);
  assert.deepEqual(stats.frames, [
    rtu.toHex(rtu.buildFrame(5, hex('05 00 00 FF 00'))),
    rtu.toHex(rtu.buildFrame(5, hex('05 00 01 FF 00'))),
  ]);
  assert.deepEqual(await modbusTcp.read(coils, ctx, {}), [true, true]);
  assert.ok(ctx.sleeps.includes(GAP), 'RTU kanallari orasida tanaffus');

  const registers = tcpDevice(host, { framing: 'rtu', unitId: 5, mode: 'register', registerReadback: true }, { channel: 2 });
  await modbusTcp.write(registers, true, ctx);
  assert.equal(stats.frames.at(-1), rtu.toHex(rtu.buildFrame(5, hex('06 00 03 01 00'))));
  assert.equal(board.relays[2], true);
  assert.deepEqual(await modbusTcp.read(registers, ctx, {}), [true]);
  assert.equal(stats.maxInFlight, 1);
});

test('RTU-over-TCP: bitta konverterdagi ikki stol navbat bilan, so‘rovlar ustma-ust tushmaydi', async (t) => {
  const boards = new Map([[1, new RelayBoard()], [2, new RelayBoard()]]);
  const { host, stats } = await startRtuTcpServer(t, boards, { delayMs: 5 });
  const tableA = tcpDevice(host, { framing: 'rtu', unitId: 1, channels: [1] }, { tableId: 1 });
  const tableB = tcpDevice(host, { framing: 'rtu', unitId: 2, channels: [1] }, { tableId: 2 });
  assert.equal(modbusTcp.lockKey(tableA), modbusTcp.lockKey(tableB));

  const withLock = makeLock();
  const ctx = makeCtx();
  await Promise.all([tableA, tableB].map((device) => withLock(modbusTcp.lockKey(device), () => modbusTcp.write(device, true, ctx))));
  assert.deepEqual(stats.frames.map((frame) => frame.slice(0, 2)), ['01', '01', '02', '02']);
  assert.equal(stats.maxInFlight, 1);

  // Tashqi qulfsiz ham bitta host:port ga ulanishlar navbat bilan (modbus.js ichki navbati)
  stats.frames.length = 0;
  stats.maxInFlight = 0;
  await Promise.all([modbusTcp.write(tableA, false, ctx), modbusTcp.write(tableB, false, ctx)]);
  assert.equal(stats.frames.length, 4);
  assert.equal(stats.maxInFlight, 1);
});

/* ------------------------------------------------------------------ */
/*  RTU COM port orqali (soxta SerialPort)                             */
/* ------------------------------------------------------------------ */

test('RTU COM port orqali: sozlamalar, aniq baytlar, eski baytlar tozalanadi, port qayta ochiladi', async (t) => {
  const board = new RelayBoard();
  const bus = useFakeSerial(t, new Map([[1, board]]));
  const ctx = makeCtx();
  const device = rtuDevice({
    serialPort: 'COM7', baudRate: 19200, parity: 'even', mode: 'register', registerReadback: true, channels: [1],
  });

  await modbusRtu.write(device, true, ctx);
  // Platalar qo'llanmasidagi aynan shu buyruq: 1-rele ochish
  assert.deepEqual(bus.frames.map(rtu.toHex), ['01 06 00 01 01 00 D9 9A', rtu.toHex(rtu.buildFrame(1, hex('06 00 02 01 00')))]);
  assert.equal(bus.instances.length, 1);
  const { path, baudRate, parity, stopBits, dataBits } = bus.instances[0].options;
  assert.deepEqual({ path, baudRate, parity, stopBits, dataBits }, {
    path: 'COM7', baudRate: 19200, parity: 'even', stopBits: 1, dataBits: 8,
  });
  assert.deepEqual(ctx.sleeps, [GAP], 'kanallar orasida bitta tanaffus');

  assert.deepEqual(await modbusRtu.read(device, ctx, {}), [true, true]);
  assert.equal(bus.instances.length, 1, 'port ochiq saqlanadi');
  assert.ok(bus.flushes >= 4, 'har so‘rovdan oldin kiruvchi bufer tozalanadi');

  // So'rov yo'q paytda kelgan eski "yoniq" javobi keyingi o'qishga aralashmaydi
  await modbusRtu.write(device, false, ctx);
  bus.instances[0].emit('data', rtu.buildFrame(1, hex('03 02 00 01')));
  assert.deepEqual(await modbusRtu.read(device, ctx, {}), [false, false]);

  // Javobdan oldin kelgan begona kadr (boshqa registr aks-sadosi) tashlanadi
  bus.injectBeforeReply = rtu.buildFrame(1, hex('06 00 07 01 00'));
  await modbusRtu.write(device, true, ctx);
  assert.deepEqual(await modbusRtu.read(device, ctx, {}), [true, true]);

  // Plata faqat boshqa manzil aks-sadosini qaytarsa — "muvaffaqiyat" deb hisoblanmaydi
  bus.rewrite = () => rtu.buildFrame(1, hex('06 00 07 01 00'));
  await assert.rejects(modbusRtu.write(device, true, makeCtx({ timeoutMs: 120 })), /serial: javob chala yoki noto'g'ri/);
  bus.rewrite = null;

  // Sozlama o'zgardi -> eski port yopiladi, yangisi shu sozlama bilan ochiladi
  await modbusRtu.write(rtuDevice({ ...device.config, parity: 'none' }), true, ctx);
  assert.equal(bus.instances.length, 2);
  assert.equal(bus.instances[0].isOpen, false);
  assert.equal(bus.instances[1].options.parity, 'none');
});

test('bitta COM portdagi ikki stol: lockKey bir xil, kadrlar hech qachon aralashmaydi', async (t) => {
  // Kalit: katta-kichik harf va bo'shliq farq qilmaydi; standart port 502 hisobga olinadi
  assert.equal(modbusRtu.lockKey(rtuDevice({ serialPort: 'COM4' })), 'serial:com4');
  assert.equal(modbusRtu.lockKey(rtuDevice({ serialPort: ' com4 ' })), 'serial:com4');
  assert.notEqual(modbusRtu.lockKey(rtuDevice({ serialPort: 'COM5' })), 'serial:com4');
  assert.equal(modbusTcp.lockKey(tcpDevice('192.168.1.60')), 'modbus:192.168.1.60:502');
  assert.equal(modbusTcp.lockKey(tcpDevice('192.168.1.60:502', { framing: 'rtu' })), 'modbus:192.168.1.60:502');
  assert.notEqual(modbusTcp.lockKey(tcpDevice('192.168.1.60:8899')), modbusTcp.lockKey(tcpDevice('192.168.1.60')));

  const bus = useFakeSerial(t, new Map([[1, new RelayBoard()], [2, new RelayBoard()]]), { delayMs: 3 });
  const tableA = rtuDevice({ serialPort: 'COM7', unitId: 1, channels: [1, 2] }, { tableId: 1 });
  const tableB = rtuDevice({ serialPort: 'COM7', unitId: 2, channels: [5] }, { tableId: 2, channel: 4 });
  assert.equal(modbusRtu.lockKey(tableA), modbusRtu.lockKey(tableB));

  const withLock = makeLock();
  const ctx = makeCtx();
  const command = (device) => withLock(modbusRtu.lockKey(device), async () => {
    await modbusRtu.write(device, true, ctx);
    return modbusRtu.read(device, ctx, {});
  });
  const [readA, readB] = await Promise.all([command(tableA), command(tableB)]);
  assert.deepEqual(readA, [true, true, true]);
  assert.deepEqual(readB, [true, true]);
  assert.equal(bus.maxInFlight, 1);
  // A ning 3 yozish + 3 o'qish kadri, keyin B ning 2 + 2 kadri — aralashmagan
  assert.deepEqual(bus.frames.map((frame) => frame[0]), [1, 1, 1, 1, 1, 1, 2, 2, 2, 2]);

  // Tashqi qulfsiz ham (masalan sinov tugmasi) kadrlar to'qnashmaydi — serial.request navbati
  bus.frames.length = 0;
  bus.maxInFlight = 0;
  await Promise.all([modbusRtu.write(tableA, false, ctx), modbusRtu.write(tableB, false, ctx)]);
  assert.equal(bus.frames.length, 5);
  assert.equal(bus.maxInFlight, 1);
});

/* ------------------------------------------------------------------ */
/*  Timeout, to'xtatish, sozlama xatolari                              */
/* ------------------------------------------------------------------ */

test('timeout: jim plata, chala javob, bo‘sh shina — tez va tushunarli xato, o‘qish throw qilmaydi', async (t) => {
  const silent = await startMbapServer(t, new Map(), { silent: true });
  let started = Date.now();
  await assert.rejects(
    modbusTcp.write(tcpDevice(silent.host), true, makeCtx({ timeoutMs: 150 })),
    /^Error: modbus: javob kelmadi \(timeout\)$/,
  );
  // Parallel testlarda CPU band bo'lishi mumkin — chegara keng, lekin 3 s lik standart timeoutdan ancha kam
  assert.ok(Date.now() - started < 2500);

  // O'lik plata: birinchi kanal timeout bo'lgach qolganlari so'ralmaydi
  const sent = silent.stats.frames.length;
  started = Date.now();
  assert.deepEqual(await modbusTcp.read(tcpDevice(silent.host, { channels: [1, 2] }), makeCtx({ timeoutMs: 150 }), {}), [null, null, null]);
  assert.equal(silent.stats.frames.length - sent, 1);
  assert.ok(Date.now() - started < 2500);

  const partial = await startRtuTcpServer(t, new Map([[1, new RelayBoard()]]), { partial: true });
  await assert.rejects(
    modbusTcp.write(tcpDevice(partial.host, { framing: 'rtu' }), true, makeCtx({ timeoutMs: 150 })),
    /modbus: javob kelmadi \(timeout\) — 6 bayt tushunarsiz/,
  );

  const bus = useFakeSerial(t, new Map()); // shinada hech kim yo'q
  await assert.rejects(
    modbusRtu.write(rtuDevice({ serialPort: 'COM9', unitId: 9 }), true, makeCtx({ timeoutMs: 120 })),
    /serial: qurilma javob bermadi \(timeout\)/,
  );
  const before = bus.frames.length;
  assert.deepEqual(
    await modbusRtu.read(rtuDevice({ serialPort: 'COM9', unitId: 9, channels: [1, 2] }), makeCtx({ timeoutMs: 120 }), {}),
    [null, null, null],
  );
  assert.equal(bus.frames.length - before, 1);
});

test('to‘xtatish signali kutilayotgan COM port so‘rovini darhol uzadi', async (t) => {
  useFakeSerial(t, new Map());
  const controller = new AbortController();
  const pending = modbusRtu.write(rtuDevice({ serialPort: 'COM10' }), true, makeCtx({ timeoutMs: 5000, signal: controller.signal }));
  setTimeout(() => controller.abort(), 30);
  const started = Date.now();
  await assert.rejects(pending, /serial: so'rov to'xtatildi/);
  assert.ok(Date.now() - started < 1000);
});

test('sozlama xatolari: aniq o‘zbekcha xabar (tarmoqqa chiqmasdan), readback() qoidasi', async (t) => {
  const bus = useFakeSerial(t, new Map());
  const ctx = makeCtx();
  await assert.rejects(modbusRtu.write(rtuDevice({}), true, ctx), /modbus_rtu uchun "serialPort" kiritilmagan/);
  await assert.rejects(modbusRtu.write(rtuDevice({ serialPort: 'COM3', unitId: 0 }), true, ctx), /broadcast/);
  await assert.rejects(modbusRtu.write(rtuDevice({ serialPort: 'COM3', unitId: 300 }), true, ctx), /"unitId" 1\.\.247/);
  await assert.rejects(modbusRtu.write(rtuDevice({ serialPort: 'COM3', parity: 'mark' }), true, ctx), /"parity"/);
  await assert.rejects(modbusRtu.write(rtuDevice({ serialPort: 'COM3', baudRate: 100 }), true, ctx), /"baudRate"/);
  await assert.rejects(modbusRtu.write(rtuDevice({ serialPort: 'COM3', stopBits: 3 }), true, ctx), /"stopBits"/);
  await assert.rejects(
    modbusRtu.write(rtuDevice({ serialPort: 'COM3', mode: 'register', registerOn: 5, registerOff: 5 }), true, ctx),
    /bir xil/,
  );
  await assert.rejects(modbusRtu.write(rtuDevice({ serialPort: 'COM3', mode: 'relay' }), true, ctx), /"mode"/);
  await assert.rejects(modbusTcp.write(tcpDevice('10.0.0.1', { framing: 'udp' }), true, ctx), /"framing"/);
  await assert.rejects(modbusTcp.write(tcpDevice('10.0.0.1', { framing: 'rtu', unitId: 0 }), true, ctx), /broadcast/);
  await assert.rejects(modbusTcp.write(tcpDevice('10.0.0.1', { coil: 70000 }), true, ctx), /"coil"/);
  await assert.rejects(modbusTcp.write(tcpDevice(''), true, ctx), /host/);
  assert.equal(bus.instances.length, 0, 'noto‘g‘ri sozlama bilan port ochilmaydi');

  // O'qish hech qachon throw qilmaydi: har kanal uchun null
  assert.deepEqual(await modbusRtu.read(rtuDevice({ channels: [1] }), ctx, {}), [null, null]);

  assert.equal(modbusRtu.readback(rtuDevice({ serialPort: 'COM3' })), true);
  assert.equal(modbusRtu.readback(rtuDevice({ serialPort: 'COM3', mode: 'register' })), false);
  assert.equal(modbusRtu.readback(rtuDevice({ serialPort: 'COM3', mode: 'register', registerReadback: true })), true);
  assert.equal(modbusTcp.readback(tcpDevice('10.0.0.1')), true);
});

test('serial.send() / listPorts() / closeAll() avvalgidek ishlaydi', async (t) => {
  const bus = useFakeSerial(t, new Map());
  assert.equal(serial.isAvailable(), true);
  const lcus = hex('A0 01 01 A2');
  await serial.send({ path: 'COM11', baudRate: 9600, data: lcus, timeoutMs: 200 });
  await serial.send({ path: 'COM11', baudRate: '9600', data: lcus, timeoutMs: 200 });
  assert.equal(bus.instances.length, 1, 'port ochiq saqlanadi');
  assert.equal(bus.instances[0].options.baudRate, 9600);
  assert.equal(bus.instances[0].options.parity, 'none');
  assert.deepEqual(bus.frames.map(rtu.toHex), ['A0 01 01 A2', 'A0 01 01 A2']);

  await serial.send({ path: 'COM11', baudRate: 115200, data: lcus, timeoutMs: 200 });
  assert.equal(bus.instances.length, 2, 'boshqa tezlik — port qayta ochiladi');
  assert.equal(bus.instances[0].isOpen, false);

  await assert.rejects(serial.send({ path: 'COM11', baudRate: 100, data: lcus }), /"baudRate"/);
  await assert.rejects(serial.send({ path: '', data: lcus }), /port nomi/);

  const ports = await serial.listPorts();
  assert.equal(ports.length, 1);
  assert.equal(ports[0].path, 'COM7');
  assert.equal(ports[0].vendorId, '0403');
  assert.equal(serial.BAUD_MIN, 300);
  assert.equal(serial.BAUD_MAX, 921600);

  serial.closeAll();
  assert.equal(bus.instances[1].isOpen, false);
});

test('drivers reyestri: yangi modbus_tcp eskisining o‘rnini oladi, modbus_rtu qo‘shiladi', () => {
  const drivers = require('../lib/drivers');
  assert.equal(drivers.getDriver('modbus_tcp'), modbusTcp);
  assert.equal(drivers.getDriver('modbus_rtu'), modbusRtu);
});
