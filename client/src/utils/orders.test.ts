import { describe, expect, it } from 'vitest';
import type { OrderItem } from '../types';
import { groupOrderItems, orderTimeLabel, ordersPageLayout } from './orders';

describe('ordersPageLayout', () => {
  it('picks cards on phones, a compact table on tablets and the full table on desktops', () => {
    // 375px telefon, 768px planshet, 1024px + yon menyu, 1366px noutbuk, 1920px monitor
    expect(ordersPageLayout(351)).toEqual({ list: 'cards', kpisPerRow: 2, kpiSize: 'compact' });
    expect(ordersPageLayout(718)).toEqual({ list: 'compact', kpisPerRow: 4, kpiSize: 'compact' });
    expect(ordersPageLayout(710)).toEqual({ list: 'compact', kpisPerRow: 4, kpiSize: 'compact' });
    expect(ordersPageLayout(1052)).toEqual({ list: 'full', kpisPerRow: 4, kpiSize: 'tight' });
    expect(ordersPageLayout(1606)).toEqual({ list: 'full', kpisPerRow: 4, kpiSize: 'regular' });
  });

  it('switches exactly at the column minimums', () => {
    expect(ordersPageLayout(671).list).toBe('cards');
    expect(ordersPageLayout(672).list).toBe('compact');
    expect(ordersPageLayout(1009).list).toBe('compact');
    expect(ordersPageLayout(1010).list).toBe('full');
  });
});

const item = (id: number, productId: number, quantity: number, price: number, name?: string): OrderItem => ({
  id,
  orderId: 1,
  productId,
  quantity,
  price,
  subtotal: price * quantity,
  product: name ? ({ id: productId, name, price } as OrderItem['product']) : undefined,
});

describe('groupOrderItems', () => {
  it('merges repeated additions of one product into a single receipt line', () => {
    const lines = groupOrderItems([
      item(1, 7, 1, 12000, 'Cola'),
      item(2, 3, 2, 5000, 'Choy'),
      item(3, 7, 2, 12000, 'Cola'),
    ]);
    expect(lines).toEqual([
      { productId: 7, name: 'Cola', quantity: 3, price: 12000, subtotal: 36000 },
      { productId: 3, name: 'Choy', quantity: 2, price: 5000, subtotal: 10000 },
    ]);
  });

  it('drops the unit price when the product was added at different prices', () => {
    const [line] = groupOrderItems([item(1, 7, 1, 12000, 'Cola'), item(2, 7, 1, 13000, 'Cola')]);
    expect(line).toMatchObject({ quantity: 2, price: null, subtotal: 25000 });
  });

  it('keeps lines of deleted products with an empty name', () => {
    expect(groupOrderItems([item(1, 99, 1, 4000)])).toEqual([
      { productId: 99, name: '', quantity: 1, price: 4000, subtotal: 4000 },
    ]);
    expect(groupOrderItems(undefined)).toEqual([]);
  });
});

describe('orderTimeLabel', () => {
  const words = { today: 'Bugun', yesterday: 'Kecha' };
  const now = new Date(2026, 9, 29, 23, 50);
  const at = (...args: [number, number, number, number, number]) => new Date(...args).toISOString();

  it('names today and yesterday', () => {
    expect(orderTimeLabel(at(2026, 9, 29, 21, 7), words, now)).toBe('Bugun, 21:07');
    expect(orderTimeLabel(at(2026, 9, 28, 0, 5), words, now)).toBe('Kecha, 00:05');
  });

  it('shows the date for older orders and the year only when it differs', () => {
    expect(orderTimeLabel(at(2026, 9, 3, 18, 15), words, now)).toBe('03.10, 18:15');
    expect(orderTimeLabel(at(2025, 11, 31, 9, 0), words, now)).toBe('31.12.2025, 09:00');
    expect(orderTimeLabel('not a date', words, now)).toBe('—');
  });
});
