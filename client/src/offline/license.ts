/**
 * OFLAYN OBUNA NAZORATI — imzolangan ruxsatnoma + monoton soat.
 *
 * MUAMMO. Obuna serverda tekshiriladi. Internet uzilganda server umuman
 * so'ralmaydi va klient keshdagi `club.isExpired` ni ko'radi — u esa
 * KESHLASH PAYTIDAGI qiymat. Muddati bugun tugaydigan klub internetni uzib
 * qo'yib cheksiz ishlashda davom eta olardi.
 *
 * YECHIM — uch qatlam:
 *
 *  1. IMZO. Server ECDSA P-256 (ES256) bilan imzolangan ruxsatnoma beradi.
 *     Klientda faqat OCHIQ kalit bor: u tekshira oladi, lekin o'ziga yangi
 *     muddat yozib OLA OLMAYDI. IndexedDB dagi qiymatni DevTools bilan
 *     o'zgartirish endi ish bermaydi — imzo mos kelmaydi va ruxsatnoma
 *     butunlay rad etiladi.
 *
 *  2. MONOTON SOAT. Kompyuter soatini orqaga surish ham yordam bermaydi:
 *     "hozir" qiymati `performance.now()` (soat o'zgarishidan mustaqil,
 *     faqat oldinga yuradi) bilan surib boriladi va eng katta ko'rilgan
 *     vaqt diskda saqlanadi. Soatni orqaga surish vaqtni TO'XTATMAYDI.
 *
 *  3. SERVER — YAKUNIY HAKAM. Oflaynda yozilgan amallar aloqa tiklanganda
 *     yuboriladi va muddati tugagan klub uchun server ularni RAD ETADI.
 *     Ya'ni birinchi ikki qatlamni chetlab o'tgan taqdirda ham "oflaynda
 *     ishlab olingan" pul haqiqiy yozuvga aylanmaydi.
 *
 * REJIM QAT'IY: muddat tugadi = darhol blok, hech qanday qo'shimcha muhlat yo'q.
 */

import { metaGet, metaSet } from './db';

const KEY_LICENSE = 'license';
const KEY_PUBKEY = 'licensePublicKey';
const KEY_MAX_TIME = 'maxSeenTime';

/** Monoton vaqt diskka shu oraliqda yoziladi */
const PERSIST_INTERVAL_MS = 30_000;

export interface SignedLicense {
  payload: string;
  signature: string;
  alg: 'ES256';
}

export interface LicensePayload {
  clubId: number;
  status: 'trial' | 'active' | 'expired' | 'blocked';
  endsAt: string | null;
  issuedAt: string;
  expiresAt: string;
}

export type LicenseVerdict =
  | { locked: false; reason: 'ok' }
  /** Ruxsatnoma yo'q yoki tekshirib bo'lmadi — bloklamaymiz, sababi pastda */
  | { locked: false; reason: 'unknown' }
  | { locked: true; reason: 'expired' | 'blocked'; endsAt: string | null };

/* ------------------------------------------------------- Monoton vaqt */

/**
 * Eng katta ko'rilgan vaqt (ms). Diskdan o'qiladi va faqat OSHADI.
 *
 * Nega kerak: `Date.now()` foydalanuvchi nazoratida. Uni orqaga surish
 * muddati tugagan obunani "hali tugamagan" qilib ko'rsatardi.
 */
let maxSeenMs = 0;

/** Shu sessiya boshlangandagi langar — `performance.now()` soatdan mustaqil */
let anchorPerf = 0;
let anchorMs = 0;
let persistTimer: ReturnType<typeof setInterval> | null = null;

/**
 * "Hozir" — uchta manbaning ENG KATTASI:
 *   - tizim soati (odatdagi holat)
 *   - sessiya langari + monoton o'tgan vaqt (soat o'zgarsa ham to'g'ri yuradi)
 *   - diskdagi eng katta ko'rilgan vaqt (brauzer yopilib ochilsa ham saqlanadi)
 */
export const effectiveNow = (): number => {
  const bySession = anchorMs + (performance.now() - anchorPerf);
  return Math.max(Date.now(), bySession, maxSeenMs);
};

const persistMaxSeen = (): void => {
  const now = effectiveNow();
  if (now <= maxSeenMs) return;
  maxSeenMs = now;
  void metaSet(KEY_MAX_TIME, maxSeenMs);
};

