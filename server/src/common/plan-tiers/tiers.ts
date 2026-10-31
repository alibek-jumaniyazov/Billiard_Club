/**
 * TARIF DARAJALARI: Standart → Pro → VIP.
 *
 * Har daraja = imkoniyatlar (bar, qarzlar, bron…) + cheklovlar (stollar, xodimlar).
 * Superadmin ularni panelda o'zi sozlaydi (platform_settings → `plan_tiers`).
 *
 * QOIDA: yuqori daraja quyisidan KAM bo'lmaydi — VIP Pro'ning hamma narsasini,
 * Pro Standartning hamma narsasini qila oladi. Panel noto'g'ri sozlashga yo'l
 * qo'ymaydi (tierViolations), bazada qo'lda buzilgan yozuv esa o'qishda
 * avtomatik tuzatiladi (normalizeTiers).
 *
 * Narxlar bu yerda EMAS: har daraja × muddat (1/3/6/12 oy) — `plans` jadvalidagi
 * alohida tarif qatori (`plans.tier`), xarid oqimi o'zgarmaydi.
 */

export const TIER_CODES = ['standard', 'pro', 'vip'] as const;
export type TierCode = (typeof TIER_CODES)[number];

/**
 * Darajaga qarab yopiladigan bo'limlar:
 *  - bar    — mahsulotlar (ombor), stolga bar mahsuloti qo'shish va stoldagi
 *             xato buyurtmani bekor qilish;
 *  - orders — «Buyurtmalar» bo'limi: barcha buyurtmalar ro'yxati va bugungi
 *             statistika (bar'siz ma'nosiz — FEATURE_REQUIRES);
 *  - staff  — xodim (kassir, operator, admin) qo'shish. O'chiq bo'lsa klubda
 *             faqat egasi ishlaydi; borlarini boshqarish (bloklash, parol) ochiq.
 */
export const FEATURE_KEYS = [
  'bar',
  'orders',
  'debts',
  'reports',
  'customers',
  'reservations',
  'expenses',
  'shifts',
  'staff',
  'lights',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Bir darajaning o'zida: kalit yoqilgan bo'lsa, qiymatdagisi ham yoqilgan bo'lishi shart */
export const FEATURE_REQUIRES: Partial<Record<FeatureKey, FeatureKey>> = { orders: 'bar' };

/**
 * Soni cheklanadigan narsalar (null — cheksiz):
 *  - tables — faol stollar;
 *  - staff — faol foydalanuvchi hisoblari EGASI BILAN birga (admin, kassir,
 *    operator). Faqat kassirlarni sanash mumkin emas: unda cheklovni qo'shimcha
 *    "admin" hisobi ochib aylanib o'tish mumkin bo'lardi. Son faqat `staff`
 *    imkoniyati yoqilgan darajada amal qiladi, aks holda — faqat egasi.
 */
export const LIMIT_KEYS = ['tables', 'staff'] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** Cheklov chegarasi — panelda kiritiladigan eng katta son */
export const LIMIT_MAX = 1000;

export interface TierDefinition {
  code: TierCode;
  nameUz: string;
  nameRu: string;
  taglineUz: string;
  taglineRu: string;
  limits: Record<LimitKey, number | null>;
  features: Record<FeatureKey, boolean>;
}

export type TiersConfig = Record<TierCode, TierDefinition>;

/** Klubning amaldagi huquqlari (klientga ham shu ko'rinishda boradi) */
export interface Entitlements {
  tier: TierCode;
  limits: Record<LimitKey, number | null>;
  features: Record<FeatureKey, boolean>;
}

const allFeatures = (value: boolean) =>
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, value])) as Record<FeatureKey, boolean>;

/** Boshlang'ich sozlama — superadmin panelda o'zgartiradi */
export const DEFAULT_TIERS: TiersConfig = {
  standard: {
    code: 'standard',
    nameUz: 'Standart',
    nameRu: 'Стандарт',
    taglineUz: 'Kichik klub uchun: stollar, bar va kassa',
    taglineRu: 'Для небольшого клуба: столы, бар и касса',
    // staff soni — xodim qo'shish yoqilsa ishlaydigan tayyor qiymat (hozir faqat egasi)
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
    features: { ...allFeatures(true), staff: false, lights: false },
  },
  vip: {
    code: 'vip',
    nameUz: 'VIP',
    nameRu: 'VIP',
    taglineUz: 'Hammasi cheksiz: xodimlar va chiroq avtomatikasi',
    taglineRu: 'Всё без ограничений: сотрудники и автоматика света',
    limits: { tables: null, staff: null },
    features: allFeatures(true),
  },
};

/** Sotiladigan muddatlar: har daraja uchun to'rtta tarif qatori */
export const PLAN_DURATIONS = [
  { months: 1, days: 30, uz: '1 oy', ru: '1 месяц' },
  { months: 3, days: 90, uz: '3 oy', ru: '3 месяца' },
  { months: 6, days: 180, uz: '6 oy', ru: '6 месяцев' },
  { months: 12, days: 365, uz: '1 yil', ru: '1 год' },
] as const;

/**
 * Boshlang'ich narxlar (so'm) — PLAN_DURATIONS tartibida, buyurtmachi tasdiqlagan.
 * Keyin superadmin panelida o'zgartiriladi.
 * TierPlans migratsiyasida shu qiymatlar ataylab NUSXALANGAN.
 */
export const DEFAULT_TIER_PRICES: Record<TierCode, readonly number[]> = {
  standard: [179000, 499000, 949000, 1790000],
  pro: [249000, 699000, 1319000, 2490000],
  vip: [349000, 979000, 1849000, 3490000],
};

