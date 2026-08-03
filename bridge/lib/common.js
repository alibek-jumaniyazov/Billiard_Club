'use strict';

/**
 * Billiard Club — bridge agenti: UMUMIY YORDAMCHILAR.
 *
 * Bu modulda barcha drayverlar (lib/*.js) va agent.js uchun kerak bo'ladigan
 * kichik funksiyalar jamlangan: xato matnini o'qish, host tekshirish,
 * hex/ASCII baytlarni tayyorlash, holat qiymatini talqin qilish va
 * timeout li fetch.
 *
 * Hech qanday npm bog'liqligi YO'Q — faqat Node 18+ ning o'zi.
 */

/* ------------------------------------------------------------------ */
/*  Xato va son yordamchilari                                          */
/* ------------------------------------------------------------------ */

/** Xato obyektidan o'qiladigan qisqa matn ajratadi (fetch xatolari sababi ichkarida) */
function errText(err) {
  if (!err) return "noma'lum xato";
  if (typeof err === 'string') return err;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return 'timeout (javob kelmadi)';

  const message = err.message || String(err);
  const cause = err.cause;
  let detail = '';

  if (cause) {
    if (cause.code) detail = String(cause.code);
    else if (Array.isArray(cause.errors) && cause.errors.length) {
      detail = cause.errors[0].code || cause.errors[0].message || '';
    } else if (cause.message) detail = cause.message;
  } else if (err.code) {
    detail = String(err.code);
  }

  return detail && !message.includes(detail) ? `${message} (${detail})` : message;
}

