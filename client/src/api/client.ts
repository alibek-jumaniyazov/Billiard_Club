import axios, { AxiosError, AxiosRequestConfig } from 'axios';

/**
 * Yagona axios instansiyasi:
 *  - Bearer token + X-Lang header
 *  - 401 TOKEN_EXPIRED da single-flight refresh (parallel 401 lar bitta
 *    refresh so'rovini kutadi — aylantirilgan refresh token poygasi yo'q)
 *  - SUBSCRIPTION_EXPIRED / CLUB_BLOCKED da blok ekraniga yo'naltirish
 */
const client = axios.create({ baseURL: '/api' });

export const tokenStore = {
  getAccess: () => localStorage.getItem('accessToken'),
  getRefresh: () => localStorage.getItem('refreshToken'),
  set: (accessToken: string, refreshToken: string) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  },
  clear: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },
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
  /** true — refresh token haqiqatan yaroqsiz (401/403); false — vaqtinchalik xato (tarmoq/5xx) */
  fatal: boolean;
}
let refreshPromise: Promise<RefreshResult> | null = null;

const refreshTokens = async (): Promise<RefreshResult> => {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return { token: null, fatal: true };
  try {
    // Interceptorlarsiz toza axios — cheksiz siklga tushmaslik uchun
    const res = await axios.post('/api/auth/refresh', { refreshToken });
    const data = res.data?.data;
    if (data?.accessToken && data?.refreshToken) {
      tokenStore.set(data.accessToken, data.refreshToken);
      return { token: data.accessToken as string, fatal: false };
    }
    return { token: null, fatal: true };
  } catch (err) {
    // Faqat 401/403 refresh tokenning yaroqsizligini bildiradi.
    // Tarmoq uzilishi / 5xx / 429 da tokenlar SAQLANADI — kassir smena
    // o'rtasida Wi-Fi lipillashi sabab tizimdan chiqarib yuborilmaydi.
    const status = (err as AxiosError).response?.status;
    return { token: null, fatal: status === 401 || status === 403 };
  }
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
      refreshPromise = refreshPromise ?? refreshTokens().finally(() => {
        refreshPromise = null;
      });
      const result = await refreshPromise;
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
      // Vaqtinchalik xato: tokenlar joyida qoladi, so'rov xato bilan qaytadi —
      // keyingi so'rov refresh'ni qaytadan uradi
    }

    return Promise.reject(error);
  },
);

export default client;
