'use strict';

/**
 * Billiard Club — bridge agenti: TUYA / SMART LIFE LOKAL PROTOKOLI (LAN, bulutsiz).
 *
 * Tuya Wi-Fi relelari (Smart Life / Tuya Smart ilovasidagi qurilmalar) lokal tarmoqda
 * TCP 6668-portda o'z protokoli bilan boshqariladi. Versiyalar: 3.1, 3.3, 3.4, 3.5.
 * Har bir buyruq uchun QISQA ulanish ochiladi:
 *   ulanish -> (3.4/3.5: sessiya kalitini kelishish) -> buyruq -> javob -> yopish.
 * Tuya qurilmasi odatda bir vaqtda BITTA TCP mijozni qabul qiladi — buyruqlar navbatini
 * drayver (lockKey) ta'minlaydi.
 *
 * Kadr formatlari (barcha sonlar big-endian):
 *   55AA (3.1–3.4): 000055AA | seqno | cmd | length | [retcode] | payload | CRC32 (3.4: HMAC-SHA256) | 0000AA55
 *                   length = retcode + payload + CRC/HMAC + suffix (sarlavhadan keyingi hamma narsa)
 *   6699 (3.5):     00006699 | 0000 | seqno | cmd | length | IV(12) | AES-GCM([retcode] + payload) | tag(16) | 00009966
 *                   length = IV + shifrlangan qism + tag (suffix kirmaydi); AAD = sarlavhaning 4..18 baytlari
 *   retcode (4 bayt) — faqat QURILMA yuborgan kadrlarda bo'ladi.
 *
 * Payload:
 *   3.1 — JSON ochiq; faqat CONTROL: "3.1" + md5 imzo (16 belgi) + base64(AES-128-ECB(json))
 *   3.3 — AES-128-ECB (PKCS7, kalit = local key); "3.3" + 12 nol bayt sarlavhasi shifrdan TASHQARIDA
 *   3.4 — sessiya kaliti bilan AES-128-ECB; "3.4" sarlavhasi shifr ICHIDA; kadr oxirida HMAC-SHA256
 *   3.5 — sessiya kaliti bilan AES-128-GCM (yuqoridagi 6699 kadr); "3.5" sarlavhasi shifr ichida
 *   DP_QUERY, DP_QUERY_NEW, HEART_BEAT va sessiya buyruqlari versiya sarlavhasiz yuboriladi.
 *
 * 3.4/3.5 sessiya kaliti: mijoz 16 baytli tasodifiy nonce yuboradi (cmd 3), qurilma o'z
 * nonce i + HMAC(localKey, mijoz nonce i) bilan javob beradi (cmd 4), mijoz
 * HMAC(localKey, qurilma nonce i) ni yuboradi (cmd 5). Sessiya kaliti =
 * AES(localKey, nonce1 XOR nonce2): 3.4 da ECB, 3.5 da GCM (IV = mijoz nonce ining
 * birinchi 12 bayti, natija — shifrlangan matnning o'zi, tag olinmaydi).
 *
 * Konstantalar, bayt tartibi va JSON shakllari tinytuya (github.com/jasonacox/tinytuya,
 * tinytuya/core/*.py) bilan solishtirilgan.
 *
 * MAXFIY: local key hech qachon logga yoki xato matniga chiqmaydi.
 * npm bog'liqligi YO'Q — faqat node:net va node:crypto.
 */

const crypto = require('node:crypto');
const net = require('node:net');
const { clampInt, errText, isValidHost, splitHostPort } = require('./common');

/* ------------------------------------------------------------------ */
/*  Konstantalar (tinytuya/core/command_types.py va header.py)         */
/* ------------------------------------------------------------------ */

/** Tuya lokal TCP porti */
const DEFAULT_PORT = 6668;

/** Qo'llab-quvvatlanadigan protokol versiyalari */
const VERSIONS = Object.freeze(['3.1', '3.3', '3.4', '3.5']);

/** Buyruq turlari (faqat kerakli va UDP qidiruvda uchraydiganlari) */
const CMD = Object.freeze({
  SESS_KEY_NEG_START: 3,
  SESS_KEY_NEG_RESP: 4,
  SESS_KEY_NEG_FINISH: 5,
  CONTROL: 7,
  STATUS: 8,
  HEART_BEAT: 9,
  DP_QUERY: 10,
  CONTROL_NEW: 13,
  DP_QUERY_NEW: 16,
  UPDATEDPS: 18,
  UDP_NEW: 19,
  BOARDCAST_LPV34: 35,
  REQ_DEVINFO: 37,
  LAN_EXT_STREAM: 64,
});

const PREFIX_55AA = 0x000055aa;
const SUFFIX_55AA = 0x0000aa55;
const PREFIX_6699 = 0x00006699;
const SUFFIX_6699 = 0x00009966;

const PREFIX_55AA_BIN = Buffer.from('000055aa', 'hex');
const PREFIX_6699_BIN = Buffer.from('00006699', 'hex');
const SUFFIX_55AA_BIN = Buffer.from('0000aa55', 'hex');
const SUFFIX_6699_BIN = Buffer.from('00009966', 'hex');

const HEADER_55AA_LEN = 16;
const HEADER_6699_LEN = 18;
const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;
const HMAC_LEN = 32;
/** "3.x" + 12 bayt */
const VERSION_HEADER_LEN = 15;

/** Versiya sarlavhasi QO'SHILMAYDIGAN buyruqlar (tinytuya NO_PROTOCOL_HEADER_CMDS) */
const NO_PROTOCOL_HEADER_CMDS = new Set([
  CMD.DP_QUERY,
  CMD.DP_QUERY_NEW,
  CMD.UPDATEDPS,
  CMD.HEART_BEAT,
  CMD.SESS_KEY_NEG_START,
  CMD.SESS_KEY_NEG_RESP,
  CMD.SESS_KEY_NEG_FINISH,
  CMD.LAN_EXT_STREAM,
]);

