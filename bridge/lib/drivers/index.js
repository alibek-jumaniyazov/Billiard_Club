'use strict';

/**
 * DRAYVERLAR REYESTRI — har bir rele turi BIR XIL shartnoma bilan ishlaydi:
 *
 *   {
 *     name:      'shelly_gen1',
 *     readback(device)              -> boolean  holatni o'qib tasdiqlash mumkinmi
 *     lockKey(device)               -> string|null
 *         Bir vaqtda faqat BITTA buyruq yuboriladigan kalit: bitta plata, bitta
 *         COM port, bitta Tuya qurilmasi. Ko'p kanalli plata bir nechta stolga
 *         xizmat qilganda buyruqlar navbat bilan ketadi (ko'p platalar bir vaqtda
 *         faqat bitta TCP ulanishni qabul qiladi). null — cheklov yo'q.
 *     write(device, physical, ctx)  FIZIK holatni stolning BARCHA kanallariga yozadi;
 *                                   xato bo'lsa throw qiladi
 *     read(device, ctx, options)    -> Array<boolean|null>  har kanalning FIZIK holati
 *                                   (o'qib bo'lmagan kanal — null)
 *   }
 *
 * `device` — stol yozuvi: { tableId, tableNumber, driver, host, channel, inverted,
 * auth, onUrl, offUrl, config }. `ctx` — { timeoutMs, signal, log, sleep, mqtt() }.
 * Mantiqiy -> fizik o'girish (inverted) chaqiruvchida (control.js) bajariladi.
 */

const { clampInt, parseHex, parseStateValue, toBytes } = require('../common');
const httpDevice = require('../http-device');
const modbus = require('../modbus');
const rawtcp = require('../rawtcp');
const serial = require('../serial');

const REGISTRY = new Map();

/** Drayverni ro'yxatga qo'shadi (yangi drayver fayllari shu orqali ulanadi) */
function register(definition) {
  if (!definition || typeof definition.name !== 'string') throw new Error('drayver nomi yo‘q');
  for (const fn of ['readback', 'lockKey', 'write', 'read']) {
    if (typeof definition[fn] !== 'function') throw new Error(`${definition.name}: ${fn}() yo‘q`);
  }
  REGISTRY.set(definition.name, definition);
}

/** Drayverni nomi bo'yicha oladi; noma'lum bo'lsa null */
function getDriver(name) {
  return REGISTRY.get(name) || null;
}

/** Ro'yxatdagi barcha drayver nomlari */
function driverNames() {
  return Array.from(REGISTRY.keys());
}

/* ------------------------------------------------------------------ */
/*  Umumiy yordamchilar                                                */
/* ------------------------------------------------------------------ */

/** Stolning barcha kanallari: asosiy `channel` DOIM birinchi, jami ≤ 9 */
function deviceChannels(device, max = 32) {
  const base = Number.isInteger(device.channel) ? device.channel : 0;
  const list = [base];
  const extra = device.config && Array.isArray(device.config.channels) ? device.config.channels : [];
  for (const item of extra) {
    if (Number.isInteger(item) && item >= 0 && item <= max && !list.includes(item)) list.push(item);
  }
  return list.slice(0, 9);
}

/** Majburiy matn maydoni */
function requireText(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`${label} kiritilmagan`);
  return text;
}

/** Mavzuda joker belgi bormi (`#` / `+`) */
function hasWildcard(topic) {
  return topic.includes('#') || topic.includes('+');
}

/* ------------------------------------------------------------------ */
/*  HTTP oilasi: Shelly, Tasmota, ESPHome, Home Assistant, umumiy HTTP */
/* ------------------------------------------------------------------ */

/** Kanal ro'yxati qo'llanadigan HTTP drayverlar (qolganlari bitta obyektni boshqaradi) */
const HTTP_CHANNEL_DRIVERS = new Set(['shelly_gen1', 'shelly_gen2', 'tasmota', 'http']);
const HTTP_READBACK_DRIVERS = new Set(['shelly_gen1', 'shelly_gen2', 'tasmota', 'esphome', 'home_assistant']);

function httpChannels(device) {
  return HTTP_CHANNEL_DRIVERS.has(device.driver)
    ? deviceChannels(device)
    : [Number.isInteger(device.channel) ? device.channel : 0];
}

