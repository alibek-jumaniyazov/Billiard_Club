'use strict';

/**
 * Billiard Club — bridge agenti: mDNS (Bonjour / zeroconf) QIDIRUVI.
 *
 * LAN skaneri (discover.js) faqat 80-portni tekshiradi. Quyidagi qurilmalar esa
 * o'zini mDNS orqali e'lon qiladi:
 *   _ewelink._tcp.local     — Sonoff DIY / eWeLink LAN (odatda 8081-port)
 *   _shelly._tcp.local      — Shelly Gen2+ (RPC); Gen1 bu xizmatni e'lon qilmaydi
 *   _esphomelib._tcp.local  — ESPHome (native API 6053; drayver esa 80-portdagi veb-server)
 *
 * Ishlash tartibi (RFC 6762 / RFC 6763):
 *   1) UDP soket avval 5353-portga (reuseAddr, 224.0.0.251 guruhiga a'zo) — javoblar
 *      multicast keladi. Port band bo'lsa — tasodifiy port + "QU" biti: qurilmalar
 *      to'g'ridan-to'g'ri (unicast) javob beradi.
 *   2) PTR so'rov har bir IPv4 interfeys orqali yuboriladi; ~1 s dan keyin takrorlanadi
 *      va yetishmagan SRV / TXT / A yozuvlari alohida so'raladi.
 *   3) Javoblardagi PTR -> SRV (host, port) -> A (IP) va TXT bog'lanadi.
 *
 * npm bog'liqligi YO'Q — faqat node:dgram va node:os.
 */

const dgram = require('node:dgram');
const os = require('node:os');
const { clampInt, errText } = require('./common');

const MDNS_GROUP = '224.0.0.251';
const MDNS_PORT = 5353;
const TYPE = { A: 1, PTR: 12, TXT: 16, AAAA: 28, SRV: 33 };
const CLASS_IN = 1;
/** Savoldagi "unicast javob" (QU) va yozuvdagi "cache-flush" biti */
const TOP_BIT = 0x8000;
/** RFC 6762 §17: mDNS paketi 9000 baytdan oshmaydi */
const MAX_PACKET = 9000;
/** Bitta qidiruvda saqlanadigan yozuvlar chegarasi (tarmoq "toshqini"dan himoya) */
const MAX_RECORDS = 4000;
/** Bitta paketdagi savollar soni (~1400 bayt MTU ichida qolsin) */
const MAX_QUESTIONS = 20;
const DEFAULT_TIMEOUT_MS = 2500;

const RELAY_SERVICES = ['_ewelink._tcp.local', '_shelly._tcp.local', '_esphomelib._tcp.local'];

/* ------------------------------------------------------------------ */
/*  DNS nomlari                                                        */
/* ------------------------------------------------------------------ */

/** Yorliq ichidagi "." va "\" ni ekranlaydi (DNS-SD nusxa nomida nuqta bo'lishi mumkin) */
function escapeLabel(label) {
  return label.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}

function unescapeName(text) {
  return String(text).replace(/\\(.)/g, '$1');
}

/** "a\.b.local." -> ['a.b', 'local'] */
function splitName(name) {
  const text = String(name || '');
  const labels = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) {
      current += text[i + 1];
      i += 1;
    } else if (ch === '.') {
      labels.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  labels.push(current);
  return labels.filter((label) => label.length > 0);
}

/** Taqqoslash uchun: kichik harf, oxirgi nuqtasiz */
function normalizeName(name) {
  return String(name || '').trim().replace(/\.+$/, '').toLowerCase();
}

