import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { cacheGet, cachePut, isCacheable } from '../offline/cache';
import { noteServerTime } from '../offline/license';
import { markOffline, markOnline } from '../offline/net-status';

/**
 * Yagona axios instansiyasi:
 *  - Bearer token + X-Lang header; withCredentials — httpOnly refresh cookie oqadi
 *  - Refresh token endi localStorage da SAQLANMAYDI: server httpOnly cookie
 *    o'rnatadi, refresh so'rovi bo'sh tana bilan yuboriladi. Eski (legacy)
 *    localStorage'dagi refreshToken bir marta fallback sifatida ishlatiladi.
 *  - 401 TOKEN_EXPIRED da single-flight refresh (parallel 401 lar bitta
 *    refresh so'rovini kutadi — aylantirilgan refresh token poygasi yo'q)
 *  - SUBSCRIPTION_EXPIRED / CLUB_BLOCKED da blok ekraniga yo'naltirish
 *  - OFLAYN: muvaffaqiyatli GET javoblari tenant bilan kalitlangan keshga
 *    yoziladi; tarmoq uzilganda o'sha kesh qaytariladi (`fromCache: true`)
 *
 * API manzili: standart holatda nisbiy `/api` (bir domendan xizmat qilinadi).
 * Electron desktop qobig'ida ilova `file://` dan ochiladi va nisbiy yo'l
 * ishlamaydi — shuning uchun build vaqtida `VITE_API_BASE_URL` bilan to'liq
 * manzil beriladi.
 */
const RAW_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
/** Oxiridagi '/' olib tashlanadi, so'ng '/api' qo'shiladi */
export const API_BASE_URL = RAW_BASE ? `${RAW_BASE.replace(/\/+$/, '')}/api` : '/api';

/**
 * SO'ROV MUDDATI (timeout) — MAJBURIY.
 *
 * Muddatsiz (axios standarti = 0 = cheksiz) so'rov klub Wi-Fi si "qora tuynuk"
 * holatiga tushganda (TCP ochiladi, javob kelmaydi — captive portal, osilgan
 * nginx upstream) HECH QACHON rad etilmaydi. Oqibati kassada juda og'ir edi:
 *  - boshlanishdagi `authApi.me()` osilsa `setLoading(false)` bajarilmay,
 *    butun ilova aylanuvchi spinner ekranida abadiy qotardi;
 *  - `sessionsApi.end()` osilsa hisob-kitob oynasi `submitting` holatida
 *    qulflanib, kassir pul oynasidan chiqa olmasdi.
 * 20 soniya — sekin 3G da ham yetarli, lekin "abadiy" emas.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/** Excel eksport / rasm yuklab olish kabi og'ir javoblar uchun kengaytirilgan muddat */
export const LONG_TIMEOUT_MS = 120_000;

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: REQUEST_TIMEOUT_MS,
});

const LEGACY_REFRESH_KEY = 'refreshToken';

/**
 * Access token shu tabda o'zgarganda (kirish/refresh/chiqish) xabar beriladi.
 * storage hodisasi FAQAT boshqa tablarda ishlaydi, shuning uchun klub
 * kontekstiga bog'liq sozlamalar (masalan valyuta belgisi) shu signalga
 * obuna bo'ladi va sahifani qayta yuklamasdan yangilanadi.
 */
const TOKEN_EVENT = 'auth:token';

export const onAccessTokenChange = (listener: () => void): (() => void) => {
  window.addEventListener(TOKEN_EVENT, listener);
  return () => window.removeEventListener(TOKEN_EVENT, listener);
};

const emitTokenChange = () => window.dispatchEvent(new Event(TOKEN_EVENT));

export const tokenStore = {
  getAccess: () => localStorage.getItem('accessToken'),
  /**
   * Faqat access token saqlanadi. Ikkinchi argument orqaga moslik uchun
   * qabul qilinadi, lekin ATAYLAB saqlanmaydi — refresh httpOnly cookie da.
   */
  set: (accessToken: string, _refreshToken?: string) => {
    localStorage.setItem('accessToken', accessToken);
    // Yangi token olindi — eski legacy refresh endi keraksiz
    localStorage.removeItem(LEGACY_REFRESH_KEY);
    emitTokenChange();
  },
  clear: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem(LEGACY_REFRESH_KEY);
    emitTokenChange();
  },
};

/** Cookie'gacha bo'lgan davrdan qolgan refresh token (bir martalik fallback) */
const legacyRefresh = {
  get: () => localStorage.getItem(LEGACY_REFRESH_KEY),
  clear: () => localStorage.removeItem(LEGACY_REFRESH_KEY),
};

