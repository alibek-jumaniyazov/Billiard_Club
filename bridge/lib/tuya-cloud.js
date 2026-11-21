'use strict';

/**
 * Billiard Club — bridge agenti: TUYA IoT BULUTIDAN "LOCAL KEY" LARNI IMPORT QILISH.
 *
 * Faqat SOZLASH paytida, bir marta ishlatiladi: klub Tuya IoT Platform (iot.tuya.com) da
 * "Cloud project" ochib, Smart Life ilovasi hisobini unga bog'laydi va Access ID /
 * Access Secret ni kiritadi. Agent qurilmalar ro'yxatini oladi:
 *   [{ id, name, localKey, ip?, productName, online }]
 * Shundan keyin chiroqlar to'liq LOKAL (internetsiz) boshqariladi (lib/tuya-protocol.js).
 *
 * Imzo (Tuya OpenAPI "new signature" algoritmi):
 *   token so'rovi:   str = client_id + t + nonce + stringToSign
 *   boshqa so'rovlar: str = client_id + access_token + t + nonce + stringToSign
 *   stringToSign = METHOD + "\n" + SHA256(body) + "\n" + [imzolanadigan sarlavhalar] + "\n" + URL
 *   URL = yo'l + "?" + kalit bo'yicha tartiblangan so'rov parametrlari (kodlanmagan)
 *   sign = HMAC-SHA256(secret, str) — katta harfli hex; t — millisekundlarda
 * Rasmiy hujjatdagi ikkala misol (developer.tuya.com, "new-singnature") testda tekshiriladi.
 * nonce va qo'shimcha imzo sarlavhalari yuborilmaydi (tinytuya va tuya-connector-python kabi).
 *
 * MAXFIY: accessSecret, access_token va local key lar logga ham, xato matniga ham chiqmaydi.
 * npm bog'liqligi YO'Q — global fetch (Node 18+).
 */

const crypto = require('node:crypto');
const { errText, fetchWithTimeout } = require('./common');

/** Tuya ma'lumot markazlari (tinytuya Cloud.py bilan bir xil) */
const REGION_HOSTS = Object.freeze({
  eu: 'openapi.tuyaeu.com', // Markaziy Yevropa
  'eu-w': 'openapi-weaz.tuyaeu.com', // G'arbiy Yevropa
  us: 'openapi.tuyaus.com', // G'arbiy Amerika
  'us-e': 'openapi-ueaz.tuyaus.com', // Sharqiy Amerika
  cn: 'openapi.tuyacn.com', // Xitoy
  in: 'openapi.tuyain.com', // Hindiston
  sg: 'openapi-sg.iotbing.com', // Singapur
});

const DEFAULT_TIMEOUT_MS = 10_000;

/** associated-users ro'yxati sahifa hajmi (tinytuya bilan bir xil) */
const PAGE_SIZE = 50;
const MAX_PAGES = 50;

/** Kompyuter soati shuncha farq qilsa server vaqti bilan bir marta qayta urinamiz */
const CLOCK_SKEW_MS = 60_000;

const CREDENTIAL_RE = /^[\x21-\x7e]{6,128}$/;
const USER_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** Ma'lum xato kodlari uchun maslahat */
const HINTS = Object.freeze({
  1004: 'Access ID / Access Secret va kompyuter soatini tekshiring',
  1010: "token yaroqsiz — qayta urinib ko'ring",
  1106: "ruxsat yo'q — region va loyihaga bog'langan Smart Life hisobini tekshiring",
});

