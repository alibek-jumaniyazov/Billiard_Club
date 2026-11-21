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
 * Shu sababli `/reports/*`, `/dashboard/stats`, `/orders/stats/today` va
 * smenalar tarixi (`/shifts`, `/shifts/:id` — Z-hisobotlar) keshlanmaydi;
 * ular internetsiz "hisobot uchun internet kerak" deb ko'rsatiladi.
 */
const CACHEABLE = [
  '/tables',
  '/products',
  '/categories',
  '/sessions',
  '/customers',
  '/settings',
  // Kassirning internetsiz ham kerak bo'ladigan joriy ekranlari
  '/reservations', // kun bo'yicha bronlar
  '/debts', // qarzlar ro'yxati
  '/shifts/current', // ochiq smena: boshlang'ich va kutilgan naqd pul
  '/orders', // bar buyurtmalari ro'yxati
  '/expenses', // xarajatlar ro'yxati
];

/** Bitta yozuv tafsiloti — faqat sahifalar haqiqatan ochadiganlari */
const CACHEABLE_DETAIL = [
  /^\/customers\/\d+$/, // mijoz profili (Mijozlar sahifasi)
  /^\/debts\/\d+\/payments$/, // qarz to'lovlari tarixi (Qarzlar sahifasi)
];

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

/**
 * Parametrida ANIQ VAQT (ISO sana-vaqt) bo'lgan so'rov keshlanmaydi.
 *
 * Masalan bosh sahifa va stollar ekrani bronlarni "hozirdan keyingi 6 soat"
 * oralig'ida so'raydi: `from/to` har so'rovda millisekundigacha o'zgaradi,
 * ya'ni bunday kalit HECH QACHON takrorlanmaydi. Uni keshlash oflaynda hech
 * narsa bermasdi, aksincha har daqiqada yangi yozuv qo'shib IndexedDB ni
 * to'ldirardi. Kunlik (YYYY-MM-DD) so'rovlar bunga kirmaydi.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const hasInstantParam = (params?: object): boolean =>
  !!params &&
  Object.values(params as Record<string, unknown>).some(
    (value) => typeof value === 'string' && ISO_INSTANT.test(value),
  );

export const isCacheable = (url: string, params?: object): boolean => {
  const path = url.split('?')[0];
  const listed = CACHEABLE.includes(path) || CACHEABLE_DETAIL.some((pattern) => pattern.test(path));
  return listed && !hasInstantParam(params);
};

/* ----------------------------------------------- Ekrandagi ma'lumot yoshi */

/**
 * EKRANDAGI MA'LUMOT QACHONGI — oflayn chizig'idagi "ma'lumot HH:MM holatida".
 *
 * Avval bu vaqt faqat "oxirgi muvaffaqiyatli so'rov" (`lastSyncAt`) dan
 * olinardi. Stollar ekrani uchun bu to'g'ri — u har 15 soniyada yangilanadi.
 * Lekin bronlar yoki qarzlar sahifasi ertalab ochilgan bo'lsa, chiziq
 * "14:05 holatida" deb turar, ekranda esa 09:00 dagi ro'yxat bo'lardi —
 * kassir ma'lumotni yangi deb o'ylardi.
 *
 * Shuning uchun joriy sahifa olgan har bir keshlanadigan javobning vaqti
 * yoziladi: tarmoqdan kelgani — olingan payt, keshdan berilgani — keshga
 * yozilgan payt. Chiziq ulardan ENG ESKISINI ko'rsatadi. Sahifa almashganda
 * ro'yxat tozalanadi (ConnectionBanner).
 */
const screenData = new Map<string, number>();
const screenListeners = new Set<() => void>();

const noteScreenData = (key: string, at: number): void => {
  screenData.set(key, at);
  screenListeners.forEach((fn) => fn());
};

/** Javob keshdan ko'rsatildi — uning asl vaqti yoziladi (api/client.ts) */
export const noteServedFromCache = (url: string, params: object | undefined, at: number): void => {
  const key = keyFor(url, params);
  if (key) noteScreenData(key, at);
};

/** Joriy sahifadagi eng eski ma'lumot vaqti (ms); hech narsa yozilmagan bo'lsa null */
export const screenDataAsOf = (): number | null =>
  screenData.size > 0 ? Math.min(...screenData.values()) : null;

/** Sahifa almashdi — oldingi sahifaning ma'lumoti endi ekranda emas */
export const resetScreenData = (): void => {
  if (screenData.size === 0) return;
  screenData.clear();
  screenListeners.forEach((fn) => fn());
};

export const onScreenDataChange = (fn: () => void): (() => void) => {
  screenListeners.add(fn);
  return () => screenListeners.delete(fn);
};

/** Muvaffaqiyatli javobni keshga yozish (xatolar jimgina yutiladi) */
export const cachePut = async (
  url: string,
  params: object | undefined,
  payload: unknown,
): Promise<void> => {
  const key = keyFor(url, params);
  if (!key || !isCacheable(url, params)) return;
  // Tarmoqdan yangi ma'lumot keldi — ekrandagi shu ro'yxat endi hozirgi holatda
  noteScreenData(key, Date.now());

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
  resetScreenData();
  await idbClear(STORE_CACHE);
};
