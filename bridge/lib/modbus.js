'use strict';

/**
 * Billiard Club — bridge agenti: MODBUS drayveri (TCP va RTU).
 *
 * Sanoat va arzon rele platalari (4/8/16 kanalli) odatda shu protokol bilan ishlaydi.
 * Bitta PDU (funksiya kodi + ma'lumot) uch xil yo'l bilan yuboriladi:
 *
 *   framing 'tcp' — Modbus TCP: MBAP sarlavha + PDU (standart port 502). Sanoat
 *                   platalari va "Modbus TCP -> RTU" shlyuz rejimidagi konverterlar.
 *   framing 'rtu' — RTU kadri (unitId + PDU + CRC16) ODDIY TCP ustida: "transparent"
 *                   rejimdagi RS485↔Ethernet konverterlar (USR-TCP232, Elfin EW11 va h.k.)
 *                   — klublarda eng ko'p uchraydigan ulanish.
 *   serial        — RTU kadri USB-RS485 adapter (COM port) orqali: lib/serial.js.
 *
 * Qo'llab-quvvatlanadigan funksiyalar:
 *   FC1 (0x01) — coil (g'altak) holatini o'qish        -> coil rejimida holatni tekshirish
 *   FC3 (0x03) — holding registrni o'qish               -> register rejimida (ixtiyoriy)
 *   FC5 (0x05) — bitta coil ga FF00 / 0000 yozish      -> yoqish / o'chirish
 *   FC6 (0x06) — bitta registrga qiymat yozish          -> arzon RTU platalar (0x0100 / 0x0200)
 *
 * TCP da har bir so'rov uchun qisqa ulanish ochiladi va darhol yopiladi: plata yoki
 * konverter odatda bir vaqtda 1–4 ta ulanishni qo'llab-quvvatlaydi, ochiq ulanishni
 * ushlab turish esa boshqa dasturlarga (sozlash utilitasi, SCADA) xalaqit beradi.
 * Bitta host:port ga so'rovlar shu modul ichida ham NAVBAT bilan ketadi (chaqiruvchi
 * qulf ishlatmasa ham ikki so'rov bir vaqtda ulanmaydi); COM port navbati — serial.js da.
 *
 * npm bog'liqligi YO'Q — faqat node:net (COM port uchun ixtiyoriy `serialport`).
 */

const net = require('node:net');
const { errText, splitHostPort } = require('./common');
const rtu = require('./modbus-rtu');
const serial = require('./serial');

/** Modbus TCP standart porti (RTU-over-TCP da ham port ko'rsatilmasa shu ishlatiladi) */
const DEFAULT_PORT = 502;

/** Funksiya kodlari */
const FC_READ_COILS = 0x01;
const FC_READ_HOLDING = 0x03;
const FC_WRITE_COIL = 0x05;
const FC_WRITE_REGISTER = 0x06;

/** TCP javob buferi chegarasi — shovqinli konverter xotirani to'ldirib yubormasin */
const MAX_RECEIVE_BYTES = 1024;

/** MBAP sarlavhasidagi tranzaksiya raqami (1..65535 aylanma) */
let transactionCounter = 0;

function nextTransactionId() {
  transactionCounter = (transactionCounter % 65535) + 1;
  return transactionCounter;
}

/** Qurilma qaytargan xato kodini o'zbekcha izohlaydi */
function exceptionText(code, functionCode) {
  const target = functionCode === FC_READ_HOLDING || functionCode === FC_WRITE_REGISTER ? 'register' : 'coil';
  switch (code) {
    case 1:
      return `funksiya qo'llab-quvvatlanmaydi (FC${functionCode}) — plata boshqa rejimda ishlaydi (coil/register)`;
    case 2:
      return `manzil (${target}) noto'g'ri`;
    case 3:
      return "qiymat noto'g'ri";
    case 4:
      return 'qurilma ichki xatosi';
    case 6:
      return 'qurilma band';
    case 0x0a:
      return "shlyuz: RS485 yo'li topilmadi";
    case 0x0b:
      return 'shlyuz ortidagi plata javob bermadi (unitId ni tekshiring)';
    default:
      return `xato kodi ${code}`;
  }
}

