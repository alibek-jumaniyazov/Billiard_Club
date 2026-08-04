import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * OFFLINE QOBIQ PLAGINI — build natijasidan `sw.js` yasaydi.
 *
 * Nega tayyor paket (vite-plugin-pwa / workbox) emas:
 *  - u ~40 ta tranzitiv bog'liqlik olib keladi va o'z generatsiya qatlami bilan
 *    keladi; bizga kerak bo'lgani esa aniq bitta narsa — build fayllari
 *    ro'yxatini service worker ichiga joylash;
 *  - service worker mantiqi (API keshlanmasligi — tenant xavfsizligi) bu
 *    loyihaga xos va baribir qo'lda yozilishi kerak edi.
 *
 * Plagin `sw/service-worker.js` ni o'qiydi, `__SW_VERSION__` va
 * `__SW_PRECACHE__` o'rin egallovchilarini almashtiradi va natijani
 * build ildiziga (`dist/sw.js`) chiqaradi.
 */

/** Qobiqqa kiritiladigan fayl turlari (offline'da interfeys to'liq chiqishi uchun) */
const PRECACHE_EXT = /\.(js|css|woff2|svg)$/i;

/**
 * Precache'ga KIRMAYDIGAN fayllar — offline ishlash uchun kerak emas, lekin
 * o'lchami katta (ijtimoiy tarmoq muqovasi ~680KB).
 */
const PRECACHE_SKIP = [/^og-cover\./];

/**
 * public/ dan qo'lda qo'shiladigan fayllar (ular bundle ga kirmaydi).
 * Ikonkalar ham shu yerda: o'rnatilgan ilova (PWA/desktop) ochilganda
 * tizim ularni so'raydi va tarmoq bo'lmasa yorliq bo'sh chiqib qolardi.
 */
const PUBLIC_ASSETS = [
  '/favicon.svg',
  '/site.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
];

export const swPlugin = (): Plugin => {
  /**
   * Shablon yo'li loyiha ILDIZIdan olinadi. `__dirname` ishlatilmaydi: Vite
   * konfiguratsiya faylini ESM ga bundle qiladi va u yerda `__dirname`
   * mavjud emas. `configResolved` esa har doim to'g'ri ildizni beradi.
   */
  let root = process.cwd();

  return {
    name: 'billiardclub-service-worker',
    apply: 'build',
    enforce: 'post',

    configResolved(config) {
      root = config.root;
    },

    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => PRECACHE_EXT.test(name) && !PRECACHE_SKIP.some((re) => re.test(name)))
        .map((name) => `/${name}`);

      // index.html qobiqning o'zi — SPA navigatsiyasining zaxirasi
      const precache = Array.from(new Set(['/index.html', ...PUBLIC_ASSETS, ...files])).sort();

      // Versiya build tarkibidan chiqadi: fayllar o'zgarmasa SW ham o'zgarmaydi
      // (foydalanuvchiga bejiz "yangilanish bor" deyilmaydi)
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 12);

      const template = readFileSync(resolve(root, 'sw/service-worker.js'), 'utf8');
      const source = template
        .replace("'__SW_VERSION__'", JSON.stringify(version))
        .replace("'__SW_PRECACHE__'", JSON.stringify(precache));

      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
};
