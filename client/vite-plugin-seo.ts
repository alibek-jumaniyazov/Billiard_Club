import type { Plugin } from 'vite';
import landingText from './src/i18n/pages/landing';
import downloadText from './src/i18n/pages/download';
import {
  CONTACT,
  DEFAULT_TRIAL_DAYS,
  LANDING_PATH,
  OG_IMAGE,
  PLAN_PRICES,
  SITE_NAME,
  SITE_ORIGIN,
  absoluteUrl,
  type SeoLang,
} from './src/seo/site';

/**
 * SEO PLAGINI — har ommaviy sahifa uchun alohida, qidiruv tizimlariga tayyor HTML.
 *
 * Ilova SPA: matn JavaScript bilan chiziladi. Google uni baribir o'qiydi, lekin
 * Yandex'ning bir qismi, Telegram/Facebook havola ko'rinishi va AI qidiruv
 * botlari JavaScript ishlatmaydi — ular faqat birinchi HTML ni ko'radi. Shuning
 * uchun build paytida:
 *
 *   dist/index.html            — o'zbekcha landing (barcha ilova sahifalari ham shu qobiqdan ochiladi)
 *   dist/ru/index.html         — ruscha landing (/ru/)
 *   dist/download/index.html   — dasturni yuklab olish sahifasi
 *   dist/sitemap.xml           — hreflang bilan
 *
 * Har birida: <title>, description, canonical, hreflang, Open Graph/Twitter,
 * JSON-LD (Organization, WebSite, SoftwareApplication, FAQPage) va
 * `#seo-static` — sahifaning to'liq matni. Bu matn JavaScript ishlaydigan
 * brauzerda ko'rinmaydi (index.html: html.js), React o'z sahifasini chizganda
 * esa butunlay olib tashlanadi — foydalanuvchi uni ko'rmaydi, bot esa o'qiydi.
 *
 * Matnlar landing tarjimalaridan olinadi: sahifa matni o'zgarsa, SEO ham o'zi
 * yangilanadi. nginx `try_files $uri $uri/ /index.html` bilan /ru/ va
 * /download o'z fayllarini oladi — sozlamani o'zgartirish shart emas.
 */

type Dict = Record<string, string>;
const LANDING = landingText as unknown as Record<SeoLang, Dict>;
const DOWNLOAD = downloadText as unknown as Record<SeoLang, Dict>;

const HEAD_START = '<!--seo:head-->';
const HEAD_END = '<!--/seo:head-->';
const BODY_START = '<!--seo:body-->';
const BODY_END = '<!--/seo:body-->';

const FEATURES = 8;
const FAQ = 11;

/** {{days}} — standart sinov muddati; boshqa o'rin egallovchilar olib tashlanadi */
const fill = (value: string | undefined): string =>
  (value ?? '')
    .replace(/\{\{\s*days\s*\}\}/g, String(DEFAULT_TRIAL_DAYS))
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

const money = (price: number, lang: SeoLang) =>
  `${price.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ${lang === 'ru' ? 'сум' : "so'm"}`;

interface Page {
  file: string;
  lang: SeoLang;
  path: string;
  title: string;
  description: string;
  keywords: string;
  image: string;
  imageAlt: string;
  /** Landing: uz/ru/x-default muqobil manzillari */
  alternates: boolean;
  jsonLd: Record<string, unknown>[];
  body: string;
}

/* ------------------------------------------------------------ JSON-LD */

const ORG_ID = `${SITE_ORIGIN}/#organization`;

const organization = () => ({
  '@type': 'Organization',
  '@id': ORG_ID,
  name: SITE_NAME,
  url: `${SITE_ORIGIN}/`,
  logo: { '@type': 'ImageObject', url: absoluteUrl('/icon-512.png'), width: 512, height: 512 },
  email: CONTACT.email,
  telephone: CONTACT.phone,
  areaServed: 'UZ',
  sameAs: [CONTACT.telegram, CONTACT.instagram],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    telephone: CONTACT.phone,
    email: CONTACT.email,
    availableLanguage: ['uz', 'ru'],
    areaServed: 'UZ',
  },
});

const website = () => ({
  '@type': 'WebSite',
  '@id': `${SITE_ORIGIN}/#website`,
  url: `${SITE_ORIGIN}/`,
  name: SITE_NAME,
  inLanguage: ['uz', 'ru'],
  publisher: { '@id': ORG_ID },
});

