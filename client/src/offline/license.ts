/** Signed, user-bound offline leases. Unverifiable state never grants offline access. */
import { metaGet, metaSet } from './db';

const KEY_LICENSE = 'license';
const KEY_PUBKEY = 'licensePublicKey';
const KEY_MAX_TIME = 'maxSeenTime';
const KEY_CLOCK_INVALID = 'clockNeedsSync';
const KEY_CLOCK_OFFSET = 'serverClockOffset';
const CLOCK_TOLERANCE_MS = 60_000;
export const MAX_OFFLINE_MS = 24 * 60 * 60 * 1000;

export interface SignedLicense { payload: string; signature: string; alg: 'ES256' }
export interface LicensePayload {
  version: 2;
  userId: number;
  role: 'admin' | 'kassir' | 'operator';
  clubId: number;
  status: 'trial' | 'active' | 'expired' | 'blocked';
  endsAt: string | null;
  issuedAt: string;
  expiresAt: string;
}
export type LicenseVerdict =
  | { locked: false; reason: 'ok' }
  | { locked: true; reason: 'expired' | 'blocked' | 'unverified' | 'leaseExpired' | 'clock'; endsAt: string | null };

const validPayload = (value: unknown): value is LicensePayload => {
  if (!value || typeof value !== 'object') return false;
  const p = value as LicensePayload;
  return p.version === 2 && Number.isSafeInteger(p.clubId) && p.clubId > 0 &&
    Number.isSafeInteger(p.userId) && p.userId > 0 &&
    ['admin', 'kassir', 'operator'].includes(p.role) &&
    ['trial', 'active', 'expired', 'blocked'].includes(p.status) &&
    (p.endsAt === null || (typeof p.endsAt === 'string' && Number.isFinite(Date.parse(p.endsAt)))) &&
    typeof p.issuedAt === 'string' && Number.isFinite(Date.parse(p.issuedAt)) &&
    typeof p.expiresAt === 'string' && Number.isFinite(Date.parse(p.expiresAt)) &&
    Date.parse(p.expiresAt) <= Date.parse(p.issuedAt) + MAX_OFFLINE_MS;
};

let maxSeenMs = 0;
let anchorMs = Date.now();
let anchorPerf = performance.now();
let lastWall = Date.now();
let lastPerf = performance.now();
let clockInvalid = false;
let clockInit: Promise<void> | null = null;
let serverRevision = 0;
let serverOffsetMs = 0;

export const effectiveNow = (): number => {
  const wall = Date.now();
  const perf = performance.now();
  // Detect rollback during a session too; a frozen clock cannot pause the lease.
  if (wall < lastWall - CLOCK_TOLERANCE_MS ||
      wall - lastWall < perf - lastPerf - CLOCK_TOLERANCE_MS) {
    clockInvalid = true;
    void metaSet(KEY_CLOCK_INVALID, true);
  }
  lastWall = wall;
  lastPerf = perf;
  maxSeenMs = Math.max(maxSeenMs, wall + serverOffsetMs, anchorMs + (perf - anchorPerf));
  return maxSeenMs;
};

const persistClock = (): void => { void metaSet(KEY_MAX_TIME, effectiveNow()); };

export const initClock = (): Promise<void> => {
  clockInit ??= (async () => {
    const revision = serverRevision;
    const saved = await metaGet<number>(KEY_MAX_TIME);
    const invalid = await metaGet<boolean>(KEY_CLOCK_INVALID);
    const offset = await metaGet<number>(KEY_CLOCK_OFFSET);
    // An HTTP response may already have established authoritative time.
    if (revision === serverRevision) {
      serverOffsetMs = Number.isFinite(offset) ? offset! : 0;
      clockInvalid = invalid === true || (saved != null && (!Number.isFinite(saved) || Date.now() + serverOffsetMs < saved - CLOCK_TOLERANCE_MS));
      maxSeenMs = Math.max(maxSeenMs, Number.isFinite(saved) ? saved! : 0);
      anchorMs = Math.max(Date.now() + serverOffsetMs, maxSeenMs);
      anchorPerf = performance.now();
    }
    if (typeof window !== 'undefined') {
      setInterval(persistClock, 10_000);
      window.addEventListener('pagehide', persistClock);
      document.addEventListener('visibilitychange', persistClock);
    }
  })();
  return clockInit;
};

/** Only a real HTTP response may reset an untrusted device clock. */
export const noteServerTime = (iso: string | number | undefined | null): void => {
  if (iso == null) return;
  const ms = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(ms) || ms <= 0) return;
  serverRevision += 1;
  // Preserve elapsed monotonic time when another same/older Date header arrives.
  const current = anchorMs + (performance.now() - anchorPerf);
  anchorMs = clockInvalid || serverRevision === 1 ? ms : Math.max(ms, Math.min(current, ms + CLOCK_TOLERANCE_MS));
  anchorPerf = performance.now();
  maxSeenMs = anchorMs;
  serverOffsetMs = anchorMs - Date.now();
  lastWall = Date.now();
  lastPerf = performance.now();
  clockInvalid = false;
  void metaSet(KEY_MAX_TIME, maxSeenMs);
  void metaSet(KEY_CLOCK_INVALID, false);
  void metaSet(KEY_CLOCK_OFFSET, serverOffsetMs);
};

