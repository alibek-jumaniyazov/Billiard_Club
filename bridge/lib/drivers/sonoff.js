'use strict';

/**
 * SONOFF / eWeLink — LAN orqali (bulutsiz) boshqaruv drayveri.
 *
 * Ikki rejim (`config.encrypt`):
 *
 *   DIY rejimi (encrypt = false, standart) — ochiq JSON, 8081-port:
 *     POST /zeroconf/switch   {"deviceid":"<id yoki ''>","data":{"switch":"on"}}
 *     POST /zeroconf/switches {"deviceid":"","data":{"switches":[{"switch":"on","outlet":0}]}}
 *     POST /zeroconf/info     {"deviceid":"","data":{}} -> {"seq":..,"error":0,"data":{...}}
 *     Eski proshivkada (3.3.x) `data` JSON MATN bo'lib keladi — ikkalasi ham o'qiladi.
 *     BASICR3/RFR3/MINI 3.7.6+ proshivkada deviceid MAJBURIY (bo'sh bo'lsa rad etadi).
 *
 *   eWeLink "LAN control" (encrypt = true) — o'sha yo'llar, tana shifrlangan:
 *     {"sequence":"<ms>","deviceid":"<id>","selfApikey":"123","iv":"<base64 16 bayt>",
 *      "encrypt":true,"data":"<base64 AES-128-CBC/PKCS7, kalit = md5(devicekey)>"}
 *     Holatni o'qish hamma proshivkada yo'q (getState ba'zilarida ishlamaydi) —
 *     shuning uchun bu rejimda readback = false (buyruq yetkazildi, tasdiqlanmaydi).
 *
 * `channel` = Sonoff "outlet" (0 dan). `config.outlets` — ko'p kanalli API; berilmasa
 * stol 0 dan boshqa kanal yoki qo'shimcha kanallardan foydalansa yoqiladi.
 *
 * devicekey (`auth`) MAXFIY: logga ham, xato matniga ham HECH QACHON chiqmaydi.
 * Qurilmaning veb-serveri bir vaqtda bitta so'rovni bajaradi: so'rovlar orasida
 * kamida 200 ms (hujjat talabi), "Connection: close" va ulanish uzilsa qisqa
 * qayta urinish (buyruqlar idempotent: faqat on/off, hech qachon toggle).
 *
 * So'rov fetch() bilan EMAS, node:http bilan yuboriladi: fetch sarlavhalarni kichik
 * harfda ("content-length:", "host:") va ortiqcha sarlavhalar bilan jo'natadi,
 * o'rnatilgan (embedded) HTTP serverlar esa ba'zan "Content-Length: " ni harfga
 * sezgir qidiradi. Bu yerda — kanonik va minimal sarlavhalar (SonoffLAN/aiohttp kabi).
 * fetchWithTimeout kafolatlari saqlanadi: muddat javob TANASIGACHA, to'xtatish
 * signali, javob hajmi chegarasi, yo'naltirish kuzatilmaydi.
 *
 * Manbalar: SONOFF DIY MODE API (help.sonoff.tech, Protocol Doc v1.4),
 * AlexxIT/SonoffLAN custom_components/sonoff/core/ewelink/local.py.
 */

const crypto = require('node:crypto');
const http = require('node:http');
const { delay, errText, isValidHost, splitHostPort } = require('../common');

const DEFAULT_PORT = 8081;
/** Hujjat: ketma-ket so'rovlar orasida kamida 200 ms */
const MIN_INTERVAL_MS = 200;
/** Qurilma band bo'lsa yangi ulanishni uzadi — shuncha marta qayta urinamiz */
const RESET_RETRIES = 2;
const RESET_RETRY_DELAY_MS = 150;
/** ctx.timeoutMs berilmasa */
const DEFAULT_TIMEOUT_MS = 5000;
/** Sonoff javobi bir necha yuz bayt — buzilgan qurilma xotirani to'ldirmasin */
const MAX_REPLY_BYTES = 64 * 1024;
const MAX_OUTLET = 32;
const DEVICE_ID_RE = /^[A-Za-z0-9]{6,40}$/;

