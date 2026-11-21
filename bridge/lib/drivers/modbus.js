'use strict';

/**
 * MODBUS DRAYVERLARI: `modbus_tcp` (kengaytirilgan) va `modbus_rtu` (RS485, COM port).
 *
 * drivers/index.js dagi eski `modbus_tcp` ning o'rnini egallaydi (bir xil nom —
 * keyin ro'yxatga olingani yutadi). Eski sozlamalar (faqat host / unitId / coil /
 * channels) AYNAN avvalgidek ishlaydi: framing 'tcp', mode 'coil'.
 *
 * Qayerga yuboriladi (transport):
 *   modbus_tcp, framing 'tcp' — Modbus TCP (MBAP): sanoat platalari, TCP->RTU shlyuzlar
 *   modbus_tcp, framing 'rtu' — RTU kadrlari oddiy TCP orqali: "transparent" RS485↔Ethernet
 *                               konverterlar (USR-TCP232, Elfin EW11, ...) — `host` = konverter
 *   modbus_rtu                — RTU kadrlari USB-RS485 adapter (COM port) orqali
 *
 * Rele qanday yoqiladi (arzon Xitoy platalari har xil):
 *   mode 'coil'     — FC05: coil ga FF00 (yoq) / 0000 (o'chir); holat FC01 bilan o'qiladi.
 *   mode 'register' — FC06: registrga registerOn / registerOff yoziladi. Standart 0x0100 /
 *                     0x0200 — "Eletechsup / R4D3B16 / Modbus RTU relay" platalari:
 *                     0x0100 = rele ochiq (yoniq), 0x0200 = yopiq (o'chiq), registr = rele
 *                     raqami (1 dan). Holatni o'qish (FC03) ixtiyoriy: ko'p platalar
 *                     o'qishni bilmaydi, shuning uchun faqat `registerReadback: true` bo'lsa.
 *                     O'qilgan qiymat: registerOn -> yoniq, registerOff -> o'chiq; aks holda
 *                     0x0001 -> yoniq, 0x0000 -> o'chiq (shu platalar holatni 1/0 qaytaradi);
 *                     boshqa qiymat -> noma'lum (null).
 *
 * Manzillar:
 *   coil     — `config.coil` (yo'q bo'lsa `channel`); qo'shimcha kanallar (`config.channels`)
 *              coil raqami sifatida AYNAN ishlatiladi (eski modbusCoils bilan bir xil).
 *   register — `config.register` (yo'q bo'lsa `channel + 1`); qo'shimcha kanal -> kanal + 1.
 *
 * Navbat: bitta shinadagi (bitta COM port yoki bitta host:port) BARCHA stollar bitta
 * lockKey ga tushadi — buyruqlar hech qachon aralashmaydi. RTU da kadrlar orasida
 * ~30 ms tanaffus: arzon platalar ketma-ket kadrlarni "yutib" yubormasin.
 */

const { clampInt, delay } = require('../common');
const modbus = require('../modbus');

/** Register rejimi: standart "yoq" / "o'chir" qiymatlari */
const DEFAULT_REGISTER_ON = 0x0100;
const DEFAULT_REGISTER_OFF = 0x0200;

/** RTU: kadrlar orasidagi eng kam tanaffus (ms) */
const RTU_GAP_MS = 30;

const MAX_ADDRESS = 0xffff;

/** Bitta stolda ko'pi bilan shuncha kanal (asosiy + qo'shimchalar) */
const MAX_CHANNELS = 9;

/** RTU shina -> oxirgi so'rov tugagan vaqt (stollar orasidagi tanaffus uchun) */
const lastBusActivity = new Map();

/* ------------------------------------------------------------------ */
/*  Sozlamalarni o'qish                                                */
/* ------------------------------------------------------------------ */

/** Bo'sh qiymat (sozlama kiritilmagan) */
function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

/** Majburiy matn maydoni */
function requireText(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`${label} kiritilmagan`);
  return text;
}

/**
 * Butun son maydoni: 256, "256" yoki "0x0100". Bo'sh bo'lsa `fallback`; noto'g'ri yoki
 * chegaradan tashqari bo'lsa XATO — jimgina boshqa relega yozib yubormaslik uchun.
 */