function encodeName(name) {
  const parts = [];
  let total = 1;
  for (const label of splitName(name)) {
    const bytes = Buffer.from(label, 'utf8');
    if (bytes.length > 63) throw new Error(`mDNS: nom qismi juda uzun: "${label.slice(0, 20)}"`);
    parts.push(Buffer.from([bytes.length]), bytes);
    total += bytes.length + 1;
  }
  if (total > 255) throw new Error('mDNS: nom juda uzun');
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

/**
 * Siqilgan (compression pointer) nomni o'qiydi.
 * @returns {{ name: string, end: number }} `end` — nomdan keyingi bayt (asl oqimda)
 */
function readName(buf, start) {
  const labels = [];
  let offset = start;
  let end = -1;
  let jumps = 0;
  let length = 1;
  for (;;) {
    if (offset >= buf.length) throw new Error('mDNS: nom paket chegarasidan chiqdi');
    const len = buf[offset];
    if (len === 0) {
      offset += 1;
      break;
    }
    const kind = len & 0xc0;
    if (kind === 0xc0) {
      if (offset + 1 >= buf.length) throw new Error("mDNS: siqish ko'rsatkichi kesilgan");
      const pointer = ((len & 0x3f) << 8) | buf[offset + 1];
      if (end === -1) end = offset + 2;
      jumps += 1;
      // Halqa (o'ziga ishora qiluvchi ko'rsatkich) bo'lsa to'xtaymiz
      if (jumps > 64 || pointer >= buf.length) throw new Error("mDNS: siqish ko'rsatkichi noto'g'ri");
      offset = pointer;
      continue;
    }
    if (kind !== 0) throw new Error("mDNS: noma'lum yorliq turi");
    if (offset + 1 + len > buf.length) throw new Error('mDNS: yorliq kesilgan');
    labels.push(escapeLabel(buf.toString('utf8', offset + 1, offset + 1 + len)));
    length += len + 1;
    if (length > 255) throw new Error('mDNS: nom juda uzun');
    offset += 1 + len;
  }
  return { name: labels.join('.'), end: end === -1 ? offset : end };
}

/* ------------------------------------------------------------------ */
/*  So'rov va javob paketlari                                          */
/* ------------------------------------------------------------------ */

/**
 * mDNS so'rov paketi.
 * @param {Array<string|{name: string, type?: number, unicastResponse?: boolean}>} questions
 *        satr — PTR savol (masalan '_ewelink._tcp.local')
 * @param {{ id?: number, unicastResponse?: boolean }} options  QU — javob unicast kelsin
 */
function encodeQuery(questions, options = {}) {
  const list = (Array.isArray(questions) ? questions : [questions])
    .map((item) => (typeof item === 'string' ? { name: item } : item))
    .filter((item) => item && item.name);
  if (!list.length) throw new Error("mDNS: so'rovda savol yo'q");
  if (list.length > 0xffff) throw new Error("mDNS: savollar juda ko'p");

  const header = Buffer.alloc(12);
  // RFC 6762 §18.1: multicast so'rovda ID = 0; flaglar = standart so'rov
  header.writeUInt16BE((Number(options.id) || 0) & 0xffff, 0);
  header.writeUInt16BE(list.length, 4);
  const parts = [header];
  for (const item of list) {
    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(item.type || TYPE.PTR, 0);
    const unicast = item.unicastResponse !== undefined ? item.unicastResponse : options.unicastResponse;
    tail.writeUInt16BE(CLASS_IN | (unicast ? TOP_BIT : 0), 2);
    parts.push(encodeName(item.name), tail);
  }
  return Buffer.concat(parts);
}

/** TXT: "kalit=qiymat" qatorlari -> { kalit: qiymat } (kalit kichik harfda, birinchisi yutadi) */
function parseTxt(buf, start, length) {
  const txt = {};
  const end = start + length;
  let offset = start;
  while (offset < end) {
    const len = buf[offset];
    offset += 1;
    if (offset + len > end) throw new Error('mDNS: TXT yozuvi kesilgan');
    const entry = buf.toString('utf8', offset, offset + len);
    offset += len;
    if (!entry) continue;
    const eq = entry.indexOf('=');
    const key = (eq === -1 ? entry : entry.slice(0, eq)).toLowerCase();
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (Object.prototype.hasOwnProperty.call(txt, key)) continue;
    // "=" siz kalit — mantiqiy belgi (RFC 6763 §6.4): bo'sh qiymat
    txt[key] = eq === -1 ? '' : entry.slice(eq + 1);
  }
  return txt;
}

function formatIpv6(buf, start) {
  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(buf.readUInt16BE(start + i).toString(16));
  return groups.join(':');
}

function parseRecordData(buf, type, start, length) {
  switch (type) {
    case TYPE.A:
      if (length !== 4) throw new Error("mDNS: A yozuvi noto'g'ri");
      return `${buf[start]}.${buf[start + 1]}.${buf[start + 2]}.${buf[start + 3]}`;
    case TYPE.AAAA:
      if (length !== 16) throw new Error("mDNS: AAAA yozuvi noto'g'ri");
      return formatIpv6(buf, start);
    case TYPE.PTR:
      return readName(buf, start).name;
    case TYPE.SRV: {
      if (length < 7) throw new Error('mDNS: SRV yozuvi kesilgan');
      return {
        priority: buf.readUInt16BE(start),
        weight: buf.readUInt16BE(start + 2),
        port: buf.readUInt16BE(start + 4),
        target: readName(buf, start + 6).name,
      };
    }
    case TYPE.TXT:
      return parseTxt(buf, start, length);
    default:
      return Buffer.from(buf.subarray(start, start + length));
  }
}

/**
 * DNS xabarini o'qiydi (sarlavha, savollar, javob/vakolat/qo'shimcha bo'limlar).
 * Buzilgan paketda throw qiladi.
 */
function parseMessage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) throw new Error('mDNS: paket juda qisqa');
  const flags = buf.readUInt16BE(2);
  const counts = [buf.readUInt16BE(4), buf.readUInt16BE(6), buf.readUInt16BE(8), buf.readUInt16BE(10)];
  let offset = 12;

  const questions = [];
  for (let i = 0; i < counts[0]; i += 1) {
    const { name, end } = readName(buf, offset);
    if (end + 4 > buf.length) throw new Error('mDNS: savol kesilgan');
    const klass = buf.readUInt16BE(end + 2);
    questions.push({
      name,
      type: buf.readUInt16BE(end),
      class: klass & 0x7fff,
      unicastResponse: Boolean(klass & TOP_BIT),
    });
    offset = end + 4;
  }

  const readRecords = (count) => {
    const records = [];
    for (let i = 0; i < count; i += 1) {
      const { name, end } = readName(buf, offset);
      if (end + 10 > buf.length) throw new Error('mDNS: yozuv sarlavhasi kesilgan');
      const type = buf.readUInt16BE(end);
      const klass = buf.readUInt16BE(end + 2);
      const ttl = buf.readUInt32BE(end + 4);
      const length = buf.readUInt16BE(end + 8);
      const dataStart = end + 10;
      if (dataStart + length > buf.length) throw new Error("mDNS: yozuv ma'lumoti kesilgan");
      records.push({
        name,
        type,
        class: klass & 0x7fff,
        cacheFlush: Boolean(klass & TOP_BIT),
        ttl,
        data: parseRecordData(buf, type, dataStart, length),
      });
      offset = dataStart + length;
    }
    return records;
  };

  const answers = readRecords(counts[1]);
  const authorities = readRecords(counts[2]);
  const additionals = readRecords(counts[3]);
  return {
    id: buf.readUInt16BE(0),
    response: Boolean(flags & 0x8000),
    opcode: (flags >> 11) & 0xf,
    authoritative: Boolean(flags & 0x0400),
    truncated: Boolean(flags & 0x0200),
    rcode: flags & 0xf,
    questions,
    answers,
    authorities,
    additionals,
  };
}