/** UDP e'lonlar kaliti: md5("yGAdlopoPVldABfn") (tuya-convert / tinytuya udpkey) */
const UDP_KEY = crypto.createHash('md5').update('yGAdlopoPVldABfn', 'latin1').digest();

/** Bitta kadr `length` maydonining yuqori chegarasi — buzilgan oqimni aniqlash uchun */
const MAX_FRAME_LENGTH = 8192;

/** Qabul buferi chegarasi — nosoz qurilma xotirani to'ldirib yubormasin */
const MAX_BUFFER = 64 * 1024;

/** 3.4/3.5: sessiya kaliti tayyor bo'lgach birinchi buyruqqacha qisqa tanaffus (ms) */
const SESSION_SETTLE_MS = 20;

const EMPTY = Buffer.alloc(0);

const LOCAL_KEY_RE = /^[\x20-\x7e]{16}$/;
const DEVICE_ID_RE = /^[a-zA-Z0-9]{10,40}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
/** UTF-8 dekodlashda buzilgan baytlar o'rniga qo'yiladigan belgi (U+FFFD) */
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

/* ------------------------------------------------------------------ */
/*  Xato matnlari (admin panelda ko'rinadi — kalit HECH QACHON yo'q)    */
/* ------------------------------------------------------------------ */

const MSG = Object.freeze({
  aborted: "Tuya: so'rov to'xtatildi",
  key: "Tuya: local key noto'g'ri — qurilma kalitni tasdiqlamadi",
  decrypt: "Tuya: javobni ochib bo'lmadi — local key yoki protokol versiyasi noto'g'ri",
  connectTimeout: "Tuya: qurilmaga ulanib bo'lmadi (timeout) — IP manzil va tarmoqni tekshiring",
  sessionTimeout: 'Tuya: sessiya kaliti kelishilmadi (timeout) — local key va protokol versiyasini tekshiring',
  commandTimeout: 'Tuya: javob kelmadi (timeout) — local key va protokol versiyasini tekshiring',
  sessionClosed: "Tuya: qurilma ulanishni uzdi — local key yoki protokol versiyasi noto'g'ri",
  commandClosed: 'Tuya: qurilma ulanishni javobsiz uzdi — local key/versiyani tekshiring yoki qurilmaga boshqa ilova ulangan',
});

/** Xato + sabab (drayver qayta urinish usulini tanlashi uchun) */
function tuyaError(message, reason, phase) {
  const err = new Error(message);
  err.tuyaReason = reason;
  if (phase) err.tuyaPhase = phase;
  return err;
}

/* ------------------------------------------------------------------ */
/*  Kriptografiya yordamchilari                                        */
/* ------------------------------------------------------------------ */

/** CRC32 (IEEE 802.3, zlib/binascii.crc32 bilan bir xil) jadvali */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC32 — Node 18 da zlib.crc32 yo'q, shuning uchun o'zimizniki */
function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 4 baytli big-endian son */
function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/** Uzunligi teng bo'lsa vaqtga chidamli taqqoslash */
function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** AES-128-ECB; `pad` — PKCS7 to'ldirish (sessiya kaliti uchun false) */
function aesEcbEncrypt(key, data, pad = true) {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(pad);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * AES-128-ECB ochish. To'ldirish tinytuya kabi YUMSHOQ olib tashlanadi (faqat oxirgi
 * bayt 1..16 ekani tekshiriladi) — haqiqiy tekshiruv keyingi JSON/matn tahlilida.
 */
function aesEcbDecrypt(key, data, unpad = true) {
  if (!data.length || data.length % 16 !== 0) throw new Error("ECB: uzunlik 16 ga karrali emas");
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  decipher.setAutoPadding(false);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  if (!unpad) return plain;
  const pad = plain[plain.length - 1];
  if (pad < 1 || pad > 16) throw new Error("ECB: to'ldirish noto'g'ri");
  return plain.subarray(0, plain.length - pad);
}

function tryEcbDecrypt(key, data) {
  try {
    return aesEcbDecrypt(key, data);
  } catch {
    return null;
  }
}

/** AES-128-GCM: 12 baytli IV, 16 baytli tag */
function gcmEncrypt(key, iv, plain, aad) {
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv, { authTagLength: GCM_TAG_LEN });
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { ciphertext, tag: cipher.getAuthTag() };
}

/** AES-128-GCM ochish; tag mos kelmasa throw qiladi */
function gcmDecrypt(key, iv, ciphertext, tag, aad) {
  const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv, { authTagLength: GCM_TAG_LEN });
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** "3.3" + 12 ta nol bayt */
function versionHeader(version) {
  return Buffer.concat([Buffer.from(version, 'latin1'), Buffer.alloc(12)]);
}

/** Bufer "3.x" sarlavhasi bilan boshlanadimi (keyingi 12 bayt har xil bo'lishi mumkin) */
function hasVersionHeader(buffer) {
  return buffer.length >= VERSION_HEADER_LEN
    && buffer[0] === 0x33 && buffer[1] === 0x2e && buffer[2] >= 0x30 && buffer[2] <= 0x39;
}

function startsWithAscii(buffer, text) {
  return buffer.length >= text.length && buffer.subarray(0, text.length).toString('latin1') === text;
}

/**
 * Sessiya kaliti (3.4/3.5). tinytuya `_negotiate_session_key_generate_finalize` bilan bir xil:
 *   3.4: AES-ECB(localKey, nonce1 XOR nonce2), to'ldirishsiz
 *   3.5: AES-GCM(localKey, IV = nonce1[0..12]) shifrlangan matni (16 bayt, tag kirmaydi)
 */
