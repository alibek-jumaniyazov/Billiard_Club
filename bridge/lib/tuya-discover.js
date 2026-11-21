'use strict';

/**
 * Billiard Club — bridge agenti: TUYA / SMART LIFE QURILMALARINI TOPISH (UDP e'lonlar).
 *
 * Tuya Wi-Fi qurilmalari lokal tarmoqqa o'zi haqida UDP e'lon yuboradi (taxminan har 5 s):
 *   6666 — 3.1:   55AA kadr ichida OCHIQ JSON
 *   6667 — 3.3+:  55AA kadr, JSON AES-128-ECB bilan shifrlangan (3.5 qurilmalarda 6699/AES-GCM)
 *   7000 — 3.5:   Smart Life ilovasi bu portga REQ_DEVINFO (0x25) so'rovini keng tarqatadi
 *                 ({"from":"app","ip":...}, 6699 kadr) — 3.5 qurilmalar shunga javob beradi.
 *                 Biz ham shunday so'rov yuboramiz (tinytuya scanner.py dagi kabi).
 * Hamma shifr uchun kalit bitta: md5("yGAdlopoPVldABfn") (tuya-convert / tinytuya udpkey).
 *
 * Natija: { driver: 'tuya', host, id, version, model, name, needs: ['localKey'] } — "local key"
 * e'londa yo'q: uni sozlashda kiritish yoki Tuya bulutidan import qilish kerak (lib/tuya-cloud.js).
 *
 * npm bog'liqligi YO'Q — faqat node:dgram va node:os.
 */

const dgram = require('node:dgram');
const os = require('node:os');
const { clampInt, errText } = require('./common');
const tuya = require('./tuya-protocol');

/** Tinglanadigan portlar: 3.1 ochiq, 3.3+ shifrlangan, 3.5 / ilova */
const DEFAULT_PORTS = Object.freeze([6666, 6667, 7000]);

/** REQ_DEVINFO so'rovi yuboriladigan port */
const APP_PORT = 7000;

/** Standart tinglash muddati (qurilmalar ~5 s da bir e'lon qiladi) */
const DEFAULT_TIMEOUT_MS = 6000;

/** REQ_DEVINFO so'rovini qayta yuborish oralig'i (ms) */
const REQUEST_INTERVAL_MS = 2000;

/** Serverga qaytariladigan maksimal qurilma soni */
const MAX_DEVICES = 256;

const DEVICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function isIpv4(value) {
  return typeof value === 'string' && IPV4_RE.test(value);
}

