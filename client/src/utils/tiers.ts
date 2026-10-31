import type { FeatureKey, LimitKey, Plan, TierCode, TierDefinition, TiersConfig } from '../types';

/**
 * TARIF DARAJALARI — klient yordamchilari (server: common/plan-tiers/tiers.ts).
 * Standart → Pro → VIP: yuqori daraja quyisidan kam bo'lmaydi.
 */
export const TIER_ORDER: TierCode[] = ['standard', 'pro', 'vip'];

export const FEATURE_ORDER: FeatureKey[] = [
  'bar',
  'debts',
  'reports',
  'customers',
  'reservations',
  'expenses',
  'shifts',
  'lights',
];

export const LIMIT_ORDER: LimitKey[] = ['tables', 'staff'];

/** Admin ro'yxatlaridagi qisqa yorliq — kod bo'yicha (superadmin bergan nomdan mustaqil) */
const TIER_LABEL: Record<TierCode, { uz: string; ru: string }> = {
  standard: { uz: 'Standart', ru: 'Стандарт' },
  pro: { uz: 'Pro', ru: 'Pro' },
  vip: { uz: 'VIP', ru: 'VIP' },
};

export const tierLabel = (code: TierCode, lang: string): string =>
  TIER_LABEL[code]?.[lang === 'ru' ? 'ru' : 'uz'] ?? code;

export const TIER_TAG_COLOR: Record<TierCode, string> = { standard: 'default', pro: 'orange', vip: 'gold' };

export const tierOptions = (lang: string) => TIER_ORDER.map((value) => ({ value, label: tierLabel(value, lang) }));

/** Sotiladigan muddatlar (oy) */
export const DURATION_MONTHS = [1, 3, 6, 12] as const;

/** Muddat (kun) → oy: 30→1, 90→3, 180→6, 365→12 */
export const monthsOf = (days: number): number => Math.max(1, Math.round(days / 30.42));

export type DurationMonths = (typeof DURATION_MONTHS)[number];

/** Sotuv katagi kunlari (server: PLAN_DURATIONS) */
export const DURATION_DAYS: Record<DurationMonths, number> = { 1: 30, 3: 90, 6: 180, 12: 365 };

/**
 * Tarif qaysi katakka (1/3/6/12 oy) tushadi. Faqat shu muddatlarga yaqinlari
 * (±3 kun) — 45 kunlik maxsus tarif "1 oylik" bo'lib ko'rinib qolmasin.
 */
export const durationSlot = (days: number): number | null =>
  DURATION_MONTHS.find((m) => Math.abs(DURATION_DAYS[m] - days) <= 3) ?? null;

const allFeatures = (on: boolean): Record<FeatureKey, boolean> =>
  Object.fromEntries(FEATURE_ORDER.map((key) => [key, on])) as Record<FeatureKey, boolean>;

/**
 * Server standarti (common/plan-tiers/tiers.ts → DEFAULT_TIERS). Landing API
 * javobi kelguncha shu bilan chiziladi; qidiruv tizimlari uchun statik matn
 * ham shundan (vite-plugin-seo). Superadmin o'zgartirsa — jonli qiymat ustun.
 */
export const DEFAULT_TIERS_CONFIG: TiersConfig = {
  standard: {
    code: 'standard',
    nameUz: 'Standart',
    nameRu: 'Стандарт',
    taglineUz: 'Kichik klub uchun: stollar, bar va kassa',
    taglineRu: 'Для небольшого клуба: столы, бар и касса',
    limits: { tables: 6, staff: 3 },
    features: { ...allFeatures(false), bar: true, debts: true, reports: true },
  },
  pro: {
    code: 'pro',
    nameUz: 'Pro',
    nameRu: 'Pro',
    taglineUz: "O'sayotgan klub uchun: bron, mijozlar, smenalar",
    taglineRu: 'Для растущего клуба: брони, клиенты, смены',
    limits: { tables: 15, staff: 8 },
    features: { ...allFeatures(true), lights: false },
  },
  vip: {
    code: 'vip',
    nameUz: 'VIP',
    nameRu: 'VIP',
    taglineUz: 'Hammasi cheksiz, chiroq avtomatikasi bilan',
    taglineRu: 'Всё без ограничений, с автоматикой света',
    limits: { tables: null, staff: null },
    features: allFeatures(true),
  },
};

