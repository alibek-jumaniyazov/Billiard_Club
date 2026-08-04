/**
 * OFLAYN SESSIYA SURATI — internet yo'q paytda "kim kirgan" savoliga javob.
 *
 * MUAMMO: ilova ochilganda `GET /auth/me` chaqiriladi. Tarmoq yo'q bo'lsa u
 * yiqiladi va foydalanuvchi login ekraniga otiladi — parolni ham tekshirib
 * bo'lmaydi. Ya'ni "oflayn ishlaydi" degani amalda ishlamas edi.
 *
 * YECHIM: har muvaffaqiyatli `/auth/me` dan keyin foydalanuvchi va klub
 * ma'lumoti localStorage ga SURAT sifatida yoziladi. Tarmoq uzilgan holatda
 * ilova shu suratdan tiklanadi.
 *
 * XAVFSIZLIK CHEGARALARI (ataylab qat'iy):
 *  1. Surat kaliti tokenning `sub` (foydalanuvchi ID) iga bog'langan — bir
 *     kompyuterda ikkinchi xodim birinchisining kontekstini OLA OLMAYDI.
 *  2. Surat hech qanday YOZUV huquqi bermaydi: har bir so'rovni server
 *     baribir tokendan tekshiradi. Bu faqat interfeysni ko'rsatish uchun.
 *  3. Obuna muddati suratdagi sanadan HOZIRGI vaqtga qarab qayta hisoblanadi
 *     — oflayn bo'lsa ham muddati tugagan klub ochilib qolmaydi.
 *  4. Surat token muddati tugaganidan keyin ham cheklangan MUHLAT ichida
 *     ishlaydi (pastdagi OFFLINE_GRACE_MS ga qarang).
 */

import type { ClubInfo, User } from '../types';

const PREFIX = 'offlineSession:';

interface Snapshot {
  user: User;
  club: ClubInfo | null;
  at: number;
}

interface JwtPayload {
  sub?: number | string;
  exp?: number;
}

/** JWT tanasini o'qish (imzo TEKSHIRILMAYDI — buni har so'rovda server qiladi) */
const decodeJwt = (token: string): JwtPayload | null => {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
};

/**
 * OFLAYN MUHLAT — access token muddati tugaganidan keyin surat yana shuncha
 * vaqt ishlaydi (24 soat).
 *
 * NEGA KERAK: access token ATAYLAB qisqa muddatli (15 daqiqa) — bu sessiyani
 * bekor qilishning yagona himoyasi. Agar surat aynan shu 15 daqiqaga
 * bog'lansa, interneti 20 daqiqa yo'q bo'lgan kassir sahifani yangilashi
 * bilan tizimdan chiqib ketardi va smena o'rtasida ishlay olmasdi.
 *
 * NEGA XAVFSIZ: surat SERVERGA KIRISH huquqi bermaydi. Muddati o'tgan token
 * bilan yuborilgan har qanday so'rovni server rad etadi. Bu muhlat faqat
 * interfeys ochiq qolishiga va amallar navbatga yozilishiga imkon beradi;
 * aloqa tiklanganda httpOnly refresh cookie orqali yangi token olinadi va
 * navbat yuboriladi. Chiqishda (logout) surat butunlay o'chiriladi.
 */
const OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000;

/** Token muddati o'tganmi (o'qib bo'lmasa — o'tgan deb hisoblanadi) */
export const isTokenExpired = (token: string): boolean => {
  const payload = decodeJwt(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 <= Date.now();
};

/** Oflayn surat uchun yaroqlimi — muddat + muhlat */
const isWithinOfflineGrace = (token: string): boolean => {
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 + OFFLINE_GRACE_MS > Date.now();
};

const keyFor = (token: string): string | null => {
  const payload = decodeJwt(token);
  return payload?.sub === undefined ? null : `${PREFIX}${payload.sub}`;
};

/** Muvaffaqiyatli /auth/me dan keyin chaqiriladi */
export const saveSessionSnapshot = (
  token: string | null,
  user: User,
  club: ClubInfo | null,
): void => {
  if (!token) return;
  const key = keyFor(token);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ user, club, at: Date.now() } satisfies Snapshot));
  } catch {
    // Kvota to'lgan — oflayn suratsiz ishlayveramiz
  }
};

/**
 * Oflayn tiklash. Token yo'q, muhlat ham o'tib ketgan yoki surat topilmasa — null.
 * Klubning muddati suratdagi sanadan HOZIRGI vaqtga qarab qayta baholanadi.
 */
export const loadSessionSnapshot = (
  token: string | null,
): { user: User; club: ClubInfo | null } | null => {
  if (!token || !isWithinOfflineGrace(token)) return null;
  const key = keyFor(token);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    if (!snap?.user) return null;

    let club = snap.club;
    if (club) {
      // Muddat oflayn ham HOZIRGI vaqt bo'yicha tekshiriladi
      const endsAt = club.effectiveEndsAt ? Date.parse(club.effectiveEndsAt) : NaN;
      const expired = !Number.isNaN(endsAt) && endsAt <= Date.now();
      club = { ...club, isExpired: club.isExpired || expired };
    }
    return { user: snap.user, club };
  } catch {
    return null;
  }
};

/** Chiqishda — barcha suratlar o'chiriladi */
export const clearSessionSnapshots = (): void => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // e'tiborsiz
  }
};