function deriveSessionKey(version, realKey, localNonce, remoteNonce) {
  const mixed = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) mixed[i] = localNonce[i] ^ remoteNonce[i];
  if (version === '3.4') return aesEcbEncrypt(realKey, mixed, false);
  return gcmEncrypt(realKey, localNonce.subarray(0, GCM_IV_LEN), mixed).ciphertext;
}

/* ------------------------------------------------------------------ */
/*  Kadrlarni yig'ish va ajratish                                      */
/* ------------------------------------------------------------------ */

/**
 * 55AA kadri. `hmacKey` berilsa (3.4) CRC32 o'rniga HMAC-SHA256.
 * `retcode` — faqat qurilma tomonidagi kadrlar uchun (mijoz uni yubormaydi).
 */
function pack55AA({ seqno, cmd, payload = EMPTY, retcode = null, hmacKey = null }) {
  const retLen = retcode === null || retcode === undefined ? 0 : 4;
  const endLen = (hmacKey ? HMAC_LEN : 4) + 4;
  const head = Buffer.alloc(HEADER_55AA_LEN + retLen);
  head.writeUInt32BE(PREFIX_55AA, 0);
  head.writeUInt32BE(seqno >>> 0, 4);
  head.writeUInt32BE(cmd >>> 0, 8);
  head.writeUInt32BE(retLen + payload.length + endLen, 12);
  if (retLen) head.writeUInt32BE(retcode >>> 0, 16);
  const body = Buffer.concat([head, payload]);
  const check = hmacKey ? hmacSha256(hmacKey, body) : uint32(crc32(body));
  return Buffer.concat([body, check, SUFFIX_55AA_BIN]);
}

/** 6699 kadri (3.5): AES-GCM, AAD = sarlavhaning 4..18 baytlari, IV har safar tasodifiy */
function pack6699({ seqno, cmd, payload = EMPTY, retcode = null, key, iv = null }) {
  const retLen = retcode === null || retcode === undefined ? 0 : 4;
  const head = Buffer.alloc(HEADER_6699_LEN);
  head.writeUInt32BE(PREFIX_6699, 0);
  head.writeUInt16BE(0, 4);
  head.writeUInt32BE(seqno >>> 0, 6);
  head.writeUInt32BE(cmd >>> 0, 10);
  head.writeUInt32BE(GCM_IV_LEN + retLen + payload.length + GCM_TAG_LEN, 14);
  const nonce = iv || crypto.randomBytes(GCM_IV_LEN);
  const plain = retLen ? Buffer.concat([uint32(retcode), payload]) : payload;
  const { ciphertext, tag } = gcmEncrypt(key, nonce, plain, head.subarray(4));
  return Buffer.concat([head, nonce, ciphertext, tag, SUFFIX_6699_BIN]);
}

