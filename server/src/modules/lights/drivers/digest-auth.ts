import { createHash, randomBytes } from 'crypto';

/**
 * HTTP Digest autentifikatsiyasi (RFC 7616 / RFC 2617) — Shelly Gen2/Gen3/Plus/Pro
 * relelari uchun. Bu qurilmalar parol qo'yilganda Basic auth ni QABUL QILMAYDI:
 * 401 bilan `WWW-Authenticate: Digest ...` chaqirig'ini qaytaradi.
 *
 * Fayl DB/Nest ga bog'liq emas — faqat matn va hash bilan ishlaydi.
 * SHA-256 (Shelly ishlatadigan) va MD5 (eski qurilmalar) qo'llab-quvvatlanadi,
 * `-sess` variantlari bilan birga. `qop=auth-int` QO'LLAB-QUVVATLANMAYDI
 * (tana hashi kerak bo'ladi, relelar uni ishlatmaydi) — bunda `null` qaytadi
 * va chaqiruvchi qayta urinmaydi.
 */

/** Serverdan kelgan `WWW-Authenticate: Digest ...` chaqirig'ining tahlil qilingan ko'rinishi */
export interface DigestChallenge {
  realm: string;
  nonce: string;
  /** 'auth' yoki null (RFC 2069 uslubidagi eski javob) */
  qop: 'auth' | null;
  opaque: string | null;
  /** Serverdan kelgani (yoki 'MD5') — javobda AYNAN shu qiymat qaytariladi */
  algorithm: string;
  /** Hash funksiyasi: 'md5' | 'sha256' */
  hash: 'md5' | 'sha256';
  /** `-sess` variantimi (HA1 nonce/cnonce bilan qo'shimcha hashlanadi) */
  sess: boolean;
}

/** Digest javobini yig'ish uchun kerakli ma'lumotlar */
export interface DigestRequestParams {
  username: string;
  password: string;
  /** So'rov metodi ('GET' | 'POST' ...) — HA2 ichiga kiradi */
  method: string;
  /** So'rov yo'li va query qismi ('/rpc/Switch.Set?id=0&on=true') */
  uri: string;
  /** Nonce hisoblagichi (default 1) — har so'rovda yangi chaqiriq olinadi */
  nc?: number;
}

/** Chaqiriq ichidagi `kalit=qiymat` juftliklari (qiymat qo'shtirnoqli yoki qo'shtirnoqsiz) */
const PARAM_RE = /([a-zA-Z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]*))/g;

/** Ko'p chaqiriqli sarlavhada ("Basic realm=..., Digest realm=...") Digest qismining boshi */
const DIGEST_SCHEME_RE = /(?:^|,)\s*Digest\s+/i;

/**
 * `WWW-Authenticate` sarlavhasidan Digest chaqirig'ini ajratib oladi.
 * Chaqiriq yo'q, buzuq yoki qo'llab-quvvatlanmaydigan bo'lsa — `null`
 * (chaqiruvchi bunda so'rovni qayta yubormaydi).
 */
export function parseDigestChallenge(header: string | null | undefined): DigestChallenge | null {
  if (!header) return null;
  const start = DIGEST_SCHEME_RE.exec(header);
  if (!start) return null;

  const params = new Map<string, string>();
  const body = header.slice(start.index + start[0].length);
  PARAM_RE.lastIndex = 0;
  for (let match = PARAM_RE.exec(body); match !== null; match = PARAM_RE.exec(body)) {
    const key = match[1].toLowerCase();
    // Qo'shtirnoq ichidagi \" va \\ escape lari ochiladi
    const value = match[2] !== undefined ? match[2].replace(/\\(.)/g, '$1') : (match[3] ?? '');
    if (!params.has(key)) params.set(key, value);
  }

  const nonce = params.get('nonce');
  if (!nonce) return null;

  // Algoritm ko'rsatilmasa RFC bo'yicha MD5
  const algorithm = (params.get('algorithm') ?? 'MD5').trim();
  const normalized = algorithm.toUpperCase();
  const sess = normalized.endsWith('-SESS');
  const base = sess ? normalized.slice(0, -5) : normalized;
  let hash: 'md5' | 'sha256';
  if (base === 'MD5') hash = 'md5';
  else if (base === 'SHA-256' || base === 'SHA256') hash = 'sha256';
  else return null; // SHA-512-256 va boshqalar — qo'llab-quvvatlanmaydi

  // qop ro'yxatida 'auth' bo'lishi shart; faqat 'auth-int' bo'lsa — imkonsiz
  const rawQop = params.get('qop');
  let qop: 'auth' | null = null;
  if (rawQop !== undefined && rawQop.trim() !== '') {
    const options = rawQop.split(',').map((item) => item.trim().toLowerCase());
    if (!options.includes('auth')) return null;
    qop = 'auth';
  }

  return {
    realm: params.get('realm') ?? '',
    nonce,
    qop,
    opaque: params.get('opaque') ?? null,
    algorithm,
    hash,
    sess,
  };
}

/**
 * Chaqiriqqa javob beruvchi `Authorization: Digest ...` sarlavhasi qiymatini yig'adi.
 *
 * `qop=auth` bo'lsa: response = H(HA1:nonce:nc:cnonce:qop:HA2),
 * aks holda (eski server): response = H(HA1:nonce:HA2).
 */
export function buildDigestHeader(
  challenge: DigestChallenge,
  params: DigestRequestParams,
): string {
  const digest = (value: string): string =>
    createHash(challenge.hash).update(value, 'utf8').digest('hex');

  const cnonce = randomBytes(8).toString('hex');
  const nc = formatNonceCount(params.nc ?? 1);

  let ha1 = digest(`${params.username}:${challenge.realm}:${params.password}`);
  if (challenge.sess) ha1 = digest(`${ha1}:${challenge.nonce}:${cnonce}`);
  const ha2 = digest(`${params.method.toUpperCase()}:${params.uri}`);

  const response = challenge.qop
    ? digest(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
    : digest(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${escapeQuoted(params.username)}"`,
    `realm="${escapeQuoted(challenge.realm)}"`,
    `nonce="${escapeQuoted(challenge.nonce)}"`,
    `uri="${escapeQuoted(params.uri)}"`,
    // algorithm/qop/nc — RFC bo'yicha qo'shtirnoqsiz token lar
    `algorithm=${challenge.algorithm}`,
  ];
  if (challenge.qop) {
    parts.push(`qop=${challenge.qop}`, `nc=${nc}`, `cnonce="${escapeQuoted(cnonce)}"`);
  }
  parts.push(`response="${response}"`);
  if (challenge.opaque !== null) parts.push(`opaque="${escapeQuoted(challenge.opaque)}"`);

  return `Digest ${parts.join(', ')}`;
}

/** Hisoblagich 8 xonali o'n oltilik ko'rinishda: 1 -> '00000001' */
function formatNonceCount(value: number): string {
  const safe = Number.isInteger(value) && value > 0 ? value : 1;
  return safe.toString(16).padStart(8, '0').slice(-8);
}

/** Qo'shtirnoqli qiymat ichidagi `"` va `\` belgilarini himoyalash (sarlavha buzilmasin) */
function escapeQuoted(value: string): string {
  return value.replace(/([\\"])/g, '\\$1');
}