/* ------------------------------------------------------------------ */
/*  Javoblarni yig'ish                                                 */
/* ------------------------------------------------------------------ */

/** Link-local (169.254.x) bo'lmagan birinchi manzil */
function pickAddress(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find((ip) => !/^169\.254\./.test(ip)) || list[0];
}

/**
 * Bir nechta javob paketidagi yozuvlarni jamlaydi. Yozuvlar turli paketlarda
 * kelishi mumkin (PTR — javobda, SRV/TXT/A — qo'shimcha bo'limda yoki keyinroq).
 */
function createCollector() {
  const ptr = new Map(); // xizmat -> Set<nusxa nomi> (kichik harf)
  const srv = new Map(); // nusxa -> { target, port }
  const txt = new Map(); // nusxa -> { k: v }
  const addresses = new Map(); // host nomi -> [IPv4]
  const sources = new Map(); // nusxa -> paketni yuborgan IP (A yozuvi kelmasa)
  const spelled = new Map(); // kichik harf -> asl yozilishi
  let count = 0;

  // Nusxa nomi doim "<nusxa>.<xizmat>" — PTR yo'qolgan bo'lsa ham SRV/TXT dan topiladi
  const instanceKeys = (service) => {
    const suffix = `.${service}`;
    const keys = new Set();
    for (const key of [...(ptr.get(service) || []), ...srv.keys(), ...txt.keys()]) {
      if (key.length > suffix.length && key.endsWith(suffix)) keys.add(key);
    }
    return keys;
  };

  return {
    /** Bitta o'qilgan xabar; `source` — yuboruvchi IP */
    add(message, source) {
      if (!message || !message.response) return;
      for (const record of [...message.answers, ...message.additionals]) {
        if (count >= MAX_RECORDS) return;
        // TTL = 0 — "xayr" e'loni: qurilma tarmoqdan chiqmoqda
        if (!record || record.ttl === 0) continue;
        count += 1;
        const key = normalizeName(record.name);
        if (record.type === TYPE.PTR && typeof record.data === 'string') {
          const target = normalizeName(record.data);
          if (!ptr.has(key)) ptr.set(key, new Set());
          ptr.get(key).add(target);
          spelled.set(target, record.data);
          if (source && !sources.has(target)) sources.set(target, source);
        } else if (record.type === TYPE.SRV && record.data && typeof record.data === 'object') {
          srv.set(key, { target: record.data.target, port: record.data.port });
          spelled.set(key, record.name);
          if (source) sources.set(key, source);
        } else if (record.type === TYPE.TXT && record.data && typeof record.data === 'object') {
          txt.set(key, record.data); // keyingi e'lon — yangiroq holat
          spelled.set(key, record.name);
          if (source && !sources.has(key)) sources.set(key, source);
        } else if (record.type === TYPE.A && typeof record.data === 'string') {
          const list = addresses.get(key) || [];
          if (!list.includes(record.data)) list.push(record.data);
          addresses.set(key, list);
        }
      }
    },

    /** Qayta so'rash kerak bo'lgan yozuvlar: SRV/TXT yo'q nusxalar va IP siz hostlar */
    missing(services) {
      const questions = [];
      for (const service of services) {
        for (const key of instanceKeys(service)) {
          const name = spelled.get(key) || key;
          if (!srv.has(key)) questions.push({ name, type: TYPE.SRV });
          if (!txt.has(key)) questions.push({ name, type: TYPE.TXT });
          const entry = srv.get(key);
          if (entry && entry.target && !addresses.has(normalizeName(entry.target))) {
            questions.push({ name: entry.target, type: TYPE.A });
          }
        }
      }
      const seen = new Set();
      return questions.filter((item) => {
        const id = `${item.type}|${normalizeName(item.name)}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    },

    /** Topilgan nusxalar: { service, instance, host, ip, port, txt } */
    instances(services) {
      const result = [];
      for (const service of services) {
        const suffix = `.${service}`;
        for (const key of instanceKeys(service)) {
          const fullName = spelled.get(key) || key;
          if (fullName.length <= suffix.length) continue;
          const entry = srv.get(key) || null;
          const host = entry && entry.target ? entry.target : null;
          // A yozuvi bo'lmasa (ba'zi Sonoff'lar yubormaydi) — paketni yuborgan IP
          const ip = pickAddress(host ? addresses.get(normalizeName(host)) : null) || sources.get(key) || null;
          if (!ip) continue;
          result.push({
            service,
            instance: unescapeName(fullName.slice(0, fullName.length - suffix.length)),
            host: host ? unescapeName(host) : null,
            ip,
            port: entry && Number.isInteger(entry.port) ? entry.port : null,
            txt: { ...(txt.get(key) || {}) },
          });
        }
      }
      return result;
    },
  };
}

/**
 * O'qilgan xabarlardan nusxalar ro'yxati (sof funksiya — testlar uchun).
 * @param {Array<{ message: object, address?: string }>} packets
 */
function collectInstances(packets, services) {
  const wanted = normalizeServices(services);
  const collector = createCollector();
  for (const packet of packets || []) collector.add(packet && packet.message, packet && packet.address);
  return collector.instances(wanted);
}

function normalizeServices(services) {
  const list = [];
  for (const item of Array.isArray(services) ? services : [services]) {
    const name = normalizeName(item);
    if (name && !list.includes(name)) list.push(name);
  }
  return list;
}

/* ------------------------------------------------------------------ */
/*  Tarmoq                                                             */
/* ------------------------------------------------------------------ */

/** Tashqi IPv4 interfeyslar (so'rov har biri orqali yuboriladi) */
function ipv4Interfaces() {
  const list = [];
  let interfaces = {};
  try {
    interfaces = os.networkInterfaces();
  } catch {
    return list;
  }
  for (const items of Object.values(interfaces)) {
    for (const item of items || []) {
      const isIpv4 = item.family === 'IPv4' || item.family === 4;
      if (!isIpv4 || item.internal || /^169\.254\./.test(item.address)) continue;
      if (!list.includes(item.address)) list.push(item.address);
    }
  }
  return list.slice(0, 16);
}

function bindSocket(port, address) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const onError = (err) => {
      socket.removeListener('listening', onListening);
      try {
        socket.close();
      } catch {
        /* allaqachon yopilgan */
      }
      reject(err);
    };
    const onListening = () => {
      socket.removeListener('error', onError);
      resolve(socket);
    };
    socket.once('error', onError);
    socket.once('listening', onListening);
    try {
      socket.bind(port, address);
    } catch (err) {
      onError(err);
    }
  });
}

function sendPacket(socket, packet, port, address) {
  return new Promise((resolve, reject) => {
    try {
      socket.send(packet, port, address, (err) => (err ? reject(err) : resolve()));
    } catch (err) {
      reject(err);
    }
  });
}

/** Savollarni MTU ga sig'adigan paketlarga bo'ladi */
function buildPackets(questions, unicastResponse) {
  const packets = [];
  for (let i = 0; i < questions.length; i += MAX_QUESTIONS) {
    try {
      packets.push(encodeQuery(questions.slice(i, i + MAX_QUESTIONS), { unicastResponse }));
    } catch {
      /* yaroqsiz nom (masalan juda uzun) — bu guruhni o'tkazamiz */
    }
  }
  return packets;
}

/**
 * mDNS orqali xizmatlarni qidiradi.
 * @param {object} options
 * @param {string[]} options.services     masalan ['_ewelink._tcp.local']
 * @param {number}  [options.timeoutMs]   javoblarni kutish (standart 2500 ms)
 * @param {AbortSignal} [options.signal]  to'xtatish — shu paytgacha topilgani qaytadi
 * @param {Function} [options.log]        (level, message)
 * @param {{address: string, port: number}} [options.destination]  faqat test/diagnostika:
 *        multicast o'rniga shu manzilga unicast so'rov (tasodifiy portdan)
 * @returns {Promise<Array<{service, instance, host, ip, port, txt}>>}
 */
async function queryMdns(options = {}) {
  const services = normalizeServices(options.services);
  if (!services.length) return [];
  const timeoutMs = clampInt(options.timeoutMs, 50, 15_000, DEFAULT_TIMEOUT_MS);
  const signal = options.signal;
  const log = typeof options.log === 'function' ? options.log : () => {};
  const destination = options.destination && options.destination.address ? options.destination : null;
  if (signal && signal.aborted) return [];

  // 1) Soket: 5353 (multicast javoblar) yoki tasodifiy port (unicast javoblar)
  let socket = null;
  let sharedPort = false;
  if (!destination) {
    try {
      socket = await bindSocket(MDNS_PORT);
      sharedPort = true;
    } catch (err) {
      log('debug', `mDNS: 5353-port band (${errText(err)}) — tasodifiy port ishlatiladi`);
    }
  }
  // Lokal (127.x) manzilga so'rovda tashqi interfeysni ochmaymiz
  if (!socket) socket = await bindSocket(0, destination && /^127\./.test(destination.address) ? '127.0.0.1' : undefined);

  const interfaces = destination ? [] : ipv4Interfaces();
  let joined = 0;
  if (!destination) {
    try {
      socket.setMulticastTTL(255);
    } catch {
      /* e'tiborsiz */
    }
    if (sharedPort) {
      for (const address of interfaces.length ? interfaces : [undefined]) {
        try {
          if (address) socket.addMembership(MDNS_GROUP, address);
          else socket.addMembership(MDNS_GROUP);
          joined += 1;
        } catch {
          /* interfeys multicast ni qo'llamaydi yoki allaqachon a'zo */
        }
      }
    }
  }
  // Guruhga a'zo bo'lmasak multicast javobni eshitmaymiz — unicast so'raymiz
  const unicastResponse = !sharedPort || joined === 0;
  const collector = createCollector();

  return new Promise((resolve) => {
    let done = false;
    const timers = [];

    const finish = () => {
      if (done) return;
      done = true;
      for (const timer of timers) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', finish);
      try {
        socket.close();
      } catch {
        /* allaqachon yopilgan */
      }
      resolve(collector.instances(services));
    };

    socket.on('message', (msg, rinfo) => {
      if (done || msg.length > MAX_PACKET) return;
      try {
        collector.add(parseMessage(msg), rinfo && rinfo.address);
      } catch {
        /* buzilgan yoki begona paket */
      }
    });
    socket.on('error', (err) => {
      log('debug', `mDNS soket xatosi: ${errText(err)}`);
      finish(); // shu paytgacha topilgani qaytadi
    });

    const sendAll = async (packets) => {
      for (const packet of packets) {
        if (destination) {
          if (done) return;
          try {
            // eslint-disable-next-line no-await-in-loop
            await sendPacket(socket, packet, destination.port, destination.address);
          } catch (err) {
            log('debug', `mDNS: so'rov yuborilmadi — ${errText(err)}`);
          }
          continue;
        }
        for (const address of interfaces.length ? interfaces : [undefined]) {
          if (done) return;
          try {
            // Interfeys almashtirilgach paket ketguncha kutamiz (aks holda hammasi oxirgisidan ketadi)
            if (address) socket.setMulticastInterface(address);
            // eslint-disable-next-line no-await-in-loop
            await sendPacket(socket, packet, MDNS_PORT, MDNS_GROUP);
          } catch (err) {
            log('debug', `mDNS: ${address || 'standart'} interfeysdan yuborilmadi — ${errText(err)}`);
          }
        }
      }
    };

    const ptrQuestions = services.map((name) => ({ name, type: TYPE.PTR }));
    timers.push(setTimeout(finish, timeoutMs));
    if (signal) {
      // Soket ochilayotganda to'xtatilgan bo'lishi mumkin — "abort" qayta kelmaydi
      if (signal.aborted) {
        finish();
        return;
      }
      signal.addEventListener('abort', finish, { once: true });
    }

    // 2) Darhol so'rov; ~1 s dan keyin takror + yetishmagan SRV/TXT/A
    sendAll(buildPackets(ptrQuestions, unicastResponse)).catch(() => {});
    const repeatAt = Math.min(1000, Math.floor(timeoutMs / 2));
    if (repeatAt >= 50) {
      timers.push(setTimeout(() => {
        if (done) return;
        const questions = [...ptrQuestions, ...collector.missing(services)];
        sendAll(buildPackets(questions, unicastResponse)).catch(() => {});
      }, repeatAt));
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Rele qurilmalariga aylantirish                                     */
/* ------------------------------------------------------------------ */

function shortText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, 60) : undefined;
}

