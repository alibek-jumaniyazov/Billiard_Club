#!/usr/bin/env node
'use strict';

/**
 * Billiard Club — CHIROQ BOSHQARUVI BRIDGE AGENTI (v2)
 *
 * Klubning lokal tarmog'ida (NAT ortida) ishlaydi. Bulutdagi serverga O'ZI chiqadi
 * (outbound HTTPS) — port forwarding, statik IP yoki router sozlash KERAK EMAS.
 *
 * Ish tartibi:
 *   1) GET  {SERVER_URL}/api/bridge/state?v={lastVersion}  — uzun-polling (server 25s ushlaydi)
 *   2) Kerakli holat (desired) o'zgargan qurilmalarga buyruq yuboradi
 *      (bir vaqtda ≤8 ta, har biriga 3 martagacha urinish)
 *   3) Majburiy sinxronizatsiyada (forceSyncMs) qurilmadan HAQIQIY holat o'qiladi;
 *      mos kelmasa darhol tuzatiladi (drift)
 *   4) POST {SERVER_URL}/api/bridge/report      — natijalar (actual, attempts, latencyMs)
 *   5) `tasks` da "discover" kelsa — LAN skaneri ishga tushadi va natija
 *      POST {SERVER_URL}/api/bridge/discovered  ga yuboriladi
 *   6) Tarmoq xatosida oxirgi ma'lum holat DISK KESHIDAN qayta qo'llanadi
 *      (internet yo'q bo'lsa ham klub qorong'ida qolmasin)
 *
 * Qo'llab-quvvatlanadigan drayverlar:
 *   shelly_gen1, shelly_gen2 (digest auth), tasmota, esphome, home_assistant, http,
 *   mqtt (o'z minimal klientimiz), modbus_tcp, tcp (xom baytlar), serial (USB rele).
 *
 * npm bog'liqligi YO'Q (faqat USB rele uchun ixtiyoriy `serialport`).
 * Jarayon hech qachon crash bo'lmasligi kerak — barcha xatolar ushlanadi va loglanadi.
 * Parol/token HECH QACHON logga chiqmaydi.
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  errText,
  clampInt,
  maskToken,
  parseHex,
  parseStateValue,
  toBytes,
  fetchWithTimeout,
} = require('./lib/common');
const httpDevice = require('./lib/http-device');
const modbus = require('./lib/modbus');
const rawtcp = require('./lib/rawtcp');
const serial = require('./lib/serial');
const { MqttClient } = require('./lib/mqtt');
const { discover } = require('./lib/discover');

/* ------------------------------------------------------------------ */
/*  Konstantalar                                                       */
/* ------------------------------------------------------------------ */

/** Agent versiyasi — serverga /api/bridge/report da yuboriladi */
const AGENT_VERSION = '2.0.0';

/** Uzun-polling uchun timeout — server javobni 25s ushlab turadi, biroz zaxira qo'shamiz */
const POLL_TIMEOUT_MS = 30000;

/** Bitta qurilmaga buyruq yuborishga urinishlar oralig'i (ms) — jami 3 urinish */
const RETRY_DELAYS_MS = [0, 400, 1200];

/** Bir vaqtda nechta qurilma bilan ishlanadi */
const MAX_PARALLEL = 8;

/** Tarmoq xatosida kutish bosqichlari (ms) */
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];

/** Kanal ro'yxati (config.channels) qo'llanadigan drayverlar */
const CHANNEL_DRIVERS = new Set(['shelly_gen1', 'shelly_gen2', 'tasmota', 'http', 'modbus_tcp']);

/**
 * MQTT: buyruq yuborilgandan keyin holat xabarini shuncha kutamiz.
 * Qurilma javobini kutmasdan o'qisak, brokerdagi ESKI qiymat "haqiqiy holat"
 * bo'lib serverga ketadi va panelda soxta "drift" ko'rinadi.
 */
const MQTT_STATE_WAIT_MS = 600;

/** Bir xil taskni qayta bajarmaslik uchun eslab qolinadigan maksimal task soni */
const MAX_DONE_TASKS = 200;

/**
 * Bitta hisobotdagi natijalarning eng ko'p soni.
 * Server DTO si `@ArrayMaxSize(200)` bilan cheklangan — undan katta ro'yxat
 * BUTUNLAY rad etilardi (400), ya'ni hamma natija yo'qolardi. Shuning uchun
 * hisobot bo'laklarga bo'lib yuboriladi.
 */
const MAX_REPORT_ITEMS = 200;

/* ------------------------------------------------------------------ */
/*  Sozlamalar (.env yoki muhit o'zgaruvchilari)                        */
/* ------------------------------------------------------------------ */

/**
 * .env faylini o'qiydi (dotenv paketisiz, o'z parserimiz).
 * Qo'llab-quvvatlanadi: izohlar (#), bo'sh qatorlar, "export KEY=..." prefiksi,
 * qiymat atrofidagi bitta yoki qo'sh qo'shtirnoq.
 */