/** Keyingi prefiks (55AA yoki 6699) joyi; topilmasa -1 */
function findPrefix(buffer, offset) {
  const a = buffer.indexOf(PREFIX_55AA_BIN, offset);
  const b = buffer.indexOf(PREFIX_6699_BIN, offset);
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

/**
 * TCP oqimidan TO'LIQ kadrlarni ajratadi: bir bo'lakda bir nechta kadr, bo'laklarga
 * bo'lingan kadr va oradagi tanilmagan baytlar to'g'ri ishlanadi.
 * @returns {{ frames: Buffer[], rest: Buffer, skipped: number }} `rest` — keyingi bo'lak kutilayotgan qism
 */
function splitFrames(buffer) {
  const frames = [];
  let offset = 0;
  let skipped = 0;
  for (;;) {
    const start = findPrefix(buffer, offset);
    if (start === -1) {
      // Prefiksning boshi bo'lishi mumkin bo'lgan oxirgi 3 baytni saqlab qolamiz
      const keep = Math.min(3, buffer.length - offset);
      skipped += buffer.length - offset - keep;
      return { frames, rest: buffer.subarray(buffer.length - keep), skipped };
    }
    skipped += start - offset;
    const is6699 = buffer.readUInt32BE(start) === PREFIX_6699;
    const headLen = is6699 ? HEADER_6699_LEN : HEADER_55AA_LEN;
    if (buffer.length - start < headLen) return { frames, rest: buffer.subarray(start), skipped };

    const length = buffer.readUInt32BE(start + headLen - 4);
    const minLength = is6699 ? GCM_IV_LEN + GCM_TAG_LEN : 8;
    if (length < minLength || length > MAX_FRAME_LENGTH) {
      // Buzilgan sarlavha — bir bayt surib qayta qidiramiz
      offset = start + 1;
      skipped += 1;
      continue;
    }
    const total = headLen + length + (is6699 ? 4 : 0);
    if (buffer.length - start < total) return { frames, rest: buffer.subarray(start), skipped };
    if (buffer.readUInt32BE(start + total - 4) !== (is6699 ? SUFFIX_6699 : SUFFIX_55AA)) {
      offset = start + 1;
      skipped += 1;
      continue;
    }
    frames.push(buffer.subarray(start, start + total));
    offset = start + total;
  }
}

/** Kadrdagi buyruq raqami (ochilmagan kadr uchun ham) */
function frameCommand(frame) {
  return frame.readUInt32BE(0) === PREFIX_6699 ? frame.readUInt32BE(10) : frame.readUInt32BE(8);
}

/**
 * Qurilma kadridagi retcode. tinytuya qurilma kadrlarida uni doim kutadi; tuyapi kabi
 * qo'shimcha ehtiyot: so'zning yuqori 3 bayti nol bo'lmasa (masalan "3.3" yoki "{"
 * bilan boshlangan payload) retcode YO'Q deb hisoblaymiz.
 */
function splitRetcode(payload) {
  if (payload.length >= 4 && payload[0] === 0 && payload[1] === 0 && payload[2] === 0) {
    return { retcode: payload.readUInt32BE(0), payload: payload.subarray(4) };
  }
  return { retcode: null, payload };
}

/**
 * Bitta kadrni ochadi.
 *   55AA: CRC32 / HMAC tekshiriladi, natija `checkOk` da (tinytuya kabi mos kelmasa
 *         ham payload qaytariladi — haqiqiy tekshiruv shifr va JSON da)
 *   6699: AES-GCM bilan ochiladi; tag mos kelmasa throw
 * @param {Buffer} frame
 * @param {object} options { key: Buffer|null, hmac: boolean (3.4), retcode: boolean (qurilma kadri) }
 */
function unpackFrame(frame, { key = null, hmac = false, retcode = true } = {}) {
  const prefix = frame.readUInt32BE(0);
  if (prefix === PREFIX_55AA) {
    const endLen = (hmac ? HMAC_LEN : 4) + 4;
    const bodyEnd = frame.length - endLen;
    if (bodyEnd < HEADER_55AA_LEN) throw new Error('kadr juda qisqa');
    const body = frame.subarray(0, bodyEnd);
    const check = frame.subarray(bodyEnd, frame.length - 4);
    let checkOk;
    if (hmac) {
      if (!key) throw new Error("HMAC uchun kalit yo'q");
      checkOk = safeEqual(check, hmacSha256(key, body));
    } else {
      checkOk = check.readUInt32BE(0) === crc32(body);
    }
    const raw = frame.subarray(HEADER_55AA_LEN, bodyEnd);
    const parts = retcode ? splitRetcode(raw) : { retcode: null, payload: raw };
    return {
      format: '55aa',
      seqno: frame.readUInt32BE(4),
      cmd: frame.readUInt32BE(8),
      retcode: parts.retcode,
      payload: parts.payload,
      checkOk,
    };
  }
  if (prefix === PREFIX_6699) {
    if (!key) throw new Error("6699 kadr uchun kalit yo'q");
    if (frame.length < HEADER_6699_LEN + GCM_IV_LEN + GCM_TAG_LEN + 4) throw new Error('kadr juda qisqa');
    const iv = frame.subarray(HEADER_6699_LEN, HEADER_6699_LEN + GCM_IV_LEN);
    const tag = frame.subarray(frame.length - 4 - GCM_TAG_LEN, frame.length - 4);
    const ciphertext = frame.subarray(HEADER_6699_LEN + GCM_IV_LEN, frame.length - 4 - GCM_TAG_LEN);
    const plain = gcmDecrypt(key, iv, ciphertext, tag, frame.subarray(4, HEADER_6699_LEN));
    const parts = retcode ? splitRetcode(plain) : { retcode: null, payload: plain };
    return {
      format: '6699',
      seqno: frame.readUInt32BE(6),
      cmd: frame.readUInt32BE(10),
      retcode: parts.retcode,
      payload: parts.payload,
      checkOk: true,
    };
  }
  throw new Error("noma'lum kadr prefiksi");
}

/**
 * Mijoz xabarini versiyaga mos kadrga aylantiradi (tinytuya `_encode_message`).
 * @param {object} options { version, key (3.4/3.5 da sessiya kaliti), seqno, cmd, payload }
 */
function encodeMessage({ version, key, seqno, cmd, payload = EMPTY }) {
  const withHeader = !NO_PROTOCOL_HEADER_CMDS.has(cmd);
  if (version === '3.5') {
    const plain = withHeader ? Buffer.concat([versionHeader('3.5'), payload]) : payload;
    return pack6699({ seqno, cmd, payload: plain, key });
  }
  if (version === '3.4') {
    // 3.4: sarlavha shifr ICHIDA
    const plain = withHeader ? Buffer.concat([versionHeader('3.4'), payload]) : payload;
    return pack55AA({ seqno, cmd, payload: aesEcbEncrypt(key, plain), hmacKey: key });
  }
  if (version === '3.3') {
    // 3.3: avval shifr, keyin sarlavha (shifrdan TASHQARIDA)
    const encrypted = aesEcbEncrypt(key, payload);
    return pack55AA({
      seqno, cmd, payload: withHeader ? Buffer.concat([versionHeader('3.3'), encrypted]) : encrypted,
    });
  }
  // 3.1: faqat CONTROL shifrlanadi: "3.1" + md5("data=<b64>||lpv=3.1||<key>")[8:24] + <b64>
  if (cmd === CMD.CONTROL) {
    const b64 = Buffer.from(aesEcbEncrypt(key, payload).toString('base64'), 'latin1');
    const digest = crypto.createHash('md5')
      .update(Buffer.concat([Buffer.from('data=', 'latin1'), b64, Buffer.from('||lpv=3.1||', 'latin1'), key]))
      .digest('hex');
    return pack55AA({
      seqno, cmd, payload: Buffer.concat([Buffer.from('3.1', 'latin1'), Buffer.from(digest.slice(8, 24), 'latin1'), b64]),
    });
  }
  return pack55AA({ seqno, cmd, payload });
}

/* ------------------------------------------------------------------ */
/*  Payload ni ochish va talqin qilish                                 */
/* ------------------------------------------------------------------ */

/** Baytlar o'qiladigan matnmi (noto'g'ri kalit bilan ochilgan "axlat" emasmi) */
function asText(buffer) {
  const text = buffer.toString('utf8').replace(/\u0000+$/, '');
  return CONTROL_CHAR_RE.test(text) || text.includes(REPLACEMENT_CHAR) ? { error: 'decrypt' } : { text };
}

/**
 * Qurilma payloadini matnga aylantiradi (tinytuya `_decode_payload` bilan bir xil tartib).
 * @returns {{ text?: string, error?: string }} error — ochib bo'lmadi (kalit/versiya noto'g'ri)
 */
function decodePayload(payload, version, key) {
  if (!payload || !payload.length) return { text: '' };

  if (version === '3.5') {
    // Kadr darajasida (GCM) ochilgan; faqat sarlavha olib tashlanadi
    return asText(hasVersionHeader(payload) ? payload.subarray(VERSION_HEADER_LEN) : payload);
  }

  if (version === '3.4') {
    // 3.4: sarlavha ham shifr ichida — avval butun payload ochiladi
    const plain = tryEcbDecrypt(key, payload);
    if (!plain) return asText(payload); // ochiq matnli xato xabari bo'lishi mumkin
    return asText(hasVersionHeader(plain) ? plain.subarray(VERSION_HEADER_LEN) : plain);
  }

  if (startsWithAscii(payload, '3.1')) {
    // 3.1 STATUS: "3.1" + md5 imzo (16 belgi) + base64(AES-ECB(json))
    if (payload.length <= 19) return { error: 'decrypt' };
    const raw = Buffer.from(payload.subarray(19).toString('latin1'), 'base64');
    const plain = tryEcbDecrypt(key, raw);
    return plain ? asText(plain) : { error: 'decrypt' };
  }

  // 3.1 qurilmasining qolgan javoblari ochiq JSON
  if (version === '3.1') return asText(payload);

  // 3.3: sarlavha bo'lishi ham, bo'lmasligi ham mumkin
  let data = payload;
  if (hasVersionHeader(data)) data = data.subarray(VERSION_HEADER_LEN);
  else if (data.length > VERSION_HEADER_LEN && data.length % 16 === VERSION_HEADER_LEN) {
    // "device22" turidagi qurilmalar: sarlavha boshqacha ko'rinishda (tinytuya ham olib tashlaydi)
    data = data.subarray(VERSION_HEADER_LEN);
  }
  if (!data.length) return { text: '' };
  const plain = tryEcbDecrypt(key, data);
  if (plain) {
    const decoded = asText(plain);
    if (!decoded.error) return decoded;
  }
  return asText(data); // shifrlanmagan xato matni bo'lishi mumkin; "axlat" bo'lsa error
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Ochilgan matndan JSON va DP qiymatlarini ajratadi.
 * 3.4/3.5 da dps `data.dps` ichida keladi: {"protocol":4,"t":..,"data":{"dps":{"1":true}}}
 * @returns {{ text: string, json: object|null, dps: object|null, invalid: boolean }}
 */
function interpretText(text) {
  const trimmed = String(text || '').trim();
  const result = { text: trimmed, json: null, dps: null, invalid: /data unvalid/i.test(trimmed) };
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      if (isPlainObject(json)) {
        result.json = json;
        if (isPlainObject(json.dps)) result.dps = json.dps;
        else if (isPlainObject(json.data) && isPlainObject(json.data.dps)) result.dps = json.data.dps;
      }
    } catch {
      /* JSON emas — matn sifatida qoladi */
    }
  }
  return result;
}

