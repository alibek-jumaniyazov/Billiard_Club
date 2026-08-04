/* eslint-disable no-undef */
/**
 * BILLIARD CLUB — SERVICE WORKER (offline qobiq).
 *
 * VAZIFASI: internet bo'lmasa ham ilova OCHILSIN. Kassa kompyuteri qayta
 * yuklansa yoki brauzer yopilib ochilsa, tarmoqsiz holatda oq ekran emas —
 * to'liq ishlaydigan interfeys chiqadi (ma'lumot esa app qatlamidagi
 * IndexedDB keshidan keladi).
 *
 * ATAYLAB QILINMAGAN NARSA: `/api/**` javoblari BU YERDA KESHLANMAYDI.
 * Service Worker keshining kaliti faqat URL — u qaysi xodim yoki qaysi klub
 * so'raganini AJRATA OLMAYDI. Bitta kassa kompyuterida ikki xodim navbatma-navbat
 * ishlaganda bu bir klubning pul ma'lumotini boshqasiga ko'rsatib qo'yardi.
 * Shuning uchun API javoblari foydalanuvchi+klub bilan kalitlangan holda
 * src/offline/cache.ts da keshlanadi.
 *
 * Bu fayl Vite tomonidan QAYTA ISHLANMAYDI — vite-plugin-sw.ts uni build
 * paytida o'zgaruvchilarni almashtirib nusxalaydi.
 */

const VERSION = '__SW_VERSION__';
const PRECACHE = '__SW_PRECACHE__';
const CACHE_NAME = `billiardclub-shell-${VERSION}`;

/** Navigatsiya (SPA) so'rovlari uchun zaxira sahifa */
const APP_SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Bitta fayl tushmasa ham butun o'rnatish yiqilmasin: har birini
      // alohida qo'shamiz (cache.addAll bitta 404 da hammasini bekor qiladi)
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
            if (res.ok) await cache.put(url, res);
          } catch {
            /* bu fayl offline'da mavjud bo'lmaydi — qolganlari ishlaydi */
          }
        }),
      );
      // Yangi versiya darhol kutish holatiga o'tadi; almashtirish
      // foydalanuvchi tasdiqlagach (SKIP_WAITING) bo'ladi — kassir ish
      // o'rtasida kutilmaganda qayta yuklanib qolmaydi.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('billiardclub-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      // Navigation preload — tarmoq bor paytda navigatsiyani tezlashtiradi
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* qo'llab-quvvatlanmasa muhim emas */
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** Hashli (immutable) build fayli — nomida 8+ belgili hash bor */
const isHashedAsset = (pathname) => /\/assets\/.+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Faqat GET keshlanadi. POST/PUT/DELETE — offline navbat (app qatlami).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Boshqa domen (Telegram, tashqi rasm) — aralashmaymiz
  if (url.origin !== self.location.origin) return;

  // API — HECH QACHON keshlanmaydi (yuqoridagi izohga qarang).
  // Tarmoq xatosi axios'ga o'z holicha yetib boradi va app qatlami
  // o'zining tenant bilan kalitlangan keshidan javob beradi.
  if (url.pathname.startsWith('/api/')) return;

  // SPA navigatsiyasi: avval tarmoq, bo'lmasa keshdagi qobiq
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const shell = await cache.match(APP_SHELL);
          if (shell) return shell;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Oflayn</title>' +
              '<body style="font-family:system-ui;background:#0e1513;color:#e8f0ee;' +
              'display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
              '<div style="text-align:center"><h1>Oflayn</h1>' +
              '<p>Ilova hali yuklab olinmagan. Bir marta internet bilan oching.</p></div>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }
      })(),
    );
    return;
  }

  // Hashli build fayllari — o'zgarmaydi, keshdan berish eng tez yo'l
  if (isHashedAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })(),
    );
    return;
  }

  // Qolgan statik fayllar (favicon, manifest, rasm) — avval tarmoq,
  // uzilganda kesh
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      } catch {
        const hit = await cache.match(request);
        if (hit) return hit;
        throw new Error('offline');
      }
    })(),
  );
});
