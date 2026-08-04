# Billiard Club — Billiard klublar uchun boshqaruv tizimi (SaaS)

Billiard klublariga **oylik obuna** asosida sotiladigan, ko'p-klubli (multi-tenant) boshqaruv tizimi:
stol taymerlari, bar POS, qarzlar daftari, hisobotlar va platforma egasi uchun klublarni boshqarish paneli.

## Arxitektura

| Qism | Texnologiya |
|---|---|
| `server/` | NestJS 11 · TypeORM · PostgreSQL · JWT · class-validator |
| `client/` | Vite · React 18 · TypeScript · Ant Design 5 · react-i18next (uz/ru) · service worker (oflayn) |
| `desktop/` | Electron qobiq — Windows/macOS/Linux uchun o'rnatiladigan dastur |
| `bridge/` | Klub tarmog'idagi chiroq agenti (ixtiyoriy) |

### Biznes model
- **Superadmin** (siz) — klublarni yaratadi, har biriga login/parol beradi, obunani istalgan muddatga
  (+1/+3/+6/+12 oy yoki aniq sana) uzaytiradi, bloklaydi, statistikasini ko'radi.
- Har yangi klubga **bepul sinov muddati** (standart 7 kun) — uzunligi superadmin panelidan
  o'zgartiriladi (*Sozlamalar → Platforma qoidalari*), kodga tegish shart emas. Landing
  sahifasidagi "N kun bepul" matnlari ham shu qiymatdan yig'iladi, ya'ni sayt va tizim
  hech qachon bir-biriga zid bo'lmaydi.
- Klub qo'shilganda sizga **Telegram** orqali xabar keladi. Obuna tugashidan oldingi
  eslatma chegaralari ham shu panelda sozlanadi (standart: 3 va 1 kun qolganda).
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

## Stol chiroqlarini avtomatik boshqarish

Kassir o'yinni boshlaganda stol chirog'i o'zi yonadi, yakunlanganda o'zi o'chadi — odatda **1 soniyadan kam**
kechikish bilan. Klubdagi doim yoqiq kompyuterda kichik **bridge agent** ishlaydi: u serverga o'zi chiqadi
(chiquvchi HTTPS, uzun-polling), shuning uchun port forwarding ham, statik IP ham kerak emas.
Agent lokal tarmoqdagi Wi-Fi/DIN relelarga (Shelly, Tasmota) HTTP so'rov yuboradi.
Server bir tarmoqda bo'lsa `DIRECT` rejimi ham bor (faqat xususiy IP lar — SSRF himoyasi).

Funksiya butunlay **ixtiyoriy va standart holatda o'chiq**: yoqilmasa dastur bugungidek ishlaydi,
yoqilganda ham chiroqdagi har qanday xato sessiya va pul hisobiga **hech qachon** ta'sir qilmaydi.

Apparat variantlari (13–150 $), elektr ulanish sxemalari, o'rnatish chek-listi, nosozliklar va
xarajat hisobi: **[docs/LIGHT-CONTROL.md](docs/LIGHT-CONTROL.md)**

## Internetsiz ishlash (oflayn)

Klub Wi-Fi si uzilganda kassa **to'xtamaydi**. Uch qatlam:

1. **Ilova ochiladi.** Service worker (`client/sw/service-worker.js`) interfeysni keshlaydi —
   kompyuter qayta yuklansa yoki brauzer yopilib ochilsa ham oq ekran chiqmaydi.
2. **Ma'lumot ko'rinadi.** Oxirgi muvaffaqiyatli javoblar IndexedDB da saqlanadi
   (`client/src/offline/cache.ts`) va yuqorida "Internet yo'q — ma'lumot 14:32 holatida"
   chizig'i turadi. **Taymer to'g'ri yuradi** (u `startTime` dan qayta hisoblanadi), shuning
   uchun uzilish qancha davom etsa ham vaqt va summa yo'qolmaydi.
3. **Amallar saqlanadi.** O'yin boshlash, pauza/davom ettirish va bar buyurtmasi navbatga
   yoziladi (`client/src/offline/queue.ts`), ekranda darhol ko'rinadi va aloqa tiklanishi
   bilan **yozilgan tartibda** yuboriladi.

**Nima ATAYLAB oflayn ishlamaydi:** hisob-kitob (yakunlash), qarz to'lovi, sessiyani bekor
qilish va ko'chirish. Bu amallarning summasi boshqa terminalda qo'shilgan buyurtmalarga,
chegirmalarga va qarz holatiga bog'liq — eskirgan ma'lumot ustida hisoblangan chek mijozdan
**noto'g'ri pul olishga** olib kelardi va uni keyin tuzatib bo'lmasdi. Tugmalar sababi
ko'rsatilgan holda o'chiq turadi.