/** Bo'sh maydonlarsiz obyekt — hub birlashtirganda LAN skaneri ma'lumotini o'chirmasin */
function compact(object) {
  const result = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined && value !== null && value !== '') result[key] = value;
  }
  return result;
}

/** Sonoff: eWeLink_<deviceid>; TXT: id, type, encrypt, iv, data1..data4 */
function mapEwelink(instance) {
  // iHost / ZBBridge-U ham _ewelink._tcp e'lon qiladi — ular rele emas (SonoffLAN ham o'tkazadi)
  if (!/^ewelink/i.test(instance.instance || '')) return null;
  const txt = instance.txt || {};
  const encrypt = txt.encrypt === 'true';
  const port = Number.isInteger(instance.port) && instance.port > 0 && instance.port !== 8081 ? `:${instance.port}` : '';

  const fromName = /^ewelink_([a-z0-9]{6,40})/i.exec(instance.instance);
  const rawId = typeof txt.id === 'string' && txt.id.trim() ? txt.id.trim() : fromName ? fromName[1] : '';
  const id = /^[A-Za-z0-9]{6,40}$/.test(rawId) ? rawId : undefined;

  let channels;
  if (!encrypt) {
    // DIY: data1..data4 birlashtirilganda ochiq JSON (249 baytdan uzun bo'lsa bo'linadi)
    const raw = ['data1', 'data2', 'data3', 'data4'].map((key) => txt[key] || '').join('');
    try {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.switches) && data.switches.length) channels = Math.min(data.switches.length, 32);
      else if (data && typeof data.switch === 'string') channels = 1;
    } catch {
      /* JSON emas */
    }
  }
  // Shifrlangan ko'p kanalli qurilma (4CH/Dual) — aniq son noma'lum, yuqori chegara
  if (channels === undefined && String(txt.type || '').toLowerCase() === 'strip') channels = 4;

  return compact({
    driver: 'sonoff',
    host: `${instance.ip}${port}`,
    id,
    model: shortText(txt.type),
    encrypt,
    channels,
    needs: encrypt ? ['deviceKey'] : [],
  });
}

