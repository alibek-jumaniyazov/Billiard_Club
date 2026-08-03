'use strict';

/**
 * Billiard Club — bridge agenti: LOKAL TARMOQNI SKANERLASH (discover).
 *
 * Server "discover" tasky yuborganda agent klub tarmog'idagi 1..254 manzillarni
 * ko'rib chiqadi va Shelly / Tasmota / ESPHome qurilmalarini topadi.
 * Natija `POST /api/bridge/discovered` orqali serverga qaytariladi va panelda
 * "stolga biriktirish" tugmasi bilan ishlatiladi.
 *
 * Tartib (har bir IP uchun):
 *   1) 80-port ochiqmi (tez TCP tekshiruv) — yopiq bo'lsa keyingisiga o'tamiz
 *   2) GET /shelly            -> Shelly Gen1/Gen2
 *   3) GET /cm?cmnd=Status    -> Tasmota
 *   4) GET /                  -> sahifada "ESPHome" bo'lsa
 *
 * npm bog'liqligi YO'Q — global fetch va node:net/node:os.
 */

const net = require('node:net');
const os = require('node:os');
const dgram = require('node:dgram');
const { errText, clampInt, fetchWithTimeout } = require('./common');

/** Bir vaqtda tekshiriladigan manzillar soni */
const DEFAULT_PARALLEL = 32;

/** Bitta HTTP so'rov uchun kutish (ms) */
const DEFAULT_TIMEOUT_MS = 700;

/** 80-port ochiqligini tekshirish muddati (ms) */
const PORT_TIMEOUT_MS = 400;

/** Serverga yuboriladigan maksimal qurilma soni (DTO chegarasi) */
const MAX_DEVICES = 256;

/** Marshrutni aniqlash uchun UDP "connect" muddati (ms) */
const ROUTE_TIMEOUT_MS = 700;

/** Docker / VPN / virtual adapterlar — klub tarmog'i ular ortida EMAS */
const VIRTUAL_IFACE_RE =
  /docker|veth|br-|virbr|vmnet|vboxnet|vethernet|hyper-v|wsl|tailscale|zerotier|wg\d|tun\d|tap\d|utun|ppp|loopback|bluetooth/i;

/** IPv4 manzilni /24 tarmoqqa aylantiradi: '192.168.1.7' -> '192.168.1' */
function toSubnet(address) {
  const parts = String(address || '').split('.');
  return parts.length === 4 ? parts.slice(0, 3).join('.') : null;
}

/**
 * Lokal manzil skanerlash uchun yaroqlimi.
 * DNS ishlamaganda soket `0.0.0.0` qaytaradi, server lokal bo'lsa `127.0.0.1` —
 * bunday manzillardan tarmoq chiqarib bo'lmaydi.
 */
