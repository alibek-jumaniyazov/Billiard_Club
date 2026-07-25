#!/usr/bin/env node
'use strict';

/**
 * Billiard Club — CHIROQ BOSHQARUVI BRIDGE AGENTI
 *
 * Klubning lokal tarmog'ida (NAT ortida) ishlaydi. Bulutdagi serverga O'ZI chiqadi
 * (outbound HTTPS) — port forwarding, statik IP yoki router sozlash KERAK EMAS.
 *
 * Ish tartibi:
 *   1) GET  {SERVER_URL}/api/bridge/state?v={lastVersion}  — uzun-polling (server 25s ushlaydi)
 *   2) Kerakli holat (desired) o'zgargan qurilmalarga buyruq yuboradi (parallel, har biriga 3s)
 *   3) POST {SERVER_URL}/api/bridge/report                 — natijalarni serverga qaytaradi
 *   4) Tarmoq xatosida eksponensial kutish (1s -> 2s -> 5s -> 10s -> 30s) va qaytadan
 *
 * Hech qanday npm bog'liqligi YO'Q: faqat Node 18+ global fetch va node:fs.
 * Jarayon hech qachon crash bo'lmasligi kerak — barcha xatolar ushlanadi va loglanadi.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Agent versiyasi — serverga /api/bridge/report da yuboriladi */
const AGENT_VERSION = '1.0.0';

/** Uzun-polling uchun timeout — server javobni 25s ushlab turadi, biroz zaxira qo'shamiz */
const POLL_TIMEOUT_MS = 30000;

/** Har bir relayga buyruq yuborish timeouti */
const DEVICE_TIMEOUT_MS = 3000;