/**
 * Modbus xatosi. `deviceResponded` — qurilma JAVOB BERDI (xato kodi yoki tushunarsiz
 * javob): tarmoq/ulanish ishlayapti, demak boshqa kanallarni so'rash mantiqli.
 */
function modbusError(message, deviceResponded = false, extra = null) {
  const err = new Error(`modbus: ${message}`);
  err.deviceResponded = deviceResponded;
  if (extra) Object.assign(err, extra);
  return err;
}

function exceptionError(code, functionCode) {
  return modbusError(exceptionText(code, functionCode), true, { exceptionCode: code });
}

/**
 * Shina (bus) kaliti: "192.168.1.60" va "192.168.1.60:502" — BITTA qurilma.
 * Bo'sh manzil — bo'sh satr.
 */
function hostKey(host) {
  const text = String(host || '').trim().toLowerCase();
  if (!text) return '';
  const { host: hostname, port } = splitHostPort(text, DEFAULT_PORT);
  return `${hostname}:${port}`;
}

/* ------------------------------------------------------------------ */
/*  Bitta host:port ga so'rovlar navbati                               */
/* ------------------------------------------------------------------ */

/** hostKey -> navbat oxiri */
const busQueues = new Map();

function withBus(key, fn) {
  const previous = busQueues.get(key) || Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  busQueues.set(key, tail);
  void tail.then(() => {
    if (busQueues.get(key) === tail) busQueues.delete(key);
  });
  return run;
}

/* ------------------------------------------------------------------ */
/*  Kadrlar va javobni ajratuvchilar                                   */
/* ------------------------------------------------------------------ */

/** MBAP sarlavha + PDU */
function buildFrame(transactionId, unitId, pdu) {
  const head = Buffer.allocUnsafe(7);
  head.writeUInt16BE(transactionId, 0);
  head.writeUInt16BE(0, 2); // protokol identifikatori — Modbus uchun doim 0
  head.writeUInt16BE(pdu.length + 1, 4);
  head.writeUInt8(unitId & 0xff, 6);
  return Buffer.concat([head, pdu]);
}

/**
 * MBAP javobini ajratuvchi. Natija: null (yana bayt kerak) | { pdu } | { error }.
 */
function mbapExtractor(transactionId, functionCode) {
  return (received) => {
    if (received.length < 8) return null;
    const total = 6 + received.readUInt16BE(4);
    if (received.length < total) return null;
    if (received.readUInt16BE(0) !== transactionId) {
      return { error: modbusError("javob boshqa so'rovga tegishli", true) };
    }
    const pdu = received.subarray(7, total);
    if (!pdu.length) return { error: modbusError("javob bo'sh", true) };
    if ((pdu[0] & 0x80) !== 0) return { error: exceptionError(pdu.length > 1 ? pdu[1] : 0, functionCode) };
    return { pdu: Buffer.from(pdu) };
  };
}

/** RTU javobini ajratuvchi (axlat baytlar, bo'laklar va xato javoblari — modbus-rtu.js da) */
function rtuExtractor(expect) {
  return (received) => {
    const found = rtu.parseResponse(received, expect);
    if (!found) return null;
    if (found.exception !== null) return { error: exceptionError(found.exception, expect.functionCode) };
    return { pdu: found.pdu };
  };
}

/** Javob kelmadi: bir necha bayt kelgan bo'lsa — sozlama mos emasligiga ishora */
function timeoutError(receivedBytes) {
  return receivedBytes
    ? modbusError(`javob kelmadi (timeout) — ${receivedBytes} bayt tushunarsiz ma'lumot keldi (framing/unitId ni tekshiring)`)
    : modbusError('javob kelmadi (timeout)');
}

/* ------------------------------------------------------------------ */
/*  Transportlar                                                       */
/* ------------------------------------------------------------------ */

/**
 * TCP orqali bitta so'rov: ulanadi, kadrni yuboradi, javob kelguncha baytlarni yig'adi.
 * @param {object}   options { host, timeoutMs, signal }
 * @param {Buffer}   frame   yuboriladigan kadr (MBAP yoki RTU)
 * @param {Function} extract (received) => null | { pdu } | { error }
 */