/** DP qiymatini boolean ga aylantiradi; tushunilmasa null */
function dpBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value !== 0 : null;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === 'on' || text === '1') return true;
    if (text === 'false' || text === 'off' || text === '0') return false;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  JSON payload shakllari (tinytuya payload_dict)                     */
/* ------------------------------------------------------------------ */

function isModern(version) {
  return version === '3.4' || version === '3.5';
}

/** CONTROL (≤3.3) yoki CONTROL_NEW (3.4/3.5) uchun JSON */
function controlPayload(version, deviceId, dps, nowMs = Date.now()) {
  const t = Math.floor(nowMs / 1000);
  if (isModern(version)) return { protocol: 5, t, data: { dps } };
  return { devId: deviceId, uid: deviceId, t: String(t), dps };
}

/** DP_QUERY (≤3.3) yoki DP_QUERY_NEW (3.4/3.5) uchun JSON */
function queryPayload(version, deviceId, nowMs = Date.now()) {
  if (isModern(version)) return {};
  return { gwId: deviceId, devId: deviceId, uid: deviceId, t: String(Math.floor(nowMs / 1000)) };
}

/** "device22" holat so'rovi: CONTROL_NEW + so'raladigan DP lar null qiymat bilan */
function device22Payload(deviceId, dpList, nowMs = Date.now()) {
  const dps = {};
  for (const dp of dpList) dps[String(dp)] = null;
  return { devId: deviceId, uid: deviceId, t: String(Math.floor(nowMs / 1000)), dps };
}

/** JSON -> bayt; JSON.stringify bo'sh joy qo'shmaydi (Tuya bo'sh joyli JSON ga javob bermaydi) */
function jsonBuffer(value) {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

/* ------------------------------------------------------------------ */
/*  Sozlamani tekshirish                                               */
/* ------------------------------------------------------------------ */

function normalizeVersion(raw) {
  if (raw === undefined || raw === null || raw === '') return '3.3';
  const text = String(raw).trim();
  if (!VERSIONS.includes(text)) {
    throw tuyaError("Tuya: protokol versiyasi noto'g'ri — 3.1, 3.3, 3.4 yoki 3.5 bo'lishi kerak", 'config');
  }
  return text;
}

function normalizeLocalKey(raw) {
  if (Buffer.isBuffer(raw)) {
    if (raw.length !== 16) throw tuyaError("Tuya: local key 16 ta belgidan iborat bo'lishi kerak", 'config');
    return Buffer.from(raw);
  }
  const text = typeof raw === 'string' ? raw : '';
  if (!text.trim()) throw tuyaError('Tuya: local key kiritilmagan', 'config');
  // Kalitning o'zi 16 belgi bo'lsa — aynan o'zi; atrofida tasodifiy bo'sh joy bo'lsa — kesilgani
  const key = LOCAL_KEY_RE.test(text) ? text : text.trim();
  if (!LOCAL_KEY_RE.test(key)) throw tuyaError("Tuya: local key 16 ta belgidan iborat bo'lishi kerak", 'config');
  return Buffer.from(key, 'latin1');
}

function normalizeDeviceId(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) throw tuyaError('Tuya: qurilma ID (deviceId) kiritilmagan', 'config');
  if (!DEVICE_ID_RE.test(text)) {
    throw tuyaError("Tuya: qurilma ID (deviceId) noto'g'ri — 10–40 ta lotin harf va raqam", 'config');
  }
  return text;
}