**Ikki marta yozilmaydi:** har bir navbatdagi amalga bir martalik `Idempotency-Key` biriktiriladi,
server esa uni eslab qoladi (`server/src/common/idempotency/`). Javob yo'lda yo'qolib, amal
qayta yuborilsa ham pul ikki marta yozilmaydi.

**Yuborilmagan amal hech qachon jimgina yo'qolmaydi:** u ro'yxatda ko'rinadi, xato bo'lsa
navbat to'xtaydi va foydalanuvchidan hal qilish so'raladi.

### Obuna oflaynda ham aniq vaqtida tugaydi

Internet uzilganda server so'ralmaydi — ya'ni muddati tugagan klub tarmoqni uzib qo'yib
ishlashda davom eta olardi. Endi uch qatlam bor:

1. **Imzolangan ruxsatnoma.** Server har bir auth javobida ECDSA P-256 (ES256) bilan
   imzolangan ruxsatnoma beradi: klub ID si va muddat. Klientda faqat **ochiq kalit** bor —
   u tekshira oladi, lekin o'ziga yangi muddat yozib **ola olmaydi**. IndexedDB dagi
   qiymatni DevTools bilan o'zgartirish endi ish bermaydi: imzo mos kelmaydi va ruxsatnoma
   butunlay rad etiladi (`client/src/offline/license.ts`).
2. **Monoton soat.** Kompyuter soatini orqaga surish ham yordam bermaydi — "hozir" qiymati
   `performance.now()` bilan surib boriladi va eng katta ko'rilgan vaqt diskda saqlanadi.
3. **Server — yakuniy hakam.** Oflaynda yozilgan amallar aloqa tiklanganda yuboriladi va
   muddati tugagan klub uchun `SubscriptionGuard` ularni rad etadi. Ya'ni birinchi ikki
   qatlamni chetlab o'tilgan taqdirda ham "oflaynda ishlab olingan" pul haqiqiy yozuvga
   aylanmaydi.

Rejim **qat'iy**: muddat tugadi = darhol blok, qo'shimcha muhlat yo'q.
Kalit birinchi ishga tushishda o'zi yaratiladi (`LICENSE_PRIVATE_KEY` bilan ochiq
belgilash mumkin — bir nechta nusxada ishlatilsa **majburiy**).

## Desktop dastur

`desktop/` — Electron qobiq: o'z oynasi, o'z ikonkasi, Boshlash menyusidagi yorliq,
yuborilmagan amallar bo'lsa yopishdan oldin ogohlantirish.

### Yuklab olish — bitta joyda

**`/download`** — yagona ommaviy sahifa: joriy versiya, hajmi, chiqarilgan sanasi,
o'zgarishlar ro'yxati va SHA-512 nazorat summasi. Platforma avtomatik aniqlanadi
(Windows/macOS/Linux). Desktop qobiq **ichida** ochilsa yuklab olish tugmasi o'rniga
joriy versiya va yangilanish holati ko'rsatiladi.

Fayllar **o'z serveringizda** turadi — GitHub yoki boshqa tashqi xizmat ishlatilmaydi
(`RELEASES_DIR`, standart: `server/uploads/releases`).

### Avtomatik yangilanish

`electron-updater` o'z serveringizdagi feed'dan boqiladi:

```
<server>/api/public/updates/latest.yml        # Windows
<server>/api/public/updates/latest-mac.yml    # macOS
<server>/api/public/updates/latest-linux.yml  # Linux
```

Ishga tushgandan 20 soniya keyin va har 4 soatda tekshiriladi → yangi versiya fonda
yuklab olinadi → `sha512` tekshiriladi → **dastur yopilganda o'rnatiladi**. Smena
o'rtasida dastur o'zini qayta ishga tushirib yubormaydi; yuborilmagan oflayn amallar
bo'lsa avval ogohlantiradi.

Yangi versiya chiqarish: `desktop/package.json` dagi versiyani oshiring →
`npm run dist:win` → superadmin panelidan yuklang → **Nashr etish**. Nashr etilmagan
reliz `/download` da ham, auto-update feed'ida ham ko'rinmaydi.

Tafsilot: **[desktop/README.md](desktop/README.md)**

## Superadmin — klub ma'lumotlari konsoli

`/admin/clubs/:id/data` — istalgan klubning to'liq ma'lumotini **faqat o'qish** rejimida
ko'rish: tushum, o'yinlar, bar buyurtmalari, qarzlar, xodimlar faolligi va faoliyat jurnali.

"Klubni ko'rish" (impersonatsiya) rejimidan farqi: sessiya konteksti **o'zgarmaydi**,
klub nomidan hech narsa **yozilmaydi** va har bir so'rov `admin.impersonate` jurnal
yozuvini hosil qilmaydi — shuning uchun bir necha klubni ketma-ket ko'rish jurnalni
shovqin bilan to'ldirmaydi va haqiqiy aralashuvlar ko'rinib turadi.