/** Shelly: _shelly._tcp faqat Gen2+ da; TXT gen=2|3|4, app=<model> */
function mapShelly(instance) {
  const txt = instance.txt || {};
  const gen = Number.parseInt(txt.gen, 10);
  return compact({
    // Gen3/Gen4 ham Gen2 RPC API sida ishlaydi
    driver: gen >= 2 ? 'shelly_gen2' : 'shelly_gen1',
    host: instance.ip,
    name: shortText(instance.instance),
    model: shortText(txt.app || txt.model),
    needs: [],
  });
}

/** ESPHome: boshqaruv veb-server (80-port) orqali — switch entity tanlanishi kerak */
function mapEsphome(instance) {
  return compact({
    driver: 'esphome',
    host: instance.ip,
    name: shortText(instance.instance),
    needs: ['entity'],
  });
}

/** Bitta mDNS nusxasini "topilgan qurilma" shakliga aylantiradi (mos kelmasa null) */
function mapRelayInstance(instance) {
  if (!instance || typeof instance.ip !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(instance.ip)) return null;
  switch (normalizeName(instance.service)) {
    case '_ewelink._tcp.local':
      return mapEwelink(instance);
    case '_shelly._tcp.local':
      return mapShelly(instance);
    case '_esphomelib._tcp.local':
      return mapEsphome(instance);
    default:
      return null;
  }
}

