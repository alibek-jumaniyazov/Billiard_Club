/**
 * SEO: sayt haqidagi YAGONA ma'lumot manbai.
 *
 * Ikki joyda ishlatiladi:
 *  - build paytida (vite-plugin-seo.ts): har sahifa uchun statik <head>,
 *    JSON-LD va qidiruv tizimlari uchun matn, sitemap.xml;
 *  - brauzerda (useDocumentHead): sahifa almashganda canonical, og:* va robots.
 *
 * Shu sababli bu fayl brauzer API lariga (window, localStorage) TEGMAYDI.
 */

export const SITE_ORIGIN = 'https://billiardclub.uz';
export const SITE_NAME = 'Billiard Club';

export type SeoLang = 'uz' | 'ru';

/** Landing har tilda alohida manzilda — Google ikkala tildagi qidiruvda ham topadi */
export const LANDING_PATH: Record<SeoLang, string> = { uz: '/', ru: '/ru/' };

/** Ijtimoiy tarmoq va qidiruv uchun muqova (1200×630) */
export const OG_IMAGE: Record<SeoLang, string> = { uz: '/og-cover.png', ru: '/og-cover-ru.png' };

export const CONTACT = {
  email: 'avilab.com@gmail.com',
  phone: '+998886003230',
  telegram: 'https://t.me/alibek_jumaniyazov',
  instagram: 'https://www.instagram.com/avilab.uz',
} as const;

/**
 * Qidiruv tizimlari tasdiqlash kodlari — har sahifa <head> iga meta teg bo'lib
 * tushadi (vite-plugin-seo.ts). Kodlar sir emas: sahifa manbasida baribir ko'rinadi.
 * `.env` dagi VITE_*_VERIFICATION ularni almashtira oladi.
 *  - Bing: shu teg + client/public/BingSiteAuth.xml
 *  - Yandex: fayl orqali — client/public/yandex_32bce71309dcf287.html
 */
export const SEARCH_VERIFICATION: { google?: string; yandex?: string; bing?: string } = {
  bing: '9EC34CCAD6FF10C6EE32A7B442B0461B',
};

/** Server standarti (platform-config: trialDays) — superadmin o'zgartirsa sahifa o'zi yangilanadi */
export const DEFAULT_TRIAL_DAYS = 7;

/** Server seed dagi tariflar (Landing ham shu zaxira ro'yxatni ishlatadi) */
export const PLAN_PRICES = [
  { code: 'monthly', price: 290000, months: 1 },
  { code: 'semiannual', price: 1490000, months: 6 },
  { code: 'yearly', price: 2490000, months: 12 },
] as const;

/** Qidiruv tizimlari indekslaydigan sahifalar; qolganlari (ish joyi, admin) — noindex */
const PUBLIC_PATHS = new Set(['/', '/ru', '/download', '/register', '/login']);

const normalize = (pathname: string): string => pathname.replace(/\/+$/, '') || '/';

export const isPublicPath = (pathname: string): boolean => PUBLIC_PATHS.has(normalize(pathname));

export const isLandingPath = (pathname: string): boolean => {
  const p = normalize(pathname);
  return p === '/' || p === '/ru';
};

/** Manzil tilni belgilaydimi: /ru/... — rus tili */
export const langFromPath = (pathname: string): SeoLang | null => (/^\/ru(\/|$)/.test(pathname) ? 'ru' : null);

export const absoluteUrl = (path: string): string => `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;

/** Sahifaning asosiy (canonical) manzili: landing — tilga qarab, qolganlari — o'z yo'li */
export const canonicalPath = (pathname: string, lang: SeoLang): string =>
  isLandingPath(pathname) ? LANDING_PATH[lang] : normalize(pathname);
