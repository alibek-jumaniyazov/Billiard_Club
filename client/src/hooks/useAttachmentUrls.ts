import { useEffect, useRef, useState } from 'react';

/**
 * Biriktirilgan rasmlarni autentifikatsiyalangan blob sifatida yuklab,
 * obyekt URL larga aylantiradi (statik /uploads endi tarqatilmaydi —
 * <img src> ga Authorization qo'shib bo'lmaydi).
 *
 * `key` o'zgarganda eski URL lar bekor qilinadi (revokeObjectURL) va
 * yangi to'plam yuklanadi; komponent yechilganda ham tozalanadi.
 *
 * @param key      Yuklamalar egasining identifikatori (masalan, feedback.id);
 *                 null — hech narsa yuklanmaydi
 * @param count    Yuklamalar soni (feedback.attachments.length)
 * @param fetcher  (index) => Promise<Blob> — sahifaga mos API metod
 * @returns        index bo'yicha obyekt URL lar (yuklanmagani undefined)
 */
export const useAttachmentUrls = (
  key: number | null,
  count: number,
  fetcher: (index: number) => Promise<Blob>,
): Array<string | undefined> => {
  const [urls, setUrls] = useState<Array<string | undefined>>([]);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (key === null || count <= 0) {
      setUrls([]);
      return;
    }
    let cancelled = false;
    const created: string[] = [];

    setUrls(new Array<string | undefined>(count).fill(undefined));
    for (let i = 0; i < count; i += 1) {
      void fetcherRef
        .current(i)
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          created.push(url);
          setUrls((prev) => {
            const next = [...prev];
            next[i] = url;
            return next;
          });
        })
        .catch(() => {
          /* rasm yuklanmasa — o'rni bo'sh qoladi, xato toast shart emas */
        });
    }

    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key, count]);

  return urls;
};

export default useAttachmentUrls;