/** Tarmoq xatosida kutish bosqichlari (ms) */
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];

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
    if (value.length >= 2 && ((value[0] === '"' && value.endsWith('"')) || (value[0] === "'" && value.endsWith("'")))) {
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

/** Sozlamalarni yig'adi: muhit o'zgaruvchilari .env dan USTUN turadi */
function buildConfig() {
  const envFile = loadEnvFile(path.join(__dirname, '.env'));
  const pick = (key) => (process.env[key] !== undefined && process.env[key] !== '' ? process.env[key] : envFile[key]);

  const serverUrlRaw = String(pick('SERVER_URL') || '').trim();
  const token = String(pick('BRIDGE_TOKEN') || '').trim();
  const logLevel = String(pick('LOG_LEVEL') || 'info').trim().toLowerCase() === 'debug' ? 'debug' : 'info';

  return {
    serverUrl: serverUrlRaw.replace(/\/+$/, ''), // oxiridagi "/" larni kesamiz
    token,
    forceSyncMs: readInt(pick('FORCE_SYNC_MS'), 60000, 5000),
    requestTimeoutMs: readInt(pick('REQUEST_TIMEOUT_MS'), 5000, 500),
    logLevel,
  };
}

const cfg = buildConfig();

/* ------------------------------------------------------------------ */
/*  Loglash                                                            */
/* ------------------------------------------------------------------ */

/** Mahalliy vaqt belgisi: 2026-07-24 18:30:05 */
function ts() {
  const d = new Date();
  const p = (n, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function log(level, message) {
  if (level === 'debug' && cfg.logLevel !== 'debug') return;
  const line = `[${ts()}] [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line);
  else console.log(line);
}

/** Xato obyektidan o'qiladigan matn ajratadi (fetch xatolari sababi ichkarida yashiringan) */
function errText(err) {
  if (!err) return "noma'lum xato";
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return 'timeout (javob kelmadi)';

  const message = err.message || String(err);
  const cause = err.cause;
  let detail = '';

  if (cause) {
    if (cause.code) detail = cause.code;
    else if (Array.isArray(cause.errors) && cause.errors.length) {
      detail = cause.errors[0].code || cause.errors[0].message || '';
    } else if (cause.message) detail = cause.message;
  }

  return detail ? `${message} (${detail})` : message;
}

/* ------------------------------------------------------------------ */
/*  To'xtatish (SIGINT / SIGTERM) va kutish                            */
/* ------------------------------------------------------------------ */

let stopping = false;

/** Faol so'rovlarning AbortController lari — to'xtatishda hammasini uzamiz */
const activeControllers = new Set();

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

  for (const controller of activeControllers) {
    try {
      controller.abort();
    } catch {
      /* e'tiborsiz */
    }
  }
  activeControllers.clear();

  // Sikl toza yakunlanishi uchun qisqa muhlat beramiz
  setTimeout(() => {
    log('info', 'Agent to’xtadi.');
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
/*  HTTP yordamchi                                                     */
/* ------------------------------------------------------------------ */

/**
 * Timeout va to'xtatishni qo'llab-quvvatlaydigan fetch.
 * AbortSignal.timeout o'rniga o'z controller imizdan foydalanamiz —
 * shunda SIGTERM da faol so'rovlarni ham darhol uza olamiz.
 */
async function httpRequest(url, options = {}) {
  const controller = new AbortController();
  activeControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || cfg.requestTimeoutMs);

  try {
    return await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
    activeControllers.delete(controller);
  }
}

/* ------------------------------------------------------------------ */
/*  Qurilma drayverlari (server tarafdagi bilan AYNAN bir xil)         */
/* ------------------------------------------------------------------ */

/** IPv4[:port] yoki hostname[:port] formatini tekshiradi */
function isValidHost(host) {
  if (typeof host !== 'string' || !host || host.length > 255) return false;
  if (/[\s/\\@?#]/.test(host)) return false; // sxema, yo'l yoki auth bo'lmasin

  const parts = host.split(':');
  if (parts.length > 2) return false;

  const [hostname, port] = parts;
  if (port !== undefined) {
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return false;
  }

  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split('.').every((oct) => Number(oct) >= 0 && Number(oct) <= 255);
  }

  // Hostname (masalan shelly-1.local)
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(hostname);
}

/**
 * Qurilma va FIZIK holat (on) bo'yicha chaqiriladigan URL ni yasaydi.
 *   shelly_gen1: /relay/{ch}?turn=on|off
 *   shelly_gen2: /rpc/Switch.Set?id={ch}&on=true|false
 *   tasmota:     /cm?cmnd=Power{ch+1}%20ON|OFF
 *   http:        onUrl / offUrl shabloni ({channel}, {state} o'rinbosarlari)
 */
function buildDeviceUrl(device, on) {
  const channel = Number.isInteger(device.channel) ? device.channel : 0;

  if (device.driver === 'http') {
    const template = on ? device.onUrl : device.offUrl;
    if (!template || typeof template !== 'string') {
      throw new Error(`http drayveri uchun ${on ? 'onUrl' : 'offUrl'} kiritilmagan`);
    }
    return template
      .split('{channel}').join(String(channel))
      .split('{state}').join(on ? 'on' : 'off');
  }

  if (!isValidHost(device.host)) {
    throw new Error(`host formati noto'g'ri: "${device.host}"`);
  }

  const base = `http://${device.host}`;

  switch (device.driver) {
    case 'shelly_gen1':
      return `${base}/relay/${channel}?turn=${on ? 'on' : 'off'}`;
    case 'shelly_gen2':
      return `${base}/rpc/Switch.Set?id=${channel}&on=${on ? 'true' : 'false'}`;
    case 'tasmota':
      return `${base}/cm?cmnd=Power${channel + 1}%20${on ? 'ON' : 'OFF'}`;
    default:
      throw new Error(`noma'lum drayver: "${device.driver}"`);
  }
}

/**
 * Bitta qurilmaga kerakli holatni qo'llaydi.
 * HECH QACHON throw qilmaydi — natijani { tableId, ok, on, error } ko'rinishida qaytaradi.
 */
async function applyDevice(device) {
  const label = `stol #${device.tableNumber ?? device.tableId}`;
  const logical = device.desired === true; // mantiqiy holat: chiroq yoniqmi
  const physical = device.inverted === true ? !logical : logical; // NC relay uchun teskari

  try {
    const url = buildDeviceUrl(device, physical);

    const headers = { Accept: '*/*' };
    if (device.auth) {
      // Basic auth — parol URL ichida emas, Authorization header orqali
      headers.Authorization = `Basic ${Buffer.from(String(device.auth), 'utf8').toString('base64')}`;
    }

    log('debug', `${label}: ${url}`);

    const res = await httpRequest(url, { method: 'GET', headers, timeoutMs: DEVICE_TIMEOUT_MS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Tanani o'qib bo'shatamiz (soketni ochiq qoldirmaslik uchun)
    try {
      await res.text();
    } catch {
      /* e'tiborsiz */
    }

    log('info', `${label}: chiroq ${logical ? 'YONDI' : "O'CHDI"} (${device.driver})`);
    return { tableId: device.tableId, ok: true, on: logical, error: null };
  } catch (err) {
    const message = errText(err);
    log('error', `${label}: xato — ${message}`);
    return { tableId: device.tableId, ok: false, on: null, error: message.slice(0, 200) };
  }
}

/* ------------------------------------------------------------------ */
/*  Server bilan aloqa                                                 */
/* ------------------------------------------------------------------ */

/** Uzun-polling: kerakli holatni oladi */
async function fetchState(version) {
  const url = `${cfg.serverUrl}/api/bridge/state?v=${encodeURIComponent(version || '')}`;

  const res = await httpRequest(url, {
    method: 'GET',
    headers: { 'X-Bridge-Token': cfg.token, Accept: 'application/json' },
    timeoutMs: POLL_TIMEOUT_MS,
  });

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

  try {
    const res = await httpRequest(`${cfg.serverUrl}/api/bridge/report`, {
      method: 'POST',
      headers: {
        'X-Bridge-Token': cfg.token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ agentVersion: AGENT_VERSION, results }),
      timeoutMs: cfg.requestTimeoutMs,
    });

    if (!res.ok) {
      log('error', `Hisobot yuborilmadi: HTTP ${res.status}`);
      return;
    }

    log('debug', `Hisobot yuborildi: ${results.length} ta natija`);
  } catch (err) {
    log('error', `Hisobot yuborishda xato: ${errText(err)}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Asosiy sikl                                                        */
/* ------------------------------------------------------------------ */

/** Oxirgi MUVAFFAQIYATLI qo'llangan holat: tableId -> boolean */
const appliedState = new Map();

/** Oxirgi majburiy (to'liq) sinxronizatsiya vaqti */
let lastForceSyncAt = 0;

/** Serverdagi ro'yxat versiyasi (uzun-polling uchun) */
let lastVersion = '';

/** Serverdan kelgan forceSyncMs (kelmasa .env dagi qiymat ishlatiladi) */
let forceSyncMs = cfg.forceSyncMs;

/**
 * Kerakli holatni qurilmalarga qo'llaydi.
 * Faqat O'ZGARGAN qurilmalarga buyruq yuboriladi; FORCE_SYNC_MS o'tgan bo'lsa —
 * hammasi majburiy qayta qo'llanadi (relay qayta yoqilgan holat uchun).
 */
async function syncDevices(devices) {
  const now = Date.now();
  const forced = now - lastForceSyncAt >= forceSyncMs;

  // Ro'yxatdan chiqib ketgan stollarni keshdan tozalaymiz
  const knownIds = new Set(devices.map((d) => d.tableId));
  for (const id of Array.from(appliedState.keys())) {
    if (!knownIds.has(id)) appliedState.delete(id);
  }

  if (forced) lastForceSyncAt = now;

  const pending = devices.filter((d) => forced || appliedState.get(d.tableId) !== (d.desired === true));
  if (!pending.length) {
    log('debug', `O'zgarish yo'q (${devices.length} ta qurilma)`);
    return;
  }

  log('info', `${pending.length} ta qurilmaga buyruq yuborilmoqda${forced ? ' (majburiy sinxronizatsiya)' : ''}`);

  // Qurilmalarga PARALLEL murojaat — bittasi sekin bo'lsa boshqalari kutmasin
  const settled = await Promise.allSettled(pending.map((device) => applyDevice(device)));

  const results = [];
  settled.forEach((item, index) => {
    const device = pending[index];
    if (item.status === 'fulfilled') {
      results.push(item.value);
    } else {
      // applyDevice o'zi throw qilmaydi, lekin har ehtimolga qarshi
      results.push({ tableId: device.tableId, ok: false, on: null, error: errText(item.reason).slice(0, 200) });
    }
  });

  for (const result of results) {
    if (result.ok) appliedState.set(result.tableId, result.on === true);
    else appliedState.delete(result.tableId); // xato bo'lsa keyingi siklda qayta urinamiz
  }

  await sendReport(results);
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
      if (typeof data.version === 'string' && data.version !== lastVersion) {
        log('info', `Yangi holat versiyasi: ${data.version}`);
        lastVersion = data.version;
      }

      const devices = Array.isArray(data.devices) ? data.devices : [];
      await syncDevices(devices);
    } catch (err) {
      if (stopping) break;

      const wait = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
      backoffIndex += 1;
      log('error', `Server bilan aloqa xatosi: ${errText(err)} — ${Math.round(wait / 1000)}s dan keyin qayta urinamiz`);
      await sleep(wait);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Ishga tushirish                                                    */
/* ------------------------------------------------------------------ */

function validateConfig() {
  const errors = [];

  if (!cfg.serverUrl) errors.push('SERVER_URL kiritilmagan (masalan: https://billiardclub.uz)');
  else if (!/^https?:\/\//i.test(cfg.serverUrl)) errors.push('SERVER_URL http:// yoki https:// bilan boshlanishi kerak');

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
    console.error(`  bridge/.env faylini to'ldiring (namuna: .env.example)`);
    process.exit(1);
  }

  const maskedToken = `${cfg.token.slice(0, 4)}...${cfg.token.slice(-4)}`;
  log('info', `Billiard Club bridge agenti v${AGENT_VERSION} ishga tushdi (Node ${process.versions.node})`);
  log('info', `Server: ${cfg.serverUrl} | Token: ${maskedToken}`);
  log('info', `forceSync: ${forceSyncMs} ms | so'rov timeouti: ${cfg.requestTimeoutMs} ms | log: ${cfg.logLevel}`);

  mainLoop().catch((err) => {
    // Bu yerga tushmasligi kerak, lekin tushsa ham jarayon o'lmasin
    log('error', `Asosiy sikl kutilmaganda tugadi: ${errText(err)}`);
    if (!stopping) {
      setTimeout(() => main(), 5000);
    }
  });
}

main();