/** host:port -> oxirgi so'rov tugagan vaqt (so'rovlar orasidagi tanaffus uchun) */
const lastRequestAt = new Map();
/** Shifrlangan rejim: `sequence` jarayon ichida doim o'suvchi bo'lsin */
let lastSequence = 0;

/* ------------------------------------------------------------------ */
/*  Sozlamalar                                                         */
/* ------------------------------------------------------------------ */

/**
 * Stolning kanallari: asosiy `channel` DOIM birinchi, takrorsiz, jami ≤ 9.
 * (drivers/index.js dagi deviceChannels nusxasi — aylanma require bo'lmasin)
 */
function sonoffChannels(device) {
  const base = Number.isInteger(device && device.channel) ? device.channel : 0;
  const list = [base];
  const extra = device && device.config && Array.isArray(device.config.channels) ? device.config.channels : [];
  for (const item of extra) {
    if (Number.isInteger(item) && item >= 0 && item <= MAX_OUTLET && !list.includes(item)) list.push(item);
  }
  return list.slice(0, 9);
}

/** Qurilma yozuvidan ish sozlamalari; noto'g'ri bo'lsa tushunarli xato */
function resolveSettings(device) {
  const config = device && device.config && typeof device.config === 'object' ? device.config : {};
  const rawHost = typeof device.host === 'string' ? device.host.trim() : '';
  if (!rawHost) throw new Error("Sonoff: qurilma manzili (host) ko'rsatilmagan");
  if (!isValidHost(rawHost)) throw new Error(`Sonoff: host formati noto'g'ri: "${rawHost.slice(0, 60)}"`);
  const { host, port } = splitHostPort(rawHost, DEFAULT_PORT);

  const deviceId = typeof config.deviceId === 'string' ? config.deviceId.trim() : '';
  if (deviceId && !DEVICE_ID_RE.test(deviceId)) {
    throw new Error("Sonoff: deviceId formati noto'g'ri (10 belgili eWeLink ID, masalan 1000abcdef)");
  }

  const encrypt = config.encrypt === true;
  let key = null;
  if (encrypt) {
    if (!deviceId) throw new Error('Sonoff: shifrlangan (eWeLink LAN) rejim uchun deviceId kiritilmagan');
    const devicekey = typeof device.auth === 'string' ? device.auth.trim() : '';
    if (!devicekey) {
      throw new Error('Sonoff: shifrlangan (eWeLink LAN) rejim uchun qurilma kaliti (devicekey) kiritilmagan');
    }
    // AES-128 kaliti = md5(devicekey) ning xom 16 bayti
    key = crypto.createHash('md5').update(devicekey, 'utf8').digest();
  }

  const channels = sonoffChannels(device);
  const outlets = typeof config.outlets === 'boolean' ? config.outlets : channels.length > 1 || channels[0] !== 0;

  return { origin: `${host}:${port}`, encrypt, deviceId, key, channels, outlets };
}

/* ------------------------------------------------------------------ */
/*  Shifrlash (eWeLink LAN)                                            */
/* ------------------------------------------------------------------ */

/** JSON `data` ni shifrlaydi: AES-128-CBC, PKCS7, tasodifiy 16 baytli IV */
function encryptData(data, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), data: encrypted.toString('base64') };
}

/** Shifrlangan javobni ochadi; JSON matn qaytaradi (kalit noto'g'ri bo'lsa throw) */
function decryptData(dataBase64, ivBase64, key) {
  const iv = Buffer.from(String(ivBase64), 'base64');
  if (iv.length !== 16) throw new Error("Sonoff: javobdagi IV noto'g'ri");
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  const plain = Buffer.concat([decipher.update(Buffer.from(String(dataBase64), 'base64')), decipher.final()]);
  // Ba'zi proshivkalar JSON oxiriga ortiqcha \x02 qo'shadi (SonoffLAN #1160)
  let end = plain.length;
  while (end > 0 && plain[end - 1] < 0x20) end -= 1;
  return plain.subarray(0, end).toString('utf8');
}

function nextSequence() {
  lastSequence = Math.max(Date.now(), lastSequence + 1);
  return String(lastSequence);
}