export const isSubscriptionOver = (endsAt: string | null | undefined): boolean => {
  if (!endsAt) return false;
  const ms = Date.parse(endsAt);
  return !Number.isFinite(ms) || effectiveNow() >= ms;
};

let cachedKey: CryptoKey | null = null;

/**
 * base64 / base64url -> baytlar.
 *
 * Qaytish turi ATAYLAB `Uint8Array<ArrayBuffer>`: WebCrypto imzosi
 * `BufferSource` kutadi va TypeScript ning standart `Uint8Array<ArrayBufferLike>`
 * turi unga to'g'ri kelmaydi (`SharedArrayBuffer` ehtimoli sababli).
 * Shuning uchun bufer ochiq `ArrayBuffer` sifatida yaratiladi.
 */
const bytesFromB64 = (value: string): Uint8Array<ArrayBuffer> => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const importKey = async (spkiB64: string): Promise<CryptoKey | null> => {
  try {
    return await crypto.subtle.importKey(
      'spki',
      bytesFromB64(spkiB64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    return null;
  }
};

/** Ochiq kalitni saqlash (serverdan olingach) */
export const storePublicKey = async (spkiB64: string): Promise<void> => {
  const current = await metaGet<string>(KEY_PUBKEY);
  if (current === spkiB64) return;
  await metaSet(KEY_PUBKEY, spkiB64);
  cachedKey = null;
};

/**
 * Yangi ruxsatnomani saqlash (har bir auth javobida keladi).
 *
 * `null` kelsa saqlangani O'CHIRILADI. Bu muhim: server "bu sessiya uchun
 * ruxsatnoma yo'q" deyayotgan bo'ladi (masalan superadmin kirdi). Eski
 * qiymatni qoldirish bir kompyuterda navbatma-navbat ishlaydigan hisoblarda
 * BOSHQA klubning imzolangan ruxsatnomasini diskda saqlab qo'yardi.
 * `offlineVerdict` klub ID sini solishtirgani uchun u noto'g'ri ochib
 * yubormasdi, lekin begona tenantning ma'lumotini saqlab turishning o'zi
 * keraksiz — ayniqsa u imzolangan va "haqiqiy" ko'rinadi.
 */
export const storeLicense = async (license: SignedLicense | null): Promise<void> => {
  await metaSet(KEY_LICENSE, license ?? null);
};

/** Chiqishda tozalanadi — boshqa hisob birovning ruxsatnomasini ishlatmasin */
export const clearLicense = async (): Promise<void> => {
  await metaSet(KEY_LICENSE, null);
};

/**
 * Saqlangan ruxsatnomani tekshirib, tarkibini qaytaradi.
 * Imzo mos kelmasa yoki kalit yo'q bo'lsa — null (ishonchsiz ma'lumot
 * hech qachon "haqiqiy" deb qabul qilinmaydi).
 */
export const readLicense = async (): Promise<LicensePayload | null> => {
  const license = await metaGet<SignedLicense | null>(KEY_LICENSE);
  if (license?.alg !== 'ES256' || typeof license.payload !== 'string' || typeof license.signature !== 'string' || license.payload.length > 4096) return null;

  if (!cachedKey) {
    const spki = await metaGet<string>(KEY_PUBKEY);
    if (!spki) return null;
    cachedKey = await importKey(spki);
    if (!cachedKey) return null;
  }

  try {
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cachedKey,
      bytesFromB64(license.signature),
      new TextEncoder().encode(license.payload),
    );
    if (!ok) return null;
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytesFromB64(license.payload)));
    return validPayload(payload) ? payload : null;
  } catch {
    return null;
  }
};

/** The subscription deadline and the shorter refresh deadline are both mandatory. */
export const offlineVerdict = async (clubId: number | null, userId?: number): Promise<LicenseVerdict> => {
  const p = await readLicense();
  if (!p || clubId === null || p.clubId !== clubId || (userId !== undefined && p.userId !== userId)) {
    return { locked: true, reason: 'unverified', endsAt: null };
  }
  const now = effectiveNow();
  if (p.status === 'blocked') return { locked: true, reason: 'blocked', endsAt: p.endsAt };
  if (p.status === 'expired' || (p.endsAt && now >= Date.parse(p.endsAt))) {
    return { locked: true, reason: 'expired', endsAt: p.endsAt };
  }
  if (clockInvalid || now < Date.parse(p.issuedAt) - CLOCK_TOLERANCE_MS) {
    return { locked: true, reason: 'clock', endsAt: p.endsAt };
  }
  if (now >= Date.parse(p.expiresAt)) return { locked: true, reason: 'leaseExpired', endsAt: p.endsAt };
  return { locked: false, reason: 'ok' };
};

/** Called at the storage boundary, including after a network request times out. */
export const requireOfflineLease = async (scope: string): Promise<void> => {
  const match = /^u([1-9][0-9]*)\|c([1-9][0-9]*)$/.exec(scope);
  if (!match || (await offlineVerdict(Number(match[2]), Number(match[1]))).locked) {
    throw new Error('OFFLINE_LICENSE_REQUIRED');
  }
};