/** Matnni JSON obyektga aylantiradi; bo'lmasa null */
function parseJsonObject(text) {
  const trimmed = String(text || '').replace(/\u0000+$/, '').trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const data = JSON.parse(trimmed);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Bitta UDP e'lonni ochadi (tinytuya `decrypt_udp` bilan bir xil tartib):
 *   6699 kadr  -> AES-GCM (udpkey), retcode bo'lsa olib tashlanadi, oxiridagi NUL lar kesiladi
 *   55AA kadr  -> payload "{...}" bo'lsa ochiq JSON (3.1), aks holda AES-ECB (udpkey)
 *   kadrsiz    -> butun paket AES-ECB (eski format)
 * @returns {object|null} e'londagi JSON
 */
function decodeBroadcast(message) {
  if (!Buffer.isBuffer(message) || message.length < 16) return null;
  const { frames } = tuya.splitFrames(message);
  if (!frames.length) {
    try {
      return parseJsonObject(tuya.aesEcbDecrypt(tuya.UDP_KEY, message).toString('utf8'));
    } catch {
      return null;
    }
  }
  const frame = frames[0];
  try {
    if (frame.readUInt32BE(0) === tuya.PREFIX_6699) {
      return parseJsonObject(tuya.unpackFrame(frame, { key: tuya.UDP_KEY }).payload.toString('utf8'));
    }
    const { payload } = tuya.unpackFrame(frame, {});
    if (payload.length && payload[0] === 0x7b) {
      const plain = parseJsonObject(payload.toString('utf8'));
      if (plain) return plain; // 3.1: ochiq JSON
    }
    return parseJsonObject(tuya.aesEcbDecrypt(tuya.UDP_KEY, payload).toString('utf8'));
  } catch {
    return null;
  }
}

/** E'londan qurilma yozuvi; ilovaning o'z so'rovi yoki yaroqsiz e'lon bo'lsa null */
function toDevice(data, rinfo, port) {
  if (!data || data.from === 'app') return null; // Smart Life ilovasi (yoki o'zimiz) yuborgan so'rov
  const rawId = typeof data.gwId === 'string' ? data.gwId : typeof data.devId === 'string' ? data.devId : '';
  const id = rawId.trim();
  if (!DEVICE_ID_RE.test(id)) return null;
  // Manzil — paket kelgan IP (tinytuya ham shunday); e'londagi "ip" faqat zaxira
  const host = rinfo && isIpv4(rinfo.address) ? rinfo.address : isIpv4(data.ip) ? data.ip : null;
  if (!host) return null;
  const rawVersion = typeof data.version === 'number' ? String(data.version) : data.version;
  let version;
  if (typeof rawVersion === 'string' && /^\d\.\d$/.test(rawVersion.trim())) version = rawVersion.trim();
  else if (port === 6666) version = '3.1';
  const model = typeof data.productKey === 'string' && data.productKey.trim()
    ? data.productKey.trim().slice(0, 60)
    : undefined;
  return { driver: 'tuya', host, id, version, model, name: undefined, needs: ['localKey'] };
}

/** '192.168.1.7' -> 32 bitli son (noto'g'ri bo'lsa null) */
function ipToInt(address) {
  if (!isIpv4(address)) return null;
  return address.split('.').reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}

function intToIp(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join('.');
}

/** Docker / VPN / virtual adapterlar — klub tarmog'i ular ortida emas (discover.js dagi kabi) */
const VIRTUAL_IFACE_RE =
  /docker|veth|br-|virbr|vmnet|vboxnet|vethernet|hyper-v|wsl|tailscale|zerotier|radmin|hamachi|wg\d|tun\d|tap\d|utun|ppp|loopback|bluetooth/i;

/** Xususiy (RFC 1918) manzil — Tuya qurilmalari shunday tarmoqlarda bo'ladi */
function isPrivateAddress(address) {
  return /^10\./.test(address) || /^192\.168\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

/**
 * REQ_DEVINFO yuboriladigan tarmoqlar: har IPv4 interfeysning keng tarqatish manzili.
 * Tanlov tartibi: `subnet` ('192.168.1') ga mos interfeys -> virtual bo'lmagan xususiy
 * tarmoq -> istalgan xususiy tarmoq (Hyper-V "vEthernet (LAN)" kabi) -> hammasi.
 */
function broadcastTargets(subnet) {
  const targets = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const item of list || []) {
      const isV4 = item.family === 'IPv4' || item.family === 4;
      if (!isV4 || item.internal || /^169\.254\./.test(item.address)) continue;
      const ip = ipToInt(item.address);
      const mask = ipToInt(item.netmask);
      if (ip === null || mask === null || mask === 0) continue;
      const broadcast = intToIp((ip | (~mask >>> 0)) >>> 0);
      if (!targets.some((t) => t.address === item.address && t.broadcast === broadcast)) {
        targets.push({ address: item.address, broadcast, virtual: VIRTUAL_IFACE_RE.test(name) });
      }
    }
  }
  const prefix = typeof subnet === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(subnet.trim())
    ? `${subnet.trim()}.`
    : null;
  const choices = [
    prefix ? targets.filter((t) => t.address.startsWith(prefix)) : [],
    targets.filter((t) => !t.virtual && isPrivateAddress(t.address)),
    targets.filter((t) => isPrivateAddress(t.address)),
    targets,
  ];
  const chosen = choices.find((list) => list.length) || [];
  return chosen.map(({ address, broadcast }) => ({ address, broadcast }));
}

/** 3.5 qurilmalarni javob berishga undovchi so'rov (6699, udpkey, REQ_DEVINFO) */
function buildDevInfoRequest(localAddress) {
  return tuya.pack6699({
    seqno: 0,
    cmd: tuya.CMD.REQ_DEVINFO,
    payload: Buffer.from(JSON.stringify({ from: 'app', ip: localAddress }), 'utf8'),
    key: tuya.UDP_KEY,
  });
}

/** Bitta UDP portni tinglaydi; band/ruxsat yo'q bo'lsa null (qolganlari ishlayveradi) */
function bindListener(port, address, onMessage, log) {
  return new Promise((resolve) => {
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch (err) {
      log('debug', `Tuya UDP ${port}: soket ochilmadi (${errText(err)})`);
      resolve(null);
      return;
    }
    const onBindError = (err) => {
      log('debug', `Tuya UDP ${port}: tinglab bo'lmadi (${errText(err)})`);
      try {
        socket.close();
      } catch {
        /* e'tiborsiz */
      }
      resolve(null);
    };
    socket.once('error', onBindError);
    socket.on('message', (message, rinfo) => onMessage(message, rinfo, port));
    try {
      socket.bind({ port, address: address || undefined }, () => {
        socket.removeListener('error', onBindError);
        socket.on('error', (err) => log('debug', `Tuya UDP ${port}: ${errText(err)}`));
        try {
          socket.setBroadcast(true);
        } catch {
          /* e'tiborsiz */
        }
        resolve(socket);
      });
    } catch (err) {
      onBindError(err);
    }
  });
}

