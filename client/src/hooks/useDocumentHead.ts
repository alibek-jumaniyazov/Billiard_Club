import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Route bo'yicha document.title va meta description ni i18n dan REAKTIV
 * o'rnatadi: til almashganda sarlavha/meta ham darhol yangilanadi.
 *
 * Foydalanish:
 *   useDocumentHead('landing.metaTitle', 'landing.metaDescription');
 *
 * @param titleKey       i18n kaliti — document.title uchun
 * @param descriptionKey i18n kaliti — <meta name="description"> uchun (ixtiyoriy)
 */
export const useDocumentHead = (titleKey: string, descriptionKey?: string): void => {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t(titleKey);

    if (!descriptionKey) return;
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = t(descriptionKey);
    // i18n.language — til almashganda qayta ishga tushishi uchun
  }, [t, titleKey, descriptionKey, i18n.language]);
};

export default useDocumentHead;