function isUsableLocalAddress(address) {
  const text = String(address || '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return false;
  if (text.split('.').some((oct) => Number(oct) > 255)) return false;
  return !/^(0\.|127\.|169\.254\.|255\.)/.test(text);
}

/** Xususiy diapazon ustuvorligi: 192.168 -> 10 -> 172.16-31 -> qolganlari */
function privateRank(address) {
  if (/^192\.168\./.test(address)) return 3;
  if (/^10\./.test(address)) return 2;
  const match = /^172\.(\d{1,3})\./.exec(address);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return 1;
  return 0;
}

/**
 * Serverga chiqishda ISHLATILADIGAN interfeys manzilini aniqlaydi.
 * UDP soketni "connect" qilish hech qanday paket YUBORMAYDI — tizim faqat
 * marshrutni tanlaydi va biz `address()` dan lokal IP ni olamiz.
 */
function routedAddress(host, timeoutMs) {
  return new Promise((resolve) => {
    if (!host) {
      resolve(null);
      return;
    }

    let socket = null;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        if (socket) socket.close();
      } catch {
        /* e'tiborsiz */
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    try {
      socket = dgram.createSocket('udp4');
      socket.on('error', () => finish(null));
      // 53 — DNS porti (shunchaki marshrut tanlash uchun, so'rov ketmaydi)
      socket.connect(53, host, () => {
        try {
          const info = socket.address();
          const address = info && info.address ? info.address : '';
          // DNS ishlamasa 0.0.0.0, server lokal bo'lsa 127.0.0.1 keladi — yaramaydi
          finish(isUsableLocalAddress(address) ? address : null);
        } catch {
          finish(null);
        }
      });
    } catch {
      finish(null);
    }
  });
}

/**
 * Agentning o'z IPv4 manzilidan /24 tarmoqni aniqlaydi: '192.168.1'.
 * Docker/VPN adapterlari chetlab o'tiladi, xususiy diapazonlar afzal ko'riladi.
 * Topilmasa null.
 */
function detectSubnet() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, list] of Object.entries(interfaces)) {
    for (const item of list || []) {
      const isIpv4 = item.family === 'IPv4' || item.family === 4;
      if (!isIpv4 || item.internal) continue;
      if (/^169\.254\./.test(item.address)) continue; // link-local — tarmoq yo'q
      candidates.push({
        address: item.address,
        // Virtual adapter tanlanib qolmasin (Docker: 172.17.0.1 va h.k.)
        rank: (VIRTUAL_IFACE_RE.test(name) ? 0 : 10) + privateRank(item.address),
      });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.rank - a.rank);
  return toSubnet(candidates[0].address);
}

/**
 * Skanerlanadigan tarmoqni tanlaydi: avval serverga chiqish yo'lidagi interfeys,
 * u aniqlanmasa — interfeyslar ro'yxatidan eng mos keladigani.
 */
async function resolveSubnet(options = {}) {
  const manual = normalizeSubnet(options.subnet);
  if (manual) return manual;

  const routed = await routedAddress(
    String(options.serverHost || '').trim(),
    clampInt(options.routeTimeoutMs, 100, 5000, ROUTE_TIMEOUT_MS),
  );
  return (routed ? toSubnet(routed) : null) || detectSubnet();
}

/** '192.168.1.' yoki '192.168.1' -> '192.168.1' (noto'g'ri bo'lsa null) */
function normalizeSubnet(raw) {
  const text = String(raw || '').trim().replace(/\.+$/, '');
  if (!text) return null;
  const parts = text.split('.');
  if (parts.length !== 3) return null;
  if (!parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)) {
    return null;
  }
  return parts.join('.');
}

/** 80-port ochiqmi (qurilma bormi) — yopiq manzillarni tez tashlab ketamiz */
function isPortOpen(host, port, timeoutMs, signal) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.connect({ host, port });

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      try {
        socket.destroy();
      } catch {
        /* e'tiborsiz */
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    const onAbort = () => finish(false);
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    socket.setNoDelay(true);
    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
  });
}

