import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIERS,
  DEFAULT_TIER_PRICES as SERVER_PRICES,
  FEATURE_KEYS,
  LIMIT_KEYS,
  PLAN_DURATIONS,
  TIER_CODES,
} from '../../../server/src/common/plan-tiers/tiers';
import {
  DEFAULT_TIERS_CONFIG,
  DEFAULT_TIER_PRICES,
  DURATION_DAYS,
  DURATION_MONTHS,
  FEATURE_ORDER,
  LIMIT_ORDER,
  TIER_ORDER,
} from './tiers';

/**
 * Landing zaxirasi va SEO matni server standartidan uzoqlashib ketmasin:
 * kimdir serverda narx yoki imkoniyatni o'zgartirsa, shu test eslatadi.
 */
describe('klient va server tarif standartlari bir xil', () => {
  it('darajalar, imkoniyatlar, cheklovlar va muddatlar', () => {
    expect(TIER_ORDER).toEqual([...TIER_CODES]);
    expect([...FEATURE_ORDER].sort()).toEqual([...FEATURE_KEYS].sort());
    expect([...LIMIT_ORDER].sort()).toEqual([...LIMIT_KEYS].sort());
    expect(PLAN_DURATIONS.map((d) => [d.months, d.days])).toEqual(DURATION_MONTHS.map((m) => [m, DURATION_DAYS[m]]));
  });

  it('standart sozlama va narxlar', () => {
    expect(DEFAULT_TIERS_CONFIG).toEqual(DEFAULT_TIERS);
    for (const code of TIER_ORDER) {
      expect(DURATION_MONTHS.map((m) => DEFAULT_TIER_PRICES[code][m])).toEqual([...SERVER_PRICES[code]]);
    }
  });
});