/** So'rov tanasi: DIY — ochiq, eWeLink LAN — shifrlangan */
function buildBody(settings, data, sequence) {
  if (!settings.encrypt) return { deviceid: settings.deviceId, data };
  const sealed = encryptData(data, settings.key);
  return {
    sequence,
    deviceid: settings.deviceId,
    selfApikey: '123',
    iv: sealed.iv,
    encrypt: true,
    data: sealed.data,
  };
}

/* ------------------------------------------------------------------ */
/*  Yuborish                                                           */
/* ------------------------------------------------------------------ */

function sleepFor(ctx, ms) {
  return ctx && typeof ctx.sleep === 'function' ? ctx.sleep(ms) : delay(ms);
}

/** Bir qurilmaga ketma-ket so'rovlar orasida kamida MIN_INTERVAL_MS */
async function pace(origin, ctx) {
  const last = lastRequestAt.get(origin);
  if (last === undefined) return;
  const wait = last + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleepFor(ctx, Math.min(wait, MIN_INTERVAL_MS));
}

function markRequest(origin) {
  const now = Date.now();
  lastRequestAt.set(origin, now);
  if (lastRequestAt.size > 256) {
    for (const [key, at] of lastRequestAt) if (now - at > 10_000) lastRequestAt.delete(key);
  }
}

/** Qurilma band bo'lganda ulanishni uzib yuboradi — faqat shunda qayta urinamiz */
function isConnectionReset(err) {
  return Boolean(err) && ['ECONNRESET', 'EPIPE'].includes(err.code);
}

function namedError(name, message) {
  const err = new Error(message);
  err.name = name; // errText() buni "timeout (javob kelmadi)" deb ko'rsatadi
  return err;
}

/**
 * Bitta JSON POST: kanonik sarlavhalar, keep-alive yo'q, muddat butun almashinuvga.
 * @returns {Promise<{ status: number, text: string }>}
 */