/** JSON so'rov — xato yoki noto'g'ri format bo'lsa null */
async function tryJson(url, ctx) {
  try {
    const res = await fetchWithTimeout(url, { method: 'GET', redirect: 'manual' }, ctx.timeoutMs, ctx.signal);
    if (!res.ok) {
      await res.text().catch(() => '');
      return null;
    }
    const text = await res.text();
    const data = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** Matn (HTML) so'rov — faqat boshi kerak */
async function tryText(url, ctx) {
  try {
    const res = await fetchWithTimeout(url, { method: 'GET', redirect: 'manual' }, ctx.timeoutMs, ctx.signal);
    if (!res.ok) {
      await res.text().catch(() => '');
      return null;
    }
    const text = await res.text();
    return text.slice(0, 4000);
  } catch {
    return null;
  }
}

/** Shelly `/shelly` javobidan qurilma yozuvi */
function mapShelly(host, data) {
  const gen = Number(data.gen);
  const isGen2 = Number.isFinite(gen) ? gen >= 2 : Boolean(data.model && !data.type);
  const outputs = Number(data.num_outputs);

  return {
    host,
    mac: typeof data.mac === 'string' ? data.mac.slice(0, 40) : undefined,
    model: String(data.model || data.type || 'Shelly').slice(0, 60),
    name: typeof data.name === 'string' && data.name ? data.name.slice(0, 60) : undefined,
    driver: isGen2 ? 'shelly_gen2' : 'shelly_gen1',
    channels: clampInt(outputs, 1, 32, 1),
  };
}

/** Tasmota `/cm?cmnd=Status` javobidan qurilma yozuvi */
function mapTasmota(host, data) {
  const status = data.Status || {};
  const friendly = Array.isArray(status.FriendlyName) ? status.FriendlyName[0] : status.FriendlyName;
  const name = String(friendly || status.DeviceName || status.Topic || 'Tasmota').slice(0, 60);

  return {
    host,
    model: 'Tasmota',
    name,
    driver: 'tasmota',
    channels: clampInt(Array.isArray(status.FriendlyName) ? status.FriendlyName.length : 1, 1, 32, 1),
  };
}

/** ESPHome web serveri sahifasidan qurilma yozuvi */
function mapEsphome(host, html) {
  const title = /<title>([^<]{1,60})<\/title>/i.exec(html);
  return {
    host,
    model: 'ESPHome',
    name: title ? title[1].trim().slice(0, 60) : undefined,
    driver: 'esphome',
    channels: 1,
  };
}

/** Bitta manzilni tekshiradi; qurilma topilmasa null */
async function probe(host, ctx) {
  if (!(await isPortOpen(host, 80, PORT_TIMEOUT_MS, ctx.signal))) return null;

  const shelly = await tryJson(`http://${host}/shelly`, ctx);
  if (shelly && (shelly.mac || shelly.type || shelly.model || shelly.gen)) {
    return mapShelly(host, shelly);
  }

  const tasmota = await tryJson(`http://${host}/cm?cmnd=Status`, ctx);
  if (tasmota && tasmota.Status) return mapTasmota(host, tasmota);

  const html = await tryText(`http://${host}/`, ctx);
  if (html && /esphome/i.test(html)) return mapEsphome(host, html);

  return null;
}

/**
 * Tarmoqni skanerlaydi.
 * @param {object} options { subnet?, serverHost?, timeoutMs?, parallel?, signal?, log? }
 * @returns {Promise<{ subnet: string, devices: object[] }>}
 */
async function discover(options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  // Tarmoq: qo'lda ko'rsatilgani -> serverga chiqish yo'lidagi interfeys -> ro'yxatdan tanlash
  const subnet = await resolveSubnet(options);
  if (!subnet) {
    throw new Error("tarmoqni aniqlab bo'lmadi — .env dagi SUBNET ni to'ldiring (masalan 192.168.1)");
  }

  const ctx = {
    timeoutMs: clampInt(options.timeoutMs, 200, 5000, DEFAULT_TIMEOUT_MS),
    signal: options.signal,
  };
  const parallel = clampInt(options.parallel, 1, 64, DEFAULT_PARALLEL);

  const hosts = [];
  for (let i = 1; i <= 254; i += 1) hosts.push(`${subnet}.${i}`);

  const devices = [];
  let index = 0;

  const worker = async () => {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= hosts.length) return;
      if (ctx.signal && ctx.signal.aborted) return;
      if (devices.length >= MAX_DEVICES) return;

      try {
        const found = await probe(hosts[current], ctx);
        if (found) {
          devices.push(found);
          log('info', `Topildi: ${found.host} — ${found.model || ''} (${found.driver})`);
        }
      } catch (err) {
        log('debug', `${hosts[current]}: ${errText(err)}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(parallel, hosts.length) }, () => worker()));

  return { subnet, devices: devices.slice(0, MAX_DEVICES) };
}

module.exports = { discover, detectSubnet, resolveSubnet, normalizeSubnet };
