/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Server manzili (sxema + host, oxirida '/' shart emas), masalan:
   *   https://billiardclub.uz
   *
   * Bo'sh bo'lsa nisbiy `/api` ishlatiladi — veb-versiya, desktop qobiq va
   * o'rnatilgan PWA uchun standart yo'l (klient va server bitta domendan
   * xizmat qilinadi).
   *
   * Bu o'zgaruvchi faqat klient boshqa domendan berilganda kerak bo'ladi
   * (masalan alohida CDN yoki lokal fayldan yuklanadigan maxsus qurilma).
   * `desktop/` qobig'i ilovani HTTPS manzilidan ochadi, shuning uchun unga
   * bu o'zgaruvchi KERAK EMAS — izohni desktop/README.md da qarang.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