function postJson(origin, path, payload, timeoutMs, signal) {
  const { host, port } = splitHostPort(origin, DEFAULT_PORT);
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return new Promise((resolve, reject) => {
    let settled = false;
    let req = null;
    let timer = null;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (err) {
        if (req) req.destroy();
        reject(err);
      } else {
        resolve(value);
      }
    };
    const onAbort = () => finish(namedError('AbortError', "so'rov to'xtatildi"));

    if (signal && signal.aborted) {
      onAbort();
      return;
    }
    timer = setTimeout(() => finish(namedError('TimeoutError', 'javob kelmadi')), timeoutMs);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    try {
      req = http.request({
        host,
        port,
        path,
        method: 'POST',
        agent: false, // har so'rovga yangi ulanish — qurilma bitta ulanishni ushlab qolmasin
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, Connection: 'close' },
      }, (res) => {
        const chunks = [];
        let length = 0;
        res.on('data', (chunk) => {
          length += chunk.length;
          if (length > MAX_REPLY_BYTES) finish(new Error('Sonoff: javob juda katta'));
          else chunks.push(chunk);
        });
        res.on('end', () => finish(null, { status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', (err) => finish(err));
        res.on('close', () => {
          // Tana oxirigacha kelmasdan ulanish yopildi
          if (!res.complete) finish(Object.assign(new Error('javob uzildi'), { code: 'ECONNRESET' }));
        });
      });
      req.on('error', (err) => finish(err));
      req.end(body);
    } catch (err) {
      finish(err);
    }
  });
}

/** Qurilma `error` kodini panel uchun tushunarli matnga aylantiradi (kalitsiz!) */
function deviceErrorMessage(raw, settings, command) {
  const code = Number(raw);
  switch (code) {
    case 400:
      if (settings.encrypt) {
        return "Sonoff: so'rov rad etildi (xato 400) — qurilma DIY rejimida bo'lsa \"encrypt\" ni o'chiring";
      }
      return settings.deviceId
        ? "Sonoff: so'rov formati rad etildi (xato 400)"
        : "Sonoff: so'rov rad etildi (xato 400) — qurilma ID (deviceId) sini kiritib ko'ring";
    case 401:
      return settings.encrypt
        ? "Sonoff: qurilma so'rovni rad etdi (xato 401) — devicekey va deviceId ni tekshiring"
        : 'Sonoff: qurilmada shifrlash yoqilgan, DIY rejimida emas (xato 401) — DIY rejimini yoqing '
          + 'yoki "encrypt" va devicekey ni kiriting';
    case 404:
      return settings.deviceId
        ? "Sonoff: deviceId bu qurilmaga mos emas (xato 404) — ID ni tekshiring"
        : "Sonoff: qurilma deviceId talab qilyapti (xato 404) — 10 belgili qurilma ID sini kiriting";
    case 422:
      return command === 'switches'
        ? "Sonoff: qurilma kanal(lar)ni qabul qilmadi (xato 422) — kanal raqami yoki \"outlets\" sozlamasini tekshiring"
        : "Sonoff: qurilma buyruqni qabul qilmadi (xato 422) — ko'p kanalli qurilma bo'lsa \"outlets\" ni yoqing";
    default:
      if (raw === undefined || raw === null || raw === '') return "Sonoff: javobda natija kodi (error) yo'q";
      return `Sonoff: qurilma xato qaytardi (kod ${Number.isFinite(code) ? code : String(raw).slice(0, 20)})`;
  }
}

/**
 * POST /zeroconf/<command>. Muvaffaqiyatda javob obyektini qaytaradi
 * ({ seq, error: 0, data?, iv?, encrypt? }), aks holda throw qiladi.
 */
async function callDevice(settings, command, data, ctx) {
  const timeoutMs = Number.isFinite(ctx && ctx.timeoutMs) && ctx.timeoutMs > 0 ? ctx.timeoutMs : DEFAULT_TIMEOUT_MS;
  const signal = ctx ? ctx.signal : undefined;
  // Qayta urinishda ham bitta `sequence` (yangi IV bilan) — SonoffLAN shunday qiladi
  const sequence = settings.encrypt ? nextSequence() : undefined;

  await pace(settings.origin, ctx);
  let res;
  for (let attempt = 0; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      res = await postJson(settings.origin, `/zeroconf/${command}`, buildBody(settings, data, sequence), timeoutMs, signal);
      break;
    } catch (err) {
      if (attempt >= RESET_RETRIES || !isConnectionReset(err) || (signal && signal.aborted)) {
        const timedOut = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
        throw new Error(timedOut
          ? `Sonoff: qurilma javob bermadi — ${errText(err)}`
          : `Sonoff: qurilmaga ulanib bo'lmadi — ${errText(err)}`);
      }
    } finally {
      markRequest(settings.origin);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleepFor(ctx, RESET_RETRY_DELAY_MS);
  }

  if (res.status < 200 || res.status > 299) {
    if (res.status === 404 && command === 'switches') {
      throw new Error("Sonoff: qurilma ko'p kanalli buyruqni bilmaydi (HTTP 404) — \"outlets\" ni o'chiring");
    }
    if (res.status === 404 && command === 'switch') {
      throw new Error('Sonoff: qurilma bir kanalli buyruqni bilmaydi (HTTP 404) — "outlets" ni yoqing');
    }
    throw new Error(`Sonoff: HTTP ${res.status}`);
  }

  let reply;
  try {
    reply = JSON.parse(res.text);
  } catch {
    reply = null;
  }
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) {
    throw new Error('Sonoff: javob tushunarsiz (JSON emas) — qurilma DIY/LAN rejimidami?');
  }
  const code = typeof reply.error === 'number' ? reply.error
    : typeof reply.error === 'string' && reply.error.trim() ? Number(reply.error) : Number.NaN;
  if (code !== 0) throw new Error(deviceErrorMessage(reply.error, settings, command));
  return reply;
}

/* ------------------------------------------------------------------ */
/*  Holatni talqin qilish                                              */
/* ------------------------------------------------------------------ */

/**
 * Javobdagi `data` ni obyektga aylantiradi: obyekt, JSON matn (DIY 3.3.x) yoki
 * shifrlangan matn (iv bilan). O'qib bo'lmasa null.
 */