/**
 * Ulanish sozlamalarini tekshiradi.
 * @param {object} options { host, deviceId, localKey, version, timeoutMs, signal, log }
 */
function normalizeOptions(options = {}) {
  const rawHost = typeof options.host === 'string' ? options.host.trim() : '';
  if (!rawHost) throw tuyaError('Tuya: qurilma manzili (IP) kiritilmagan', 'config');
  if (!isValidHost(rawHost)) throw tuyaError(`Tuya: qurilma manzili noto'g'ri ("${rawHost.slice(0, 60)}")`, 'config');
  const { host, port } = splitHostPort(rawHost, DEFAULT_PORT);
  return {
    host,
    port,
    deviceId: normalizeDeviceId(options.deviceId),
    localKey: normalizeLocalKey(options.localKey),
    version: normalizeVersion(options.version),
    timeoutMs: clampInt(options.timeoutMs, 100, 60_000, 3000),
    signal: options.signal || null,
    log: typeof options.log === 'function' ? options.log : () => {},
  };
}

/* ------------------------------------------------------------------ */
/*  Bitta TCP ulanish (mijoz)                                          */
/* ------------------------------------------------------------------ */

class TuyaConnection {
  constructor(opts) {
    this.opts = opts;
    this.version = opts.version;
    this.realKey = opts.localKey;
    /** Joriy kalit: 3.4/3.5 da kelishuvdan keyin sessiya kaliti */
    this.key = opts.localKey;
    this.seqno = 1;
    /** connect -> open -> negotiate -> command */
    this.phase = 'connect';
    this.socket = null;
    this.buffer = EMPTY;
    this.queue = [];
    this.connectWaiter = null;
    this.frameWaiter = null;
    this.failure = null;
    /** Ochib bo'lmagan kadrlar soni — timeout bo'lsa sababini aniqroq aytish uchun */
    this.badFrames = 0;
  }