/** So'rov parametrlari: imzo uchun (kodlanmagan) va URL uchun (kodlangan), kalit bo'yicha tartiblangan */
function sortedQuery(query = {}) {
  const keys = Object.keys(query)
    .filter((key) => query[key] !== undefined && query[key] !== null && query[key] !== '')
    .sort();
  return {
    signed: keys.map((key) => `${key}=${query[key]}`).join('&'),
    encoded: keys.map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`).join('&'),
  };
}

/**
 * Tuya OpenAPI imzosi.
 * @param {object} p { clientId, secret, t, nonce?, accessToken?, method?, body?, url, signHeaders?: [key, value][] }
 * @returns {string} katta harfli hex HMAC-SHA256
 */
function signRequest({
  clientId, secret, t, nonce = '', accessToken = '', method = 'GET', body = '', url, signHeaders = [],
}) {
  const bodyHash = crypto.createHash('sha256').update(body || '', 'utf8').digest('hex');
  const headerBlock = signHeaders.map(([key, value]) => `${key}:${value}\n`).join('');
  const stringToSign = `${String(method).toUpperCase()}\n${bodyHash}\n${headerBlock}\n${url}`;
  return crypto.createHmac('sha256', secret)
    .update(`${clientId}${accessToken}${t}${nonce}${stringToSign}`, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/** Bulut xabaridan maxfiy qiymatlarni olib tashlaydi va qisqartiradi */
function cleanMessage(text, secrets) {
  let message = typeof text === 'string' ? text : '';
  for (const secret of secrets) if (secret) message = message.split(secret).join('***');
  // eslint-disable-next-line no-control-regex
  return message.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function cloudError(data, session) {
  const code = data && data.code !== undefined && data.code !== null ? String(data.code) : '?';
  const message = cleanMessage(data && data.msg, [session.accessSecret, session.token]);
  const hint = HINTS[code];
  return new Error(`Tuya bulut xatosi (kod ${code})${message ? `: ${message}` : ''}${hint ? ` — ${hint}` : ''}`);
}

/** Bitta imzolangan GET so'rov; javob JSON obyekti (success tekshirilmagan) */
async function signedGet(session, path, query) {
  const { signed, encoded } = sortedQuery(query);
  const t = String(Date.now() + session.clockOffset);
  const sign = signRequest({
    clientId: session.accessId,
    secret: session.accessSecret,
    t,
    accessToken: session.token || '',
    method: 'GET',
    url: signed ? `${path}?${signed}` : path,
  });
  const headers = { client_id: session.accessId, sign, t, sign_method: 'HMAC-SHA256' };
  if (session.token) headers.access_token = session.token;

  let response;
  try {
    response = await fetchWithTimeout(
      `${session.baseUrl}${path}${encoded ? `?${encoded}` : ''}`,
      { method: 'GET', headers },
      session.timeoutMs,
      session.signal,
    );
  } catch (err) {
    throw new Error(`Tuya bulut: ulanib bo'lmadi (${errText(err)})`);
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`Tuya bulut: HTTP ${response.status}`);
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* pastda xato */
  }
  if (!data || typeof data !== 'object') throw new Error('Tuya bulut: javob JSON emas');
  return data;
}

/** So'rov + muvaffaqiyat tekshiruvi; soat farqi katta bo'lsa server vaqti bilan bir marta qayta */
async function call(session, path, query) {
  let data = await signedGet(session, path, query);
  if (!data.success && !session.clockSynced && typeof data.t === 'number'
    && Math.abs(data.t - (Date.now() + session.clockOffset)) > CLOCK_SKEW_MS) {
    session.clockSynced = true;
    session.clockOffset = data.t - Date.now();
    data = await signedGet(session, path, query);
  }
  if (!data.success) throw cloudError(data, session);
  return data.result;
}

/** Natijadan qurilmalar massivi: [..] | { devices: [..] } | { list: [..] } */
function deviceArray(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.devices)) return result.devices;
  if (result && Array.isArray(result.list)) return result.list;
  return [];
}

/** Loyihaga bog'langan barcha ilova hisoblari qurilmalari (sahifalab) */
async function listAssociatedDevices(session) {
  const devices = [];
  let lastRowKey = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = { size: PAGE_SIZE };
    if (lastRowKey) query.last_row_key = lastRowKey;
    // eslint-disable-next-line no-await-in-loop
    const result = await call(session, '/v1.0/iot-01/associated-users/devices', query);
    devices.push(...deviceArray(result));
    const next = result && typeof result.last_row_key === 'string' ? result.last_row_key : '';
    if (!(result && result.has_more) || !next || next === lastRowKey) break;
    lastRowKey = next;
  }
  return devices;
}

