# Prime Billiard — Billiard klublar uchun boshqaruv tizimi (SaaS)

Billiard klublariga **oylik obuna** asosida sotiladigan, ko'p-klubli (multi-tenant) boshqaruv tizimi:
stol taymerlari, bar POS, qarzlar daftari, hisobotlar va platforma egasi uchun klublarni boshqarish paneli.

## Arxitektura

| Qism | Texnologiya |
|---|---|
| `server/` | NestJS 11 · TypeORM · PostgreSQL · JWT · class-validator |
| `client/` | Vite · React 18 · TypeScript · Ant Design 5 · react-i18next (uz/ru) |

### Biznes model
- **Superadmin** (siz) — klublarni yaratadi, har biriga login/parol beradi, obunani istalgan muddatga
  (+1/+3/+6/+12 oy yoki aniq sana) uzaytiradi, bloklaydi, statistikasini ko'radi.
- Har yangi klubga **7 kunlik bepul sinov**; klub qo'shilganda sizga **Telegram** orqali xabar keladi.
- Muddati tugagan/bloklangan klub foydalanuvchilari tizimga kira oladi, lekin **blok ekranidan** o'ta olmaydi —
  ma'lumotlari saqlanadi, obuna uzaytirilishi bilan ish davom etadi.

### Rollar
`superadmin` (platforma egasi) · `admin` (klub egasi) · `kassir` (hisob-kitob, qarzlar, hisobotlar) · `operator` (o'yin boshlash, bar buyurtma)

## Ishga tushirish (development)

Talablar: Node.js 20+, PostgreSQL 14+.

```bash
# 1. Server
cd server
cp .env.example .env        # qiymatlarni to'ldiring (JWT sirlari, DB parol, Telegram)
npm install
npm run migration:run       # sxema (yagona manba — migratsiyalar)
npm run seed                # superadmin (+ SEED_DEMO_CLUB=true bo'lsa demo klub)
npm run dev                 # http://localhost:5000

# 2. Client (alohida terminal)
cd client
npm install
npm run dev                 # http://localhost:5173 (API /api -> :5000 proxy)
```

Demo kirishlar (faqat dev, `SEED_DEMO_CLUB=true`): `demo_admin` / `demo123!`, `demo_kassir`, `demo_operator` (parol bir xil).
Superadmin: `.env` dagi `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD`.

## Telegram xabarnoma

1. [@BotFather](https://t.me/BotFather) da bot yarating → tokenni `TELEGRAM_BOT_TOKEN` ga qo'ying
2. Botga `/start` yozing
3. `https://api.telegram.org/bot<TOKEN>/getUpdates` dan `chat.id` ni oling → `TELEGRAM_CHAT_ID`

Shundan so'ng yangi klub qo'shilganda va obuna uzaytirilganda sizga xabar keladi.

## Muhim texnik qarorlar

- **Tushum** = sessiya yakunida haqiqatda olingan pul (`sales`) + undirilgan qarzlar (`debt_payments`),
  to'lov sanasi bo'yicha. Qarzga yozilgan summa to'lanmaguncha tushumga kirmaydi.
- **DB darajasidagi himoya**: bitta stolda bitta faol sessiya, bitta sessiyada bitta ochiq buyurtma
  (partial unique indekslar), manfiy summalar taqiqi (CHECK). Pul yo'llarida qator qulflari (FOR UPDATE).
- **Tenant izolyatsiyasi**: har so'rov `clubId` bilan chegaralanadi; superadmin `X-Club-Id` header
  bilan istalgan klubni ko'ra oladi.
- **i18n**: klient `X-Lang: uz|ru` header yuboradi — server xabarlari ham shu tilda qaytadi.
- Sxemani **faqat migratsiyalar** boshqaradi (`synchronize` hech qachon yoqilmaydi).

## Production eslatmalari

- `server/.env` git'ga kirmaydi; kuchli `JWT_SECRET`/`JWT_REFRESH_SECRET` qo'ying:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- Eski git tarixida oldingi dev sirlari bor — ular almashtirilgan, lekin repo ommaviy bo'lsa tarixni tozalash tavsiya etiladi.
- Reverse proxy (nginx/Caddy) ortida TLS bilan ishga tushiring; `trust proxy` allaqachon sozlangan.
- `SEED_DEMO_CLUB=false` bo'lsin; superadmin parolini kuchli qiling.
- PostgreSQL uchun muntazam backup (pg_dump) sozlang — bu klublarning moliyaviy ma'lumotlari.
