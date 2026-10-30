# SEO — billiardclub.uz qidiruvda

## Kutish (halol baho)

- **Aniq so'rovlar** — "billiard klub dasturi", "bilyard klubi uchun dastur", "программа для
  бильярдного клуба", "учет бильярдного клуба". O'zbekistonda raqobat kam, shuning uchun bunday
  so'rovlarda birinchi o'rinlarga chiqish real. Sayt indekslangach, odatda bir necha hafta yoki
  oy kerak bo'ladi.
- **Umumiy so'rovlar** — "billiard", "бильярд", "billiard qoidalari", "billiard Toshkent".
  Bunday qidiruvda odamlar o'ynash uchun klub, xarita, qoidalar yoki o'yin izlaydi. Google bu
  yerda xaritani, klublarni va Vikipediyani ko'rsatadi. Dastur sayti bunday so'rovda birinchi
  bo'lmaydi.
- Hech kim (Google ham) aniq o'rinni kafolatlay olmaydi. Pastdagi kod qismi bajarildi, qolgani
  (tasdiqlash, havolalar, sharhlar) sayt egasining ishi.

## Kodda nima qilingan

| Nima | Qayerda |
|---|---|
| Har sahifa uchun alohida HTML: `/` (o'zbekcha), `/ru/` (ruscha), `/download` | `client/vite-plugin-seo.ts` (build paytida) |
| Har sahifada: sarlavha, tavsif, kalit so'zlar, canonical, hreflang (uz/ru/x-default), Open Graph, Twitter | o'sha plagin |
| JSON-LD: Organization, WebSite, SoftwareApplication (3 tarif, imkoniyatlar), FAQPage (11 savol) | o'sha plagin, matnlar landing tarjimalaridan |
| JavaScript ishlatmaydigan botlar uchun to'liq matn (`#seo-static`). Foydalanuvchiga ko'rinmaydi | `client/index.html` (`html.js`) |
| Ruscha landing alohida manzilda, til tugmasi manzilni ham almashtiradi | `App.tsx` (`/ru`), `Landing.tsx` |
| Sahifa almashganda canonical va `og:*` yangilanadi | `hooks/useDocumentHead.ts` |
| Ish joyi, admin va 404 — `noindex`. `robots.txt` da shaxsiy yo'llar yopiq | `useRobotsMeta`, `public/robots.txt` |
| `sitemap.xml` — hreflang va rasmlar bilan, har build'da sanasi yangilanadi | plagin |
| H1 kalit so'z bilan ("Billiard klublari uchun boshqaruv tizimi"). Katta shior H2 bo'ldi, ko'rinish o'zgarmagan | `Landing.tsx` |
| Bannerlar 1200×630 (uz/ru, haqiqiy dastur ekrani bilan), `favicon.ico`, 1024 px logotip | `tools/brand-video/banners.cjs` |
| Qidiruvdan kelgan mehmon va botlar brend intro'sini ko'rmaydi (Google sahifani to'sadigan oynalarni yoqtirmaydi) | `components/brand/introGate.ts` |

Ma'lumotlar bitta joyda: `client/src/seo/site.ts` (domen, kontaktlar, tariflar, sinov kunlari).
Tarif yoki sinov muddati o'zgarsa, shu yerda ham yangilang.

**Sharhlar:** landingdagi mijoz sharhlari (`testimonials`) atayin JSON-LD ga **qo'shilmagan**.
Google soxta yoki tasdiqlanmagan sharhlarni jazolaydi. Sharhlarni faqat haqiqiy mijozlarning
roziligi bilan qo'ying.

## Sayt egasi qiladigan ishlar (muhimlik tartibida)

1. **Deploy.** Yangi client build'ni serverga chiqaring. nginx sozlamasini o'zgartirish shart
   emas: `try_files $uri $uri/ /index.html` `/ru/` va `/download` uchun o'z fayllarini beradi.
   Tekshiring:
   - `https://billiardclub.uz/ru/` sahifasining manbasida (Ctrl+U) ruscha `<title>` bo'lishi kerak;
   - `https://billiardclub.uz/sitemap.xml` ochilishi kerak.
2. **Google Search Console** — <https://search.google.com/search-console>
   - "Domen" turida qo'shing (DNS TXT yozuvi) yoki "URL prefiksi" + HTML teg. Teg uchun
     `client/.env.production` ga `VITE_GOOGLE_SITE_VERIFICATION=<kod>` yozib, qayta build qiling.
   - **Sitemaps** bo'limida `https://billiardclub.uz/sitemap.xml` ni yuboring.
   - **URL Inspection** orqali `/` va `/ru/` uchun "Request indexing" bosing.
3. **Yandex.Webmaster** — <https://webmaster.yandex.ru>
   - Tasdiqlash fayli qo'yilgan: `client/public/yandex_32bce71309dcf287.html`. Deploydan keyin
     «Проверить» ni bosing.
   - Regionni "Узбекистан" qilib belgilang, sitemap yuboring.
   - Ruscha qidiruvlarning sezilarli qismi Yandex orqali bo'ladi.
4. **Bing Webmaster Tools** — tasdiqlash ikki usulda tayyor:
   - fayl `client/public/BingSiteAuth.xml`;
   - har sahifadagi `msvalidate.01` meta teg (kod `client/src/seo/site.ts` →
     `SEARCH_VERIFICATION`).
   Deploydan keyin «Verify» ni bosing. ChatGPT qidiruvi va Copilot ham Bing indeksidan
   foydalanadi.

Faylni yoki tegni keyin o'chirmang: qidiruv tizimlari tasdiqni vaqti-vaqti bilan qayta
tekshiradi.
5. **Google Business Profile, 2GIS va Yandex Business** — kompaniya kartochkasini oching:
   - logotip: `client/public/brand/billiardclub-logo-1024.png`;
   - muqova: `og-cover.png`;
   - telefon, sayt va Telegram.
   Mijoz klublardan **haqiqiy** sharh so'rang: sharhlar va kartochka "billiard dastur Toshkent"
   kabi so'rovlarda ko'rinishni oshiradi.
6. **Havolalar (backlink)** — Google uchun eng kuchli signal:
   - ishlayotgan klublarning saytida yoki Instagram bio'sida "Billiard Club tizimida" havolasi;
   - biznes kataloglari;
   - Telegram kanallar;
   - YouTube'dagi dastur ko'rsatuvi (brend videosi: `client/public/brand/`).
7. **Kontent** — "billiard klub ochish", "billiard klubini boshqarish", "rus bilyardi qoidalari"
   kabi foydali maqolalar (uz va ru). Ular umumiy billiard qidiruvlaridan ham mehmon olib keladi.

## Tekshirish

- `npm run build` — `dist/index.html`, `dist/ru/index.html`, `dist/download/index.html`,
  `dist/sitemap.xml`.
- JSON-LD: <https://search.google.com/test/rich-results> va <https://validator.schema.org>.
- Havola ko'rinishi: Telegram'da havolani yuborib ko'ring. Facebook uchun Sharing Debugger.
- Bannerlarni qayta yaratish: `tools/brand-video/README.md`.