/** Butun sonni chegara ichiga kiritadi; noto'g'ri qiymatda `fallback` qaytadi */
function clampInt(value, min, max, fallback) {
  const num = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

/** Tokenni logga chiqarish uchun niqoblaydi: "A7f2...9dQx" */
function maskToken(token) {
  const text = String(token || '');
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/*  Manzil (host) yordamchilari                                        */
/* ------------------------------------------------------------------ */

/** IPv4[:port] yoki hostname[:port] formatini tekshiradi (IPv6 qo'llab-quvvatlanmaydi) */
function isValidHost(host) {
  if (typeof host !== 'string') return false;
  const raw = host.trim();
  if (!raw || raw.length > 255) return false;
  if (/[\s/\\@?#]/.test(raw)) return false; // sxema, yo'l yoki login bo'lmasin

  const parts = raw.split(':');
  if (parts.length > 2) return false;

  const [hostname, port] = parts;
  if (port !== undefined) {
    if (!/^\d{1,5}$/.test(port)) return false;
    const num = Number(port);
    if (num < 1 || num > 65535) return false;
  }
  if (!hostname || hostname.length > 253) return false;

  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split('.').every((oct) => Number(oct) >= 0 && Number(oct) <= 255);
  }
  // Butunlay raqamli, lekin IPv4 emas ("8.8.8", "2130706433") — rad etamiz
  if (/^\d+(\.\d+)*$/.test(hostname)) return false;

  // Hostname (masalan shelly-1.local)
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(hostname);
}

/** "192.168.1.60:8080" -> { host: '192.168.1.60', port: 8080 } */
function splitHostPort(raw, defaultPort) {
  const text = String(raw || '').trim();
  const index = text.indexOf(':');
  if (index === -1) return { host: text, port: defaultPort };
  const port = Number.parseInt(text.slice(index + 1), 10);
  return {
    host: text.slice(0, index),
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : defaultPort,
  };
}

/* ------------------------------------------------------------------ */
/*  Bayt (hex / ASCII) yordamchilari                                   */
/* ------------------------------------------------------------------ */

/** "A0 01:01-A2" yoki "0xA00101A2" -> Buffer; noto'g'ri bo'lsa null */
function parseHex(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.trim().replace(/0x/gi, '').replace(/[\s:,._-]/g, '');
  if (!cleaned || cleaned.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null;
  return Buffer.from(cleaned, 'hex');
}

/** Matndagi \n \r \t \0 \\ \xNN ketma-ketliklarini haqiqiy belgilarga aylantiradi */
function unescapeAscii(text) {
  return String(text).replace(/\\(x[0-9a-fA-F]{2}|[nrt0\\])/g, (match, group) => {
    if (group[0] === 'x' || group[0] === 'X') {
      return String.fromCharCode(Number.parseInt(group.slice(1), 16));
    }
    switch (group) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case '0':
        return String.fromCharCode(0); // NUL bayti
      case '\\':
        return '\\';
      default:
        return match;
    }
  });
}

/**
 * Sozlamadagi hex yoki ASCII qiymatdan yuboriladigan baytlarni tayyorlaydi.
 * `label` xato matnida ko'rinadi (masalan "onHex/onAscii").
 */
function toBytes(hex, ascii, label) {
  if (typeof hex === 'string' && hex.trim()) {
    const buffer = parseHex(hex);
    if (!buffer || !buffer.length) throw new Error(`${label}: hex qiymat noto'g'ri`);
    return buffer;
  }
  if (typeof ascii === 'string' && ascii.length) {
    // latin1 — \xNN orqali 127 dan katta baytlarni ham yozish mumkin bo'lsin
    return Buffer.from(unescapeAscii(ascii), 'latin1');
  }
  throw new Error(`${label}: qiymat kiritilmagan`);
}

/* ------------------------------------------------------------------ */
/*  Holat qiymatini talqin qilish                                      */
/* ------------------------------------------------------------------ */

const ON_WORDS = new Set(['ON', 'TRUE', '1', 'YES', 'ONLINE']);
const OFF_WORDS = new Set(['OFF', 'FALSE', '0', 'NO', 'OFFLINE']);

/** JSON javobda holat saqlanishi mumkin bo'lgan maydonlar (tartib muhim) */
const STATE_FIELDS = ['state', 'value', 'POWER', 'Power', 'power', 'ison', 'output', 'on'];

/**
 * Qurilmadan kelgan holat qiymatini boolean ga aylantiradi.
 * Tushunilmasa `null` (noma'lum) qaytadi — bu "o'chiq" degani EMAS.
 *
 * @param {unknown} raw     qiymat (string | boolean | number | JSON matn)
 * @param {string}  onValue "yoniq" deb hisoblanadigan qiymat (default 'ON')
 */
function parseStateValue(raw, onValue) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;

  const text = String(raw).trim();
  if (!text) return null;

  // JSON kelsa ichidan holat maydonini qidiramiz: {"state":"ON"} / {"value":true}
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text);
      if (data && typeof data === 'object') {
        for (const field of STATE_FIELDS) {
          if (data[field] !== undefined) return parseStateValue(data[field], onValue);
        }
      }
    } catch {
      /* JSON emas — oddiy matn sifatida davom etamiz */
    }
  }

  const expected = String(onValue || '').trim();
  if (expected && text.toUpperCase() === expected.toUpperCase()) return true;

  const upper = text.toUpperCase();
  if (ON_WORDS.has(upper)) return true;
  if (OFF_WORDS.has(upper)) return false;
  return null;
}

/* ------------------------------------------------------------------ */
/*  Tarmoq yordamchilari                                               */
/* ------------------------------------------------------------------ */

/**
 * Timeout va tashqi to'xtatish signalini qo'llab-quvvatlaydigan fetch.
 * `signal` — agentning umumiy "to'xtash" signali (SIGTERM da barcha so'rovlar uziladi).
 */
async function fetchWithTimeout(url, options, timeoutMs, signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** Oddiy kutish (drayverlar ichida ishlatiladi) */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  errText,
  clampInt,
  maskToken,
  isValidHost,
  splitHostPort,
  parseHex,
  unescapeAscii,
  toBytes,
  parseStateValue,
  fetchWithTimeout,
  delay,
};