  debug(message) {
    try {
      this.opts.log('debug', `Tuya ${this.opts.host}: ${message}`);
    } catch {
      /* log xatosi buyruqqa ta'sir qilmasin */
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.connectWaiter = { resolve, reject };
      const socket = net.connect({ host: this.opts.host, port: this.opts.port });
      this.socket = socket;
      socket.setNoDelay(true);
      socket.once('connect', () => {
        if (this.failure) return;
        this.phase = 'open';
        this.connectWaiter = null;
        resolve();
      });
      socket.on('data', (chunk) => {
        // Hodisa ishlovchisidagi kutilmagan xato agentni to'xtatmasin — ulanish xatosiga aylanadi
        try {
          this.onData(chunk);
        } catch (err) {
          this.fail(tuyaError(`Tuya: javobni o'qishda xato (${errText(err)})`, 'protocol', this.phase));
        }
      });
      socket.on('error', (err) => this.fail(this.socketError(err)));
      socket.on('close', () => this.fail(this.closedError()));
    });
  }

  onData(chunk) {
    if (this.failure) return;
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    if (this.buffer.length > MAX_BUFFER) {
      this.fail(tuyaError("Tuya: qurilmadan kutilmagan hajmdagi ma'lumot keldi", 'protocol', this.phase));
      return;
    }
    const { frames, rest, skipped } = splitFrames(this.buffer);
    this.buffer = rest;
    if (skipped) this.debug(`${skipped} bayt tanilmadi va tashlab yuborildi`);
    for (const frame of frames) this.queue.push(Buffer.from(frame));
    if (this.frameWaiter && this.queue.length) {
      const { resolve } = this.frameWaiter;
      this.frameWaiter = null;
      resolve(this.queue.shift());
    }
  }

  /** Ulanish tugadi (xato/yopildi/timeout): kutayotganlarga xabar beriladi */
  fail(err) {
    if (!this.failure) this.failure = err;
    const waiters = [this.connectWaiter, this.frameWaiter];
    this.connectWaiter = null;
    this.frameWaiter = null;
    for (const waiter of waiters) if (waiter) waiter.reject(this.failure);
  }

  close(err) {
    this.fail(err || tuyaError('Tuya: ulanish yopildi', 'closed', this.phase));
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {
        /* e'tiborsiz */
      }
    }
  }

  /** Navbatdagi to'liq kadr (avval kelganlari, keyin yangisi) */
  nextFrame() {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.frameWaiter = { resolve, reject };
    });
  }

  send(cmd, payload) {
    if (this.failure) throw this.failure;
    const frame = encodeMessage({ version: this.version, key: this.key, seqno: this.seqno, cmd, payload });
    this.seqno = (this.seqno + 1) >>> 0 || 1;
    this.socket.write(frame);
  }

  /** Kadrni ochadi (payload hali shifrlangan bo'lishi mumkin) */
  async receive() {
    const frame = await this.nextFrame();
    try {
      const msg = unpackFrame(frame, { key: this.key, hmac: this.version === '3.4' });
      if (!msg.checkOk) this.debug(`kadr nazorat yig'indisi mos kelmadi (cmd ${msg.cmd})`);
      return msg;
    } catch (err) {
      this.badFrames += 1;
      this.debug(`kadrni ochib bo'lmadi (cmd ${frameCommand(frame)}): ${err.message}`);
      return { cmd: frameCommand(frame), seqno: null, retcode: null, payload: EMPTY, undecodable: true };
    }
  }

  /** Kadr + payload: { cmd, retcode, text, json, dps, invalid, undecodable } */
  async receiveMessage() {
    const msg = await this.receive();
    if (msg.undecodable) return msg;
    const decoded = decodePayload(msg.payload, this.version, this.key);
    if (decoded.error) {
      this.badFrames += 1;
      this.debug(`cmd ${msg.cmd} javobini ochib bo'lmadi`);
      return { ...msg, undecodable: true };
    }
    return { ...msg, ...interpretText(decoded.text) };
  }

  /** 3.4/3.5 sessiya kalitini kelishish (tinytuya `_negotiate_session_key`) */
  async negotiate() {
    this.phase = 'negotiate';
    const localNonce = crypto.randomBytes(16);
    this.send(CMD.SESS_KEY_NEG_START, localNonce);
    let remoteNonce = null;
    while (!remoteNonce) {
      // eslint-disable-next-line no-await-in-loop
      const msg = await this.receive();
      // 3.5: GCM tegi mos kelmadi — qurilma boshqa kalit bilan shifrlagan
      if (msg.undecodable) throw tuyaError(MSG.key, 'key', 'negotiate');
      if (msg.cmd !== CMD.SESS_KEY_NEG_RESP) {
        this.debug(`sessiya javobi o'rniga cmd ${msg.cmd} keldi — e'tiborsiz`);
        continue;
      }
      let payload = msg.payload;
      if (this.version === '3.4') payload = tryEcbDecrypt(this.realKey, payload) || EMPTY;
      // Javob: qurilma nonce i (16) + HMAC(localKey, bizning nonce) (32)
      if (payload.length < 48 || !safeEqual(payload.subarray(16, 48), hmacSha256(this.realKey, localNonce))) {
        throw tuyaError(MSG.key, 'key', 'negotiate');
      }
      remoteNonce = Buffer.from(payload.subarray(0, 16));
    }
    this.send(CMD.SESS_KEY_NEG_FINISH, hmacSha256(this.realKey, remoteNonce));
    this.key = deriveSessionKey(this.version, this.realKey, localNonce, remoteNonce);
  }

  timeoutError() {
    if (this.phase === 'connect') return tuyaError(MSG.connectTimeout, 'timeout', 'connect');
    if (this.phase === 'negotiate') return tuyaError(MSG.sessionTimeout, 'timeout', 'negotiate');
    if (this.badFrames) return tuyaError(MSG.decrypt, 'decrypt', 'command');
    return tuyaError(MSG.commandTimeout, 'timeout', 'command');
  }

  closedError() {
    if (this.phase === 'connect') return tuyaError("Tuya: qurilmaga ulanib bo'lmadi (ulanish uzildi)", 'connect', 'connect');
    if (this.phase === 'negotiate') return tuyaError(MSG.sessionClosed, 'closed', 'negotiate');
    if (this.badFrames) return tuyaError(MSG.decrypt, 'decrypt', 'command');
    return tuyaError(MSG.commandClosed, 'closed', 'command');
  }

  socketError(err) {
    const code = err && err.code ? String(err.code) : '';
    const { host, port } = this.opts;
    if (this.phase === 'connect') {
      if (code === 'ECONNREFUSED') {
        return tuyaError(`Tuya: ${host}:${port} ulanishni rad etdi — qurilma band yoki port yopiq`, 'connect', 'connect');
      }
      if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'EHOSTDOWN') {
        return tuyaError(`Tuya: ${host} ga yo'l yo'q — IP manzilni tekshiring`, 'connect', 'connect');
      }
      return tuyaError(`Tuya: qurilmaga ulanib bo'lmadi (${errText(err)})`, 'connect', 'connect');
    }
    if (code === 'ECONNRESET' || code === 'EPIPE') return this.closedError();
    return tuyaError(`Tuya: tarmoq xatosi (${errText(err)})`, 'closed', this.phase);
  }
}

function pause(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Bitta ulanish ichida to'liq almashuv: ulanish, (3.4/3.5) sessiya, `work(conn)`, yopish.
 * `timeoutMs` — BUTUN almashuv uchun; `signal` — tashqi to'xtatish.
 */
function exchange(options, work) {
  let opts;
  try {
    opts = normalizeOptions(options);
  } catch (err) {
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    const { signal } = opts;
    if (signal && signal.aborted) {
      reject(tuyaError(MSG.aborted, 'aborted'));
      return;
    }
    const conn = new TuyaConnection(opts);
    let settled = false;
    let timer = null;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      conn.close(err);
      if (err) reject(err);
      else resolve(value);
    };
    const onAbort = () => finish(tuyaError(MSG.aborted, 'aborted', conn.phase));
    timer = setTimeout(() => finish(conn.timeoutError()), opts.timeoutMs);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    (async () => {
      await conn.connect();
      if (isModern(opts.version)) {
        await conn.negotiate();
        // Qurilma sessiyani yakunlab ulgursin (FINISH va buyruq bitta paketga tushmasin)
        await pause(SESSION_SETTLE_MS);
      }
      conn.phase = 'command';
      return work(conn);
    })().then((value) => finish(null, value), (err) => finish(err));
  });
}

/* ------------------------------------------------------------------ */
/*  Ommaviy API: yozish va o'qish                                      */
/* ------------------------------------------------------------------ */

/** Qurilma rad etgan javob uchun qisqa xato */
function rejectedError(msg) {
  const code = msg.retcode ? `kod ${msg.retcode}` : 'xato';
  const text = msg.text ? msg.text.replace(/\s+/g, ' ').slice(0, 80) : '';
  const hint = msg.invalid ? " — DP raqami yoki protokol versiyasi mos emas" : '';
  return tuyaError(`Tuya: qurilma buyruqni rad etdi (${code}${text ? `: ${text}` : ''})${hint}`, 'rejected', 'command');
}

