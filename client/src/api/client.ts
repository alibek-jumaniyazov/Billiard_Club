import axios, { AxiosError, AxiosRequestConfig } from 'axios';

/**
 * Yagona axios instansiyasi:
 *  - Bearer token + X-Lang header; withCredentials — httpOnly refresh cookie oqadi
 *  - Refresh token endi localStorage da SAQLANMAYDI: server httpOnly cookie
 *    o'rnatadi, refresh so'rovi bo'sh tana bilan yuboriladi. Eski (legacy)
 *    localStorage'dagi refreshToken bir marta fallback sifatida ishlatiladi.
 *  - 401 TOKEN_EXPIRED da single-flight refresh (parallel 401 lar bitta
 *    refresh so'rovini kutadi — aylantirilgan refresh token poygasi yo'q)
 *  - SUBSCRIPTION_EXPIRED / CLUB_BLOCKED da blok ekraniga yo'naltirish
 */
const client = axios.create({ baseURL: '/api', withCredentials: true });

const LEGACY_REFRESH_KEY = 'refreshToken';

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
  },
  clear: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem(LEGACY_REFRESH_KEY);
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
    const res = await axios.post('/api/auth/refresh', body, { withCredentials: true });
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

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ code?: string; message?: string }>) => {
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.code;

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

    return Promise.reject(error);
  },
);

export default client;