/**
 * Vaqt langarini ishga tushirish. Ilova yuklanganda bir marta chaqiriladi.
 *
 * Diskdagi qiymat kelajakda bo'lsa ham hurmat qilinadi — bu ATAYLAB:
 * u faqat SERVER vaqtidan yoki o'tgan monoton vaqtdan kelib chiqqan bo'lishi
 * mumkin, ya'ni undan orqaga qaytish har doim manipulyatsiya belgisi.
 */
export const initClock = async (): Promise<void> => {
  maxSeenMs = (await metaGet<number>(KEY_MAX_TIME)) ?? 0;
  anchorMs = Math.max(Date.now(), maxSeenMs);
  anchorPerf = performance.now();

  if (persistTimer) clearInterval(persistTimer);
  persistTimer = setInterval(persistMaxSeen, PERSIST_INTERVAL_MS);

  // Sahifa yopilishidan oldin oxirgi holatni saqlab qolamiz: aks holda
  // brauzer yopilganda oxirgi 30 soniya "yo'qolib", qayta ochilganda
  // vaqt biroz orqaga sakrardi.
  window.addEventListener('pagehide', persistMaxSeen);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistMaxSeen();
  });
};

/** Serverdan kelgan vaqtni langarga qo'shish (u eng ishonchli manba) */
export const noteServerTime = (iso: string | number | undefined | null): void => {
  if (iso === undefined || iso === null) return;
  const ms = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(ms) || ms <= maxSeenMs) return;
  maxSeenMs = ms;
  anchorMs = Math.max(anchorMs, ms);
  anchorPerf = performance.now();
  void metaSet(KEY_MAX_TIME, maxSeenMs);
};

/**
 * Obuna muddati o'tganmi — SINXRON tekshiruv (marshrut himoyasi uchun).
 *
 * `effectiveNow()` ishlatiladi, ya'ni kompyuter soatini orqaga surish yordam
 * bermaydi. Bu tekshiruv imzolangan ruxsatnomadan MUSTAQIL: ruxsatnoma hali
 * hisoblanmagan (asinxron) bir necha millisekundlik oynada ham muddati
 * tugagan klub ilovaga kira olmasligi kerak.
 */
export const isSubscriptionOver = (endsAt: string | null | undefined): boolean => {
  if (!endsAt) return false;
  const ms = Date.parse(endsAt);
  if (!Number.isFinite(ms)) return false;
  return effectiveNow() >= ms;
};

/* --------------------------------------------------------- Ruxsatnoma */

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
  if (!license?.payload || !license.signature) return null;

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
    return JSON.parse(new TextDecoder().decode(bytesFromB64(license.payload))) as LicensePayload;
  } catch {
    return null;
  }
};

/**
 * Klub oflaynda ishlashga haqlimi.
 *
 * `unknown` — ruxsatnoma yo'q yoki tekshirib bo'lmadi. Bunda BLOKLANMAYDI:
 * yangi qurilmada ilova birinchi marta ochilganda yoki ochiq kalit hali
 * olinmaganda kassa noo'rin to'xtab qolmasligi kerak. Bu holatda ham xavf
 * yo'q — server yakuniy hakam bo'lib qolaveradi (navbatdagi amallar
 * muddati tugagan klub uchun rad etiladi).
 *
 * @param clubId joriy foydalanuvchining klubi — begona ruxsatnoma o'tmasin
 */
export const offlineVerdict = async (clubId: number | null): Promise<LicenseVerdict> => {
  const payload = await readLicense();
  if (!payload) return { locked: false, reason: 'unknown' };

  // Boshqa klubning ruxsatnomasi (bir kompyuterda ikki hisob ishlatilgan)
  if (clubId !== null && payload.clubId !== clubId) return { locked: false, reason: 'unknown' };

  if (payload.status === 'blocked') {
    return { locked: true, reason: 'blocked', endsAt: payload.endsAt };
  }

  if (!payload.endsAt) return { locked: false, reason: 'ok' };

  const endsMs = Date.parse(payload.endsAt);
  if (!Number.isFinite(endsMs)) return { locked: false, reason: 'unknown' };

  // QAT'IY: muddat o'tdi = blok. Qo'shimcha muhlat yo'q.
  if (effectiveNow() >= endsMs) {
    return { locked: true, reason: 'expired', endsAt: payload.endsAt };
  }
  return { locked: false, reason: 'ok' };
};