/** Holat xabaridagi qiymatlar yozilganiga mosmi */
function matchesAll(reported, wanted) {
  return Object.keys(wanted).every((dp) => {
    if (!Object.prototype.hasOwnProperty.call(reported, dp)) return false;
    const expected = wanted[dp];
    return typeof expected === 'boolean' ? dpBoolean(reported[dp]) === expected : reported[dp] === expected;
  });
}

/** Bitta CONTROL xabarini yuborib, qurilma tasdig'ini kutadi */
async function sendControl(conn, dps) {
  const cmd = isModern(conn.version) ? CMD.CONTROL_NEW : CMD.CONTROL;
  conn.send(cmd, jsonBuffer(controlPayload(conn.version, conn.opts.deviceId, dps)));
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const msg = await conn.receiveMessage();
    if (msg.cmd === CMD.CONTROL || msg.cmd === CMD.CONTROL_NEW) {
      // Ochilmagan javob + nol bo'lmagan kod — odatda noto'g'ri kalit belgisi
      if (msg.undecodable && msg.retcode !== 0) throw tuyaError(MSG.decrypt, 'decrypt', 'command');
      if (msg.retcode || msg.invalid) throw rejectedError(msg);
      if (msg.undecodable) conn.debug('tasdiq payloadi ochilmadi, lekin kod 0 — buyruq qabul qilingan');
      return msg.dps || null;
    }
    // Ba'zi qurilmalar tasdiq o'rniga darhol holat (STATUS) yuboradi
    if (msg.cmd === CMD.STATUS && msg.dps && matchesAll(msg.dps, dps)) return msg.dps;
    if (!msg.undecodable) conn.debug(`kutilmagan xabar e'tiborsiz qoldirildi (cmd ${msg.cmd})`);
  }
}

/**
 * DP qiymatlarini yozadi — odatda BITTA CONTROL xabarida (masalan {"1":true,"2":true}).
 * @param {object} options { host, deviceId, localKey, version, timeoutMs, signal, log }
 * @param {Record<string, unknown>} dps
 * @param {object} [extra] { singleDp: true } — har DP alohida xabarda (bir vaqtda faqat
 *   bitta DP qabul qiladigan qurilmalar uchun; tinytuya max_simultaneous_dps = 1)
 * @returns {Promise<object|null>} qurilma xabar qilgan dps (bo'lsa)
 */
function setDps(options, dps, extra = {}) {
  const entries = Object.entries(dps || {});
  if (!entries.length) return Promise.reject(tuyaError("Tuya: yoziladigan DP ko'rsatilmagan", 'config'));
  const batches = extra.singleDp ? entries.map(([dp, value]) => ({ [dp]: value })) : [Object.fromEntries(entries)];
  return exchange(options, async (conn) => {
    let reported = null;
    for (const batch of batches) {
      // eslint-disable-next-line no-await-in-loop
      reported = await sendControl(conn, batch);
    }
    return reported;
  });
}

/**
 * Qurilma holatini so'raydi (DP_QUERY / DP_QUERY_NEW). "data unvalid" javobida
 * tinytuya kabi "device22" usuliga (CONTROL_NEW + {"dps":{"1":null}}) o'tadi.
 * @param {object} options { host, deviceId, localKey, version, timeoutMs, signal, log }
 * @param {Array<number|string>} dpList  kerakli DP lar (STATUS xabarlarini yig'ish uchun)
 * @returns {Promise<Record<string, unknown>>} qurilma xabar qilgan dps
 */
function queryDps(options, dpList = []) {
  const wanted = dpList.map(String);
  return exchange(options, async (conn) => {
    let queryCmd = isModern(conn.version) ? CMD.DP_QUERY_NEW : CMD.DP_QUERY;
    conn.send(queryCmd, jsonBuffer(queryPayload(conn.version, conn.opts.deviceId)));
    let fallbackSent = false;
    const collected = {};
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const msg = await conn.receiveMessage();
      if (msg.undecodable) {
        if (msg.cmd === queryCmd && msg.retcode !== 0) throw tuyaError(MSG.decrypt, 'decrypt', 'command');
        continue;
      }
      if (msg.invalid && !fallbackSent && (conn.version === '3.3' || conn.version === '3.4')) {
        fallbackSent = true;
        queryCmd = CMD.CONTROL_NEW;
        conn.debug("qurilma DP_QUERY ni qabul qilmadi (data unvalid) — device22 usulida so'raymiz");
        conn.send(CMD.CONTROL_NEW, jsonBuffer(device22Payload(conn.opts.deviceId, wanted.length ? wanted : ['1'])));
        continue;
      }
      if (msg.dps) {
        Object.assign(collected, msg.dps);
        // So'rovga javob — to'liq ro'yxat; STATUS esa faqat o'zgargan DP larni olib kelishi mumkin
        if (msg.cmd !== CMD.STATUS || wanted.every((dp) => collected[dp] !== undefined)) return collected;
        continue;
      }
      if (msg.cmd === queryCmd && (msg.retcode || msg.invalid)) throw rejectedError(msg);
      // Bo'sh tasdiq yoki boshqa xabar — kutishda davom etamiz
    }
  });
}

module.exports = {
  DEFAULT_PORT,
  VERSIONS,
  CMD,
  PREFIX_55AA,
  SUFFIX_55AA,
  PREFIX_6699,
  SUFFIX_6699,
  NO_PROTOCOL_HEADER_CMDS,
  UDP_KEY,
  crc32,
  aesEcbEncrypt,
  aesEcbDecrypt,
  gcmEncrypt,
  gcmDecrypt,
  versionHeader,
  deriveSessionKey,
  pack55AA,
  pack6699,
  splitFrames,
  unpackFrame,
  encodeMessage,
  decodePayload,
  interpretText,
  dpBoolean,
  controlPayload,
  queryPayload,
  device22Payload,
  normalizeOptions,
  setDps,
  queryDps,
};
