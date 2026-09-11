import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * So'rov konteksti — bitta HTTP so'rovni auth -> guard -> servis -> xato
 * filtri bo'ylab kuzatish uchun. Ko'p klub/instansiyada log'larni bir so'rovga
 * bog'lash imkonini beradi (kassir "noto'g'ri hisob" desa, aynan o'sha so'rovni
 * requestId bo'yicha topib bo'ladi). Bog'liqliksiz — faqat node:async_hooks.
 */
export interface RequestStore {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

/** Joriy so'rovning correlation id si (so'rov konteksti tashqarisida null) */
export function currentRequestId(): string | null {
  return requestContext.getStore()?.requestId ?? null;
}