export const isTierCode = (value: unknown): value is TierCode =>
  typeof value === 'string' && (TIER_CODES as readonly string[]).includes(value);

export const tierLevel = (tier: TierCode): number => TIER_CODES.indexOf(tier);

/** null (cheksiz) — eng katta */
const limitRank = (value: number | null) => (value === null ? Infinity : value);

/**
 * Qoidaga zid joylar: yuqori darajada quyisida bor imkoniyat yo'q yoki
 * cheklov quyisidan kichik. Bo'sh ro'yxat — sozlama to'g'ri.
 */
export const tierViolations = (config: TiersConfig): string[] => {
  const problems: string[] = [];
  for (const code of TIER_CODES) {
    for (const [key, needs] of Object.entries(FEATURE_REQUIRES) as [FeatureKey, FeatureKey][]) {
      if (config[code].features[key] && !config[code].features[needs]) problems.push(`${code}.features.${key}`);
    }
  }
  for (let i = 1; i < TIER_CODES.length; i += 1) {
    const lower = config[TIER_CODES[i - 1]];
    const higher = config[TIER_CODES[i]];
    for (const key of FEATURE_KEYS) {
      if (lower.features[key] && !higher.features[key]) problems.push(`${higher.code}.features.${key}`);
    }
    for (const key of LIMIT_KEYS) {
      if (limitRank(higher.limits[key]) < limitRank(lower.limits[key])) problems.push(`${higher.code}.limits.${key}`);
    }
  }
  return problems;
};

const text = (value: unknown, fallback: string, max = 120) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;

const limit = (value: unknown, fallback: number | null): number | null => {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= LIMIT_MAX) return value;
  return fallback;
};

/** Bitta darajani shaklga keltirish: yetishmagan yoki yaroqsiz maydon — standart qiymat */
export const shapeTier = (code: TierCode, raw: unknown): TierDefinition => {
  const base = DEFAULT_TIERS[code];
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const limits = (item.limits && typeof item.limits === 'object' ? item.limits : {}) as Record<string, unknown>;
  const features = (item.features && typeof item.features === 'object' ? item.features : {}) as Record<string, unknown>;
  return {
    code,
    nameUz: text(item.nameUz, base.nameUz, 40),
    nameRu: text(item.nameRu, base.nameRu, 40),
    taglineUz: text(item.taglineUz, base.taglineUz),
    taglineRu: text(item.taglineRu, base.taglineRu),
    limits: Object.fromEntries(
      LIMIT_KEYS.map((k) => [k, k in limits ? limit(limits[k], base.limits[k]) : base.limits[k]]),
    ) as Record<LimitKey, number | null>,
    features: Object.fromEntries(
      FEATURE_KEYS.map((k) => [k, typeof features[k] === 'boolean' ? (features[k] as boolean) : base.features[k]]),
    ) as Record<FeatureKey, boolean>,
  };
};

/** Har darajani shaklga keltiradi, lekin qoidaga KELTIRMAYDI (panel kiritmasini tekshirish uchun) */
export const shapeTiers = (raw: unknown): TiersConfig => {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(TIER_CODES.map((code) => [code, shapeTier(code, source[code])])) as TiersConfig;
};

/**
 * Ishonchsiz qiymatni (bazadan, eski versiyadan) to'liq sozlamaga aylantiradi:
 * yetishmagan maydon — standart qiymat, so'ng qoidaga keltiriladi (quyida bor
 * imkoniyat yuqoriga ham beriladi, cheklov yuqorida kamaymaydi).
 */
export const normalizeTiers = (raw: unknown): TiersConfig => {
  const result = shapeTiers(raw);
  // Bog'liqlik: «Buyurtmalar» yoqilgan darajada bar ham yoqiladi
  for (const code of TIER_CODES) {
    for (const [key, needs] of Object.entries(FEATURE_REQUIRES) as [FeatureKey, FeatureKey][]) {
      if (result[code].features[key]) result[code].features[needs] = true;
    }
  }
  // Qoidaga keltirish: pastdan yuqoriga
  for (let i = 1; i < TIER_CODES.length; i += 1) {
    const lower = result[TIER_CODES[i - 1]];
    const higher = result[TIER_CODES[i]];
    for (const key of FEATURE_KEYS) if (lower.features[key]) higher.features[key] = true;
    for (const key of LIMIT_KEYS) {
      if (limitRank(higher.limits[key]) < limitRank(lower.limits[key])) higher.limits[key] = lower.limits[key];
    }
  }
  return result;
};

/** Xodim qo'shish o'chiq darajada amaldagi hisoblar chegarasi — faqat egasi */
export const OWNER_ONLY = 1;

export const entitlementsFor = (config: TiersConfig, tier: TierCode): Entitlements => ({
  tier,
  limits: {
    ...config[tier].limits,
    // Sozlamadagi son xodim qo'shish yoqilgandagina amal qiladi
    staff: config[tier].features.staff ? config[tier].limits.staff : OWNER_ONLY,
  },
  features: { ...config[tier].features },
});

/** Imkoniyat qaysi darajadan boshlab bor (hech birida yo'q bo'lsa null) */
export const minTierFor = (config: TiersConfig, feature: FeatureKey): TierCode | null =>
  TIER_CODES.find((code) => config[code].features[feature]) ?? null;

/** Ko'proq joy beradigan eng quyi daraja (masalan 20 ta stol uchun) */
export const minTierForLimit = (config: TiersConfig, key: LimitKey, needed: number): TierCode | null =>
  TIER_CODES.find((code) => limitRank(config[code].limits[key]) >= needed) ?? null;