**Oflayn amallar alohida ajratilgan.** Internetsiz kiritilgan har bir amal jurnalga
`offline.replay` sifatida yoziladi: qachon navbatga qo'yilgani (klient vaqti), qachon
serverga yetib kelgani va kechikish. Nizoli holatda aynan shu farq hal qiluvchi bo'ladi.

> Ma'lumotga kirish `superadmin` roli bilan chegaralangan (klub foydalanuvchilari 403
> oladi). Ko'p ijarali (multi-tenant) SaaS da platforma egasining ma'lumotlarga texnik
> kirishi muqarrar — buni **foydalanish shartlari va maxfiylik siyosatida** ochiq yozib
> qo'yish kerak (O'zbekiston "Shaxsga doir ma'lumotlar to'g'risida"gi qonuni talabi).

```bash
cd desktop && npm install
npm start          # ishga tushirish
npm run dist:win   # Windows o'rnatgichi (.exe)
```

Qobiq ilovaning **nusxasini saqlamaydi** — u ishlayotgan manzilni ochadi, oflayn rejim esa
yuqoridagi service worker hisobiga ishlaydi. Sabablari va sozlash: **[desktop/README.md](desktop/README.md)**.

Brauzerda ham ilovani o'rnatish mumkin (PWA): manzil satridagi "O'rnatish" tugmasi —
natija bir xil, alohida oyna va yorliq.

## Muhim texnik qarorlar

- **Tushum** = sessiya yakunida haqiqatda olingan pul (`sales`) + undirilgan qarzlar (`debt_payments`),
  to'lov sanasi bo'yicha. Qarzga yozilgan summa to'lanmaguncha tushumga kirmaydi.
- **DB darajasidagi himoya**: bitta stolda bitta faol sessiya, bitta sessiyada bitta ochiq buyurtma
  (partial unique indekslar), manfiy summalar taqiqi (CHECK). Pul yo'llarida qator qulflari (FOR UPDATE).
- **Tenant izolyatsiyasi**: har so'rov `clubId` bilan chegaralanadi; superadmin `X-Club-Id` header
  bilan istalgan klubni ko'ra oladi.
- **i18n**: klient `X-Lang: uz|ru` header yuboradi — server xabarlari ham shu tilda qaytadi.
- Sxemani **faqat migratsiyalar** boshqaradi (`synchronize` hech qachon yoqilmaydi).

## Testlar

```bash
npm test          # yoki: cd client && npm test
```

Qamrov ataylab tor va PUL MANTIG'IGA qaratilgan — bu yerda xato bevosita
mijozdan olinadigan summaga ta'sir qiladi:

- `client/src/utils/session.test.ts` — sessiya taymeri va summasi: pauza,
  transfer (segmentlar), kumulyativ yaxlitlash, muhrlangan narx. Bu fayl
  serverdagi `billSegments` formulasining nusxasi bo'lgani uchun har bir
  invariant testda muhrlangan.
- `client/src/offline/overlay.test.ts` — oflayn amallarning ekranda
  ko'rsatilishi: dublikat bo'lmasligi, pauza vaqti, bar summasi, xato
  yozuvning qoplanmasligi.

## Yangi versiyani chiqarish (deploy) tartibi

1. `npm run typecheck && npm test && npm run build`
2. **`npm run migrate`** — MAJBURIY. Kutilayotgan migratsiyalar:
   `RefreshSessionAndOrderIndexes`, `IdempotencyKeys`, `DebtWriteOff`.
   Ularsiz qarzni hisobdan chiqarish ishlamaydi.
3. Chiroqning `DIRECT` rejimidan foydalanadigan klub bo'lsa —
   `LIGHTS_DIRECT_ALLOWED_CIDRS` ni to'ldiring (pastdagi izohga qarang),
   aks holda DIRECT rejim ishlamaydi. `BRIDGE` rejimi ta'sirlanmaydi.
4. Serverni qayta ishga tushiring.

## Production eslatmalari

- `server/.env` git'ga kirmaydi; kuchli `JWT_SECRET`/`JWT_REFRESH_SECRET` qo'ying:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- Eski git tarixida oldingi dev sirlari bor — ular almashtirilgan, lekin repo ommaviy bo'lsa tarixni tozalash tavsiya etiladi.
- Reverse proxy (nginx/Caddy) ortida TLS bilan ishga tushiring; `trust proxy` allaqachon sozlangan.
- `SEED_DEMO_CLUB=false` bo'lsin; superadmin parolini kuchli qiling.
- PostgreSQL uchun muntazam backup (pg_dump) sozlang — bu klublarning moliyaviy ma'lumotlari.
