import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { OG_IMAGE, absoluteUrl, canonicalPath, isPublicPath, type SeoLang } from '../seo/site';

const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
  }
  meta.content = content;
};

const setCanonical = (href: string) => {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
};

/**
 * Route bo'yicha <head> ni i18n dan REAKTIV o'rnatadi: sarlavha, description,
 * canonical va ijtimoiy tarmoq (og:/twitter:) teglari. Til almashganda ham
 * darhol yangilanadi. Statik boshlang'ich qiymatlar build paytida
 * vite-plugin-seo.ts tomonidan yoziladi — bu hook ularni sahifa almashganda
 * mos holatga keltiradi.
 *
 * Foydalanish:
 *   useDocumentHead('landing.metaTitle', 'landing.metaDescription');
 *
 * @param titleKey       i18n kaliti — document.title uchun
 * @param descriptionKey i18n kaliti — <meta name="description"> uchun (ixtiyoriy)
 */
export const useDocumentHead = (titleKey: string, descriptionKey?: string): void => {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();

  useEffect(() => {
    const lang: SeoLang = i18n.language === 'ru' ? 'ru' : 'uz';
    const title = t(titleKey);
    const url = absoluteUrl(canonicalPath(pathname, lang));
    const image = absoluteUrl(OG_IMAGE[lang]);
    document.title = title;
    setCanonical(url);
    setMeta('property', 'og:title', title);
    setMeta('name', 'twitter:title', title);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:locale', lang === 'ru' ? 'ru_RU' : 'uz_UZ');
    setMeta('property', 'og:image', image);
    setMeta('name', 'twitter:image', image);

    if (!descriptionKey) return;
    const description = t(descriptionKey);
    setMeta('name', 'description', description);
    setMeta('property', 'og:description', description);
    setMeta('name', 'twitter:description', description);
    // i18n.language — til almashganda qayta ishga tushishi uchun
  }, [t, titleKey, descriptionKey, i18n.language, pathname]);
};

/**
 * Qidiruv tizimlari faqat ommaviy sahifalarni (landing, yuklab olish, kirish,
 * ro'yxatdan o'tish) indekslaydi. Ish joyi, admin va 404 — `noindex`: SPA har
 * qanday manzilga 200 qaytaradi, aks holda Google ularni bo'sh sahifa sifatida
 * qo'shib olardi.
 */
export const useRobotsMeta = (): void => {
  const { pathname } = useLocation();
  useEffect(() => {
    setMeta(
      'name',
      'robots',
      isPublicPath(pathname)
        ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        : 'noindex, nofollow',
    );
  }, [pathname]);
};

export default useDocumentHead;
