import { describe, expect, it } from 'vitest';
import type { Plan, TiersConfig } from '../types';
import { durationSlot, groupPlans, minTierFor, monthsOf, priceInfo, setLimit, toggleFeature } from './tiers';

const features = (on: boolean) => ({
  bar: on,
  debts: on,
  reports: on,
  customers: on,
  reservations: on,
  expenses: on,
  shifts: on,
  lights: on,
});

const config: TiersConfig = {
  standard: {
    code: 'standard',
    nameUz: 'Standart',
    nameRu: 'Стандарт',
    taglineUz: '',
    taglineRu: '',
    limits: { tables: 6, staff: 3 },
    features: { ...features(false), bar: true },
  },
  pro: {
    code: 'pro',
    nameUz: 'Pro',
    nameRu: 'Pro',
    taglineUz: '',
    taglineRu: '',
    limits: { tables: 15, staff: 8 },
    features: { ...features(true), lights: false },
  },
  vip: {
    code: 'vip',
    nameUz: 'VIP',
    nameRu: 'VIP',
    taglineUz: '',
    taglineRu: '',
    limits: { tables: null, staff: null },
    features: features(true),
  },
};

const plan = (id: number, tier: Plan['tier'], durationDays: number, price: number): Plan => ({
  id,
  code: `${tier}_${id}`,
  tier,
  nameUz: '',
  nameRu: '',
  descriptionUz: null,
  descriptionRu: null,
  durationDays,
  price,
  isActive: true,
  sortOrder: id,
  features: null,
  createdAt: '',
  updatedAt: '',
});

describe('tarif narxlari', () => {
  it("buyurtmachi misoli: oyiga va 1 oylikka nisbatan tejash", () => {
    const monthly = plan(1, 'standard', 30, 179000);
    expect(priceInfo(plan(2, 'standard', 90, 499000), monthly)).toEqual({ months: 3, perMonth: 166333, savings: 38000 });
    expect(priceInfo(plan(3, 'standard', 180, 949000), monthly)).toEqual({ months: 6, perMonth: 158167, savings: 125000 });
    expect(priceInfo(plan(4, 'standard', 365, 1790000), monthly)).toEqual({ months: 12, perMonth: 149167, savings: 358000 });
    expect(priceInfo(monthly, monthly).savings).toBe(0);
  });

  it('muddat kunlardan oyga va daraja bo‘yicha guruhlash', () => {
    expect([30, 90, 180, 365].map(monthsOf)).toEqual([1, 3, 6, 12]);
    expect([30, 31, 45, 92, 183, 366, 400].map(durationSlot)).toEqual([1, 1, null, 3, 6, 12, null]);
    const grouped = groupPlans([
      plan(1, 'standard', 30, 179000),
      plan(2, 'pro', 90, 699000),
      { ...plan(3, 'vip', 30, 349000), isActive: false },
      // 45 kunlik arzon maxsus tarif 1 oylik katakni egallamaydi
      plan(4, 'standard', 45, 99000),
    ]);
    expect(grouped.standard[1]?.price).toBe(179000);
    expect(grouped.pro[3]?.price).toBe(699000);
    expect(grouped.vip[1]).toBeUndefined();
  });
});

describe('admin jadvali qoidani buzmaydi', () => {
  it('quyida yoqilgan imkoniyat yuqorida ham yoqiladi, yuqorida o‘chirilgani quyida ham o‘chadi', () => {
    const on = toggleFeature(config, 'standard', 'reservations', true);
    expect([on.standard, on.pro, on.vip].map((t) => t.features.reservations)).toEqual([true, true, true]);
    const off = toggleFeature(config, 'pro', 'customers', false);
    expect([off.standard, off.pro, off.vip].map((t) => t.features.customers)).toEqual([false, false, true]);
    expect(minTierFor(config, 'lights')).toBe('vip');
    // Asl obyekt o'zgarmaydi
    expect(config.pro.features.customers).toBe(true);
  });

  it('cheklov: yuqori daraja quyisidan kam bo‘lmaydi, null — cheksiz', () => {
    const up = setLimit(config, 'standard', 'tables', 20);
    expect([up.standard, up.pro, up.vip].map((t) => t.limits.tables)).toEqual([20, 20, null]);
    const down = setLimit(config, 'vip', 'staff', 5);
    expect([down.standard, down.pro, down.vip].map((t) => t.limits.staff)).toEqual([3, 5, 5]);
    const unlimited = setLimit(config, 'pro', 'tables', null);
    expect(unlimited.vip.limits.tables).toBeNull();
  });
});
