'use strict';

/**
 * Billiard Club — bridge agenti: HTTP orqali boshqariladigan qurilmalar drayveri.
 *
 * Qo'llab-quvvatlanadi:
 *   shelly_gen1     — /relay/{kanal}?turn=on|off              (Basic auth)
 *   shelly_gen2     — /rpc/Switch.Set?id={kanal}&on=true|false (Digest auth, SHA-256)
 *   tasmota         — /cm?cmnd=Power{kanal+1}%20ON|OFF        (Basic auth)
 *   esphome         — POST /switch/{entity}/turn_on|turn_off  (Basic auth)
 *   home_assistant  — POST /api/services/{domain}/turn_on|turn_off (Bearer token)
 *   http            — foydalanuvchi kiritgan onUrl/offUrl shabloni
 *
 * Barcha funksiyalar FIZIK holat bilan ishlaydi (inverted ni chaqiruvchi hisoblaydi).
 * Parol/token HECH QACHON URL ga yozilmaydi va logga chiqmaydi — faqat sarlavhada ketadi.
 */

const crypto = require('node:crypto');
const { errText, isValidHost, parseStateValue, fetchWithTimeout } = require('./common');

/** Shu modul bajara oladigan drayverlar */
const HTTP_DRIVERS = new Set([
  'shelly_gen1',
  'shelly_gen2',
  'tasmota',
  'esphome',
  'home_assistant',
  'http',
]);

/**
 * Qurilmaga buyruq yuboradi. Xato bo'lsa throw qiladi.
 *
 * @param {object} device   serverdan kelgan qurilma yozuvi
 * @param {boolean} physical relega yuboriladigan FIZIK qiymat
 * @param {number} channel  kanal raqami (ko'p kanalli qurilmalarda takrorlanadi)
 * @param {object} ctx      { timeoutMs, signal, log }
 */
