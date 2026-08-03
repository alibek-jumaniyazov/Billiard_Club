'use strict';

/**
 * Billiard Club — bridge agenti: MODBUS TCP drayveri.
 *
 * Sanoat rele platalari (8/16 kanalli) odatda shu protokol bilan ishlaydi.
 * Qo'llab-quvvatlanadigan funksiyalar:
 *   FC5 (0x05) — bitta g'altak (coil) ga yozish  -> yoqish/o'chirish
 *   FC1 (0x01) — g'altaklarni o'qish             -> haqiqiy holatni tekshirish
 *
 * Har bir buyruq uchun qisqa TCP ulanish ochiladi va darhol yopiladi:
 * plata odatda bir vaqtda 1–4 ta ulanishni qo'llab-quvvatlaydi, ochiq
 * ulanishni ushlab turish esa boshqa dasturlarga xalaqit beradi.
 *
 * npm bog'liqligi YO'Q — faqat node:net.
 */

const net = require('node:net');
const { errText, splitHostPort } = require('./common');

/** Modbus TCP standart porti */
const DEFAULT_PORT = 502;

/** MBAP sarlavhasidagi tranzaksiya raqami (1..65535 aylanma) */
let transactionCounter = 0;

function nextTransactionId() {
  transactionCounter = (transactionCounter % 65535) + 1;
  return transactionCounter;
}

/** Qurilma qaytargan xato kodini o'zbekcha izohlaydi */
function exceptionText(code) {
  switch (code) {
    case 1:
      return "funksiya qo'llab-quvvatlanmaydi";
    case 2:
      return "manzil (coil) noto'g'ri";
    case 3:
      return "qiymat noto'g'ri";
    case 4:
      return 'qurilma ichki xatosi';
    case 6:
      return 'qurilma band';
    default:
      return `xato kodi ${code}`;
  }
}

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
 * Bitta so'rov yuborib javob PDU sini qaytaradi.
 * @param {object} options { host, unitId, pdu, timeoutMs, signal }
 */
function request(options) {
  const { host: hostname, port } = splitHostPort(options.host, DEFAULT_PORT);
  if (!hostname) return Promise.reject(new Error("modbus: qurilma manzili ko'rsatilmagan"));

  const unitId = Number.isInteger(options.unitId) ? options.unitId : 1;
  const timeoutMs = Number(options.timeoutMs) || 3000;
  const transactionId = nextTransactionId();

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

    const timer = setTimeout(() => finish(new Error('modbus: javob kelmadi (timeout)')), timeoutMs);
    const onAbort = () => finish(new Error("modbus: so'rov to'xtatildi"));

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    socket.setNoDelay(true);
    socket.on('connect', () => {
      try {
        socket.write(buildFrame(transactionId, unitId, options.pdu));
      } catch (err) {
        finish(new Error(`modbus: ${errText(err)}`));
      }
    });
    socket.on('error', (err) => finish(new Error(`modbus: ${errText(err)}`)));
    socket.on('close', () => finish(new Error('modbus: ulanish javobsiz yopildi')));

    socket.on('data', (chunk) => {
      received = received.length ? Buffer.concat([received, chunk]) : chunk;
      if (received.length < 8) return;

      const total = 6 + received.readUInt16BE(4);
      if (received.length < total) return;

      if (received.readUInt16BE(0) !== transactionId) {
        finish(new Error('modbus: javob boshqa so\'rovga tegishli'));
        return;
      }

      const pdu = received.subarray(7, total);
      if (!pdu.length) {
        finish(new Error("modbus: javob bo'sh"));
        return;
      }
      if ((pdu[0] & 0x80) !== 0) {
        finish(new Error(`modbus: ${exceptionText(pdu.length > 1 ? pdu[1] : 0)}`));
        return;
      }
      finish(null, pdu);
    });
  });
}

/**
 * FC5 — bitta g'altakni yoqadi/o'chiradi.
 * @param {object} options { host, unitId, coil, value, timeoutMs, signal }
 */
async function writeCoil(options) {
  const coil = Number.isInteger(options.coil) ? options.coil : 0;
  if (coil < 0 || coil > 65535) throw new Error(`modbus: coil raqami noto'g'ri (${coil})`);

  const pdu = Buffer.allocUnsafe(5);
  pdu.writeUInt8(0x05, 0);
  pdu.writeUInt16BE(coil, 1);
  pdu.writeUInt16BE(options.value ? 0xff00 : 0x0000, 3);

  const response = await request({ ...options, pdu });
  if (response[0] !== 0x05) throw new Error('modbus: javob funksiyasi mos emas');
}

/**
 * FC1 — bitta g'altak holatini o'qiydi. Tushunarsiz javobda `null`.
 * @param {object} options { host, unitId, coil, timeoutMs, signal }
 */
async function readCoil(options) {
  const coil = Number.isInteger(options.coil) ? options.coil : 0;
  if (coil < 0 || coil > 65535) return null;

  const pdu = Buffer.allocUnsafe(5);
  pdu.writeUInt8(0x01, 0);
  pdu.writeUInt16BE(coil, 1);
  pdu.writeUInt16BE(1, 3);

  const response = await request({ ...options, pdu });
  if (response[0] !== 0x01 || response.length < 3) return null;
  return (response[2] & 0x01) === 1;
}

module.exports = { writeCoil, readCoil, DEFAULT_PORT };