function loadEnvFile(filePath) {
  const result = {};
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return result; // fayl yo'q — muammo emas, muhit o'zgaruvchilaridan olamiz
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();

    // Qo'shtirnoqlarni olib tashlaymiz (ichida izoh belgisi bo'lsa ham buzilmasin)
    if (
      value.length >= 2 &&
      ((value[0] === '"' && value.endsWith('"')) || (value[0] === "'" && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

/** Butun son o'qish — noto'g'ri qiymatda standart qiymat qaytadi */
function readInt(value, fallback, min) {
  const num = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(num) || num < (min ?? 1)) return fallback;
  return num;
}

/** Bayroq o'qish: 1 / true / yes / on — yoqilgan */
function readFlag(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

/** URL dan faqat host nomini oladi (marshrutni aniqlash uchun kerak) */
function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Sozlamalarni yig'adi: muhit o'zgaruvchilari .env dan USTUN turadi */
function buildConfig() {
  const envFile = loadEnvFile(path.join(__dirname, '.env'));
  const pick = (key) =>
    process.env[key] !== undefined && process.env[key] !== '' ? process.env[key] : envFile[key];

  const serverUrlRaw = String(pick('SERVER_URL') || '').trim();
  const token = String(pick('BRIDGE_TOKEN') || '').trim();
  const logLevel =
    String(pick('LOG_LEVEL') || 'info').trim().toLowerCase() === 'debug' ? 'debug' : 'info';
  const stateFile = String(pick('STATE_FILE') || '').trim() || path.join(__dirname, 'state.json');

  const serverUrl = serverUrlRaw.replace(/\/+$/, ''); // oxiridagi "/" larni kesamiz

  return {
    serverUrl,
    serverHost: hostOf(serverUrl), // qidiruvda to'g'ri interfeysni tanlash uchun
    token,
    forceSyncMs: readInt(pick('FORCE_SYNC_MS'), 60000, 5000),
    requestTimeoutMs: readInt(pick('REQUEST_TIMEOUT_MS'), 5000, 500),
    deviceTimeoutMs: readInt(pick('DEVICE_TIMEOUT_MS'), 3000, 500),
    logLevel,
    stateFile,

    // Diskdagi keshga qurilma parollarini YOZISH (standart holatda o'chirilgan)
    cacheSecrets: readFlag(pick('CACHE_SECRETS')),

    // MQTT (parol serverga YUBORILMAYDI — faqat shu faylda qoladi)
    mqttUrl: String(pick('MQTT_URL') || '').trim(),
    mqttUser: String(pick('MQTT_USER') || '').trim(),
    mqttPass: String(pick('MQTT_PASS') || ''),
    mqttClientId: String(pick('MQTT_CLIENT_ID') || '').trim(),
    mqttKeepaliveSec: readInt(pick('MQTT_KEEPALIVE_SEC'), 30, 10),
    // mqtts:// uchun: standart holatda sertifikat TEKSHIRILADI (lib/mqtt.js _tlsOptions)
    mqttCaFile: String(pick('MQTT_CA') || '').trim(),
    mqttTlsInsecure: ['1', 'true', 'yes'].includes(String(pick('MQTT_TLS_INSECURE') || '').trim().toLowerCase()),

    // Qurilma qidirish (discover)
    subnet: String(pick('SUBNET') || '').trim(),
    discoverTimeoutMs: readInt(pick('DISCOVER_TIMEOUT_MS'), 700, 200),
    discoverParallel: readInt(pick('DISCOVER_PARALLEL'), 32, 1),
  };
}

const cfg = buildConfig();

/* ------------------------------------------------------------------ */
/*  Loglash                                                            */
/* ------------------------------------------------------------------ */

/** Mahalliy vaqt belgisi: 2026-08-03 18:30:05 */
function ts() {
  const d = new Date();
  const p = (n, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

function log(level, message) {
  if (level === 'debug' && cfg.logLevel !== 'debug') return;
  const line = `[${ts()}] [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line);
  else console.log(line);
}

/* ------------------------------------------------------------------ */
/*  To'xtatish (SIGINT / SIGTERM) va kutish                            */
/* ------------------------------------------------------------------ */

let stopping = false;

/** Barcha faol so'rovlar shu signal orqali uziladi */
const shutdownController = new AbortController();

/** Kutayotgan sleep() lar — to'xtatishda darhol uyg'otamiz */
const sleepers = new Set();

function sleep(ms) {
  if (stopping) return Promise.resolve();
  return new Promise((resolve) => {
    const entry = {
      timer: setTimeout(() => {
        sleepers.delete(entry);
        resolve();
      }, ms),
      resolve,
    };
    sleepers.add(entry);
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log('info', `${signal} qabul qilindi — agent to'xtatilmoqda...`);

  for (const entry of sleepers) {
    clearTimeout(entry.timer);
    entry.resolve();
  }
  sleepers.clear();

  try {
    shutdownController.abort();
  } catch {
    /* e'tiborsiz */
  }
  if (mqttClient) {
    try {
      mqttClient.close();
    } catch {
      /* e'tiborsiz */
    }
  }
  try {
    serial.closeAll();
  } catch {
    /* e'tiborsiz */
  }

  // Sikl toza yakunlanishi uchun qisqa muhlat beramiz
  setTimeout(() => {
    log('info', "Agent to'xtadi.");
    process.exit(0);
  }, 300).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Jarayon HECH QACHON crash bo'lmasin
process.on('unhandledRejection', (reason) => {
  log('error', `Ushlanmagan promise xatosi: ${errText(reason)}`);
});
process.on('uncaughtException', (err) => {
  log('error', `Ushlanmagan istisno: ${errText(err)}`);
});

/* ------------------------------------------------------------------ */
/*  Umumiy holat                                                       */
/* ------------------------------------------------------------------ */

/** Oxirgi MUVAFFAQIYATLI qo'llangan mantiqiy holat: tableId -> boolean */
const appliedState = new Map();

/** Oxirgi majburiy (to'liq) sinxronizatsiya vaqti */
let lastForceSyncAt = 0;

/** Serverdagi ro'yxat versiyasi (uzun-polling uchun) */
let lastVersion = '';

/** Serverdan kelgan forceSyncMs (kelmasa .env dagi qiymat ishlatiladi) */
let forceSyncMs = cfg.forceSyncMs;

/** Serverdagi "holatni tekshirish" sozlamasi (klub bo'yicha) */
let serverVerify = false;

/** Diskdagi kesh (state.json) — internet yo'qda shu holat qo'llanadi */
let cachedState = null;

/** MQTT klienti (faqat kerak bo'lganda yaratiladi) */
let mqttClient = null;
/** MQTT ni ishga tushirib bo'lmagan bo'lsa — sabab (takror urinmaymiz) */
let mqttInitError = null;

/** Bajarilgan tasklar (qayta bajarmaslik uchun) */
const doneTasks = new Set();
/** Bajarilishini kutayotgan tasklar (skan ketayotganda yo'qolib ketmasin) */
const taskQueue = [];
/** Bir vaqtda faqat bitta skan */
let discoverRunning = false;
/** Hozir bajarilayotgan task id si (server tasdiq kelgunicha uni qayta yuborishi mumkin) */
let runningTaskId = null;
/**
 * Skan bajarilgan, lekin serverga YETKAZILMAGAN natija: `{ taskId, devices, subnet }`.
 * Server bunday taskni 60 soniyadan keyin qayta beradi — o'shanda butun tarmoqni
 * qaytadan skanerlamasdan shu tayyor natijani yuboramiz.
 */
let unsentDiscover = null;

/** Drayverlarga beriladigan kontekst */
function driverCtx() {
  return { timeoutMs: cfg.deviceTimeoutMs, signal: shutdownController.signal, log };
}

/* ------------------------------------------------------------------ */
/*  Server bilan aloqa                                                 */
/* ------------------------------------------------------------------ */

/** Uzun-polling: kerakli holatni oladi */
async function fetchState(version) {
  const url = `${cfg.serverUrl}/api/bridge/state?v=${encodeURIComponent(version || '')}`;

  const res = await fetchWithTimeout(
    url,
    { method: 'GET', headers: { 'X-Bridge-Token': cfg.token, Accept: 'application/json' } },
    POLL_TIMEOUT_MS,
    shutdownController.signal,
  );

  if (res.status === 401 || res.status === 403) {
    throw new Error("BRIDGE_TOKEN noto'g'ri yoki bekor qilingan (401/403)");
  }
  if (!res.ok) {
    throw new Error(`/api/bridge/state javobi: HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!json || json.success !== true || !json.data) {
    throw new Error('/api/bridge/state javob formati kutilganidek emas');
  }
  return json.data;
}

/** Natijalarni serverga yuboradi — xatosi asosiy siklni to'xtatmaydi */
async function sendReport(results) {
  if (!results.length || stopping) return;

  const payload = results.map((item) => ({
    tableId: item.tableId,
    ok: item.ok,
    on: item.on,
    actual: item.actual,
    attempts: clampInt(item.attempts, 0, 10, 0),
    latencyMs: clampInt(item.latencyMs, 0, 60000, 0),
    error: item.error,
  }));

  // Server bir so'rovda 200 tagacha natija qabul qiladi — kattasi bo'laklanadi
  for (let offset = 0; offset < payload.length; offset += MAX_REPORT_ITEMS) {
    if (stopping) return;
    const chunk = payload.slice(offset, offset + MAX_REPORT_ITEMS);

    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetchWithTimeout(
        `${cfg.serverUrl}/api/bridge/report`,
        {
          method: 'POST',
          headers: {
            'X-Bridge-Token': cfg.token,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ agentVersion: AGENT_VERSION, results: chunk }),
        },
        cfg.requestTimeoutMs,
        shutdownController.signal,
      );

      if (!res.ok) {
        log('error', `Hisobot yuborilmadi: HTTP ${res.status}`);
        // Token bekor qilingan bo'lsa qolgan bo'laklar ham o'tmaydi — to'xtaymiz;
        // boshqa xatolarda esa QOLGAN bo'laklar yuboriladi (bir stolning xatosi
        // tufayli boshqa stollarning holati eskirib qolmasin)
        if (res.status === 401 || res.status === 403) return;
        continue;
      }
      log('debug', `Hisobot yuborildi: ${chunk.length} ta natija`);
    } catch (err) {
      log('error', `Hisobot yuborishda xato: ${errText(err)}`);
      continue;
    }
  }
}

/**
 * Topilgan qurilmalar ro'yxatini serverga yuboradi.
 * `taskId` — server qaysi vazifa yopilganini bilishi uchun (kutiladi),
 * `subnet` — panelda qaysi tarmoq skanerlangani ko'rinishi uchun.
 *
 * @returns {Promise<boolean>} `true` — server natijani QABUL QILDI. Chaqiruvchi
 *   shu javobga qarab taskni "bajarilgan" deb belgilaydi: server vazifani natija
 *   kelmaguncha navbatda ushlab turadi va 60 soniyadan keyin QAYTA beradi, shuning
 *   uchun yuborilmagan natijani "bajarildi" deb yopib qo'ysak qidiruv butunlay
 *   yo'qolardi.
 */
async function sendDiscovered(taskId, devices, subnet) {
  if (stopping) return false;

  try {
    const res = await fetchWithTimeout(
      `${cfg.serverUrl}/api/bridge/discovered`,
      {
        method: 'POST',
        headers: {
          'X-Bridge-Token': cfg.token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ taskId, ...(subnet ? { subnet } : {}), devices }),
      },
      cfg.requestTimeoutMs,
      shutdownController.signal,
    );

    if (!res.ok) {
      log('error', `Qidiruv natijasi yuborilmadi: HTTP ${res.status}`);
      return false;
    }
    log('info', `Qidiruv natijasi serverga yuborildi (${devices.length} ta qurilma)`);
    return true;
  } catch (err) {
    log('error', `Qidiruv natijasini yuborishda xato: ${errText(err)}`);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Disk keshi (state.json)                                            */
/* ------------------------------------------------------------------ */

/**
 * Qurilma yozuvidan parol/tokenni olib tashlaydi (diskka yozishdan oldin).
 * `authOmitted` belgisi keshdan tiklashda "bu qurilmani parolsiz qo'llab bo'lmaydi"
 * deganini bildiradi.
 */
function stripAuth(device) {
  if (!device || device.auth === null || device.auth === undefined || device.auth === '') {
    return device;
  }
  const copy = { ...device, auth: null, authOmitted: true };
  return copy;
}

/**
 * Holatni diskka XAVFSIZ yozadi (vaqtinchalik fayl orqali almashtirish).
 * Windows da fayl rejimi (0600) e'tiborga olinmaydi, shuning uchun POSIX da
 * yakuniy faylga ham `chmod 0600` qo'yiladi. Tmp fayl 'wx' bilan yaratiladi —
 * begona jarayon oldindan yaratib qo'ygan fayl (yoki simvolik havola) ga yozib
 * yubormaymiz.
 */
function writeStateFile(data) {
  const tmp = `${cfg.stateFile}.tmp`;
  let fd = null;

  try {
    try {
      fs.unlinkSync(tmp); // eski/yetim tmp fayl qolgan bo'lsa
    } catch {
      /* fayl yo'q — muammo emas */
    }
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(data));
    fs.closeSync(fd);
    fd = null;

    fs.renameSync(tmp, cfg.stateFile);
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(cfg.stateFile, 0o600);
      } catch {
        /* fayl tizimi rejimni qo'llamasa — e'tiborsiz */
      }
    }
    log('debug', `Holat keshi saqlandi: ${cfg.stateFile}`);
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* e'tiborsiz */
      }
    }
    log('debug', `Holat keshini saqlab bo'lmadi: ${errText(err)}`);
  }
}

/**
 * Oxirgi holatni diskka yozadi.
 * DIQQAT: qurilma parollari (`auth`) standart holatda DISKKA YOZILMAYDI —
 * .env da `CACHE_SECRETS=1` bo'lsagina saqlanadi. Xotiradagi nusxa esa doim
 * to'liq bo'ladi (aloqa uzilganda parolli qurilmalar ham boshqariladi).
 */
function saveCache(version, devices) {
  const data = {
    version,
    savedAt: new Date().toISOString(),
    forceSyncMs,
    verify: serverVerify,
    devices,
  };
  cachedState = data;

  const onDisk = cfg.cacheSecrets
    ? data
    : { ...data, secrets: false, devices: devices.map(stripAuth) };
  writeStateFile(onDisk);
}

/** Diskdagi keshni o'qiydi (agent qayta ishga tushganda) */
function loadCache() {
  try {
    const raw = fs.readFileSync(cfg.stateFile, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.devices)) return null;

    if (Number.isFinite(data.forceSyncMs) && data.forceSyncMs >= 5000) forceSyncMs = data.forceSyncMs;
    if (typeof data.verify === 'boolean') serverVerify = data.verify;
    return data;
  } catch {
    return null; // kesh yo'q — birinchi ishga tushish
  }
}

/* ------------------------------------------------------------------ */
/*  Drayverlarni tanlash                                               */
/* ------------------------------------------------------------------ */

/** MQTT klientini (bir marta) yaratadi */
function ensureMqtt() {
  if (mqttClient) return mqttClient;
  if (mqttInitError) throw mqttInitError;

  if (!cfg.mqttUrl) {
    mqttInitError = new Error("mqtt drayveri uchun .env da MQTT_URL sozlanmagan");
    throw mqttInitError;
  }
  try {
    mqttClient = new MqttClient({
      url: cfg.mqttUrl,
      username: cfg.mqttUser,
      password: cfg.mqttPass,
      clientId: cfg.mqttClientId,
      keepaliveSec: cfg.mqttKeepaliveSec,
      caFile: cfg.mqttCaFile,
      tlsInsecure: cfg.mqttTlsInsecure,
      log,
    });
    mqttClient.start();
    log('info', `MQTT: ulanish boshlandi (${mqttClient.address})`);
    return mqttClient;
  } catch (err) {
    mqttInitError = new Error(`mqtt: ${errText(err)}`);
    throw mqttInitError;
  }
}

/** Stolning barcha kanallari: asosiy `channel` DOIM birinchi */
function deviceChannels(device) {
  const base = Number.isInteger(device.channel) ? device.channel : 0;
  const list = [base];
  const extra = device.config && Array.isArray(device.config.channels) ? device.config.channels : [];

  for (const item of extra) {
    if (Number.isInteger(item) && item >= 0 && item <= 32 && !list.includes(item)) list.push(item);
  }
  return list.slice(0, 9);
}

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

/** Majburiy matn maydonini oladi */
function requireText(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`${label} kiritilmagan`);
  return text;
}

/**
 * Bitta qurilmaga FIZIK holatni yuboradi. Xato bo'lsa throw qiladi.
 * (Mantiqiy -> fizik o'girish chaqiruvchida bajariladi.)
 */
async function writeDevice(device, physical) {
  const config = device.config || {};
  const ctx = driverCtx();

  if (httpDevice.HTTP_DRIVERS.has(device.driver)) {
    const channels = CHANNEL_DRIVERS.has(device.driver) ? deviceChannels(device) : [device.channel || 0];
    for (const channel of channels) {
      // Kanallar KETMA-KET: bittasi xato bo'lsa umumiy xato hisoblanadi
      // eslint-disable-next-line no-await-in-loop
      await httpDevice.apply(device, physical, channel, ctx);
    }
    return;
  }

  switch (device.driver) {
    case 'mqtt': {
      const client = ensureMqtt();
      const topic = requireText(config.topic, 'mqtt uchun "topic"');
      const payload = physical
        ? config.onPayload === undefined || config.onPayload === null
          ? 'ON'
          : String(config.onPayload)
        : config.offPayload === undefined || config.offPayload === null
          ? 'OFF'
          : String(config.offPayload);

      log('debug', `${deviceLabel(device)}: mqtt ${topic} <- ${payload}`);
      await client.publish(topic, payload, {
        qos: config.qos === 1 ? 1 : 0,
        retain: config.retain === true,
        timeoutMs: cfg.deviceTimeoutMs,
      });
      return;
    }

    case 'modbus_tcp': {
      const unitId = clampInt(config.unitId, 0, 247, 1);
      for (const coil of modbusCoils(device)) {
        log('debug', `${deviceLabel(device)}: modbus ${device.host} unit=${unitId} coil=${coil}`);
        // eslint-disable-next-line no-await-in-loop
        await modbus.writeCoil({
          host: device.host,
          unitId,
          coil,
          value: physical,
          timeoutMs: cfg.deviceTimeoutMs,
          signal: shutdownController.signal,
        });
      }
      return;
    }

    case 'tcp': {
      const data = physical
        ? toBytes(config.onHex, config.onAscii, 'onHex/onAscii')
        : toBytes(config.offHex, config.offAscii, 'offHex/offAscii');
      const expect = config.expectHex ? parseHex(config.expectHex) : null;

      log('debug', `${deviceLabel(device)}: tcp ${device.host} <- ${data.toString('hex')}`);
      await rawtcp.send({
        host: device.host,
        data,
        expect,
        timeoutMs: cfg.deviceTimeoutMs,
        signal: shutdownController.signal,
      });
      return;
    }

    case 'serial': {
      const portPath = requireText(config.serialPort, 'serial uchun "serialPort"');
      const data = physical
        ? toBytes(config.onHex, config.onAscii, 'onHex/onAscii')
        : toBytes(config.offHex, config.offAscii, 'offHex/offAscii');

      log('debug', `${deviceLabel(device)}: serial ${portPath} <- ${data.toString('hex')}`);
      await serial.send({
        // baudRate JIMGINA qisqartirilmaydi: chegaradan chiqsa (serverdagidek
        // 300..921600) drayver tushunarli xato beradi
        path: portPath,
        baudRate: config.baudRate,
        data,
        timeoutMs: cfg.deviceTimeoutMs,
      });
      return;
    }

    default:
      throw new Error(`noma'lum drayver: "${device.driver}"`);
  }
}

/** Mavzuda joker belgi bormi (`#` / `+`) — bunday mavzuga obuna bo'lmaymiz */
function hasWildcard(topic) {
  return topic.includes('#') || topic.includes('+');
}

/** MQTT holat xabari shuncha vaqtdan eski bo'lsa — "noma'lum" hisoblanadi */
function mqttStateTtlMs() {
  return Math.max(forceSyncMs, cfg.mqttKeepaliveSec * 2000);
}

/**
 * Qurilmaning HAR BIR kanali uchun FIZIK holatini o'qiydi.
 * Faqat asosiy kanal emas — qo'shimcha kanallar (channels/coils) ham o'qiladi,
 * aks holda ularning drifti hech qachon aniqlanmaydi.
 *
 * @param {object} options { since } — MQTT da shu belgidan KEYIN kelgan xabar kutiladi
 * @returns {Promise<Array<boolean|null>>} bilib bo'lmagan kanal uchun null
 */
async function readPhysicalChannels(device, options = {}) {
  const config = device.config || {};

  if (httpDevice.HTTP_DRIVERS.has(device.driver)) {
    const channels = CHANNEL_DRIVERS.has(device.driver)
      ? deviceChannels(device)
      : [Number.isInteger(device.channel) ? device.channel : 0];
    const values = [];
    for (const channel of channels) {
      // eslint-disable-next-line no-await-in-loop
      values.push(await httpDevice.read(device, channel, driverCtx()));
    }
    return values;
  }

  switch (device.driver) {
    case 'mqtt': {
      const topic = typeof config.stateTopic === 'string' ? config.stateTopic.trim() : '';
      if (!topic || !mqttClient || hasWildcard(topic)) return [];
      const onValue = config.stateOnValue || 'ON';

      try {
        if (options.since) {
          // Buyruqdan KEYIN kelgan xabarnigina qabul qilamiz (eskisi "actual" bo'lib ketmasin)
          const payload = await mqttClient.waitMessage(topic, options.since, MQTT_STATE_WAIT_MS);
          return [parseStateValue(payload, onValue)];
        }
        // Eskirgan qiymat haqiqiy holat deb qabul qilinmasin (TTL)
        return [parseStateValue(mqttClient.lastMessage(topic, mqttStateTtlMs()), onValue)];
      } catch {
        return [];
      }
    }

    case 'modbus_tcp': {
      const values = [];
      for (const coil of modbusCoils(device)) {
        try {
          // eslint-disable-next-line no-await-in-loop
          values.push(
            await modbus.readCoil({
              host: device.host,
              unitId: clampInt(config.unitId, 0, 247, 1),
              coil,
              timeoutMs: cfg.deviceTimeoutMs,
              signal: shutdownController.signal,
            }),
          );
        } catch {
          // Holatni o'qish majburiy emas — bu kanal "noma'lum" bo'lib qoladi
          values.push(null);
        }
      }
      return values;
    }

    // tcp / serial — holatni o'qishning umumiy usuli yo'q
    default:
      return [];
  }
}

/**
 * Qurilmaning MANTIQIY holati (inverted hisobga olinadi).
 * Ko'p kanalli qurilmada kanallar BIR XIL bo'lmasa — kamida bittasi kerakli
 * holatda emas, shuning uchun `!desired` qaytadi (qayta yozish kerak degani).
 */
async function readLogical(device, desired, options = {}) {
  let values;
  try {
    values = await readPhysicalChannels(device, options);
  } catch {
    return null; // holatni o'qish majburiy emas
  }

  const known = values
    .filter((item) => item === true || item === false)
    .map((item) => (device.inverted === true ? !item : item));

  if (!known.length) return null;
  if (known.some((item) => item !== known[0])) return !desired;
  return known[0];
}

/** Shu stol uchun holatni tekshirish yoqilganmi (stol sozlamasi klubdan ustun) */
function resolveVerify(device) {
  const config = device.config || {};
  if (typeof config.verify === 'boolean') return config.verify;
  return serverVerify === true;
}

function deviceLabel(device) {
  return `stol #${device.tableNumber ?? device.tableId}`;
}

/* ------------------------------------------------------------------ */
/*  Sinxronizatsiya                                                    */
/* ------------------------------------------------------------------ */

/** Buyruqni 3 martagacha qayta urinib yuboradi; urinishlar sonini qaytaradi */
async function writeWithRetry(device, physical, label) {
  let lastError = null;

  for (let index = 0; index < RETRY_DELAYS_MS.length; index += 1) {
    if (stopping) {
      const stopErr = new Error("agent to'xtatilmoqda");
      stopErr.attempts = index;
      throw stopErr;
    }
    if (RETRY_DELAYS_MS[index] > 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(RETRY_DELAYS_MS[index]);
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await writeDevice(device, physical);
      return index + 1;
    } catch (err) {
      lastError = err;
      log('debug', `${label}: ${index + 1}-urinish muvaffaqiyatsiz — ${errText(err)}`);
    }
  }

  const error = new Error(errText(lastError));
  error.attempts = RETRY_DELAYS_MS.length;
  throw error;
}

/**
 * Bitta qurilmani kerakli holatga keltiradi.
 * HECH QACHON throw qilmaydi — hisobot yozuvini qaytaradi.
 */
async function handleDevice(device, forced) {
  const label = deviceLabel(device);
  const desired = device.desired === true;
  const physical = device.inverted === true ? !desired : desired;
  const verify = resolveVerify(device);
  const startedAt = Date.now();
  // Holat avvalgidek qolsa log "debug" ga tushadi — majburiy sinxronizatsiya
  // har daqiqada bir xil qatorlarni yozib jurnalni to'ldirmasin
  const known = appliedState.get(device.tableId);

  let attempts = 0;
  let actual = null;

  try {
    // 1) Majburiy sinxronizatsiyada avval HAQIQIY holatni o'qiymiz
    if (forced && verify) {
      actual = await readLogical(device, desired);
      if (actual !== null && actual !== desired) {
        log('info', `${label}: holat mos emas (qurilmada ${actual ? 'yoniq' : "o'chiq"}) — tuzatilmoqda`);
      }
    }

    // 2) Holat noma'lum yoki farq qilsa — buyruq yuboramiz
    const needWrite = actual === null || actual !== desired;
    if (needWrite) {
      const writtenAt = Date.now();
      attempts = await writeWithRetry(device, physical, label);

      // 3) Tekshirish yoqilgan bo'lsa — yozgandan keyin qayta o'qiymiz.
      //    `since` — buyruqdan OLDINGI holat xabari qabul qilinmasligi uchun (MQTT).
      actual = verify ? await readLogical(device, desired, { since: writtenAt }) : null;
      log(
        known === desired ? 'debug' : 'info',
        `${label}: chiroq ${desired ? 'YONDI' : "O'CHDI"} (${device.driver})`,
      );
    } else {
      log('debug', `${label}: holat allaqachon to'g'ri (${desired ? 'yoniq' : "o'chiq"})`);
    }

    return {
      tableId: device.tableId,
      ok: true,
      on: desired,
      actual,
      attempts,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (err) {
    // Xato matni panelga chiqadi — bir qatorga jamlanadi va qisqartiriladi
    const message = errText(err).replace(/\s+/g, ' ').trim();
    log('error', `${label}: xato — ${message}`);
    return {
      tableId: device.tableId,
      ok: false,
      on: null,
      actual: null,
      attempts: Number.isInteger(err && err.attempts) ? err.attempts : attempts,
      latencyMs: Date.now() - startedAt,
      error: message.slice(0, 200),
    };
  }
}

/** Ro'yxatni parallellik chegarasi bilan qayta ishlaydi (≤ MAX_PARALLEL) */
async function runPool(items, limit, worker) {
  const results = [];
  let index = 0;

  const run = async () => {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= items.length || stopping) return;
      try {
        results.push(await worker(items[current]));
      } catch (err) {
        // worker o'zi throw qilmaydi, lekin har ehtimolga qarshi
        results.push({
          tableId: items[current].tableId,
          ok: false,
          on: null,
          actual: null,
          attempts: 0,
          latencyMs: 0,
          error: errText(err).slice(0, 200),
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

/**
 * Kerakli holatni qurilmalarga qo'llaydi.
 * Faqat O'ZGARGAN qurilmalarga buyruq yuboriladi; forceSyncMs o'tgan bo'lsa —
 * hammasi majburiy tekshiriladi (rele qayta yonganda holat tiklanishi uchun).
 */
async function syncDevices(devices, options = {}) {
  const now = Date.now();
  const forced = now - lastForceSyncAt >= forceSyncMs;
  const active = devices.filter((item) => item && item.driver && item.driver !== 'none');

  // Ro'yxatdan chiqib ketgan stollarni keshdan tozalaymiz
  const knownIds = new Set(active.map((item) => item.tableId));
  for (const id of Array.from(appliedState.keys())) {
    if (!knownIds.has(id)) appliedState.delete(id);
  }

  if (forced) lastForceSyncAt = now;

  const pending = active.filter(
    (item) => forced || appliedState.get(item.tableId) !== (item.desired === true),
  );
  if (!pending.length) {
    log('debug', `O'zgarish yo'q (${active.length} ta qurilma)`);
    return;
  }

  log(
    forced ? 'debug' : 'info',
    `${pending.length} ta qurilma tekshirilmoqda${forced ? ' (majburiy sinxronizatsiya)' : ''}`,
  );

  const results = await runPool(pending, MAX_PARALLEL, (device) => handleDevice(device, forced));

  for (const result of results) {
    if (result.ok) appliedState.set(result.tableId, result.on === true);
    else appliedState.delete(result.tableId); // xato bo'lsa keyingi siklda qayta urinamiz
  }

  if (options.report !== false) await sendReport(results);
}

/** Joker belgili mavzu haqida bir marta ogohlantirish uchun */
const warnedTopics = new Set();

/** MQTT holat mavzulariga obuna bo'ladi (verify uchun) */
function ensureSubscriptions(devices) {
  const topics = devices
    .filter((item) => item && item.driver === 'mqtt' && item.config && item.config.stateTopic)
    .map((item) => String(item.config.stateTopic).trim())
    .filter(Boolean)
    .filter((topic) => {
      // Joker belgili mavzuga obuna bo'lsak, boshqa stollarning xabarlari ham
      // kelib holatni chalkashtiradi — obuna bo'lmaymiz, faqat ogohlantiramiz
      if (!hasWildcard(topic)) return true;
      if (!warnedTopics.has(topic)) {
        warnedTopics.add(topic);
        log('error', `MQTT: "${topic}" da joker belgi (#/+) bor — bunday holat mavzusi qo'llanmaydi`);
      }
      return false;
    });

  if (!topics.length) return;
  try {
    const client = ensureMqtt();
    for (const topic of topics) client.subscribe(topic);
  } catch (err) {
    log('debug', `MQTT obunalari o'rnatilmadi: ${errText(err)}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Tasklar (qurilma qidirish)                                         */
/* ------------------------------------------------------------------ */

/**
 * Serverdan kelgan tasklarni qabul qiladi.
 * Skan ketayotgan bo'lsa yangi task TASHLAB YUBORILMAYDI — lokal navbatga tushadi
 * (server taskni bir marta beradi, yo'qotib qo'ysak qidiruv umuman bajarilmaydi).
 * Server tasdiq kelgunicha bir xil taskni qayta yuborishi mumkin — shuning uchun
 * bajarilayotgan va navbatdagi id lar ham tekshiriladi.
 *
 * @returns {boolean} `true` — tasklar bor edi, lekin hammasi allaqachon bajarilgan
 *                    yoki bajarilmoqda (bo'sh aylanmaslik uchun chaqiruvchi biroz kutadi)
 */
function handleTasks(tasks) {
  if (!tasks.length) return false;
  let idle = true;

  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || !task.id) continue;
    if (doneTasks.has(task.id)) continue;
    if (runningTaskId === task.id) continue; // hozir bajarilmoqda
    if (taskQueue.some((item) => item.id === task.id)) continue; // allaqachon navbatda

    if (task.type !== 'discover') {
      log('debug', `Noma'lum task turi: ${task.type}`);
      rememberTask(task.id); // bajarish shart emas — qayta ko'rib chiqmaymiz
      continue;
    }

    taskQueue.push(task);
    idle = false;
  }

  void pumpTasks();
  return idle;
}

/** Navbatdagi tasklarni ketma-ket bajaradi (bir vaqtda faqat bitta skan) */
async function pumpTasks() {
  if (discoverRunning) return;
  if (stopping) {
    taskQueue.length = 0;
    return;
  }

  const task = taskQueue.shift();
  if (!task) return;

  discoverRunning = true;
  runningTaskId = task.id;
  try {
    await runDiscoverTask(task);
  } finally {
    discoverRunning = false;
    runningTaskId = null;
  }
  void pumpTasks(); // navbatda yana bor bo'lsa — davom etamiz
}

/** Bajarilgan tasklar ro'yxatini cheklangan hajmda saqlaydi */
function rememberTask(id) {
  if (doneTasks.size >= MAX_DONE_TASKS) doneTasks.clear();
  doneTasks.add(id);
}

/** LAN skanerini ishga tushiradi va natijani serverga yuboradi */
async function runDiscoverTask(task) {
  try {
    // Shu taskning natijasi allaqachon tayyor (faqat yuborish uzilgan edi) —
    // server taskni qayta berganda tarmoqni QAYTA skanerlash shart emas
    let found = unsentDiscover && unsentDiscover.taskId === task.id ? unsentDiscover : null;

    if (!found) {
      const subnet = String(task.subnet || cfg.subnet || '').trim();
      log('info', `Qurilmalarni qidirish boshlandi (${subnet || 'tarmoq avtomatik aniqlanadi'})`);

      const scan = await discover({
        subnet,
        serverHost: cfg.serverHost, // to'g'ri interfeys tanlansin (Docker/VPN emas)
        timeoutMs: cfg.discoverTimeoutMs,
        parallel: cfg.discoverParallel,
        signal: shutdownController.signal,
        log,
      });

      log('info', `Qidiruv tugadi: ${scan.devices.length} ta qurilma (${scan.subnet}.0/24)`);
      found = { taskId: task.id, devices: scan.devices, subnet: scan.subnet };
    } else {
      log('info', `Oldingi qidiruv natijasi qayta yuborilmoqda (${found.devices.length} ta qurilma)`);
    }

    // Natija YETKAZILMAGUNCHA saqlanadi, task esa "bajarilgan" deb belgilanmaydi:
    // server uni navbatda ushlab turadi va qayta beradi, shunda yuqoridagi shart
    // bo'yicha natija skanersiz qayta yuboriladi.
    unsentDiscover = found;
    if (await sendDiscovered(task.id, found.devices, found.subnet)) {
      unsentDiscover = null;
      rememberTask(task.id);
    }
  } catch (err) {
    // Xatoda taskni eslab qolmaymiz: server uni qayta yuborsa yana urinib ko'ramiz.
    // Serverda "ishlamoqda" belgisi 3 daqiqada o'zi so'nadi, shuning uchun bo'sh
    // natija yuborib avvalgi ro'yxatni o'chirib yubormaymiz.
    log('error', `Qurilmalarni qidirishda xato: ${errText(err)}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Asosiy sikl                                                        */
/* ------------------------------------------------------------------ */

/** Parolsiz qo'llab bo'lmaydigan qurilmalar haqida bir marta ogohlantiramiz */
let authSkipWarned = false;

/** Internet yo'q bo'lsa — diskdagi oxirgi holatni qayta qo'llaymiz */
async function applyCachedState() {
  if (!cachedState || !Array.isArray(cachedState.devices) || !cachedState.devices.length) return;

  // Diskdagi keshda parol saqlanmagan bo'lsa — o'sha qurilmalarni o'tkazib yuboramiz
  // (parolsiz so'rov 401 bilan qaytadi, foydasi yo'q)
  const usable = cachedState.devices.filter((item) => item && item.authOmitted !== true);
  const skipped = cachedState.devices.length - usable.length;
  if (skipped > 0 && !authSkipWarned) {
    authSkipWarned = true;
    log(
      'info',
      `${skipped} ta qurilma parol talab qiladi — disk keshida parol saqlanmagan, ular o'tkazib yuborildi ` +
        "(.env da CACHE_SECRETS=1 qo'yilsa saqlanadi)",
    );
  }
  if (!usable.length) return;

  try {
    ensureSubscriptions(usable);
    // Hisobot yuborilmaydi — server baribir mavjud emas
    await syncDevices(usable, { report: false });
  } catch (err) {
    log('error', `Keshdagi holatni qo'llashda xato: ${errText(err)}`);
  }
}

async function mainLoop() {
  let backoffIndex = 0;

  while (!stopping) {
    try {
      const data = await fetchState(lastVersion);
      if (stopping) break;

      backoffIndex = 0; // aloqa tiklandi

      if (Number.isFinite(data.forceSyncMs) && data.forceSyncMs >= 5000) {
        forceSyncMs = data.forceSyncMs;
      }
      serverVerify = data.verify === true;

      const devices = Array.isArray(data.devices) ? data.devices : [];
      const versionChanged = typeof data.version === 'string' && data.version !== lastVersion;
      if (versionChanged) {
        log('info', `Yangi holat versiyasi: ${data.version}`);
        lastVersion = data.version;
        saveCache(data.version, devices);
      } else if (!cachedState) {
        saveCache(lastVersion, devices);
      }

      ensureSubscriptions(devices);
      const idleTasks = handleTasks(Array.isArray(data.tasks) ? data.tasks : []);
      await syncDevices(devices);

      // Server bir xil taskni qaytaraversa — bo'sh aylanib ketmaymiz
      if (idleTasks) await sleep(2000);
    } catch (err) {
      if (stopping) break;

      const wait = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
      backoffIndex += 1;
      log(
        'error',
        `Server bilan aloqa xatosi: ${errText(err)} — ${Math.round(wait / 1000)}s dan keyin qayta urinamiz`,
      );

      // Aloqa yo'q — oxirgi ma'lum holatni ushlab turamiz (klub qorong'ida qolmasin)
      await applyCachedState();
      await sleep(wait);
    }
  }
}

/** Sikl kutilmaganda tugasa shuncha kutib qayta ishga tushiramiz (ms) */
const LOOP_RESTART_MS = 5000;

/**
 * Asosiy siklni ishga tushiradi va O'ZINI-O'ZI tiklaydi.
 * Har bir qayta ishga tushirishga ham xato ushlagichi biriktiriladi — aks holda
 * ikkinchi yiqilishdan keyin agent jim qolardi (jarayon tirik bo'lgani uchun
 * systemd/NSSM ham uni qayta ishga tushirmaydi).
 */
function startMainLoop() {
  if (stopping) return;

  const restart = (message) => {
    if (stopping) return;
    log('error', `${message} — ${Math.round(LOOP_RESTART_MS / 1000)}s dan keyin qayta ishga tushiramiz`);
    setTimeout(startMainLoop, LOOP_RESTART_MS); // unref QILINMAYDI: jarayon tirik qolsin
  };

  mainLoop()
    .then(() => {
      // Sikl faqat to'xtatishda tugashi kerak; boshqa holatda — tiklaymiz
      if (!stopping) restart("Asosiy sikl kutilmaganda to'xtadi");
    })
    .catch((err) => {
      restart(`Asosiy sikl kutilmaganda tugadi: ${errText(err)}`);
    });
}

/* ------------------------------------------------------------------ */
/*  Ishga tushirish                                                    */
/* ------------------------------------------------------------------ */

function validateConfig() {
  const errors = [];

  if (!cfg.serverUrl) errors.push('SERVER_URL kiritilmagan (masalan: https://billiardclub.uz)');
  else if (!/^https?:\/\//i.test(cfg.serverUrl)) {
    errors.push('SERVER_URL http:// yoki https:// bilan boshlanishi kerak');
  }
  if (!cfg.token) errors.push('BRIDGE_TOKEN kiritilmagan (klub sozlamalaridan oling)');

  return errors;
}

function main() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    console.error(`Node.js 18+ kerak, hozirgi versiya: ${process.versions.node}`);
    process.exit(1);
  }

  const errors = validateConfig();
  if (errors.length) {
    console.error(`[${ts()}] [ERROR] Sozlamalar noto'g'ri:`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error('  bridge/.env faylini to\'ldiring (namuna: .env.example)');
    process.exit(1);
  }

  log('info', `Billiard Club bridge agenti v${AGENT_VERSION} ishga tushdi (Node ${process.versions.node})`);
  log('info', `Server: ${cfg.serverUrl} | Token: ${maskToken(cfg.token)}`);
  log(
    'info',
    `forceSync: ${forceSyncMs} ms | qurilma timeouti: ${cfg.deviceTimeoutMs} ms | log: ${cfg.logLevel}`,
  );

  cachedState = loadCache();
  if (cachedState) {
    log(
      'info',
      `Disk keshi topildi: ${cachedState.devices.length} ta qurilma (${cachedState.savedAt || "vaqti noma'lum"})`,
    );
  }
  if (cfg.cacheSecrets) {
    // Operator bilib tursin: bu rejimda faylda ochiq parol/token bo'ladi
    log('info', `CACHE_SECRETS=1 — qurilma parollari ${cfg.stateFile} fayliga yoziladi (0600)`);
  }
  if (cfg.mqttUrl) log('info', 'MQTT sozlangan — birinchi mqtt stolida ulanish ochiladi');
  if (!serial.isAvailable()) {
    log('debug', "USB rele uchun `serialport` paketi topilmadi (faqat serial drayveri uchun kerak)");
  }

  startMainLoop();
}

main();