/** REQ_DEVINFO yuboruvchi vaqtinchalik soket (tasodifiy port) */
function openSender(log) {
  return new Promise((resolve) => {
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      resolve(null);
      return;
    }
    const onBindError = (err) => {
      log('debug', `Tuya UDP so'rov soketi ochilmadi (${errText(err)})`);
      try {
        socket.close();
      } catch {
        /* e'tiborsiz */
      }
      resolve(null);
    };
    socket.once('error', onBindError);
    socket.bind(0, () => {
      socket.removeListener('error', onBindError);
      socket.on('error', (err) => log('debug', `Tuya UDP so'rov: ${errText(err)}`));
      try {
        socket.setBroadcast(true);
      } catch {
        /* e'tiborsiz */
      }
      resolve(socket);
    });
  });
}

function closeQuietly(socket) {
  if (!socket) return;
  try {
    socket.close();
  } catch {
    /* allaqachon yopilgan */
  }
}

/**
 * Lokal tarmoqdagi Tuya qurilmalarini UDP e'lonlari orqali topadi.
 * @param {object} options
 *   signal         to'xtatish signali (to'xtasa shu paytgacha topilganlar qaytadi)
 *   log            (level, message) => void
 *   timeoutMs      tinglash muddati (standart 6000)
 *   subnet         '192.168.1' — REQ_DEVINFO shu tarmoqqa yuboriladi (ixtiyoriy)
 *   requestDevInfo false — 3.5 qurilmalarga so'rov yubormaslik (faqat tinglash)
 *   ports, address — testlar uchun: tinglanadigan portlar va manzil
 * @returns {Promise<object[]>}
 */
async function discoverTuya(options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  const { signal } = options;
  const timeoutMs = clampInt(options.timeoutMs, 100, 120_000, DEFAULT_TIMEOUT_MS);
  const ports = Array.isArray(options.ports) && options.ports.length ? options.ports : DEFAULT_PORTS;
  if (signal && signal.aborted) return [];

  const found = new Map();
  const handleMessage = (message, rinfo, port) => {
    const device = toDevice(decodeBroadcast(message), rinfo, port);
    if (!device) return;
    const previous = found.get(device.id);
    if (!previous && found.size >= MAX_DEVICES) return;
    if (!previous) log('info', `Tuya topildi: ${device.host} (${device.id}${device.version ? `, v${device.version}` : ''})`);
    // Yangi e'londa bo'lmagan maydon (masalan versiya) eskisidan qoladi
    const merged = { ...(previous || {}) };
    for (const [field, value] of Object.entries(device)) {
      if (value !== undefined || !(field in merged)) merged[field] = value;
    }
    found.set(device.id, merged);
  };
  // Hodisa ishlovchisidagi xato butun agentni to'xtatmasin
  const onMessage = (message, rinfo, port) => {
    try {
      handleMessage(message, rinfo, port);
    } catch (err) {
      log('debug', `Tuya UDP: e'lonni o'qishda xato (${errText(err)})`);
    }
  };

  const listeners = (await Promise.all(ports.map((port) => bindListener(port, options.address, onMessage, log))))
    .filter(Boolean);
  if (!listeners.length) {
    log('debug', "Tuya UDP: birorta port tinglanmadi — qidiruv o'tkazib yuborildi");
    return [];
  }

  let sender = null;
  let repeat = null;
  try {
    if (options.requestDevInfo !== false) {
      sender = await openSender(log);
      // Qurilma javobni so'rov kelgan portga (unicast) yuborsa ham qabul qilamiz
      if (sender) sender.on('message', (message, rinfo) => onMessage(message, rinfo, APP_PORT));
      const targets = sender ? broadcastTargets(options.subnet) : [];
      const sendRequests = () => {
        for (const target of targets) {
          try {
            sender.send(buildDevInfoRequest(target.address), APP_PORT, target.broadcast, (err) => {
              if (err) log('debug', `Tuya UDP so'rov ${target.broadcast}: ${errText(err)}`);
            });
          } catch (err) {
            log('debug', `Tuya UDP so'rov ${target.broadcast}: ${errText(err)}`);
          }
        }
      };
      if (targets.length) {
        sendRequests();
        repeat = setInterval(sendRequests, REQUEST_INTERVAL_MS);
      }
    }

    await new Promise((resolve) => {
      let timer = null;
      const done = () => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', done);
        resolve();
      };
      timer = setTimeout(done, timeoutMs);
      if (signal) {
        if (signal.aborted) done();
        else signal.addEventListener('abort', done, { once: true });
      }
    });
  } finally {
    if (repeat) clearInterval(repeat);
    closeQuietly(sender);
    for (const socket of listeners) closeQuietly(socket);
  }
  return Array.from(found.values());
}

module.exports = {
  discoverTuya,
  decodeBroadcast,
  toDevice,
  broadcastTargets,
  buildDevInfoRequest,
  DEFAULT_PORTS,
};
