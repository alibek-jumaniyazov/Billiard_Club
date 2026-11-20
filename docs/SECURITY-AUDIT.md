# Xavfsizlik auditi: cdScan hisoboti tahlili (2026-11-19)

Manba: cdCTF cdScan, `billiardclub.uz`, baho **B (72/100)**: 2 ta o'rtacha, 11 ta past/ma'lumot.
Har bir topilma jonli saytda (`curl`, DNS) va kodda qayta tekshirildi.

## Xulosa

- **Haqiqiy muammo bitta: sayt sahifalarida HTTP xavfsizlik sarlavhalari yo'q.** HTML nginx'dan
  beriladi va nginx ularni qo'ymaydi. API javoblarida esa hammasi bor (Node, `helmet`) — skaner
  faqat bosh sahifani tekshirgani uchun 1–6 va 13-topilmalar chiqqan.
- Tuzatish kodda tayyor: [deploy/nginx/](../deploy/nginx/README.md) dagi sarlavhalar fayli va
  ularga mos client o'zgarishi (ichki skript `public/theme-init.js` ga ko'chirildi, build esa
  CSP'ni buzadigan ichki skriptni endi o'tkazmaydi). Serverda qo'llash — operator ishi.
- SSH va DNS bo'yicha tavsiyalar quyida. robots.txt, DKIM va PFS bo'yicha hech narsa qilish kerak emas.

## Topilmalar