/**
 * Qidiruvchi (discovery-providers.js): Sonoff, Shelly Gen2+, ESPHome.
 * HECH QACHON throw qilmaydi — xatoda debug log va shu paytgacha topilgani.
 */
async function discoverMdnsRelays({ signal, log, timeoutMs } = {}) {
  const logger = typeof log === 'function' ? log : () => {};
  let instances = [];
  try {
    instances = await queryMdns({ services: RELAY_SERVICES, timeoutMs, signal, log: logger });
  } catch (err) {
    logger('debug', `mDNS qidiruvi ishlamadi: ${errText(err)}`);
    return [];
  }

  const devices = [];
  const seen = new Set();
  for (const instance of instances) {
    let device = null;
    try {
      device = mapRelayInstance(instance);
    } catch (err) {
      logger('debug', `mDNS: "${String(instance && instance.instance).slice(0, 60)}" o'qilmadi — ${errText(err)}`);
    }
    if (!device) continue;
    const key = `${device.driver}|${device.host}`;
    if (seen.has(key)) continue;
    seen.add(key);
    devices.push(device);
  }
  logger('debug', `mDNS: ${devices.length} ta rele qurilmasi topildi`);
  return devices;
}

module.exports = {
  MDNS_GROUP,
  MDNS_PORT,
  TYPE,
  RELAY_SERVICES,
  encodeQuery,
  encodeName,
  parseMessage,
  collectInstances,
  mapRelayInstance,
  queryMdns,
  discoverMdnsRelays,
};