async function apply(device, physical, channel, ctx) {
  const request = buildCommandRequest(device, physical, channel);
  ctx.log('debug', `${deviceLabel(device)}: ${request.method} ${request.url}`);
  const res = await send(request, device, ctx);

  if (!res.ok) {
    // Javob tanasi o'qib bo'shatiladi, lekin xato matniga QO'SHILMAYDI (panelga chiqadi)
    await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}`);
  }
  await res.text().catch(() => '');
}

/**
 * Qurilmaning HAQIQIY (fizik) holatini o'qiydi.
 * Qurilma javob bermasa yoki format tushunarsiz bo'lsa `null` qaytadi — bu xato emas.
 */
async function read(device, channel, ctx) {
  let request;
  try {
    request = buildReadRequest(device, channel);
  } catch {
    return null;
  }
  if (!request) return null;

  try {
    const res = await send(request, device, ctx);
    if (!res.ok) {
      await res.text().catch(() => '');
      return null;
    }
    const text = await res.text();
    return request.pick ? request.pick(text) : parseStateValue(text, 'ON');
  } catch {
    // Holatni o'qish majburiy emas — xatoni yuqoriga chiqarmaymiz
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  So'rovlarni yig'ish                                                */
/* ------------------------------------------------------------------ */

/** Buyruq (yoqish/o'chirish) so'rovi */
function buildCommandRequest(device, physical, channel) {
  const config = device.config || {};
  const ch = Number.isInteger(channel) ? channel : 0;

  switch (device.driver) {
    case 'shelly_gen1':
      return {
        method: 'GET',
        url: `http://${requireHost(device)}/relay/${ch}?turn=${physical ? 'on' : 'off'}`,
      };

    case 'shelly_gen2':
      return {
        method: 'GET',
        url: `http://${requireHost(device)}/rpc/Switch.Set?id=${ch}&on=${physical ? 'true' : 'false'}`,
      };

    case 'tasmota':
      // %20 allaqachon kodlangan — qo'shimcha kodlash kerak emas
      return {
        method: 'GET',
        url: `http://${requireHost(device)}/cm?cmnd=Power${ch + 1}%20${physical ? 'ON' : 'OFF'}`,
      };

    case 'esphome': {
      const entity = requireEntity(config.entity, 'esphome uchun "entity"');
      const url = `http://${requireHost(device)}/switch/${encodeURIComponent(entity)}`;
      return { method: 'POST', url: `${url}/${physical ? 'turn_on' : 'turn_off'}` };
    }

    case 'home_assistant': {
      const entityId = requireEntity(config.entityId, 'home_assistant uchun "entityId"');
      const domain = entityId.split('.')[0];
      return {
        method: 'POST',
        url: `http://${requireHost(device)}/api/services/${domain}/${physical ? 'turn_on' : 'turn_off'}`,
        body: JSON.stringify({ entity_id: entityId }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    case 'http': {
      const template = physical ? device.onUrl : device.offUrl;
      if (!template || typeof template !== 'string') {
        throw new Error(`http drayveri uchun ${physical ? 'onUrl' : 'offUrl'} kiritilmagan`);
      }
      const url = template
        .split('{channel}').join(String(ch))
        .split('{state}').join(physical ? 'on' : 'off');
      return { method: 'GET', url };
    }

    default:
      throw new Error(`http-device: noma'lum drayver "${device.driver}"`);
  }
}

/** Holatni o'qish so'rovi (qo'llab-quvvatlanmasa null) */
function buildReadRequest(device, channel) {
  const config = device.config || {};
  const ch = Number.isInteger(channel) ? channel : 0;

  switch (device.driver) {
    case 'shelly_gen1':
      return {
        method: 'GET',
        url: `http://${requireHost(device)}/relay/${ch}`,
        pick: (text) => pickJson(text, ['ison']),
      };

    case 'shelly_gen2':
      return {
        method: 'GET',
        url: `http://${requireHost(device)}/rpc/Switch.GetStatus?id=${ch}`,
        pick: (text) => pickJson(text, ['output']),
      };

    case 'tasmota':
      return {
        method: 'GET',
        url: `http://${requireHost(device)}/cm?cmnd=Power${ch + 1}`,
        // Ko'p kanalli qurilmada {"POWER2":"ON"}, bir kanallida {"POWER":"ON"}
        pick: (text) => pickJson(text, [`POWER${ch + 1}`, 'POWER']),
      };

    case 'esphome': {
      const entity = config.entity;
      if (!entity) return null;
      return {
        method: 'GET',
        url: `http://${requireHost(device)}/switch/${encodeURIComponent(entity)}`,
        pick: (text) => pickJson(text, ['state', 'value']),
      };
    }

    case 'home_assistant': {
      const entityId = config.entityId;
      if (!entityId) return null;
      return {
        method: 'GET',
        url: `http://${requireHost(device)}/api/states/${encodeURIComponent(entityId)}`,
        pick: (text) => pickJson(text, ['state']),
      };
    }

    // http — ixtiyoriy shablon, holatni o'qishning yagona usuli yo'q
    default:
      return null;
  }
}

/** JSON javobdan birinchi mos maydonni olib boolean ga aylantiradi */
function pickJson(text, fields) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return parseStateValue(text, 'ON');
  }
  if (!data || typeof data !== 'object') return parseStateValue(text, 'ON');
  for (const field of fields) {
    if (data[field] !== undefined) return parseStateValue(data[field], 'ON');
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Yuborish va autentifikatsiya                                       */
/* ------------------------------------------------------------------ */

/**
 * So'rovni yuboradi; 401 kelsa va qurilmada parol bo'lsa —
 * Digest auth hisoblab BIR MARTA qayta yuboradi (Shelly Gen2/Plus/Pro shu usulda).
 */
async function send(request, device, ctx) {
  const headers = {
    Accept: '*/*',
    ...(request.headers || {}),
    ...buildAuthHeader(device),
  };

  const options = {
    method: request.method,
    headers,
    body: request.body,
    // Yo'naltirish kuzatilmaydi: 3xx ham muvaffaqiyatsizlik hisoblanadi
    redirect: 'manual',
  };

  const res = await fetchWithTimeout(request.url, options, ctx.timeoutMs, ctx.signal);
  if (res.status !== 401 || !device.auth) return res;

  const challenge = res.headers.get('www-authenticate') || '';
  if (!/digest/i.test(challenge)) return res;

  await res.text().catch(() => '');
  const digest = buildDigestHeader(challenge, device.auth, request.method, request.url);
  if (!digest) return res;

  ctx.log('debug', `${deviceLabel(device)}: digest auth bilan qayta yuborilmoqda`);
  return fetchWithTimeout(
    request.url,
    { ...options, headers: { ...headers, Authorization: digest } },
    ctx.timeoutMs,
    ctx.signal,
  );
}

/**
 * Boshlang'ich autentifikatsiya sarlavhasi.
 * home_assistant — Bearer token, qolganlari — Basic "user:parol".
 */
function buildAuthHeader(device) {
  if (!device.auth) return {};
  if (device.driver === 'home_assistant') {
    return { Authorization: `Bearer ${String(device.auth).trim()}` };
  }
  return { Authorization: `Basic ${Buffer.from(String(device.auth), 'utf8').toString('base64')}` };
}

/**
 * RFC 7616 Digest javobini yig'adi (SHA-256 va MD5, qop=auth).
 * `auth` "user:parol" ko'rinishida bo'ladi; parol hech qayerda loglanmaydi.
 */
function buildDigestHeader(challenge, auth, method, url) {
  const params = parseAuthParams(challenge);
  if (!params.nonce) return null;

  const separator = String(auth).indexOf(':');
  const username = separator === -1 ? 'admin' : String(auth).slice(0, separator);
  const password = separator === -1 ? String(auth) : String(auth).slice(separator + 1);

  const algorithm = String(params.algorithm || 'MD5').toUpperCase();
  const hash = algorithm.startsWith('SHA-256')
    ? (text) => crypto.createHash('sha256').update(text).digest('hex')
    : (text) => crypto.createHash('md5').update(text).digest('hex');

  let uri = '/';
  try {
    const parsed = new URL(url);
    uri = `${parsed.pathname}${parsed.search}`;
  } catch {
    /* URL allaqachon tekshirilgan — bu yerga tushmasligi kerak */
  }

  const qopList = String(params.qop || '').split(',').map((item) => item.trim().toLowerCase());
  const qop = qopList.includes('auth') ? 'auth' : '';
  const realm = params.realm || '';
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');

  const ha1 = hash(`${username}:${realm}:${password}`);
  const ha2 = hash(`${method}:${uri}`);
  const response = qop
    ? hash(`${ha1}:${params.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : hash(`${ha1}:${params.nonce}:${ha2}`);

  const parts = [
    `username="${escapeQuoted(username)}"`,
    `realm="${escapeQuoted(realm)}"`,
    `nonce="${escapeQuoted(params.nonce)}"`,
    `uri="${escapeQuoted(uri)}"`,
    `algorithm=${algorithm}`,
    `response="${response}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (params.opaque) parts.push(`opaque="${escapeQuoted(params.opaque)}"`);

  return `Digest ${parts.join(', ')}`;
}

/** `Digest realm="shelly", nonce="...", algorithm=SHA-256` -> obyekt */
function parseAuthParams(challenge) {
  const params = {};
  const re = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|([^,\s]+))/g;
  let match = re.exec(challenge);
  while (match) {
    params[match[1].toLowerCase()] = match[2] !== undefined ? match[2] : match[3];
    match = re.exec(challenge);
  }
  return params;
}

function escapeQuoted(text) {
  return String(text).replace(/["\\]/g, '');
}

/* ------------------------------------------------------------------ */
/*  Kichik yordamchilar                                                */
/* ------------------------------------------------------------------ */

function requireHost(device) {
  const host = typeof device.host === 'string' ? device.host.trim() : '';
  if (!host) throw new Error("qurilma manzili (host) ko'rsatilmagan");
  if (!isValidHost(host)) throw new Error(`host formati noto'g'ri: "${host}"`);
  return host;
}

function requireEntity(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`${label} kiritilmagan`);
  return text;
}

function deviceLabel(device) {
  return `stol #${device.tableNumber ?? device.tableId}`;
}

module.exports = { HTTP_DRIVERS, apply, read };
