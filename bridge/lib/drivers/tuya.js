'use strict';

/**
 * TUYA / SMART LIFE drayveri — lokal tarmoq orqali, BULUTSIZ (lib/tuya-protocol.js).
 * lib/drivers/index.js shartnomasi bo'yicha ro'yxatga olinadi.
 *
 * Stol sozlamasi (server paneli aynan shu shaklni yuboradi):
 *   host             qurilma IP manzili, ixtiyoriy ":port" (standart 6668) — majburiy
 *   auth             Tuya "local key" (16 ta belgi) — majburiy, MAXFIY: logga chiqmaydi
 *   config.deviceId  Tuya qurilma ID (gwId/devId), 10–40 lotin harf/raqam — majburiy
 *   config.version   '3.1' | '3.3' | '3.4' | '3.5' (standart '3.3')
 *   config.dps       ixtiyoriy: har kanal O'RNI uchun aniq DP raqami ([1] yoki [20]);
 *                    berilmagan o'rinda DP = kanal + 1 (switch_1 = DP 1, switch_2 = DP 2, ...)
 *   channel / config.channels — stol kanallari (asosiy kanal doim birinchi, jami ≤ 9)
 *
 * Yozish: stolning BARCHA DP lari BITTA CONTROL xabarida ({"1":true,"2":true}).
 * O'qish: holat so'rovi (DP_QUERY / DP_QUERY_NEW) — har kanal uchun boolean yoki null.
 * Navbat kaliti: `tuya:<ip>:<deviceId>` — bitta qurilma bir vaqtda bitta TCP mijozni oladi.
 */

const { splitHostPort } = require('../common');
const tuya = require('../tuya-protocol');

/** Kanal raqamining yuqori chegarasi (DP = kanal + 1 ≤ 255 bo'lishi kerak) */
const MAX_CHANNEL = 255;

/**
 * Bir vaqtda faqat BITTA DP qabul qiladigan qurilmalar (navbat kaliti bo'yicha).
 * Ko'p DP li xabar buyruq bosqichida javobsiz qolsa yoki rad etilsa, keyingi urinishlarda
 * DP lar alohida xabarlarda yuboriladi (tinytuya ham shunday qiladi: max_simultaneous_dps = 1).
 */
const singleDpDevices = new Set();

/**
 * Stol kanallari: asosiy `channel` doim birinchi, keyin takrorlanmagan qo'shimchalar, jami ≤ 9.
 * index.js dagi deviceChannels(device, 255) bilan bir xil — aylanma require bo'lmasligi uchun shu yerda.
 */
function tuyaChannels(device) {
  const base = Number.isInteger(device.channel) ? device.channel : 0;
  const list = [base];
  const extra = device.config && Array.isArray(device.config.channels) ? device.config.channels : [];
  for (const item of extra) {
    if (Number.isInteger(item) && item >= 0 && item <= MAX_CHANNEL && !list.includes(item)) list.push(item);
  }
  return list.slice(0, 9);
}

/** Bitta DP qiymatini butun songa aylantiradi (raqamli matn ham qabul qilinadi) */
function parseDp(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && /^\s*\d{1,3}\s*$/.test(raw)) return Number(raw);
  return Number.NaN;
}

/**
 * Har kanal o'rni uchun DP raqami: `config.dps[i]` berilgan bo'lsa o'sha, aks holda kanal + 1.
 * Noto'g'ri DP (1..255 dan tashqari) — sozlash xatosi, jim o'tkazib yuborilmaydi.
 */
function tuyaDps(device) {
  const config = device.config && typeof device.config === 'object' ? device.config : {};
  const raw = config.dps;
  const explicit = Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === '' ? [] : [raw];
  return tuyaChannels(device).map((channel, index) => {
    const given = index < explicit.length ? explicit[index] : undefined;
    const dp = given === undefined || given === null || given === '' ? channel + 1 : parseDp(given);
    if (!Number.isInteger(dp) || dp < 1 || dp > 255) {
      throw new Error(`Tuya: DP raqami noto'g'ri (${String(given ?? dp).slice(0, 20)}) — 1..255 bo'lishi kerak`);
    }
    return dp;
  });
}