| # | Topilma | Tekshiruv natijasi | Qaror |
|---|---|---|---|
| 1 | CSP yo'q (o'rtacha) | Tasdiqlandi: HTML'da yo'q, API'da bor | **Tuzatildi** — qat'iy CSP (`script-src 'self'`), ilova bilan moslashtirilgan |
| 2 | Clickjacking (o'rtacha) | Tasdiqlandi | **Tuzatildi** — `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'` |
| 3 | HSTS yo'q | HTML'da yo'q; API allaqachon `includeSubDomains` bilan yuboradi | **Tuzatildi** — 1 yil, `includeSubDomains` (www va mail HTTPS da) |
| 4 | `nosniff` yo'q | Tasdiqlandi | **Tuzatildi** |
| 5 | Referrer-Policy yo'q | Tasdiqlandi | **Tuzatildi** — `strict-origin-when-cross-origin` |
| 6 | Permissions-Policy yo'q | Tasdiqlandi | **Tuzatildi** — kamera, mikrofon, joylashuv, to'lov, USB o'chiq |
| 7 | nginx versiyasi ochiq | Tasdiqlandi: `nginx/1.28.3 (Ubuntu)` | **Serverda**: `server_tokens off;` |
| 8 | SSH 22-port ochiq | Ma'lumot | **Serverda / AWS** — pastga qarang |
| 9 | robots.txt | Unda faqat kirishsiz ochilmaydigan ilova sahifalari bor | **Kerak emas** — SEO uchun zarur, sir oshkor qilmaydi |
| 10 | DKIM faol | Ijobiy topilma | Kerak emas |
| 11 | DMARC `p=none` | Tasdiqlandi, ustiga `rua` ham yo'q — hisobot ham yig'ilmaydi | **DNS'da** — pastga qarang |
| 12 | PFS faol | Ijobiy topilma (TLS 1.3) | Kerak emas |
| 13 | COOP yo'q | Tasdiqlandi | **Tuzatildi** — `same-origin` (ilovada popup oqimlari yo'q, xavfsiz) |

## CSP ilovani buzmasligi qanday tekshirildi

- Brauzer faqat o'z domeniga ulanadi (`/api` nisbiy); tashqi skript, analitika va tashqi iframe yo'q.
- Ant Design uslublari va chek chop etish iframe'i ichki `<style>` ishlatadi — `style-src 'unsafe-inline'`.
  Skriptlar uchun `'unsafe-inline'` yo'q.
- Yuklangan rasmlar va Excel `blob:` orqali ko'rsatiladi — `img-src`/`media-src` da bor.
- **Android ilova** (Capacitor 8.6) HTML ni o'zi yuklab, o'z skriptini qo'shadi va server
  sarlavhalarini o'tkazmaydi (`WebViewLocalServer.handleProxyRequest`). Shuning uchun CSP unga ta'sir qilmaydi.
- **Windows ilova** (Electron) saytni oddiy oynada ochadi, preload `contextBridge` orqali ishlaydi.
  Skript qo'shmaydi — CSP bilan mos.
- Build qo'riqchisi (`client/src/seo/csp.ts`, testlari bor): HTML'da ichki skript, `on…=` atributi
  yoki `javascript:` havola paydo bo'lsa, build xato bilan to'xtaydi.
- Brauzerda production build + aynan shu sarlavhalar (`npm run preview`) bilan tekshirildi:
  - bosh sahifa, `/ru/`, `/download`, `/login`, `/register` — CSP buzilishi 0 ta (brauzerning
    o'z hisobotlari, `ReportingObserver`, orqali);
  - och va qorong'i mavzu qo'llanadi;
  - Ant Design uslublari, shriftlar va service worker ishlaydi;
  - chek chop etish mexanizmi (yashirin iframe + ichki uslub) ishlaydi;
  - `blob:` va `data:` rasmlar ochiladi.

  Nazorat sinovi: sahifaga qo'shilgan ichki skript ham, tashqi domenga so'rov ham, tashqi rasm ham
  bloklandi — ya'ni siyosat haqiqatan ishlayapti.

  Kirishdan keyingi ekranlar kod bo'yicha tekshirildi: `eval`/`new Function`, WebSocket,
  tashqi so'rov va tashqi rasm yo'q. Ilova rasmlari autentifikatsiyalangan `blob:` URL orqali ko'rsatiladi.

## Skaner tavsiyalaridan farqlar

- `preload` HSTS'ga qo'shilmadi: u hstspreload.org ga yozilishni anglatadi va orqaga qaytarish
  oylab davom etadi. Kerak bo'lsa keyinroq qo'shiladi.
- `more_clear_headers` qo'llanmadi: u qo'shimcha `headers-more` modulini talab qiladi. Versiyani
  yashirish uchun `server_tokens off;` yetarli.
- Hisobotdagi UFW, `network.host` (Elasticsearch) va 3306/5432/6379 qatorlari bu tizimga tegishli
  emas: server AWS'da, tarmoq Security Group bilan boshqariladi, baza portlari esa allaqachon yopiq
  (skaner ham shuni tasdiqlagan).

## Serverda qilinadigan ishlar (operator)

1. **Client'ni deploy qilish, keyin nginx.** Tartib: [deploy/nginx/README.md](../deploy/nginx/README.md).
2. **SSH (22-port).** AWS Security Group'da 22-portni faqat admin IP'lariga oching (yoki EC2
   Instance Connect / SSM Session Manager ishlatib, portni butunlay yoping). Parolli kirish
   o'chiqligini tekshiring:

   ```bash
   sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin)'
   ```

   Kutilgan natija: `passwordauthentication no`, `permitrootlogin no` (yoki `prohibit-password`).
   Qo'shimcha himoya: `sudo apt install fail2ban` (Ubuntu'da SSH qoidasi standart yoqilgan).

## DNS'da qilinadigan ishlar

1. **DMARC.** Hozir `v=DMARC1; p=none;` va hisobot manzili yo'q, ya'ni soxta xatlar
   bloklanmaydi va kuzatilmaydi ham. Domen nomidan klub egalariga soxta "obuna to'lovi" xatlari
   yuborilishining oldini olish uchun yozuvni almashtiring:

   ```text
   _dmarc.billiardclub.uz  TXT  "v=DMARC1; p=quarantine; rua=mailto:<hisobot-qutisi>"
   ```

   2–4 hafta hisobotlarni kuzating. Haqiqiy xatlaringiz o'tayotgan bo'lsa, `p=reject` ga o'ting.
2. **SPF.** Yozuvda `ip4:185.196.212.52` bor, joriy server esa `54.221.136.192` (u `+a`/`+mx`
   orqali allaqachon qamralgan). Agar 185.196.212.52 endi sizniki bo'lmasa, uni olib tashlang —
   aks holda shu IP egasi sizning domeningiz nomidan xat yubora oladi. DMARC hisobotlari toza
   bo'lgach, `~all` ni `-all` ga almashtiring.