function parseIntField(value, min, max, fallback, label) {
  if (isBlank(value)) return fallback;
  let num = Number.NaN;
  if (typeof value === 'number') num = value;
  else if (typeof value === 'string') {
    const text = value.trim();
    if (/^0x[0-9a-f]+$/i.test(text)) num = Number.parseInt(text.slice(2), 16);
    else if (/^\d+$/.test(text)) num = Number.parseInt(text, 10);
  }
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new Error(`modbus: "${label}" ${min}..${max} oralig'ida butun son bo'lishi kerak (${value})`);
  }
  return num;
}

/** 'coil' | 'register' (bo'sh — 'coil'); boshqa qiymat — xato */
function parseMode(value) {
  if (isBlank(value)) return 'coil';
  const mode = String(value).trim().toLowerCase();
  if (mode !== 'coil' && mode !== 'register') {
    throw new Error(`modbus: "mode" coil yoki register bo'lishi kerak (${value})`);
  }
  return mode;
}

/** 'tcp' | 'rtu' (bo'sh — 'tcp'); boshqa qiymat — xato */
function parseFraming(value) {
  if (isBlank(value)) return 'tcp';
  const framing = String(value).trim().toLowerCase();
  if (framing !== 'tcp' && framing !== 'rtu') {
    throw new Error(`modbus: "framing" tcp yoki rtu bo'lishi kerak (${value})`);
  }
  return framing;
}

/** RTU unitId: 1..247. 0 — umumiy (broadcast) manzil: plata javob bermaydi */
function rtuUnitId(value) {
  let unitId;
  try {
    unitId = parseIntField(value, 0, 247, 1, 'unitId');
  } catch {
    throw new Error(`modbus: "unitId" 1..247 oralig'ida bo'lishi kerak (${value})`);
  }
  if (unitId === 0) {
    throw new Error('modbus: RTU da unitId 0 — umumiy (broadcast) manzil, plata javob bermaydi; 1..247 kiriting');
  }
  return unitId;
}

/** Register rejimi qiymatlari: { on, off } */
function registerValues(config) {
  const on = parseIntField(config.registerOn, 0, 0xffff, DEFAULT_REGISTER_ON, 'registerOn');
  const off = parseIntField(config.registerOff, 0, 0xffff, DEFAULT_REGISTER_OFF, 'registerOff');
  if (on === off) throw new Error('modbus: "registerOn" va "registerOff" bir xil bo\'lmasligi kerak');
  return { on, off };
}

/**
 * Stolning Modbus manzillari: asosiy kanal DOIM birinchi, jami ≤ 9.
 *   coil     — config.coil ?? channel; qo'shimchalar AYNAN coil raqami
 *   register — config.register ?? channel + 1; qo'shimchalar kanal + 1
 */
function addressList(device, mode) {
  const config = device.config || {};
  const channel = Number.isInteger(device.channel) ? device.channel : 0;
  const offset = mode === 'register' ? 1 : 0;
  const field = mode === 'register' ? 'register' : 'coil';
  const base = parseIntField(config[field], 0, MAX_ADDRESS, channel + offset, field);
  if (base < 0 || base > MAX_ADDRESS) throw new Error(`modbus: kanal raqami noto'g'ri (${device.channel})`);

  const list = [base];
  for (const item of Array.isArray(config.channels) ? config.channels : []) {
    if (!Number.isInteger(item) || item < 0) continue;
    const address = item + offset;
    if (address <= MAX_ADDRESS && !list.includes(address)) list.push(address);
  }
  return list.slice(0, MAX_CHANNELS);
}

/**
 * FC03 bilan o'qilgan registr qiymatini rele holatiga aylantiradi:
 *   1) sozlamadagi registerOn / registerOff ga AYNAN teng bo'lsa — shu;
 *   2) aks holda 0x0001 = yoniq, 0x0000 = o'chiq (yozishda 0x0100/0x0200 qabul qilib,
 *      o'qishda holatni 1/0 qaytaradigan platalar);
 *   3) boshqa qiymat — noma'lum (null): "o'chiq" degani EMAS.
 */
function registerState(value, values) {
  if (!Number.isInteger(value)) return null;
  if (value === values.on) return true;
  if (value === values.off) return false;
  if (value === 1) return true;
  if (value === 0) return false;
  return null;
}

