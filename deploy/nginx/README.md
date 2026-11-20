# nginx: xavfsizlik sarlavhalari

Sayt sahifalari (`client/dist`) nginx'dan beriladi va hozircha **hech qanday xavfsizlik
sarlavhasisiz** chiqadi. API javoblarida esa ular bor, chunki Node serverda `helmet` ulangan.
Bu papkadagi ikki fayl shu bo'shliqni yopadi. Tahlil: [docs/SECURITY-AUDIT.md](../../docs/SECURITY-AUDIT.md).

| Fayl | Qayerga ulanadi |
|---|---|
| `billiardclub-security-headers.conf` | `server { }` blokiga va o'zining `add_header`i bor har bir `location`ga |
| `billiardclub-api-headers.conf` | `location /api/ { }` ichiga — Node sarlavhalari ikki marta ketmasin |

## Tartib muhim: avval client, keyin nginx

CSP `script-src 'self'` sahifadagi ichki (inline) skriptlarni bloklaydi. Eski client build'da mavzu
skripti ichki edi, yangisida esa u `theme-init.js` fayli. **Avval yangi client build'ni chiqaring**,
keyin nginx'ni yoqing. Aks holda statik SEO matni ilova ostida ko'rinib qoladi va mavzu "chaqnaydi".

## Deploy'dan oldin lokal tekshiruv

`npm run preview` aynan shu fayldagi sarlavhalar bilan ishlaydi (`client/vite.config.ts` uni o'qiydi),
ya'ni production CSP'ni kompyuterda ko'rish mumkin:

```bash
cd client && npm run build && npm run preview   # http://localhost:4173
```

DevTools → Console'da `Refused to …` xabari chiqmasligi kerak. Build ham o'zi tekshiradi: HTML'da
ichki skript, `onclick="…"` yoki `javascript:` havola paydo bo'lsa, `npm run build` xato bilan
to'xtaydi (`client/src/seo/csp.ts`).

## Qo'llash

1. Fayllarni serverga ko'chiring:

   ```bash
   sudo cp deploy/nginx/billiardclub-security-headers.conf deploy/nginx/billiardclub-api-headers.conf /etc/nginx/snippets/
   ```

2. Sayt konfiguratsiyasiga (`/etc/nginx/sites-available/…`) include qatorlarini qo'shing:

   ```nginx
   server {
       listen 443 ssl;
       server_name billiardclub.uz www.billiardclub.uz;
       # … ssl_certificate, root, index …

       include snippets/billiardclub-security-headers.conf;

       location /api/ {
           proxy_pass http://127.0.0.1:5000;
           # … proxy_set_header …
           include snippets/billiardclub-api-headers.conf;
       }

       # O'zining add_header'i bor location — server darajasidagi sarlavhalar bu yerga
       # meros qilinmaydi, shuning uchun include takrorlanadi
       location /assets/ {
           add_header Cache-Control "public, max-age=31536000, immutable";
           include snippets/billiardclub-security-headers.conf;
       }
   }
   ```

   `www` uchun alohida `server { }` bo'lsa, unga ham include qo'shing (yoki `www` ni asosiy
   domenga 301 bilan yo'naltiring).

3. nginx versiyasini yashiring — `/etc/nginx/nginx.conf` dagi `http { }` ichida (Ubuntu'da bu qator
   izohga olingan, `#` ni olib tashlang):

   ```nginx
   server_tokens off;
   ```

4. Tekshirib, qayta yuklang:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

## Tekshiruv

```bash
curl -sI https://billiardclub.uz/ | grep -iE '^(server|strict|x-frame|x-content|referrer|permissions|cross-origin|content-security)'
```

Kutilgan natija: `Server: nginx` (versiyasiz) va qolgan 7 ta sarlavha. API'da har bir sarlavha
**bir martadan** bo'lishi kerak:

```bash
curl -sI https://billiardclub.uz/api/public/config | grep -icE '^strict-transport-security'   # 1
```

Brauzerda saytni oching va DevTools → Console'da `Refused to …` (CSP) xatolari yo'qligini
tekshiring: landing, kirish, stollar, chek chop etish, hisobot (Excel yuklash).

## Orqaga qaytarish

`include snippets/billiardclub-*.conf;` qatorlarini o'chiring va
`sudo nginx -t && sudo systemctl reload nginx`.