for (const name of httpDevice.HTTP_DRIVERS) {
  register({
    name,
    readback: (device) => HTTP_READBACK_DRIVERS.has(device.driver),
    // Bitta qurilmaga (masalan 4 kanalli Shelly Pro) buyruqlar navbat bilan
    lockKey: (device) => (device.host ? `http:${String(device.host).toLowerCase()}` : null),
    async write(device, physical, ctx) {
      for (const channel of httpChannels(device)) {
        // Kanallar KETMA-KET: bittasi xato bo'lsa umumiy xato hisoblanadi
        // eslint-disable-next-line no-await-in-loop
        await httpDevice.apply(device, physical, channel, ctx);
      }
    },
    async read(device, ctx) {
      const values = [];
      for (const channel of httpChannels(device)) {
        // eslint-disable-next-line no-await-in-loop
        values.push(await httpDevice.read(device, channel, ctx));
      }
      return values;
    },
  });
}

/* ------------------------------------------------------------------ */
/*  MQTT (Zigbee2MQTT, Tasmota/Shelly MQTT)                            */
/* ------------------------------------------------------------------ */

/** MQTT: buyruqdan keyin holat xabarini shuncha kutamiz (eski qiymat "haqiqiy" bo'lib ketmasin) */
const MQTT_STATE_WAIT_MS = 600;

register({
  name: 'mqtt',
  readback: (device) => Boolean(device.config?.stateTopic?.trim()),
  lockKey: () => null, // broker o'zi navbatlaydi
  async write(device, physical, ctx) {
    const config = device.config || {};
    const client = ctx.mqtt();
    const topic = requireText(config.topic, 'mqtt uchun "topic"');
    const payload = physical
      ? config.onPayload === undefined || config.onPayload === null ? 'ON' : String(config.onPayload)
      : config.offPayload === undefined || config.offPayload === null ? 'OFF' : String(config.offPayload);
    ctx.log('debug', `stol #${device.tableNumber ?? device.tableId}: mqtt ${topic} <- ${payload}`);
    await client.publish(topic, payload, {
      qos: config.qos === 1 ? 1 : 0,
      retain: config.retain === true,
      timeoutMs: ctx.timeoutMs,
    });
  },
  async read(device, ctx, options = {}) {
    const config = device.config || {};
    const topic = typeof config.stateTopic === 'string' ? config.stateTopic.trim() : '';
    if (!topic || hasWildcard(topic)) return [];
    let client;
    try {
      client = ctx.mqtt();
    } catch {
      return [];
    }
    const onValue = config.stateOnValue || 'ON';
    try {
      if (options.since) {
        // Buyruqdan KEYIN kelgan xabarnigina qabul qilamiz
        const payload = await client.waitMessage(topic, options.since, MQTT_STATE_WAIT_MS);
        return [parseStateValue(payload, onValue)];
      }
      return [parseStateValue(client.lastMessage(topic, ctx.mqttStateTtlMs ?? 60_000), onValue)];
    } catch {
      return [];
    }
  },
});

/* ------------------------------------------------------------------ */
/*  Modbus TCP                                                         */
/* ------------------------------------------------------------------ */

/** Modbus g'altaklari: `config.coil` berilmasa `channel` ishlatiladi */
function modbusCoils(device) {
  const config = device.config || {};
  const base = Number.isInteger(config.coil) ? config.coil : Number.isInteger(device.channel) ? device.channel : 0;
  const list = [base];
  for (const item of Array.isArray(config.channels) ? config.channels : []) {
    if (Number.isInteger(item) && item >= 0 && item <= 65535 && !list.includes(item)) list.push(item);
  }
  return list.slice(0, 9);
}

register({
  name: 'modbus_tcp',
  readback: () => true,
  // Ko'p platalar bir vaqtda faqat BITTA TCP ulanishni qabul qiladi
  lockKey: (device) => `modbus:${String(device.host || '').toLowerCase()}`,
  async write(device, physical, ctx) {
    const unitId = clampInt(device.config?.unitId, 0, 247, 1);
    for (const coil of modbusCoils(device)) {
      // eslint-disable-next-line no-await-in-loop
      await modbus.writeCoil({
        host: device.host, unitId, coil, value: physical, timeoutMs: ctx.timeoutMs, signal: ctx.signal,
      });
    }
  },
  async read(device, ctx) {
    const unitId = clampInt(device.config?.unitId, 0, 247, 1);
    const values = [];
    for (const coil of modbusCoils(device)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        values.push(await modbus.readCoil({
          host: device.host, unitId, coil, timeoutMs: ctx.timeoutMs, signal: ctx.signal,
        }));
      } catch {
        values.push(null); // holatni o'qish majburiy emas
      }
    }
    return values;
  },
});