/** Superadmin "klubni ko'rish" rejimi — tanlangan klub ID si */
export const viewingClub = {
  get: (): { id: number; name: string } | null => {
    const raw = localStorage.getItem('viewingClub');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { id: number; name: string };
    } catch {
      return null;
    }
  },
  set: (id: number, name: string) =>
    localStorage.setItem('viewingClub', JSON.stringify({ id, name })),
  clear: () => localStorage.removeItem('viewingClub'),
};

client.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Lang'] = localStorage.getItem('lang') || 'uz';
  // Superadmin klub ichini ko'rayotganda barcha so'rovlar shu klub kontekstida
  const viewing = viewingClub.get();
  if (viewing) config.headers['X-Club-Id'] = String(viewing.id);
  return config;
});

/** Bir vaqtda faqat bitta refresh so'rovi yuboriladi */
interface RefreshResult {
  token: string | null;
  /** true — refresh sessiya haqiqatan yaroqsiz (401/403); false — vaqtinchalik xato (tarmoq/5xx) */
  fatal: boolean;
}
let refreshPromise: Promise<RefreshResult> | null = null;

/** Interceptorlarsiz toza refresh urinishi — cheksiz siklga tushmaslik uchun */
const attemptRefresh = async (body: object): Promise<RefreshResult> => {
  try {
    // Manzil `client` bilan bir xil bazadan olinadi — desktop qobig'ida
    // (to'liq host) ham, veb-versiyada (nisbiy /api) ham to'g'ri ishlaydi.
    // MUDDAT ham majburiy: bu chaqiruv `client` instansiyasidan EMAS, global
    // `axios` dan ketadi (interceptorlarsiz, cheksiz sikldan qochish uchun),
    // shuning uchun instansiyadagi timeout unga TEGMAYDI. Muddatsiz qolsa
    // ilova boshlanishidagi "jim refresh" osilib, butun ekran abadiy
    // spinnerda qotib qolardi.
    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, body, {
      withCredentials: true,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const data = res.data?.data;
    if (data?.accessToken) {
      tokenStore.set(data.accessToken);
      return { token: data.accessToken as string, fatal: false };
    }
    return { token: null, fatal: true };
  } catch (err) {
    // Faqat 401/403 refresh sessiyaning yaroqsizligini bildiradi.
    // Tarmoq uzilishi / 5xx / 429 da holat SAQLANADI — kassir smena
    // o'rtasida Wi-Fi lipillashi sabab tizimdan chiqarib yuborilmaydi.
    const status = (err as AxiosError).response?.status;
    return { token: null, fatal: status === 401 || status === 403 };
  }
};

const refreshTokens = async (): Promise<RefreshResult> => {
  // Asosiy yo'l: bo'sh tana — httpOnly cookie o'zi oqib boradi
  const result = await attemptRefresh({});
  if (result.token || !result.fatal) return result;

  // Fallback: cookie yo'q (401) va eski localStorage refreshToken bor —
  // bir marta tanada yuboriladi, so'ng o'chiriladi (migratsiya yo'li)
  const legacy = legacyRefresh.get();
  if (!legacy) return result;
  legacyRefresh.clear();
  return attemptRefresh({ refreshToken: legacy });
};

/**
 * Single-flight refresh — AuthContext boot dagi "jim kirish" va 401
 * interceptor bitta so'rovni bo'lishadi.
 */
export const silentRefresh = (): Promise<RefreshResult> => {
  refreshPromise = refreshPromise ?? refreshTokens().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
};

/**
 * Keshdan sun'iy javob — chaqiruvchi uchun oddiy 200 dan farq qilmaydi,
 * faqat tanasida `fromCache: true` bo'ladi.
 */
const cachedResponse = (
  config: AxiosRequestConfig,
  payload: unknown,
  at: number,
): AxiosResponse => ({
  data: { ...(payload as object), fromCache: true, cachedAt: at },
  status: 200,
  statusText: 'OK (offline cache)',
  headers: {},
  config: config as AxiosResponse['config'],
});

client.interceptors.response.use(
  (response) => {
    // Serverdan javob keldi — aloqa bor
    markOnline();
    /**
     * SERVER VAQTINI monoton langarga qo'shamiz (offline/license.ts).
     *
     * Manba ikkita: javob tanasidagi `serverNow` (sessiya endpointlari beradi)
     * va HTTP `Date` sarlavhasi (deyarli har bir javobda bor). Server vaqti
     * eng ishonchli manba: undan keyin kompyuter soatini orqaga surish
     * oflayn obuna muddatini uzaytirmaydi.
     *
     * Ataylab KESHDAN o'qilgan javoblarda ham xavfsiz: `cachedResponse`
     * eski `Date` sarlavhasini bermaydi, `serverNow` esa cache.ts da
     * hozirgi vaqtga qayta hisoblanadi.
     */
    const body = response.data as { data?: { serverNow?: string }; serverNow?: string } | undefined;
    noteServerTime(body?.serverNow ?? body?.data?.serverNow);
    const dateHeader = response.headers?.date as string | undefined;
    if (dateHeader) noteServerTime(Date.parse(dateHeader));
    // Muvaffaqiyatli GET larni oflayn uchun saqlab qo'yamiz (ro'yxat
    // cache.ts dagi CACHEABLE bilan cheklangan; xatolar jimgina yutiladi)
    if (response.config.method?.toLowerCase() === 'get') {
      const url = response.config.url ?? '';
      if (isCacheable(url)) {
        void cachePut(url, response.config.params as object | undefined, response.data);
      }
    }
    return response;
  },
  async (error: AxiosError<{ code?: string; message?: string }>) => {
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;

    if (error.response) {
      // Server javob berdi (hatto 4xx/5xx bo'lsa ham) — aloqa BOR
      markOnline();
    } else {
      // Javob umuman yo'q: tarmoq uzilgan yoki server yetib bo'lmas holatda
      markOffline();
      // Oflayn o'qish: keshda bor bo'lsa oxirgi ma'lum holatni qaytaramiz,
      // shunda kassir bo'sh ekran o'rniga stollarni ko'rib turaveradi
      if (original && original.method?.toLowerCase() === 'get') {
        const url = original.url ?? '';
        if (isCacheable(url)) {
          const hit = await cacheGet(url, original.params as object | undefined);
          if (hit) return cachedResponse(original, hit.payload, hit.at);
        }
      }
    }

    // responseType:'blob' so'rovlarida (Excel eksport, biriktirilgan fayllar)
    // axios xato tanasini JSON qilib ochmaydi — `data` Blob bo'lib qoladi va
    // `code` topilmaydi. Shuning uchun avval tanani normallashtiramiz: JSON
    // bo'lsa o'rniga qo'yiladi (errorMessage ham xabarni ko'radi), binar
    // bo'lsa o'z holida qoladi.
    let code: string | undefined;
    const raw = error.response?.data as unknown;
    if (raw instanceof Blob) {
      try {
        const parsed = JSON.parse(await raw.text()) as { code?: string; message?: string };
        code = parsed.code;
        if (error.response) error.response.data = parsed;
      } catch {
        // binar tana — kod yo'q, xabar zaxira matndan olinadi
      }
    } else {
      code = (raw as { code?: string } | undefined)?.code;
    }

    // Obuna tugagan / klub bloklangan — blok ekraniga
    if (status === 403 && (code === 'SUBSCRIPTION_EXPIRED' || code === 'CLUB_BLOCKED')) {
      if (!window.location.pathname.startsWith('/locked')) {
        window.location.assign('/locked');
      }
      return Promise.reject(error);
    }

    if (status === 401 && code === 'TOKEN_EXPIRED' && original && !original._retry) {
      original._retry = true;
      const result = await silentRefresh();
      if (result.token) {
        original.headers = { ...original.headers, Authorization: `Bearer ${result.token}` };
        return client(original);
      }
      if (result.fatal) {
        tokenStore.clear();
        viewingClub.clear(); // eski ko'rish rejimi keyingi sessiyaga o'tmasin
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign('/login');
        }
      }
      // Vaqtinchalik xato: holat joyida qoladi, so'rov xato bilan qaytadi —
      // keyingi so'rov refresh'ni qaytadan uradi
    }

    // TOKEN_EXPIRED BO'LMAGAN 401: token yaroqsiz/bekor qilingan (parol
    // almashtirilgan, tokenVersion oshgan, xodim faolsizlantirilgan). Refresh
    // bu holatda yordam bermaydi — foydalanuvchi buzilgan "kirgan" UI da qolib
    // ketmasin, toza chiqariladi. /auth/* endpointlari (login xatosi, refresh
    // oqimi) va allaqachon token yo'q holat bundan mustasno.
    const reqUrl = original?.url ?? '';
    const isAuthEndpoint = reqUrl.includes('/auth/');
    if (status === 401 && code !== 'TOKEN_EXPIRED' && !isAuthEndpoint && tokenStore.getAccess()) {
      tokenStore.clear();
      viewingClub.clear();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  },
);

export default client;