function tcpExchange(options, frame, extract) {
  const { host: hostname, port } = splitHostPort(options.host, DEFAULT_PORT);
  if (!hostname) return Promise.reject(modbusError("qurilma manzili ko'rsatilmagan"));

  const timeoutMs = Number(options.timeoutMs) || 3000;

  return new Promise((resolve, reject) => {
    let settled = false;
    let received = Buffer.alloc(0);

    const socket = net.connect({ host: hostname, port });
    const signal = options.signal;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      try {
        socket.destroy();
      } catch {
        /* e'tiborsiz */
      }
      if (err) reject(err);
      else resolve(value);
    };

    const timer = setTimeout(() => finish(timeoutError(received.length)), timeoutMs);
    const onAbort = () => finish(modbusError("so'rov to'xtatildi"));

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    // Kadr BITTA TCP paketda ketsin: konverter bo'lingan kadrni RS485 ga pauza bilan
    // uzatsa, plata uni ikki xil kadr deb tashlab yuboradi
    socket.setNoDelay(true);
    socket.on('connect', () => {
      try {
        socket.write(frame);
      } catch (err) {
        finish(modbusError(errText(err)));
      }
    });
    socket.on('error', (err) => finish(modbusError(errText(err))));
    socket.on('close', () => finish(modbusError('ulanish javobsiz yopildi')));

    socket.on('data', (chunk) => {
      received = received.length ? Buffer.concat([received, chunk]) : chunk;
      if (received.length > MAX_RECEIVE_BYTES) received = received.subarray(received.length - MAX_RECEIVE_BYTES);
      let outcome;
      try {
        outcome = extract(received);
      } catch (err) {
        finish(err instanceof Error ? err : modbusError(String(err)));
        return;
      }
      if (!outcome) return;
      if (outcome.error) finish(outcome.error);
      else finish(null, outcome.pdu);
    });
  });
}

/** COM port (USB-RS485) orqali bitta RTU so'rov — port navbati serial.request() ichida */
async function serialExchange(options, unitId, expect) {
  const settings = options.serial || {};
  const raw = await serial.request({
    path: settings.path,
    baudRate: settings.baudRate,
    parity: settings.parity,
    stopBits: settings.stopBits,
    dataBits: settings.dataBits,
    data: rtu.buildFrame(unitId, options.pdu),
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    isComplete: (buffer) => rtu.parseResponse(buffer, expect) !== null,
  });
  const outcome = rtuExtractor(expect)(raw);
  if (!outcome) throw modbusError('javob tushunarsiz', true);
  if (outcome.error) throw outcome.error;
  return outcome.pdu;
}

/**
 * Bitta so'rov yuborib javob PDU sini qaytaradi.
 * @param {object} options
 *   pdu        Buffer — funksiya kodi + ma'lumot
 *   unitId     0..247 (default 1); RTU da 0 — broadcast, javob kelmaydi, shuning uchun rad etiladi
 *   host       "192.168.1.60[:502]" — TCP orqali
 *   framing    'tcp' (MBAP, default) | 'rtu' (RTU kadrlari oddiy TCP ustida)
 *   serial     { path, baudRate, parity, stopBits, dataBits } — berilsa RTU COM port orqali
 *   accept     (pdu) => boolean — RTU: eski/begona javob kadrlarini tashlash uchun
 *   timeoutMs, signal
 */
function request(options) {
  const pdu = options.pdu;
  if (!Buffer.isBuffer(pdu) || !pdu.length) return Promise.reject(modbusError("so'rov (PDU) tayyorlanmagan"));

  const unitId = Number.isInteger(options.unitId) ? options.unitId : 1;
  const isRtu = Boolean(options.serial) || String(options.framing || '').trim().toLowerCase() === 'rtu';
  if (isRtu && unitId === 0) {
    return Promise.reject(modbusError('RTU da unitId 0 — umumiy (broadcast) manzil, plata javob bermaydi; 1..247 kiriting'));
  }
  const expect = { unitId, functionCode: pdu[0], accept: options.accept };

  if (options.serial) return serialExchange(options, unitId, expect);

  return withBus(hostKey(options.host), () => {
    if (isRtu) return tcpExchange(options, rtu.buildFrame(unitId, pdu), rtuExtractor(expect));
    const transactionId = nextTransactionId();
    return tcpExchange(options, buildFrame(transactionId, unitId, pdu), mbapExtractor(transactionId, pdu[0]));
  });
}