/* ------------------------------------------------------------------ */
/*  Xom TCP va USB rele (COM port)                                     */
/* ------------------------------------------------------------------ */

register({
  name: 'tcp',
  readback: () => false,
  lockKey: (device) => `tcp:${String(device.host || '').toLowerCase()}`,
  async write(device, physical, ctx) {
    const config = device.config || {};
    const data = physical
      ? toBytes(config.onHex, config.onAscii, 'onHex/onAscii')
      : toBytes(config.offHex, config.offAscii, 'offHex/offAscii');
    const expect = config.expectHex ? parseHex(config.expectHex) : null;
    await rawtcp.send({ host: device.host, data, expect, timeoutMs: ctx.timeoutMs, signal: ctx.signal });
  },
  async read() {
    return [];
  },
});

/**
 * LC Technology USB rele (CH340, "LCUS-1/2/4/8"): buyruq 4 bayt —
 * A0 <kanal 1..8> <01 yoqish | 00 o'chirish> <yig'indi (A0+kanal+holat) & FF>.
 * `channel` 0 dan sanaladi, platadagi raqam esa 1 dan — shuning uchun +1.
 * Foydalanuvchi hex kiritishi shart emas: "preset: lcus" yetarli.
 */
function lcusFrame(channel, on) {
  const relay = channel + 1;
  const state = on ? 1 : 0;
  return Buffer.from([0xa0, relay, state, (0xa0 + relay + state) & 0xff]);
}

register({
  name: 'serial',
  readback: () => false,
  lockKey: (device) => `serial:${String(device.config?.serialPort || '').toLowerCase()}`,
  async write(device, physical, ctx) {
    const config = device.config || {};
    const portPath = requireText(config.serialPort, 'serial uchun "serialPort"');
    if (config.preset === 'lcus') {
      // Ko'p kanalli plata: stolning har bir kanali alohida 4 baytli buyruq
      for (const channel of deviceChannels(device, 7)) {
        // eslint-disable-next-line no-await-in-loop
        await serial.send({
          path: portPath, baudRate: config.baudRate || 9600, data: lcusFrame(channel, physical), timeoutMs: ctx.timeoutMs,
        });
        // Arzon platalar ketma-ket buyruqlarni yutib yubormasligi uchun qisqa tanaffus
        // eslint-disable-next-line no-await-in-loop
        if (ctx.sleep) await ctx.sleep(30);
      }
      return;
    }
    const data = physical
      ? toBytes(config.onHex, config.onAscii, 'onHex/onAscii')
      : toBytes(config.offHex, config.offAscii, 'offHex/offAscii');
    await serial.send({ path: portPath, baudRate: config.baudRate, data, timeoutMs: ctx.timeoutMs });
  },
  async read() {
    return [];
  },
});

/* ------------------------------------------------------------------ */
/*  Alohida fayldagi drayverlar                                        */
/* ------------------------------------------------------------------ */

/**
 * Yangi rele turlari o'z fayllarida: lib/drivers/<nom>.js. Har biri bitta ta'rif
 * yoki `{ definitions: [...] }` eksport qiladi. Shu yerda ro'yxatga olinadi —
 * keyin kelgani bir xil nomdagi eskisining o'rnini egallaydi (masalan
 * drivers/modbus.js dagi kengaytirilgan modbus_tcp).
 * Ixtiyoriy native modullar (serialport, node-hid) drayver ICHIDA kerak bo'lganda
 * yuklanadi — bu yerda emas, aks holda bitta yo'q paket hamma drayverni to'xtatardi.
 */
for (const file of ['./tuya', './sonoff', './modbus', './usb-hid']) {
  let mod = null;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    mod = require(file);
  } catch (err) {
    // Faqat drayver faylining O'ZI yo'q bo'lsa jim o'tamiz ("Cannot find module './tuya'").
    // Fayl bor-u, ichida boshqa modul topilmasa — bu dasturchi xatosi, yashirilmaydi.
    const missingSelf = err && err.code === 'MODULE_NOT_FOUND' && String(err.message).includes(`'${file}'`);
    if (!missingSelf) throw err;
  }
  if (mod) for (const definition of Array.isArray(mod.definitions) ? mod.definitions : [mod]) register(definition);
}

module.exports = {
  register,
  getDriver,
  driverNames,
  deviceChannels,
  modbusCoils,
  requireText,
  hasWildcard,
  lcusFrame,
};
