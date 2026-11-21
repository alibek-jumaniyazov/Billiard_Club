import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '../types';

/**
 * MIJOZLAR KATALOGI — internetsiz qarz faqat shu ro'yxatdagi mijozga yoziladi.
 * Kesh kaliti so'rov parametrlariga bog'liq, shuning uchun sahifalar HAR DOIM
 * bir xil parametrlar bilan so'ralishi shart — aks holda oflaynda kesh topilmaydi.
 */

const state = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../api', () => ({ customersApi: { list: state.list } }));

import { customerLabel, customerMatches, DIRECTORY_MAX_PAGES, loadCustomerDirectory } from './customer-directory';

const customer = (id: number, name: string, phone: string | null = null): Customer => ({
  id, clubId: 1, name, phone, notes: null, createdAt: '', updatedAt: '',
});

const page = (data: Customer[], pages: number, extra: Record<string, unknown> = {}) => ({
  success: true, data, pagination: { total: pages * 100, page: 1, limit: 100, pages }, ...extra,
});

beforeEach(() => state.list.mockReset());

describe('loadCustomerDirectory', () => {
  it('barcha sahifalarni BARQAROR parametrlar bilan oladi va ism bo‘yicha tartiblaydi', async () => {
    state.list
      .mockResolvedValueOnce(page([customer(2, 'Zafar'), customer(1, 'Aziz')], 2))
      .mockResolvedValueOnce(page([customer(3, 'Bobur')], 2));

    const directory = await loadCustomerDirectory();

    expect(state.list.mock.calls.map(([params]) => params)).toEqual([
      { page: 1, limit: 100 },
      { page: 2, limit: 100 },
    ]);
    expect(directory.customers.map((c) => c.name)).toEqual(['Aziz', 'Bobur', 'Zafar']);
    expect(directory).toMatchObject({ fromCache: false, cachedAt: null, complete: true });
  });

  it('oflaynda keshdan: kesh vaqti (eng eskisi) va to‘liq emasligi bildiriladi', async () => {
    state.list
      .mockResolvedValueOnce(page([customer(1, 'Aziz')], 3, { fromCache: true, cachedAt: 2000 }))
      .mockResolvedValueOnce(page([customer(2, 'Bobur')], 3, { fromCache: true, cachedAt: 1000 }))
      // 3-sahifa hech qachon keshlanmagan
      .mockRejectedValueOnce(new Error('Network Error'));

    const directory = await loadCustomerDirectory();
    expect(directory.customers).toHaveLength(2);
    expect(directory).toMatchObject({ fromCache: true, cachedAt: 1000, complete: false });
  });

  it('birinchi sahifa yo‘q (kesh ham) — tanlash uchun ro‘yxat yo‘q, xato qaytadi', async () => {
    state.list.mockRejectedValueOnce(new Error('Network Error'));
    await expect(loadCustomerDirectory()).rejects.toThrow('Network Error');
  });

  it('juda katta ro‘yxat chegaralanadi va "to‘liq emas" deb belgilanadi', async () => {
    state.list.mockResolvedValue(page([customer(1, 'Aziz')], DIRECTORY_MAX_PAGES + 5));
    const directory = await loadCustomerDirectory();
    expect(state.list).toHaveBeenCalledTimes(DIRECTORY_MAX_PAGES);
    expect(directory.complete).toBe(false);
  });
});

describe('customerMatches / customerLabel', () => {
  const aziz = customer(1, 'Aziz Karimov', '+998901234567');

  it('ism (katta-kichik harfsiz) yoki telefon RAQAMLARI bo‘yicha topadi', () => {
    expect(customerMatches(aziz, 'karim')).toBe(true);
    expect(customerMatches(aziz, '90 123')).toBe(true);
    expect(customerMatches(aziz, '+998-90-123-45')).toBe(true);
    expect(customerMatches(aziz, 'Bobur')).toBe(false);
    expect(customerMatches(customer(2, 'Bobur'), '123')).toBe(false);
    expect(customerMatches(aziz, '  ')).toBe(true);
  });

  it('yorliqda telefon bo‘lsa ko‘rsatiladi', () => {
    expect(customerLabel(aziz)).toBe('Aziz Karimov · +998901234567');
    expect(customerLabel(customer(2, 'Bobur'))).toBe('Bobur');
  });
});