/* ------------------------------------------------------------------ */
/*  Funksiyalar                                                        */
/* ------------------------------------------------------------------ */

/** FC05/FC06 so'rovi: funksiya kodi + manzil + qiymat */
function writePdu(functionCode, address, value) {
  const pdu = Buffer.allocUnsafe(5);
  pdu.writeUInt8(functionCode, 0);
  pdu.writeUInt16BE(address, 1);
  pdu.writeUInt16BE(value, 3);
  return pdu;
}

/** FC05/FC06 javobi — aks-sado: o'sha manzil bo'lishi shart (eski javob qoldig'i emas) */
function echoOf(address) {
  return (pdu) => pdu.length === 5 && pdu.readUInt16BE(1) === address;
}

/**
 * FC5 — bitta g'altakni yoqadi/o'chiradi.
 * @param {object} options { host | serial, framing, unitId, coil, value, timeoutMs, signal }
 */
async function writeCoil(options) {
  const coil = Number.isInteger(options.coil) ? options.coil : 0;
  if (coil < 0 || coil > 65535) throw new Error(`modbus: coil raqami noto'g'ri (${coil})`);

  const pdu = writePdu(FC_WRITE_COIL, coil, options.value ? 0xff00 : 0x0000);
  const response = await request({ ...options, pdu, accept: echoOf(coil) });
  if (response[0] !== FC_WRITE_COIL) throw modbusError('javob funksiyasi mos emas', true);
}

/**
 * FC1 — bitta g'altak holatini o'qiydi. Tushunarsiz javobda `null`.
 * @param {object} options { host | serial, framing, unitId, coil, timeoutMs, signal }
 */
async function readCoil(options) {
  const coil = Number.isInteger(options.coil) ? options.coil : 0;
  if (coil < 0 || coil > 65535) return null;

  const pdu = writePdu(FC_READ_COILS, coil, 1);
  // 1 ta coil -> 1 bayt ma'lumot
  const response = await request({ ...options, pdu, accept: (p) => p.length >= 3 && p[1] === 1 });
  if (response[0] !== FC_READ_COILS || response.length < 3) return null;
  return (response[2] & 0x01) === 1;
}

/**
 * FC6 — bitta holding registrga qiymat yozadi (masalan 0x0100 yoqish / 0x0200 o'chirish).
 * @param {object} options { host | serial, framing, unitId, register, value, timeoutMs, signal }
 */
async function writeRegister(options) {
  const register = Number.isInteger(options.register) ? options.register : 0;
  if (register < 0 || register > 65535) throw new Error(`modbus: register raqami noto'g'ri (${register})`);
  const value = options.value;
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`modbus: register qiymati noto'g'ri (${value})`);
  }

  const pdu = writePdu(FC_WRITE_REGISTER, register, value);
  const response = await request({ ...options, pdu, accept: echoOf(register) });
  if (response[0] !== FC_WRITE_REGISTER) throw modbusError('javob funksiyasi mos emas', true);
}

/**
 * FC3 — bitta holding registrni o'qiydi (0..65535). Tushunarsiz javobda `null`.
 * @param {object} options { host | serial, framing, unitId, register, timeoutMs, signal }
 */
async function readRegister(options) {
  const register = Number.isInteger(options.register) ? options.register : 0;
  if (register < 0 || register > 65535) return null;

  const pdu = writePdu(FC_READ_HOLDING, register, 1);
  // 1 ta registr -> 2 bayt ma'lumot
  const response = await request({ ...options, pdu, accept: (p) => p.length >= 4 && p[1] === 2 });
  if (response[0] !== FC_READ_HOLDING || response.length < 4 || response[1] < 2) return null;
  return response.readUInt16BE(2);
}

module.exports = {
  request,
  writeCoil,
  readCoil,
  writeRegister,
  readRegister,
  hostKey,
  exceptionText,
  DEFAULT_PORT,
};