function replyData(reply, settings) {
  let data = reply.data;
  if (typeof data === 'string' && data && typeof reply.iv === 'string' && reply.iv
    && (settings.encrypt || reply.encrypt === true || reply.encrypt === 'true')) {
    if (!settings.key) return null; // DIY sozlamasida shifrlangan javob — kalit yo'q
    data = decryptData(data, reply.iv, settings.key);
  }
  if (typeof data === 'string') {
    const text = data.trim();
    if (!text) return {}; // SPM-Main: bo'sh `data`
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
  }
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

function parseSwitch(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (text === 'on') return true;
  if (text === 'off') return false;
  return null;
}

/**
 * Har kanal (outlet) uchun FIZIK holat. Yozishda qaysi API ishlatilgan bo'lsa,
 * o'sha maydon ustun: ko'p kanalli — `switches[]` (outlet bo'yicha), bir kanalli —
 * `switch` (faqat 0-kanal). Ikkinchisi zaxira. Topilmasa null.
 */
function outletStates(data, channels, outlets) {
  const list = data && Array.isArray(data.switches) ? data.switches : null;
  const fromList = (channel) => {
    const item = list && list.find((entry) => entry && typeof entry === 'object' && Number(entry.outlet) === channel);
    return item ? parseSwitch(item.switch) : null;
  };
  const fromSingle = (channel) => (channel === 0 && data && typeof data.switch === 'string' ? parseSwitch(data.switch) : null);
  return channels.map((channel) => {
    if (!data) return null;
    const first = outlets ? fromList(channel) : fromSingle(channel);
    return first !== null ? first : outlets ? fromSingle(channel) : fromList(channel);
  });
}

function deviceLabel(device) {
  return `stol #${device.tableNumber ?? device.tableId}`;
}

function logger(ctx) {
  return ctx && typeof ctx.log === 'function' ? ctx.log : () => {};
}

/* ------------------------------------------------------------------ */
/*  Drayver                                                            */
/* ------------------------------------------------------------------ */

const sonoffDriver = {
  name: 'sonoff',

  // DIY: /zeroconf/info ishonchli. eWeLink LAN: holat o'qish hamma proshivkada yo'q.
  readback: (device) => !(device && device.config && device.config.encrypt === true),

  // Bitta qurilma (ko'p kanalli 4CH ham) — buyruqlar navbat bilan
  lockKey(device) {
    const { host } = splitHostPort(device && device.host, DEFAULT_PORT);
    return host ? `sonoff:${host.toLowerCase()}` : null;
  },

  async write(device, physical, ctx) {
    const settings = resolveSettings(device);
    const state = physical ? 'on' : 'off';
    const mode = settings.encrypt ? 'LAN' : 'DIY';
    const log = logger(ctx);

    if (settings.outlets) {
      // Stolning BARCHA kanallari bitta so'rovda
      log('debug', `${deviceLabel(device)}: sonoff ${settings.origin} switches [${settings.channels.join(',')}] <- ${state} (${mode})`);
      await callDevice(settings, 'switches', {
        switches: settings.channels.map((outlet) => ({ switch: state, outlet })),
      }, ctx);
      return;
    }

    if (settings.channels.length > 1 || settings.channels[0] !== 0) {
      throw new Error("Sonoff: bir kanalli rejimda (outlets: false) faqat 0-kanal bor — ko'p kanalli rejimni yoqing");
    }
    log('debug', `${deviceLabel(device)}: sonoff ${settings.origin} switch <- ${state} (${mode})`);
    await callDevice(settings, 'switch', { switch: state }, ctx);
  },

  async read(device, ctx) {
    let settings;
    try {
      settings = resolveSettings(device);
    } catch {
      return sonoffChannels(device).map(() => null);
    }
    try {
      // DIY — /zeroconf/info; eWeLink LAN — getState (faqat ba'zi proshivkalarda)
      const reply = await callDevice(settings, settings.encrypt ? 'getState' : 'info', {}, ctx);
      let data = null;
      try {
        data = replyData(reply, settings);
      } catch {
        data = null; // kalit mos emas yoki buzilgan javob
      }
      return outletStates(data, settings.channels, settings.outlets);
    } catch (err) {
      // Holatni o'qish majburiy emas — xato yuqoriga chiqmaydi (matnda kalit yo'q)
      logger(ctx)('debug', `${deviceLabel(device)}: Sonoff holatini o'qib bo'lmadi — ${err.message}`);
      return settings.channels.map(() => null);
    }
  },
};

module.exports = {
  definitions: [sonoffDriver],
  sonoffDriver,
  sonoffChannels,
  encryptData,
  decryptData,
};
