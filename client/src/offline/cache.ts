/**
 * OFFLINE O'QISH KESHI — oxirgi muvaffaqiyatli GET javoblari.
 *
 * Internet uzilganda kassir bo'sh ekran emas, OXIRGI MA'LUM holatni ko'radi
 * (stollar, mahsulotlar, narxlar) va yuqorida "oflayn — ma'lumot HH:MM holatiga"
 * chizig'i turadi.
 *
 * TENANT XAVFSIZLIGI (muhim): kesh kaliti FOYDALANUVCHI + KLUB bilan
 * chegaralangan. Bitta kassa kompyuterida ikki xodim navbatma-navbat ishlasa
 * yoki superadmin klubdan klubga o'tsa, birining ma'lumoti ikkinchisiga
 * KO'RINMAYDI. Chiqishda kesh butunlay o'chiriladi.
 *
 * Shu sababli javoblar Service Worker'da EMAS, aynan shu qatlamda keshlanadi:
 * SW kaliti faqat URL bo'lardi va u tenantni ajrata olmasdi.
 */

import { idbClear, idbGet, idbPut, metaGet, metaSet, STORE_CACHE } from './db';

/** Kesh yozuvi */
interface CacheRow<T = unknown> {
  key: string;
  /** Javob tanasi (ApiResponse shakli — data/message/serverNow bilan birga) */
  payload: T;
  /** Qachon keshlangani (ms) */
  at: number;
  /**
   * Keshlash paytidagi soat siljishi (serverNow - Date.now(), ms).
   *
   * NEGA KERAK: javobdagi `serverNow` ni o'z holicha qaytarish taymerlarni
   * BUZADI — TablesPage undan `offsetMs` hisoblaydi, eskirgan qiymat esa
   * "20 daqiqa oldingi server vaqti" degani bo'lib, barcha jonli summalar
   * 20 daqiqaga kam ko'rinardi. Shuning uchun keshdan o'qishda `serverNow`
   * SHU siljish bilan HOZIRGI vaqtga qayta hisoblanadi — offline'da ham
   * taymer va summa to'g'ri yuradi.
   */
  clockOffsetMs?: number;
}

const LAST_SYNC_KEY = 'lastSyncAt';

/**
 * Joriy kesh doirasi (scope). AuthContext foydalanuvchi aniqlanganda
 * o'rnatadi; null bo'lsa hech narsa keshlanmaydi va o'qilmaydi.
 */
let scope: string | null = null;

export const setCacheScope = (next: string | null): void => {
  scope = next;
};

export const getCacheScope = (): string | null => scope;

/**
 * To'liq doira (foydalanuvchi + klub + ko'rilayotgan klub) — kesh kalitlari
 * ham, yozuv navbati ham SHU qiymat bilan chegaralanadi.
 */
export const fullScope = (): string | null => (scope ? `${scope}${viewingClubId()}` : null);

/**
 * Superadminning "klubni ko'rish" konteksti — kesh kalitiga QO'SHILADI.
 *
 * Superadmin bir klubdan boshqasiga sahifani qayta yuklamasdan o'tadi
 * (AdminClubsPage -> viewingClub.set). Agar kalit faqat foydalanuvchi ID
 * bo'lganida, birinchi klubning keshi ikkinchi klub ekranida chiqib ketardi.
 *
 * Qiymat localStorage dan TO'G'RIDAN-TO'G'RI o'qiladi (api/client.ts bilan
 * aylanma import bo'lmasligi uchun) — kalit nomi o'sha modul bilan bir xil.
 */
const viewingClubId = (): string => {
  try {
    const raw = localStorage.getItem('viewingClub');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { id?: number };
    return typeof parsed?.id === 'number' ? `v${parsed.id}` : '';
  } catch {
    return '';
  }
};

const keyFor = (url: string, params?: object): string | null => {
  if (!scope) return null;
  // Parametrlar tartibidan qat'i nazar bir xil kalit chiqishi uchun saralaymiz
  const normalized = params
    ? JSON.stringify(
        Object.entries(params as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      )
    : '';
  return `${scope}${viewingClubId()}|${url}|${normalized}`;
};

/**
 * Offline'da ko'rsatilishi MA'NOLI bo'lgan endpointlar.
 *
 * Ataylab tor ro'yxat: eskirgan ma'lumot chalg'itmasligi kerak. Bu yerda
 * faqat "hozirgi holat" ekranlari bor — moliyaviy HISOBOTLAR ataylab YO'Q
 * (eskirgan tushum raqami klub egasini noto'g'ri qarorga olib boradi).
 */
const CACHEABLE = ['/tables', '/products', '/categories', '/sessions', '/customers', '/settings'];

/**
 * `/auth/me` ATAYLAB ro'yxatda YO'Q.
 *
 * Uni keshlash oflayn kirishni "osonlashtirgandek" ko'rinardi, lekin aslida
 * xavfsizlik tekshiruvlarini CHETLAB O'TARDI: keshdan kelgan javob AuthContext
 * uchun oddiy muvaffaqiyatli javobdan farq qilmaydi, ya'ni sessiya "onlayn
 * tasdiqlangan" deb qabul qilinardi va `session-snapshot.ts` dagi token muddati
 * hamda obuna muddatini QAYTA HISOBLASH mantiqi umuman ishlamasdi — muddati
 * tugagan klub oflayn holatda ochilib qolardi.
 *
 * Oflayn kirish uchun yagona yo'l — o'sha surat mexanizmi.
 */

export const isCacheable = (url: string): boolean =>
  CACHEABLE.some((prefix) => url === prefix || url.startsWith(`${prefix}?`));

/** Muvaffaqiyatli javobni keshga yozish (xatolar jimgina yutiladi) */
export const cachePut = async (
  url: string,
  params: object | undefined,
  payload: unknown,
): Promise<void> => {
  const key = keyFor(url, params);
  if (!key || !isCacheable(url)) return;

  const serverNow = (payload as { serverNow?: string } | null)?.serverNow;
  const parsed = serverNow ? Date.parse(serverNow) : NaN;
  const clockOffsetMs = Number.isNaN(parsed) ? undefined : parsed - Date.now();

  await idbPut<CacheRow>(STORE_CACHE, { key, payload, at: Date.now(), clockOffsetMs });
  await metaSet(LAST_SYNC_KEY, Date.now());
};

/**
 * Keshdan o'qish — topilmasa null.
 * `serverNow` bo'lsa u SAQLANGAN SILJISH bilan hozirgi vaqtga qayta hisoblanadi
 * (yuqoridagi `clockOffsetMs` izohiga qarang).
 */
export const cacheGet = async <T>(
  url: string,
  params?: object,
): Promise<{ payload: T; at: number } | null> => {
  const key = keyFor(url, params);
  if (!key) return null;
  const row = await idbGet<CacheRow<T>>(STORE_CACHE, key);
  if (!row) return null;

  let payload = row.payload;
  if (row.clockOffsetMs !== undefined && payload && typeof payload === 'object') {
    payload = {
      ...(payload as object),
      serverNow: new Date(Date.now() + row.clockOffsetMs).toISOString(),
    } as T;
  }
  return { payload, at: row.at };
};

/** Oxirgi muvaffaqiyatli sinxronizatsiya vaqti (ms) */
export const lastSyncAt = (): Promise<number | null> => metaGet<number>(LAST_SYNC_KEY);

/**
 * Butun keshni tozalash — chiqishda va foydalanuvchi/klub almashganda
 * MAJBURIY chaqiriladi (tenant izolyatsiyasi).
 */
export const clearCache = async (): Promise<void> => {
  await idbClear(STORE_CACHE);
};