/** Bitta foydalanuvchi (uid) qurilmalari */
async function listUserDevices(session, userId) {
  return deviceArray(await call(session, `/v1.0/users/${userId}/devices`, {}));
}

/** Xususiy (LAN) IPv4 manzilmi — bulutdagi `ip` odatda tashqi (WAN) manzil bo'ladi */
function isPrivateIpv4(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value.trim());
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  if (match.slice(1).some((part) => Number(part) > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function mapDevice(raw) {
  const device = {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 100) : '',
    localKey: typeof raw.local_key === 'string' ? raw.local_key : '',
    productName: typeof raw.product_name === 'string' ? raw.product_name.trim().slice(0, 100) : '',
    online: raw.online === true,
  };
  // Bulut bergan `ip` ko'pincha routerning tashqi manzili — faqat LAN manzil bo'lsa qaytaramiz
  if (isPrivateIpv4(raw.ip)) device.ip = raw.ip.trim();
  return device;
}

function requireCredential(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`Tuya bulut: ${label} kiritilmagan`);
  if (!CREDENTIAL_RE.test(text)) throw new Error(`Tuya bulut: ${label} noto'g'ri`);
  return text;
}

/**
 * Tuya IoT bulutidan qurilmalar va ularning local key larini oladi.
 * @param {object} options
 *   accessId, accessSecret  Tuya IoT loyihasining Access ID / Access Secret
 *   region                  'eu' | 'us' | 'cn' | 'in' (shuningdek 'eu-w', 'us-e', 'sg')
 *   userId                  ixtiyoriy: faqat shu ilova foydalanuvchisi (uid) qurilmalari
 *   signal, timeoutMs       to'xtatish signali va har so'rov uchun muddat (standart 10 s)
 * @returns {Promise<Array<{ id, name, localKey, ip?, productName, online }>>}
 */
async function fetchTuyaCloudDevices(options = {}) {
  const accessId = requireCredential(options.accessId, 'Access ID');
  const accessSecret = requireCredential(options.accessSecret, 'Access Secret');
  const region = String(options.region || '').trim().toLowerCase();
  // `baseUrl` — faqat testlar uchun (lokal soxta server)
  const baseUrl = typeof options.baseUrl === 'string' && options.baseUrl
    ? options.baseUrl.replace(/\/+$/, '')
    : REGION_HOSTS[region] ? `https://${REGION_HOSTS[region]}` : null;
  if (!baseUrl) {
    throw new Error(`Tuya bulut: region noto'g'ri — ${Object.keys(REGION_HOSTS).join(', ')} dan biri bo'lishi kerak`);
  }
  let userId = '';
  if (options.userId !== undefined && options.userId !== null && String(options.userId).trim()) {
    userId = String(options.userId).trim();
    if (!USER_ID_RE.test(userId)) throw new Error("Tuya bulut: foydalanuvchi ID (uid) noto'g'ri");
  }

  const session = {
    accessId,
    accessSecret,
    token: null,
    baseUrl,
    clockOffset: 0,
    clockSynced: false,
    timeoutMs: Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS,
    signal: options.signal,
  };

  const token = await call(session, '/v1.0/token', { grant_type: 1 });
  if (!token || typeof token.access_token !== 'string' || !token.access_token) {
    throw new Error('Tuya bulut: token olinmadi');
  }
  session.token = token.access_token;

  const raw = userId ? await listUserDevices(session, userId) : await listAssociatedDevices(session);
  const unique = new Map();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || item.id === undefined || item.id === null) continue;
    const device = mapDevice(item);
    if (!unique.has(device.id)) unique.set(device.id, device);
  }
  return Array.from(unique.values());
}

module.exports = {
  fetchTuyaCloudDevices,
  signRequest,
  sortedQuery,
  isPrivateIpv4,
  REGION_HOSTS,
};