/** Server standarti (DEFAULT_TIER_PRICES), so'm — buyurtmachi tasdiqlagan narxlar */
export const DEFAULT_TIER_PRICES: Record<TierCode, Record<DurationMonths, number>> = {
  standard: { 1: 179000, 3: 499000, 6: 949000, 12: 1790000 },
  pro: { 1: 249000, 3: 699000, 6: 1319000, 12: 2490000 },
  vip: { 1: 349000, 3: 979000, 6: 1849000, 12: 3490000 },
};

export const tierName = (tier: Pick<TierDefinition, 'nameUz' | 'nameRu'>, lang: string) =>
  lang === 'ru' ? tier.nameRu : tier.nameUz;

export const tierTagline = (tier: Pick<TierDefinition, 'taglineUz' | 'taglineRu'>, lang: string) =>
  lang === 'ru' ? tier.taglineRu : tier.taglineUz;

/** Faol tariflarni daraja va oy bo'yicha: { standard: { 1: Plan, 3: Plan, … }, … } */
export const groupPlans = (plans: Plan[]): Record<TierCode, Partial<Record<number, Plan>>> => {
  const grouped: Record<TierCode, Partial<Record<number, Plan>>> = { standard: {}, pro: {}, vip: {} };
  for (const plan of plans) {
    if (!plan.isActive || !TIER_ORDER.includes(plan.tier)) continue;
    const months = durationSlot(plan.durationDays);
    if (months === null) continue;
    const current = grouped[plan.tier][months];
    // Bir muddatda ikki tarif bo'lsa — arzoni (superadmin aksiya qo'ygan bo'lishi mumkin)
    if (!current || plan.price < current.price) grouped[plan.tier][months] = plan;
  }
  return grouped;
};

export interface PriceInfo {
  months: number;
  /** Oyiga (yaxlitlangan) */
  perMonth: number;
  /** 1 oylik narx × oylar soni − shu tarif narxi */
  savings: number;
}

/** "Oyiga 166 333 so'm · 38 000 so'm tejash" — 1 oylik tarifga nisbatan */
export const priceInfo = (plan: Pick<Plan, 'price' | 'durationDays'>, monthly?: Pick<Plan, 'price'> | null): PriceInfo => {
  const months = monthsOf(plan.durationDays);
  return {
    months,
    perMonth: Math.round(plan.price / months),
    savings: monthly && months > 1 ? Math.max(0, Math.round(monthly.price * months - plan.price)) : 0,
  };
};

/** Imkoniyat qaysi darajadan boshlab bor (hech birida yo'q bo'lsa null) */
export const minTierFor = (config: TiersConfig, feature: FeatureKey): TierCode | null =>
  TIER_ORDER.find((code) => config[code].features[feature]) ?? null;

const rank = (value: number | null) => (value === null ? Infinity : value);

/**
 * Admin jadvali: bitta katakni almashtirish va QOIDANI saqlash.
 * Quyi darajada yoqilsa — yuqorilarida ham yoqiladi; yuqorida o'chirilsa —
 * quyilarida ham o'chadi. Natija har doim server qabul qiladigan sozlama.
 */
export const toggleFeature = (config: TiersConfig, tier: TierCode, feature: FeatureKey, on: boolean): TiersConfig => {
  const next = structuredClone(config);
  const level = TIER_ORDER.indexOf(tier);
  TIER_ORDER.forEach((code, i) => {
    if (on && i >= level) next[code].features[feature] = true;
    if (!on && i <= level) next[code].features[feature] = false;
  });
  return next;
};

/** Cheklovni o'rnatish: yuqoriroq darajada kam bo'lsa ko'tariladi, quyida ko'p bo'lsa tushiriladi */
export const setLimit = (config: TiersConfig, tier: TierCode, key: LimitKey, value: number | null): TiersConfig => {
  const next = structuredClone(config);
  const level = TIER_ORDER.indexOf(tier);
  next[tier].limits[key] = value;
  TIER_ORDER.forEach((code, i) => {
    if (i > level && rank(next[code].limits[key]) < rank(value)) next[code].limits[key] = value;
    if (i < level && rank(next[code].limits[key]) > rank(value)) next[code].limits[key] = value;
  });
  return next;
};