/** Stol yozuvidan protokol sozlamalari (tekshiruv tuya-protocol.normalizeOptions da) */
function buildOptions(device, ctx = {}) {
  const config = device.config && typeof device.config === 'object' ? device.config : {};
  return {
    host: typeof device.host === 'string' ? device.host : '',
    deviceId: config.deviceId,
    localKey: device.auth,
    version: config.version,
    timeoutMs: ctx.timeoutMs,
    signal: ctx.signal,
    log: ctx.log,
  };
}

function lockKey(device) {
  const { host } = splitHostPort(device.host, tuya.DEFAULT_PORT);
  const deviceId = typeof device.config?.deviceId === 'string' ? device.config.deviceId.trim() : '';
  return `tuya:${String(host || '').toLowerCase()}:${deviceId}`;
}

function tableLabel(device) {
  return `stol #${device.tableNumber ?? device.tableId}`;
}

/** Xato matni uchun qisqa qiymat */
function shortValue(value) {
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}

function logDebug(ctx, message) {
  if (ctx && typeof ctx.log === 'function') {
    try {
      ctx.log('debug', message);
    } catch {
      /* e'tiborsiz */
    }
  }
}

module.exports = {
  name: 'tuya',
  // Holatni DP so'rovi bilan o'qib tasdiqlash mumkin
  readback: () => true,
  lockKey,

  async write(device, physical, ctx = {}) {
    const options = buildOptions(device, ctx);
    const dps = {};
    for (const dp of tuyaDps(device)) dps[String(dp)] = physical === true;
    const key = lockKey(device);
    const multi = Object.keys(dps).length > 1;
    const single = multi && singleDpDevices.has(key);
    logDebug(ctx, `${tableLabel(device)}: tuya <- ${JSON.stringify(dps)}${single ? ' (DP lar alohida)' : ''}`);
    try {
      await tuya.setDps(options, dps, { singleDp: single });
    } catch (err) {
      // Ko'p DP li xabar javobsiz qolsa / rad etilsa — keyingi urinishda DP lar alohida yuboriladi
      if (multi && !single && err && err.tuyaPhase === 'command'
        && ['timeout', 'rejected', 'closed'].includes(err.tuyaReason)) {
        singleDpDevices.add(key);
        logDebug(ctx, `${tableLabel(device)}: tuya — keyingi urinishda DP lar alohida xabarlarda yuboriladi`);
      }
      throw err;
    }
  },

  async read(device, ctx = {}) {
    const options = buildOptions(device, ctx);
    const dpList = tuyaDps(device);
    const reported = await tuya.queryDps(options, dpList);
    const values = dpList.map((dp) => tuya.dpBoolean(reported[String(dp)]));
    if (values.some((value) => value === null)) {
      const known = Object.keys(reported).slice(0, 20).join(',') || '—';
      logDebug(ctx, `${tableLabel(device)}: tuya javobida DP ${dpList.join(',')} to'liq emas (qurilmadagi DP lar: ${known})`);
      // DP bor, lekin mantiqiy emas — bu yoqish kanali emas (masalan, energiya hisoblagichli
      // automatda DP 1 — kVt·soat, yoqish esa DP 16). Qiymatlar shartnomasi o'zgarmaydi (null),
      // aniq sabab esa `reason` da (sanalmaydigan xossa) — markaz uni sinov oynasiga chiqaradi.
      const index = values.findIndex((value, i) => value === null && reported[String(dpList[i])] !== undefined
        && reported[String(dpList[i])] !== null);
      const reason = index >= 0
        ? `Tuya: DP ${dpList[index]} bu qurilmada yoqish-o'chirish kanali emas (qiymati: ${shortValue(reported[String(dpList[index])])}). `
          + "Qurilma sozlamasida «Boshqaruv DP» raqamini to'g'rilang — energiya hisoblagichli Wi‑Fi automatlarda odatda 16"
        : `Tuya: DP ${dpList[values.findIndex((value) => value === null)]} qurilma javobida yo'q (qurilmadagi DP lar: ${known}). `
          + '«Boshqaruv DP» raqamini tekshiring';
      Object.defineProperty(values, 'reason', { value: reason, enumerable: false });
    }
    return values;
  },

  // Testlar va sozlash ustasi uchun
  tuyaChannels,
  tuyaDps,
  buildOptions,
  singleDpDevices,
};