/** Rejim (xato chiqarmasdan): readback() hech qachon throw qilmasligi kerak */
function safeMode(config) {
  return config && String(config.mode || '').trim().toLowerCase() === 'register' ? 'register' : 'coil';
}

/** 0x0100 ko'rinishi (log uchun) */
function hex16(value) {
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ */
/*  Reja: qaysi transport, qaysi manzillar, qaysi qiymatlar            */
/* ------------------------------------------------------------------ */

function commonPlan(device, mode) {
  const config = device.config || {};
  return {
    mode,
    addresses: addressList(device, mode),
    values: mode === 'register' ? registerValues(config) : null,
    readRegisters: config.registerReadback === true,
  };
}

/** modbus_tcp: Modbus TCP (MBAP) yoki RTU-over-TCP */
function tcpPlan(device) {
  const config = device.config || {};
  const host = typeof device.host === 'string' ? device.host.trim() : '';
  if (!host) throw new Error("modbus: qurilma manzili (host) ko'rsatilmagan");
  const framing = parseFraming(config.framing);
  const mode = parseMode(config.mode);
  const rtu = framing === 'rtu';
  return {
    ...commonPlan(device, mode),
    rtu,
    // MBAP: eski xulq (0..247 ga qisqartirish) saqlanadi; RTU: qat'iy 1..247
    unitId: rtu ? rtuUnitId(config.unitId) : clampInt(config.unitId, 0, 247, 1),
    target: { host, framing },
    bus: tcpLockKey(device),
    label: `${rtu ? 'rtu/tcp' : 'tcp'} ${host}`,
  };
}

/** modbus_rtu: USB-RS485 adapter (COM port) */
function serialPlan(device) {
  const config = device.config || {};
  const path = requireText(config.serialPort, 'modbus_rtu uchun "serialPort"');
  const mode = parseMode(config.mode);
  return {
    ...commonPlan(device, mode),
    rtu: true,
    unitId: rtuUnitId(config.unitId),
    // baudRate / parity / stopBits ni serial.request() tekshiradi (xato — o'zbekcha)
    target: { serial: { path, baudRate: config.baudRate, parity: config.parity, stopBits: config.stopBits } },
    bus: serialLockKey(device),
    label: path,
  };
}

/** Modbus TCP va RTU-over-TCP: bitta host:port — bitta shina ("x.x.x.x" = "x.x.x.x:502") */
function tcpLockKey(device) {
  return `modbus:${modbus.hostKey(device.host)}`;
}

/** COM port — bitta RS485 shina: undagi BARCHA platalar (unitId lar) navbat bilan */
function serialLockKey(device) {
  return `serial:${String((device.config && device.config.serialPort) || '').trim().toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/*  Yozish va o'qish                                                   */
/* ------------------------------------------------------------------ */

/**
 * RTU tanaffusi. `between` — shu chaqiruv ichidagi keyingi kanal: doim RTU_GAP_MS.
 * Birinchi so'rovda — shinadagi oldingi so'rovdan (boshqa stol, o'qish) beri qancha
 * vaqt o'tganiga qarab qolgan qismi.
 */
async function busGap(plan, ctx, between) {
  if (!plan.rtu) return;
  let wait = 0;
  if (between) wait = RTU_GAP_MS;
  else if (lastBusActivity.has(plan.bus)) {
    wait = Math.min(RTU_GAP_MS, RTU_GAP_MS - (Date.now() - lastBusActivity.get(plan.bus)));
  }
  if (wait <= 0) return;
  if (typeof ctx.sleep === 'function') await ctx.sleep(wait);
  else await delay(wait);
}

function touchBus(plan) {
  if (plan.rtu) lastBusActivity.set(plan.bus, Date.now());
}

function requestBase(plan, ctx) {
  return { ...plan.target, unitId: plan.unitId, timeoutMs: ctx.timeoutMs, signal: ctx.signal };
}

/** Stolning BARCHA kanallariga KETMA-KET yozadi: bittasi xato bo'lsa — umumiy xato */
async function writeChannels(device, physical, ctx, plan) {
  const log = typeof ctx.log === 'function' ? ctx.log : () => {};
  const base = requestBase(plan, ctx);
  for (let index = 0; index < plan.addresses.length; index += 1) {
    const address = plan.addresses[index];
    // eslint-disable-next-line no-await-in-loop
    await busGap(plan, ctx, index > 0);
    try {
      if (plan.mode === 'coil') {
        log('debug', `stol #${device.tableNumber ?? device.tableId}: modbus ${plan.label} #${plan.unitId} coil ${address} <- ${physical ? 'ON' : 'OFF'}`);
        // eslint-disable-next-line no-await-in-loop
        await modbus.writeCoil({ ...base, coil: address, value: physical });
      } else {
        const value = physical ? plan.values.on : plan.values.off;
        log('debug', `stol #${device.tableNumber ?? device.tableId}: modbus ${plan.label} #${plan.unitId} register ${address} <- ${hex16(value)}`);
        // eslint-disable-next-line no-await-in-loop
        await modbus.writeRegister({ ...base, register: address, value });
      }
    } finally {
      touchBus(plan);
    }
  }
}