const planName = (lang: SeoLang, code: string) => {
  const t = LANDING[lang];
  const key = code === 'monthly' ? 'planMonthlyName' : code === 'semiannual' ? 'planSemiName' : 'planYearName';
  return fill(t[key]) || code;
};

const software = (lang: SeoLang, url: string, description: string) => ({
  '@type': 'SoftwareApplication',
  '@id': `${url}#software`,
  name: SITE_NAME,
  description,
  url,
  inLanguage: lang,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Windows, Android, Web',
  image: absoluteUrl(OG_IMAGE[lang]),
  screenshot: absoluteUrl(OG_IMAGE[lang]),
  downloadUrl: absoluteUrl('/download'),
  featureList: range(FEATURES).map((i) => fill(LANDING[lang][`feature${i}Title`])).filter(Boolean),
  offers: PLAN_PRICES.map((plan) => ({
    '@type': 'Offer',
    name: planName(lang, plan.code),
    price: String(plan.price),
    priceCurrency: 'UZS',
    category: 'subscription',
    url: `${absoluteUrl(LANDING_PATH[lang])}#pricing`,
  })),
  publisher: { '@id': ORG_ID },
});

const faqPage = (lang: SeoLang) => ({
  '@type': 'FAQPage',
  '@id': `${absoluteUrl(LANDING_PATH[lang])}#faq`,
  inLanguage: lang,
  mainEntity: range(FAQ)
    .map((i) => ({ q: fill(LANDING[lang][`faq${i}Q`]), a: fill(LANDING[lang][`faq${i}A`]) }))
    .filter(({ q, a }) => q && a)
    .map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

/* ------------------------------------------------- Botlar uchun matn */

const list = (items: string[]) =>
  items.length ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '';

const pick = (lang: SeoLang, keys: string[]) => keys.map((k) => fill(LANDING[lang][k])).filter(Boolean);

const contactBlock = (lang: SeoLang) => {
  const t = LANDING[lang];
  const telegram = CONTACT.telegram.replace(/^https?:\/\/t\.me\//, '@');
  const phone = '+998 88 600 32 30';
  return `<section id="contact"><h2>${esc(fill(t.contactTitle))}</h2><p>${esc(fill(t.contactSubtitle))}</p><ul>
<li>Telegram: <a href="${CONTACT.telegram}">${esc(telegram)}</a></li>
<li>${esc(fill(t.contactPhoneTitle))}: <a href="tel:${CONTACT.phone}">${phone}</a></li>
<li>Email: <a href="mailto:${CONTACT.email}">${CONTACT.email}</a></li>
<li>Instagram: <a href="${CONTACT.instagram}">@avilab.uz</a></li>
</ul></section>`;
};

const landingBody = (lang: SeoLang) => {
  const t = LANDING[lang];
  const other: SeoLang = lang === 'uz' ? 'ru' : 'uz';
  const f = (key: string) => esc(fill(t[key]));
  const features = range(FEATURES)
    .map((i) => ({ title: fill(t[`feature${i}Title`]), desc: fill(t[`feature${i}Desc`]) }))
    .filter((x) => x.title);
  const steps = range(3)
    .map((i) => ({ title: fill(t[`step${i}Title`]), desc: fill(t[`step${i}Desc`]) }))
    .filter((x) => x.title);
  const faq = range(FAQ)
    .map((i) => ({ q: fill(t[`faq${i}Q`]), a: fill(t[`faq${i}A`]) }))
    .filter((x) => x.q && x.a);
  const plans = PLAN_PRICES.map((plan) => `${planName(lang, plan.code)} — ${money(plan.price, lang)}`);

  return `<div id="seo-static" lang="${lang}">
<header><p><a href="${LANDING_PATH[lang]}">${SITE_NAME}</a></p>
<nav><a href="#features">${f('navFeatures')}</a> · <a href="#pricing">${f('navPricing')}</a> · <a href="#faq">${f('navFaq')}</a> · <a href="/download">${f('navDownload')}</a> · <a href="/register">${f('navCta')}</a> · <a href="/login">${f('navLogin')}</a> · <a href="${LANDING_PATH[other]}" hreflang="${other}" lang="${other}">${other === 'ru' ? 'Русский' : "O'zbekcha"}</a></nav></header>
<main>
<h1>${f('heroBadge')}</h1>
<p><strong>${f('heroTitle')}</strong></p>
<p>${f('heroSubtitle')}</p>
<p><a href="/register">${f('heroCta')}</a></p>
<section id="features"><h2>${f('featuresTitle')}</h2><p>${f('featuresSubtitle')}</p>
${features.map((x) => `<h3>${esc(x.title)}</h3><p>${esc(x.desc)}</p>`).join('\n')}</section>
<section id="lights"><h2>${f('lightsTitle')}</h2><p>${f('lightsDesc')}</p>${list(pick(lang, ['lightsB1', 'lightsB2', 'lightsB3', 'lightsB4']))}</section>
<section id="offline"><h2>${f('offlineTitle')}</h2><p>${f('offlineDesc')}</p>${list(pick(lang, ['offlineB1', 'offlineB2', 'offlineB3']))}</section>
<section id="devices"><h2>${f('devicesTitle')}</h2><p>${f('devicesDesc')}</p>${list(pick(lang, ['devicesB1', 'devicesB2', 'devicesB3']))}<p><a href="/download">${f('devicesCta')}</a></p></section>
<section id="how"><h2>${f('howTitle')}</h2><ol>${steps.map((x) => `<li><strong>${esc(x.title)}</strong> — ${esc(x.desc)}</li>`).join('')}</ol></section>
<section id="pricing"><h2>${f('pricingTitle')}</h2><p>${f('pricingSubtitle')}</p>${list(plans)}${list(pick(lang, ['planFeat1', 'planFeat2', 'planFeat3', 'planFeat4']))}</section>
<section id="faq"><h2>${f('faqTitle')}</h2>
${faq.map((x) => `<h3>${esc(x.q)}</h3><p>${esc(x.a)}</p>`).join('\n')}</section>
${contactBlock(lang)}
</main>
<footer><p>${f('footerTagline')}</p></footer>
</div>`;
};

const downloadBody = (lang: SeoLang) => {
  const d = DOWNLOAD[lang];
  const t = LANDING[lang];
  return `<div id="seo-static" lang="${lang}">
<header><p><a href="${LANDING_PATH[lang]}">${SITE_NAME}</a></p></header>
<main>
<h1>${esc(fill(d.metaTitle))}</h1>
<p>${esc(fill(d.metaDesc))}</p>
<h2>${esc(fill(d.title))}</h2>
<p>${esc(fill(d.subtitle))}</p>
<section><h2>${esc(fill(t.devicesTitle))}</h2><p>${esc(fill(t.devicesDesc))}</p>${list(pick(lang, ['devicesB1', 'devicesB2', 'devicesB3']))}</section>
<p><a href="/register">${esc(fill(t.heroCta))}</a> · <a href="${LANDING_PATH[lang]}">${SITE_NAME}</a></p>
${contactBlock(lang)}
</main>
</div>`;
};

/* ---------------------------------------------------------- Sahifalar */

const landingPage = (lang: SeoLang): Page => {
  const t = LANDING[lang];
  const url = absoluteUrl(LANDING_PATH[lang]);
  const description = fill(t.metaDescription);
  return {
    file: lang === 'uz' ? 'index.html' : 'ru/index.html',
    lang,
    path: LANDING_PATH[lang],
    title: fill(t.metaTitle),
    description,
    keywords: fill(t.metaKeywords),
    image: OG_IMAGE[lang],
    imageAlt: fill(t.ogImageAlt),
    alternates: true,
    jsonLd: [organization(), website(), software(lang, url, description), faqPage(lang)],
    body: landingBody(lang),
  };
};

const downloadPage = (): Page => {
  const d = DOWNLOAD.uz;
  const description = fill(d.metaDesc);
  return {
    file: 'download/index.html',
    lang: 'uz',
    path: '/download',
    title: fill(d.metaTitle),
    description,
    keywords: fill(LANDING.uz.metaKeywords),
    image: OG_IMAGE.uz,
    imageAlt: fill(LANDING.uz.ogImageAlt),
    alternates: false,
    jsonLd: [organization(), software('uz', absoluteUrl('/download'), description)],
    body: downloadBody('uz'),
  };
};

export const SEO_PAGES = (): Page[] => [landingPage('uz'), landingPage('ru'), downloadPage()];

/* ----------------------------------------------------------- HTML */

interface Verification {
  google?: string;
  yandex?: string;
  bing?: string;
}

const headFor = (page: Page, verify: Verification): string => {
  const url = absoluteUrl(page.path);
  const image = absoluteUrl(page.image);
  const other: SeoLang = page.lang === 'uz' ? 'ru' : 'uz';
  const locale = (lang: SeoLang) => (lang === 'ru' ? 'ru_RU' : 'uz_UZ');
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="keywords" content="${esc(page.keywords)}" />`,
    '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />',
    `<link rel="canonical" href="${url}" />`,
    ...(page.alternates
      ? [
          `<link rel="alternate" hreflang="uz" href="${absoluteUrl(LANDING_PATH.uz)}" />`,
          `<link rel="alternate" hreflang="ru" href="${absoluteUrl(LANDING_PATH.ru)}" />`,
          `<link rel="alternate" hreflang="x-default" href="${absoluteUrl(LANDING_PATH.uz)}" />`,
        ]
      : []),
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${esc(page.imageAlt)}" />`,
    `<meta property="og:locale" content="${locale(page.lang)}" />`,
    `<meta property="og:locale:alternate" content="${locale(other)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${esc(page.imageAlt)}" />`,
    ...(verify.google ? [`<meta name="google-site-verification" content="${esc(verify.google)}" />`] : []),
    ...(verify.yandex ? [`<meta name="yandex-verification" content="${esc(verify.yandex)}" />`] : []),
    ...(verify.bing ? [`<meta name="msvalidate.01" content="${esc(verify.bing)}" />`] : []),
    `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': page.jsonLd }).replace(/</g, '\\u003c')}</script>`,
  ];
  return tags.join('\n    ');
};

const between = (html: string, start: string, end: string, content: string) => {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < a) throw new Error(`SEO: index.html da ${start} … ${end} belgilari topilmadi`);
  return `${html.slice(0, a + start.length)}\n    ${content}\n    ${html.slice(b)}`;
};

export const renderPage = (html: string, page: Page, verify: Verification = {}): string =>
  between(
    between(html, HEAD_START, HEAD_END, headFor(page, verify)),
    BODY_START,
    BODY_END,
    page.body,
  ).replace(/<html lang="[^"]*"/, `<html lang="${page.lang}"`);

const sitemap = (date: string): string => {
  const alternates = [
    `<xhtml:link rel="alternate" hreflang="uz" href="${absoluteUrl(LANDING_PATH.uz)}"/>`,
    `<xhtml:link rel="alternate" hreflang="ru" href="${absoluteUrl(LANDING_PATH.ru)}"/>`,
    `<xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(LANDING_PATH.uz)}"/>`,
  ].join('\n    ');
  const url = (path: string, priority: string, extra = '') => `  <url>
    <loc>${absoluteUrl(path)}</loc>
    <lastmod>${date}</lastmod>
    <priority>${priority}</priority>${extra ? `\n    ${extra}` : ''}
  </url>`;
  const image = (src: string) => `<image:image><image:loc>${absoluteUrl(src)}</image:loc></image:image>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${[
  url(LANDING_PATH.uz, '1.0', `${alternates}\n    ${image(OG_IMAGE.uz)}`),
  url(LANDING_PATH.ru, '1.0', `${alternates}\n    ${image(OG_IMAGE.ru)}`),
  url('/download', '0.8'),
  url('/register', '0.7'),
  url('/login', '0.3'),
].join('\n')}
</urlset>
`;
};

export const seoPlugin = (): Plugin => {
  let verify: Verification = {};
  return {
    name: 'billiardclub-seo',
    enforce: 'post',

    configResolved(config) {
      // Search Console / Yandex.Webmaster / Bing tasdiqlash kodlari (.env, ixtiyoriy)
      verify = {
        google: config.env.VITE_GOOGLE_SITE_VERIFICATION,
        yandex: config.env.VITE_YANDEX_VERIFICATION,
        bing: config.env.VITE_BING_VERIFICATION,
      };
    },

    // Dev'da ham, build'da ham asosiy fayl — o'zbekcha landing
    transformIndexHtml: {
      order: 'post',
      handler: (html) => renderPage(html, landingPage('uz'), verify),
    },

    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') return;
      const html = String(index.source);
      for (const page of SEO_PAGES()) {
        if (page.file === 'index.html') continue;
        this.emitFile({ type: 'asset', fileName: page.file, source: renderPage(html, page, verify) });
      }
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap(new Date().toISOString().slice(0, 10)) });
    },
  };
};
