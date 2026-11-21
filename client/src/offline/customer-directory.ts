/**
 * MIJOZLAR KATALOGI — internetsiz qarzga yozishda tanlanadigan ro'yxat.
 *
 * Internetsiz qarz FAQAT ro'yxatdagi (serverda mavjud) mijozga yoziladi:
 * erkin yozilgan ism bilan yozilgan qarzni keyin kimdan undirish noma'lum
 * bo'lib qolishi mumkin. Server navbatdan kelgan qarzni mijoz ID si bo'yicha
 * QAYTA tekshiradi (sessions.service.ts: end).
 *
 * Ro'yxat oddiy GET /customers sahifalari orqali olinadi: onlayn paytda javob
 * kassadagi keshga yoziladi (api/client.ts -> offline/cache.ts), internet
 * uzilganda AYNAN shu so'rovlar keshdan qaytadi. Kesh kaliti parametrlarga
 * bog'liq, shuning uchun ular HAR DOIM bir xil: { page, limit: 100 }.
 * Stollar sahifasi onlayn ochilganda va aloqa tiklanganda katalogni oldindan
 * yangilab qo'yadi (TablesPage).
 *
 * Internetsiz qo'shilgan mijoz serverda hali yo'q — u katalogda chiqmaydi va
 * qarz uchun tanlanmaydi; interfeys buning sababini aniq aytadi.
 */

import { customersApi } from '../api';
import type { Customer } from '../types';

/** Server bitta sahifada ko'pi bilan 100 ta qaytaradi (customers.service.ts) */
export const DIRECTORY_PAGE_SIZE = 100;
/** Juda katta ro'yxatda ham kassa xotirasi va tarmoq chegaralangan bo'lsin */
export const DIRECTORY_MAX_PAGES = 10;

export interface CustomerDirectory {
  /** Ism bo'yicha tartiblangan mijozlar */
  customers: Customer[];
  /** Kamida bitta sahifa keshdan olindi (internet yo'q) */
  fromCache: boolean;
  /** Keshlangan vaqt (ms) — eng eski sahifa bo'yicha; onlayn bo'lsa null */
  cachedAt: number | null;
  /** Barcha sahifalar olindimi (katta ro'yxat kesilgan yoki sahifa yetishmasligi mumkin) */
  complete: boolean;
}

/**
 * Katalogni yuklash (onlayn — serverdan va keshga yozib; oflayn — keshdan).
 * Birinchi sahifa olinmasa xato qaytadi: tanlash uchun ro'yxat yo'q.
 */
export const loadCustomerDirectory = async (): Promise<CustomerDirectory> => {
  const first = await customersApi.list({ page: 1, limit: DIRECTORY_PAGE_SIZE });
  const totalPages = Math.max(1, first.pagination?.pages ?? 1);
  const pages = Math.min(totalPages, DIRECTORY_MAX_PAGES);
  const rest = await Promise.allSettled(
    Array.from({ length: pages - 1 }, (_, index) =>
      customersApi.list({ page: index + 2, limit: DIRECTORY_PAGE_SIZE })),
  );
  const responses = [
    first,
    ...rest.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
  ];

  const byId = new Map<number, Customer>();
  for (const response of responses) {
    for (const customer of response.data ?? []) byId.set(customer.id, customer);
  }
  const cachedTimes = responses
    .filter((response) => response.fromCache && typeof response.cachedAt === 'number')
    .map((response) => response.cachedAt as number);

  return {
    customers: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)),
    fromCache: responses.some((response) => response.fromCache === true),
    cachedAt: cachedTimes.length > 0 ? Math.min(...cachedTimes) : null,
    complete: totalPages <= DIRECTORY_MAX_PAGES && rest.every((result) => result.status === 'fulfilled'),
  };
};

/** Tanlash ro'yxatidagi yorliq: "Aziz · +998901234567" */
export const customerLabel = (customer: Pick<Customer, 'name' | 'phone'>): string =>
  customer.phone ? `${customer.name} · ${customer.phone}` : customer.name;

/**
 * Qidiruv mosligi: ism (katta-kichik harfsiz) yoki telefon RAQAMLARI bo'yicha —
 * kassir "90 123" yoki "+998-90-123" deb yozsa ham kanonik telefon topiladi.
 */
export const customerMatches = (customer: Pick<Customer, 'name' | 'phone'>, query: string): boolean => {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return true;
  if (customer.name.toLocaleLowerCase().includes(text)) return true;
  const digits = text.replace(/\D/g, '');
  return digits.length > 0 && (customer.phone ?? '').replace(/\D/g, '').includes(digits);
};