/**
 * Har kanalning FIZIK holati (o'qib bo'lmasa — null). Hech qachon throw qilmaydi.
 * Qurilma umuman javob bermasa (timeout / ulanish xatosi) qolgan kanallar so'ralmaydi —
 * o'lik plata shinani har kanal uchun timeout bilan band qilmasin.
 */
async function readChannels(ctx, plan) {
  if (plan.mode === 'register' && !plan.readRegisters) return plan.addresses.map(() => null);
  const base = requestBase(plan, ctx);
  const values = [];
  let reachable = true;
  for (let index = 0; index < plan.addresses.length; index += 1) {
    if (!reachable || (ctx.signal && ctx.signal.aborted)) {
      values.push(null);
      continue;
    }
    const address = plan.addresses[index];
    try {
      // eslint-disable-next-line no-await-in-loop
      await busGap(plan, ctx, index > 0);
      if (plan.mode === 'coil') {
        // eslint-disable-next-line no-await-in-loop
        values.push(await modbus.readCoil({ ...base, coil: address }));
      } else {
        // eslint-disable-next-line no-await-in-loop
        values.push(registerState(await modbus.readRegister({ ...base, register: address }), plan.values));
      }
    } catch (err) {
      values.push(null); // holatni o'qish majburiy emas
      if (!(err && err.deviceResponded)) reachable = false;
    } finally {
      touchBus(plan);
    }
  }
  return values;
}

/** Sozlama xato bo'lsa ham "har kanal uchun bitta qiymat" qoidasi buzilmasin */
function unknownValues(device) {
  const channels = new Set([device.channel]);
  const extra = device.config && Array.isArray(device.config.channels) ? device.config.channels : [];
  for (const item of extra) if (Number.isInteger(item) && item >= 0) channels.add(item);
  return Array.from({ length: Math.min(channels.size, MAX_CHANNELS) }, () => null);
}

/** coil rejimi — doim tekshiriladi; register — faqat `registerReadback: true` bo'lsa */
function readback(device) {
  const config = device.config || {};
  return safeMode(config) === 'register' ? config.registerReadback === true : true;
}

/* ------------------------------------------------------------------ */
/*  Drayverlar                                                         */
/* ------------------------------------------------------------------ */

const modbusTcp = {
  name: 'modbus_tcp',
  readback,
  // Ko'p platalar va konverterlar bir vaqtda faqat BITTA TCP ulanishni qabul qiladi
  lockKey: tcpLockKey,
  async write(device, physical, ctx) {
    await writeChannels(device, physical, ctx, tcpPlan(device));
  },
  async read(device, ctx) {
    let plan;
    try {
      plan = tcpPlan(device);
    } catch {
      return unknownValues(device);
    }
    return readChannels(ctx, plan);
  },
};

const modbusRtu = {
  name: 'modbus_rtu',
  readback,
  lockKey: serialLockKey,
  async write(device, physical, ctx) {
    await writeChannels(device, physical, ctx, serialPlan(device));
  },
  async read(device, ctx) {
    let plan;
    try {
      plan = serialPlan(device);
    } catch {
      return unknownValues(device);
    }
    return readChannels(ctx, plan);
  },
};

module.exports = {
  definitions: [modbusTcp, modbusRtu],
  registerState,
  DEFAULT_REGISTER_ON,
  DEFAULT_REGISTER_OFF,
  RTU_GAP_MS,
};
