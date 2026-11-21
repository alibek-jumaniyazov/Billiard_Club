#!/usr/bin/env node
'use strict';

/**
 * Billiard Club — CHIROQ BOSHQARUVI BRIDGE AGENTI (v3)
 *
 * Klubning lokal tarmog'ida (NAT ortida) ishlaydi. Bulutdagi serverga O'ZI chiqadi
 * (outbound HTTPS) — port forwarding, statik IP yoki router sozlash KERAK EMAS.
 *
 * v3 dan boshlab dvigatel `lib/hub.js` da (LightHub) — xuddi shu kod kassa
 * kompyuteridagi Windows dasturi ichida ham ishlaydi. Agentning o'zi faqat
 * sozlamalarni (.env) o'qiydi, loglaydi va to'xtatish signallarini boshqaradi.
 *
 * Asosiy o'zgarish (v3): kerakli holat serverdan tayyor kelmaydi, LOKAL
 * hisoblanadi (serverdagi qoidaning nusxasi — lib/rules.js). Internet uzilganda
 * ham o'yin tugagach kechikish, bron oldidan yoqish va qo'lda boshqaruv muddati
 * o'z vaqtida ishlaydi; eski server bilan avvalgidek ishlaydi.
 *
 * Qo'llab-quvvatlanadigan drayverlar: lib/drivers/ (reyestr).
 * npm bog'liqligi YO'Q (USB rele uchun ixtiyoriy `serialport`, USB HID rele uchun `node-hid`).
 * Jarayon hech qachon crash bo'lmasligi kerak — barcha xatolar ushlanadi va loglanadi.
 * Parol/token HECH QACHON logga chiqmaydi.
 */

const fs = require('node:fs');
const path = require('node:path');

const { errText, maskToken } = require('./lib/common');
const serial = require('./lib/serial');
const { LightHub } = require('./lib/hub');
const { defaultDiscoveryProviders } = require('./lib/discovery-providers');

/** Agent versiyasi — serverga /api/bridge/report da yuboriladi */
const AGENT_VERSION = '3.0.0';

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

/** Sozlamalarni yig'adi: muhit o'zgaruvchilari .env dan USTUN turadi */
function buildConfig() {
  const envFile = loadEnvFile(path.join(__dirname, '.env'));
  const pick = (key) =>
    process.env[key] !== undefined && process.env[key] !== '' ? process.env[key] : envFile[key];

  return {
    serverUrl: String(pick('SERVER_URL') || '').trim().replace(/\/+$/, ''),
    token: String(pick('BRIDGE_TOKEN') || '').trim(),
    forceSyncMs: readInt(pick('FORCE_SYNC_MS'), 60000, 5000),
    requestTimeoutMs: readInt(pick('REQUEST_TIMEOUT_MS'), 5000, 500),
    deviceTimeoutMs: readInt(pick('DEVICE_TIMEOUT_MS'), 3000, 500),
    logLevel: String(pick('LOG_LEVEL') || 'info').trim().toLowerCase() === 'debug' ? 'debug' : 'info',
    stateFile: String(pick('STATE_FILE') || '').trim() || path.join(__dirname, 'state.json'),
    // Diskdagi keshga qurilma parollarini YOZISH (standart holatda o'chirilgan)
    cacheSecrets: readFlag(pick('CACHE_SECRETS')),
    // MQTT (parol serverga YUBORILMAYDI — faqat shu faylda qoladi)
    mqtt: {
      url: String(pick('MQTT_URL') || '').trim(),
      user: String(pick('MQTT_USER') || '').trim(),
      pass: String(pick('MQTT_PASS') || ''),
      clientId: String(pick('MQTT_CLIENT_ID') || '').trim(),
      keepaliveSec: readInt(pick('MQTT_KEEPALIVE_SEC'), 30, 10),
      // mqtts:// uchun: standart holatda sertifikat TEKSHIRILADI (lib/mqtt.js _tlsOptions)
      caFile: String(pick('MQTT_CA') || '').trim(),
      tlsInsecure: readFlag(pick('MQTT_TLS_INSECURE')),
    },
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

let hub = null;
let stopping = false;

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log('info', `${signal} qabul qilindi — agent to'xtatilmoqda...`);
  const finish = () => {
    log('info', "Agent to'xtadi.");
    process.exit(0);
  };
  Promise.resolve(hub ? hub.stop() : undefined).then(finish, finish);
  // Sikl toza yakunlanishi uchun qisqa muhlat; osilib qolsa baribir chiqamiz
  setTimeout(finish, 3000).unref();
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
    console.error("  bridge/.env faylini to'ldiring (namuna: .env.example)");
    process.exit(1);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  // Jarayon HECH QACHON crash bo'lmasin
  process.on('unhandledRejection', (reason) => log('error', `Ushlanmagan promise xatosi: ${errText(reason)}`));
  process.on('uncaughtException', (err) => log('error', `Ushlanmagan istisno: ${errText(err)}`));

  log('info', `Billiard Club bridge agenti v${AGENT_VERSION} ishga tushdi (Node ${process.versions.node})`);
  log('info', `Server: ${cfg.serverUrl} | Token: ${maskToken(cfg.token)}`);
  log('info', `forceSync: ${cfg.forceSyncMs} ms | qurilma timeouti: ${cfg.deviceTimeoutMs} ms | log: ${cfg.logLevel}`);
  if (cfg.cacheSecrets) {
    // Operator bilib tursin: bu rejimda faylda ochiq parol/token bo'ladi
    log('info', `CACHE_SECRETS=1 — qurilma parollari ${cfg.stateFile} fayliga yoziladi (0600)`);
  }
  if (cfg.mqtt.url) log('info', 'MQTT sozlangan — birinchi mqtt stolida ulanish ochiladi');
  if (!serial.isAvailable()) {
    log('debug', "USB rele uchun `serialport` paketi topilmadi (faqat serial drayverlari uchun kerak)");
  }

  hub = new LightHub({
    kind: 'bridge',
    agentVersion: AGENT_VERSION,
    serverUrl: cfg.serverUrl,
    token: cfg.token,
    stateFile: cfg.stateFile,
    cacheSecrets: cfg.cacheSecrets,
    forceSyncMs: cfg.forceSyncMs,
    requestTimeoutMs: cfg.requestTimeoutMs,
    deviceTimeoutMs: cfg.deviceTimeoutMs,
    mqtt: cfg.mqtt.url ? cfg.mqtt : null,
    subnet: cfg.subnet,
    discoverTimeoutMs: cfg.discoverTimeoutMs,
    discoverParallel: cfg.discoverParallel,
    discoveryProviders: defaultDiscoveryProviders({ log }),
    log,
  });
  hub.start();
}

main();
