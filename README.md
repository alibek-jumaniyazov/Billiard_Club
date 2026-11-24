# Billiard Club — Billiard klublar uchun boshqaruv tizimi (SaaS)

Billiard klublariga **obuna** asosida (Standart / Pro / VIP · 1, 3, 6 oy yoki 1 yil) sotiladigan, ko'p-klubli (multi-tenant) boshqaruv tizimi:
stol taymerlari, bar POS, qarzlar daftari, hisobotlar va platforma egasi uchun klublarni boshqarish paneli.

## Arxitektura

| Qism | Texnologiya |
|---|---|
| `server/` | NestJS 11 · TypeORM · PostgreSQL · JWT · class-validator |
| `client/` | Vite · React 18 · TypeScript · Ant Design 5 · react-i18next (uz/ru) · service worker (oflayn) |
| `desktop/` | Electron qobiq — Windows/macOS/Linux uchun o'rnatiladigan dastur |
| `mobile/` | Capacitor qobiq — Android ilova (APK) |
| `bridge/` | Klub tarmog'idagi chiroq agenti (ixtiyoriy) |

### Biznes model
- **Superadmin** (siz) — klublarni yaratadi, har biriga login/parol beradi, obunani istalgan muddatga
  (+1/+3/+6/+12 oy yoki aniq sana) uzaytiradi, bloklaydi, statistikasini ko'radi.
- Ommaviy registratsiyada yangi, Telegram orqali tasdiqlangan telefon va Telegram hisobiga
  **bir martalik bepul sinov muddati** (standart 7 kun) — uzunligi superadmin panelidan
  o'zgartiriladi (*Sozlamalar → Platforma qoidalari*), kodga tegish shart emas. Landing
  sahifasidagi "N kun bepul" matnlari ham shu qiymatdan yig'iladi, ya'ni sayt va tizim
  hech qachon bir-biriga zid bo'lmaydi.
- **Tarif darajalari** — Standart, Pro va VIP. Har bir daraja qaysi bo'limlarni ochishini
  (bar, buyurtmalar, bron, mijozlar, smenalar, xodim qo'shish, chiroq va h.k.), stollar va
  foydalanuvchilar sonini hamda narxlarni superadmin o'zi belgilaydi (alohida *Tariflar*
  sahifasi). Yuqori daraja
  quyisidagi hamma narsani oladi. Batafsil: [docs/TARIFFS.md](docs/TARIFFS.md).
- Klub qo'shilganda sizga **Telegram** orqali xabar keladi. Obuna tugashidan oldingi
  eslatma chegaralari ham shu panelda sozlanadi (standart: 3 va 1 kun qolganda).
- Muddati tugagan/bloklangan klub foydalanuvchilari tizimga kira oladi, lekin **blok ekranidan** o'ta olmaydi —
  ma'lumotlari saqlanadi, obuna uzaytirilishi bilan ish davom etadi.
- **Blok sababi.** Superadmin bloklashda tayyor sababni tanlaydi va klubga ko'rinadigan izoh yozadi.
  Ikkalasi ham ixtiyoriy. Tayyor sabablar:
  - bepul tarifdan noto'g'ri foydalanish (2 yoki undan ortiq hisob ochilgan);
  - to'lov qilinmagan;
  - foydalanish shartlari buzilgan;
  - shubhali faollik;
  - klub egasining so'rovi;
  - boshqa sabab.

  Klub kirganda blok ekranida sabab, tushuntirish, izoh va bloklangan sana ko'rinadi. Sababni
  keyin ham o'zgartirish mumkin (*⋯ → Blok sababini o'zgartirish*).
- **To'lov bilan ochiladigan blok.** Ikki sabab obuna bilan hal bo'ladi: bepul tarifdan
  noto'g'ri foydalanish va to'lov qilinmagani. Ularda klub egasiga blok ekranining o'zida
  tariflar ochiladi va obuna sotib olish tavsiya qilinadi. To'lov tasdiqlanganda blok
  **o'zicha ochilmaydi**: tasdiqlash oynasida *"Klubni blokdan ham chiqarish"* belgisi bor.
  Shu ikki sababda u oldindan belgilangan bo'ladi. Qolgan sabablarda klubga administrator bilan
  bog'lanish taklif qilinadi.

### Rollar
`superadmin` (platforma egasi) · `admin` (klub egasi) · `kassir` (hisob-kitob, qarzlar, hisobotlar) · `operator` (o'yin boshlash, bar buyurtma, hisob-kitob — qarzga yozish bilan; o'yinni bekor qilish, kassa smenasi, "Qarzlar daftari" sahifasi va **chiroq boshqaruvi** — yo'q: chiroq o'yin bilan avtomatik yonadi/o'chadi, operator stol kartasida faqat "Chiroq yoniq" belgisini ko'radi)

## Ishga tushirish (development)

Talablar: Node.js 22.12+, PostgreSQL 14+.

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

Ommaviy registratsiya uchun Telegram orqali **o‘z telefonini tasdiqlash** ham kerak.
Pullik SMS ishlatilmaydi. Botni, webhookni va doimiy sinov tarixini sozlash:
**[docs/TRIAL-PROTECTION.md](docs/TRIAL-PROTECTION.md)**.
Bu sozlamalar bo‘lmasa, tasdiqlanmagan foydalanuvchiga bepul sinov ochilmaydi.

### Klub egasi uchun Telegram bot

Platformaning **mavjud boti** ishlatiladi (yangi bot shart emas). Ega saytda
ro'yxatdan o'tayotganda telefonini shu botda tasdiqlaydi va shu payt avtomatik ulanadi.
Avval ro'yxatdan o'tganlar ham bir marta avtomatik ulanadi. Qo'shimcha chat yoki sheriklar
guruhini ilovadagi **Boshqaruv → Telegram bot** bo'limida QR orqali ulash mumkin. Platforma
xabarlari avvalgidek faqat `TELEGRAM_CHAT_ID` guruhiga boradi. Bot quyidagilarni yuboradi:

- **Har kuni kechagi kun hisoboti.** Tushum (naqd/karta), o'yinlar, eng band stollar,
  kassirlar, qarz, xarajat, smena kassa farqi. Dushanba kuni hafta yakuni, oyning 1-kuni
  oy yakuni qo'shiladi.
- **Darhol xabarlar.** Bekor qilingan o'yin, chegirma, smena yopilishi (kamomad bilan),
  qarzni hisobdan chiqarish, narx o'zgarishi.
- **Buyruqlarga javob:** `/bugun`, `/hozir`, `/hafta`.

Raqamlar «Hisobotlar» sahifasi bilan bir xil. Sozlash (bir buyruq) va tafsilot:
**[docs/TELEGRAM-BOT.md](docs/TELEGRAM-BOT.md)**.

## Stol chiroqlarini avtomatik boshqarish

Kassir o'yinni boshlaganda stol chirog'i o'zi yonadi, yakunlanganda o'zi o'chadi — odatda **1 soniyadan kam**
kechikish bilan. Relelarni klubdagi kompyuter boshqaradi: **kassadagi kompyuter dasturi (1.4.0+) —
«chiroq markazi»** yoki boshqa doim yoqiq kompyuterdagi **bridge agent** (Raspberry Pi). Ikkalasi ham
serverga o'zi chiqadi (chiquvchi HTTPS, uzun-polling), shuning uchun port forwarding ham, statik IP ham kerak emas.
Server bir tarmoqda bo'lsa `DIRECT` rejimi ham bor (faqat xususiy IP lar — SSRF himoyasi).

**Internetsiz ham ishlaydi (24 soatgacha).** Server stollarning xom holatini (o'yin, pauza, oxirgi
tugash, qo'lda boshqaruv, bronlar) va klub qoidalarini beradi; markaz kerakli holatni o'zi hisoblaydi,
kassadagi oflayn amallarni darhol oladi, holatni diskda (DPAPI bilan shifrlab) saqlaydi va aloqa
tiklangach natijalarni yuboradi (`bridge/lib/hub.js`, `bridge/lib/rules.js`, `desktop/lights.js`).

**Relelar:** Tuya/Smart Life (lokal protokol, kalitni Tuya bulutidan olish), Sonoff (DIY/eWeLink LAN),
Shelly, Tasmota, ESPHome, Home Assistant, MQTT/Zigbee, Modbus TCP va RS485 (RTU), USB platalar
(CH340/LCUS, USBRelay HID), xom TCP/COM. Sozlash — **qurilma ustasi** orqali (turi → ulanish →
kanal/stol jadvali → sinov), bitta plata bir nechta stolga bitta tranzaksiyada biriktiriladi
(`client/src/pages/tables/lights/`, `PUT /api/lights/tables`).

Funksiya butunlay **ixtiyoriy va standart holatda o'chiq**: yoqilmasa dastur bugungidek ishlaydi,
yoqilganda ham chiroqdagi har qanday xato sessiya va pul hisobiga **hech qachon** ta'sir qilmaydi.

Apparat variantlari (13–150 $), elektr ulanish sxemalari, o'rnatish chek-listi, nosozliklar va
xarajat hisobi: **[docs/LIGHT-CONTROL.md](docs/LIGHT-CONTROL.md)**

**Sinovdan o'tgan (bridge v2.2):** 8 ta virtual Shelly rele + haqiqiy agent + server bilan
11 ta ssenariy: boshlash/tugash (~40 ms), pauza, tugagach kechikish, qo'lda va master
boshqaruv, javob bermaydigan rele (boshqa stollar kutib qolmaydi), elektrdan uzilgan rele
(qayta ulangach ~6 s da tiklanadi), qo'lda yoqib qo'yilgan rele (drift — majburiy sinxron
tuzatadi) va agent qayta ishga tushishi (~0,2 s da holat tiklanadi). Shu sinovda topilgan
xato tuzatildi: server har javobda soxta "qurilma qidirish" vazifasini berib yuborardi,
natijada chiroq ~2 s kechikardi va "Qurilmalarni qidirish" umuman ishlamasdi
(`UPDATE ... RETURNING` natija shakli — `server/src/common/db/returning-rows.ts`).
**Server bilan birga klubdagi agentni ham v2.2 ga yangilang.**

## Internetsiz ishlash (oflayn)

Klub Wi-Fi si uzilganda kassa **to'xtamaydi**. Uch qatlam:

1. **Ilova ochiladi.** Service worker (`client/sw/service-worker.js`) interfeysni keshlaydi —
   kompyuter qayta yuklansa yoki brauzer yopilib ochilsa ham oq ekran chiqmaydi.
2. **Ma'lumot ko'rinadi.** Oxirgi muvaffaqiyatli javoblar IndexedDB da saqlanadi
   (`client/src/offline/cache.ts`) va yuqorida "Internet yo'q — ma'lumot 14:32 holatida"
   chizig'i turadi. **Taymer to'g'ri yuradi** (u `startTime` dan qayta hisoblanadi), shuning
   uchun uzilish qancha davom etsa ham vaqt va summa yo'qolmaydi.
3. **Amallar saqlanadi.** Navbatga yoziladi (`client/src/offline/queue.ts`), ekranda darhol
   ko'rinadi va aloqa tiklanishi bilan **yozilgan tartibda, asl vaqti bilan** (`offlineAt`) yuboriladi:
   - **stollar:** o'yin boshlash, pauza/davom ettirish, bar buyurtmasi, vaqt/limitni o'zgartirish,
     boshqa stolga ko'chirish (narx bosilgan paytda bo'linadi), bekor qilish, hisob-kitob — to'liq
     to'lov yoki ro'yxatdagi mijoz qarziga (`client/src/offline/pos.ts`);
   - **qarz to'lovi, bronlar** (yaratish, tasdiqlash, "o'tirdi", "kelmadi", bekor qilish),
     **yangi mijoz**, **smena ochish/yopish** (`client/src/offline/ops.ts`).
   Oflayn kiritilgan savdo, to'lov va qarz yozuvlari "Yakunlash" bosilgan vaqt bilan saqlanadi —
   tushum o'sha kun va smenaga tushadi; smena Z-hisoboti o'yin tugagan vaqt bo'yicha yig'iladi.

   Oflayn ko'rinadigan sahifalar (oxirgi ma'lumot bilan): stollar, mahsulotlar, mijozlar, bronlar,
   qarzlar va to'lov tarixi, joriy smena, buyurtmalar, xarajatlar. Moliyaviy hisobotlar ataylab
   keshlanmaydi — oflaynda "Hisobotlar uchun internet kerak" xabari chiqadi.

**Oflayn hisob-kitob.** Internet uzilsa ham mijoz kutib qolmaydi: summa shu kassadagi
ma'lumotdan hisoblanadi, chek chop etiladi ("OFLAYN" belgisi bilan), stol darhol bo'shaydi.
Serverga "Yakunlash" bosilgan VAQT (`offlineAt`) va OLINGAN pul yuboriladi; server summani
aynan o'sha paytga qayta hisoblaydi (vaqt chegaralanadi: sessiya boshlanishidan oldin va
kelajakda bo'la olmaydi). Agar internet yo'q paytda boshqa kassada bar buyurtmasi qo'shilgan
bo'lsa, server **rad etmaydi** (pul allaqachon olingan): haqiqatda olingan summa yoziladi,
farq "Oflayn hisob-kitob farqi" tuzatishi sifatida muhrlanadi, audit jurnaliga tushadi va
kassirga darhol ogohlantirish chiqadi. Onlayn hisob-kitobdagi 409 himoyasi o'zgarmagan.

**Nima oflayn ishlamaydi (sababi bilan):** summani qo'lda tuzatish, qarzni hisobdan chiqarish,
mijozni tahrirlash/o'chirish, oflayn qo'shilgan (hali yuborilmagan) mijozga qarz yozish, biladigan
holda ustma-ust bron, hisobotlar va smena tarixi. Bunday tugmalar o'chiq va sababi ko'rsatiladi.
Oflayn ishlash muddati — **24 soat** (litsenziya ijarasi); undan eski navbat server tomonidan rad
etiladi va ko'rinadigan xato bo'lib qoladi.

**Server qayta ishga tushayotganda ham.** Javob umuman bo'lmasa yoki faqat proksi javob bersa
(nginx 502/504, deploy paytida) — bu ham "aloqa yo'q" deb hisoblanadi: kassa amallari xato
bo'lmay navbatga tushadi, ro'yxat keshdan ko'rinadi (`isGatewayFailure`, `api/client.ts`).

Sinov (brauzerda, server o'chirib-yoqilgan holda): oflayn boshlangan o'yin 53 soniyadan keyin
oflayn yakunlandi → aloqa tiklangach serverda boshlanish/tugash vaqtlari aynan saqlangan,
summa kassadagidek (220,83 so'm), farq yo'q.

**Ikki marta yozilmaydi:** har bir navbatdagi amalga bir martalik `Idempotency-Key` biriktiriladi,
server esa uni eslab qoladi (`server/src/common/idempotency/`). Javob yo'lda yo'qolib, amal
qayta yuborilsa ham pul ikki marta yozilmaydi.

**Yuborilmagan amal hech qachon jimgina yo'qolmaydi:** u ro'yxatda ko'rinadi. Server rad etgan
amal faqat o'ziga BOG'LIQ amallarni (o'sha stol, seans, mijoz, bron yoki smena) to'xtatadi —
mustaqil amallar yuborilaveradi (`meta.deps`). Tarmoq/obuna sababli urinishlar tugasa butun navbat
to'xtaydi. Chiqishda yuborilmagan amallar bo'lsa yoki internet yo'q bo'lsa, avval ogohlantiriladi.

**Sinov (brauzerda, production yig'masi, API va sahifa serverlari o'chirilgan holda):** ilova
service worker keshidan ochildi, stollar va bronlar keshdan ko'rindi; oflayn o'yin boshlandi va
bron yaratildi → serverlar yoqilgach navbat o'zi yuborildi, o'yin oflayn bosilgan vaqt bilan,
bron esa o'z vaqtida saqlandi.

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

Sinov: obuna muddatini 100 soniyaga qo'yib server o'chirildi — muddat o'tishi bilan ilova
**oflaynda** o'zi blok ekraniga o'tdi; server yoqilganda `403 SUBSCRIPTION_EXPIRED`;
obuna uzaytirilgach "Holatni tekshirish" darhol ochdi.
Kalit birinchi ishga tushishda o'zi yaratiladi (`LICENSE_PRIVATE_KEY` bilan ochiq
belgilash mumkin — bir nechta nusxada ishlatilsa **majburiy**).

## Desktop dastur

`desktop/` — Electron qobiq: o'z oynasi, o'z ikonkasi, Boshlash menyusidagi yorliq,
yuborilmagan amallar bo'lsa yopishdan oldin ogohlantirish.

### Yuklab olish — bitta joyda

**`/download`** — yagona ommaviy sahifa. Yuqorida aniqlangan qurilma uchun bitta katta
"Yuklab olish" tugmasi (versiya, hajm, sana), pastda barcha qurilmalar kartalari: Windows,
Android (kompyuterdan ochilganda APK uchun QR-kod), iPhone (Safari orqali bosh ekranga, QR-kod
bilan) va brauzer; tanlangan qurilmaning 3 qadamli o'rnatish yo'riqnomasi, o'zgarishlar
ro'yxati va SHA-512 nazorat summasi. Platforma avtomatik aniqlanadi (`/download#windows`,
`#android`, `#ios` bilan majburan tanlash mumkin). Tizimga kirgan xodimga pastda shu
qurilmaning oflayn ishlashga tayyorligi ko'rsatiladi. Desktop qobiq **ichida** ochilsa yuklab olish tugmasi o'rniga
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

**Katta fayllar va nginx (413).** Superadmin paneli o'rnatgichni **4 MB lik
bo'laklarda** yuboradi (`/api/admin/releases/uploads`): server oldidagi nginx
`client_max_body_size` chegarasi (production'da ~6 MB edi) 110 MB lik `.exe` ni
endi to'xtatmaydi. Uzilgan bo'lak qayta yuboriladi, 413 kelsa bo'lak o'zi
kichrayadi, "Yuklashni to'xtatish" serverdagi yarim faylni o'chiradi; tashlandiq
yuklashlar `uploads/releases/tmp` dan har kuni tozalanadi. nginx'da hech narsa
o'zgartirish shart emas — faqat chegara 1 MB dan kichik bo'lmasin (bo'lak 256 KB
gacha kichraya oladi).

Tafsilot: **[desktop/README.md](desktop/README.md)**

## Android ilova

`mobile/` — Capacitor qobig'i (≈3 MB APK, Android 7.0+). Desktop dastur kabi u ham
serverdagi veb-ilovani ochadi: yangi imkoniyatlar APK ni qayta o'rnatmasdan keladi,
internet uzilsa oflayn navbat ishlaydi, server umuman ochilmasa — "qayta urinish" ekrani.

```bash
npm run mobile:apk     # imzolangan release APK → mobile/dist/BilliardClub-<versiya>.apk
```

Birinchi yig'ishda imzo kaliti yaratiladi (`mobile/android/keystore*`, git'ga kirmaydi) —
**zaxiralang**, kalitsiz o'rnatilgan ilovalarni yangilab bo'lmaydi. APK superadmin
panelida **Desktop relizlari → Android (APK)** orqali nashr etiladi va `/download` da
telefon uchun o'rnatish qadamlari bilan chiqadi. GitHub Actions'da yig'ish:
`.github/workflows/android.yml`. Tafsilot: **[mobile/README.md](mobile/README.md)**

**Yangilanish.** APK o'z versiyasini user-agent'ga yozadi (`BilliardClubAndroid/1.1.0`);
ilova ichida eski qobiq bo'lsa, `/download` dagi yangi APK bir martalik banner bilan taklif
qilinadi (`NativeUpdateBanner`). Fayl yuklash tizim brauzeriga beriladi (`MainActivity`:
DownloadListener) — WebView'ning o'zi APK ni yuklamaydi. Windows dasturi esa o'zi yangilanadi:
`latest.yml` → yuklab olish → sha512 tekshiruvi (1.2.0 → 1.3.0 kanali lokal sinovdan o'tgan).

## Brend animatsiyasi va videolar

"B" logotipi (tik turgan kiy va ikki shar) uchun bitta animatsiya. Sayt, dasturlar va
videolarda u bir xil, chunki kadr faqat vaqtga bog'liq: `client/src/brand/logoMotion.ts`.

- **Saytda** landingga birinchi kirgan mehmon 2.5–3 soniyalik intro ko'radi: chiroq yonadi,
  belgi yig'iladi, yozuv chiqadi va belgi sarlavhadagi logotip o'rniga "qo'nadi". Intro bir
  sessiyada bir marta chiqadi va bosish, tugma yoki aylantirish bilan darhol yopiladi.
  "Harakatni kamaytirish" yoqilgan bo'lsa, umuman chiqmaydi.
- **Windows va Android dasturida** intro har ishga tushganda splash ekran o'rnida chiqadi.
  Android'da u tizim splash ekranidagi belgidan uzilishsiz davom etadi. Dasturlarni qayta
  yig'ish shart emas: ular serverdagi veb-ilovani ochadi.
- **Yuklanish ekranida** kulrang aylana o'rniga jonli "B" turadi: ustki shar pastkisiga tegib
  turadi.
- **Videolar** `client/public/brand/` da (saytda `/brand/...`): 16:9 (YouTube, taqdimot),
  9:16 (story, Reels) va 1:1 (post). Har biri 6 soniya, 1080p 60 fps, ovozi bilan. Qayta
  yaratish: **[tools/brand-video](tools/brand-video/README.md)**.

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

## Kassa smenasi va Z-hisobot

`/shifts` (admin, kassir) — kassir smenani boshlang'ich naqd bilan ochadi, kun oxirida
kassadagi pulni sanab yopadi. Tizim **kutilgan naqdni** (boshlang'ich + naqd tushum −
kassadan chiqim) o'zi hisoblaydi va kamomad/ortiqchani darhol ko'rsatadi. Yopilgan
paytdagi hisobot (to'lov usullari, stollar/bar, chegirmalar, qarzlar, xarajatlar)
muhrlanadi va 80 mm chek ko'rinishida chop etiladi (Z-hisobot; ochiq smena uchun X-hisobot).

- Hisob formulasi **hisobotlar moduli bilan aynan bir xil** (`sales` + `debt_payments`,
  usullar `session_payments` bo'yicha) — smenalar yig'indisi kunlik hisobot bilan mos tushadi.
- Bitta klubda faqat bitta ochiq smena — DB darajasida (qisman unique indeks).
- Ochish/yopish audit jurnaliga yoziladi (`shift.open`, `shift.close`).
- Smena **ixtiyoriy**: ochilmagan bo'lsa ham kassa odatdagidek ishlaydi.

## Belgilangan vaqtli o'yin

O'yinni boshlashda "30 daq / 1 soat / 2 soat / 3 soat" tanlanadi. Stol kartasida qolgan
vaqt ko'rinadi, 5 daqiqa qolganda sariq, tugaganda qizil belgi va **ovozli signal**.
"⋯" menyusidan "+30 daqiqa", "+1 soat" yoki cheklovni olib tashlash mumkin.
Hisob baribir **haqiqiy vaqt bo'yicha soniyalik** — bu faqat kassir uchun ogohlantirish.

### Summa limiti ("50 000 so'mga o'ynayman")

"O'yin vaqti" qatoridagi **Limit** tanlansa, vaqt o'rniga **pul** kiritiladi (yoki stol
narxiga moslangan tez tugmalar: 40 000/soatlik stolda 20 000 · 30 000 · 50 000 · 100 000).
Shu pulga to'g'ri keladigan vaqt darhol ko'rinadi: *"50 000 so'm = 1 soat 15 daqiqa o'yin ·
taxminan 21:45 gacha"*. Stol summasi limitga yetganda xuddi belgilangan vaqtdagidek qizil
"Limit tugadi" belgisi va ovozli signal chiqadi.

- **Qolgan vaqt joriy narxdan** hisoblanadi: o'yin boshqa stolga ko'chirilsa, avvalgi
  stolda o'ynalgan summa limitdan ayiriladi, qolgani yangi stol narxida vaqtga aylanadi.
  Pauzada qolgan vaqt to'xtaydi.
- **O'yin davomida**: "⋯ → Summa limiti…" — "yana 20 mingga" kabi summa qo'shish
  (+10 000 / +20 000 / +30 000) yoki limitni almashtirish; "+30 daqiqa" limitli o'yinda
  joriy narxdagi pul bo'lib limitga qo'shiladi; "Limitni olib tashlash".
- **Chegaralar** (server va klientda bir xil — `session-limit.ts` / `utils/limit.ts`):
  kamida 5 daqiqalik, ko'pi bilan 24 soatlik summa. "50 000" o'rniga "50" terilsa forma
  aniq sabab bilan to'xtatadi. Narxi 0 bo'lgan stolda limit tanlab bo'lmaydi.
- Belgilangan vaqt va summa limiti **bir vaqtda qo'yilmaydi** (DB `CHECK` cheklovi):
  biri qo'yilsa ikkinchisi olib tashlanadi.
- Internetsiz boshlangan o'yinda ham ishlaydi; navbatdagi o'yin yaroqsiz limit tufayli
  hech qachon rad etilmaydi (limitsiz boshlanadi).
- Hisob-kitob oynasida limit va undan qancha oshgani ko'rinadi. Hisob baribir
  haqiqiy vaqt bo'yicha — limit pulni cheklamaydi.

## Stol summasini yaxlitlash

**Sozlamalar → Hisob-kitob → "Stolda yig'ilgan pulni yaxlitlash"** (admin). Stol vaqti
avvalgidek **sekundigacha aniq** hisoblanadi; yoqilganda faqat STOL SUMMASI eng yaqin yaxlit
summaga yaxlitlanadi (yarmi — yuqoriga). 1 000 qadamda: `46 800 → 47 000`,
`46 300 → 46 000`, `46 500 → 47 000`. Qadamlar: 100 / 500 / 1 000 / 5 000.

- **Hamma joyda bir xil summa**: stol kartasi, "Ochiq stollarda" paneli, dashboarddagi faol
  o'yinlar, kassa oynasi, chek, qarz va kassaga yozilgan pul. Bar summasi yaxlitlanmaydi.
- **Qadam o'yinga muhrlanadi** (`sessions.roundingStep`) — barcha kassalar bir xil summani
  ko'radi. Sozlama o'zgartirilsa davom etayotgan o'yinlarga ham darhol qo'llanadi,
  yakunlangan o'yinlar o'zgarmaydi; o'zgarish audit jurnaliga yoziladi
  (`settings.table_rounding`: kim, qachon, nimadan nimaga).
- **Aniq summa yo'qolmaydi**: farq `sessions.tableRounding` da (yaxlit − aniq) saqlanadi va
  kassa oynasida, chekda, o'yinlar tarixida ("aniq 46 913 · +87") hamda hisobotda
  ("Yaxlitlash natijasi") ko'rinadi. Ko'rsatish butun so'mda — chekdagi yig'indi aniq to'g'ri.
- **Chegara holati**: "Yakunlash" bosilgandan server yozguncha taymer yaxlitlash chegarasidan
  o'tib ketsa (46 499 → 46 501), kassir ekranda ko'rgan yaxlit summa yoziladi
  (`expectedTableAmount`, 2 daqiqalik oyna) — kassadagi pul ekrandagi bilan bir xil.
- **Summa limiti** aniq summa bo'yicha qoladi — mijoz kelishgan pulning to'liq vaqtini o'ynaydi.
- Internetsiz ham ishlaydi: oflayn boshlangan o'yinga sozlamadagi qadam muhrlanadi.
- Formula server va klientda aynan bir xil: `server/src/common/money/table-rounding.ts` va
  `client/src/utils/rounding.ts` (ikkala tomonda bir xil test jadvali).

## Stollar paneli

- **Haqiqiy stol ko'rinishi** — har bir karta yog'och bortli, cho'ntakli billiard stoli:
  bo'sh stol xira (chiroq o'chiq), band stol yorug' (chiroq yoniq), pauza — o'rtacha.
- **Zonalar** — "Stollarni boshqarish"da stolga zona yoziladi (masalan, *VIP*,
  *Rus bilyardi*, *Pul*); panel stollarni zona bo'yicha guruhlaydi. Zonasizlar oxirida.
- **Jonli pul paneli** — ochiq stollardagi kutilayotgan summa har soniyada yangilanadi
  (stol kartasidagi formula bilan bir xil); kassir/admin uchun ochiq smenaning tushumi
  va kassadagi naqd ham shu yerda.
- **Bron belgisi** — keyingi 6 soatdagi tasdiqlangan/kutilayotgan bron stol kartasida
  vaqt va mijoz nomi bilan ko'rinadi.

Dizayn tizimi: `client/src/theme/tokens.ts` (yagona manba) va `client/src/index.css`
dagi CSS o'zgaruvchilar. Ranglar — billiard movuti yashili, yong'oq yog'och,
latun-oltin va fil suyagi (matn kontrasti WCAG AA: barcha matn ranglari kartalarda ≥ 4.5:1);
shriftlar — Unbounded (logo va ilova sarlavhalari), Onest (matn va landing sarlavhalari) va
JetBrains Mono (taymerlar), hammasi o'z serverdan (`@fontsource`), tashqi CDN'siz.

**Logo** — "B" monogrammasi: tik turgan kiy (harf o'zagi) va unga tegib turgan ikki fil
suyagi shar (harf qorinlari), chiroq yoritgan mato ustida. Bitta geometriya uch joyda:
`client/public/favicon.svg`, `BrandLogo.tsx` va `desktop/build/make-icons.mjs` (`MARK`) —
`npm run icons` Windows, PWA va Android ikonkalari hamda splash ekranlarni qayta chizadi.
Ijtimoiy tarmoq va qidiruv bannerlari (`og-cover.png`, `og-cover-ru.png`), `favicon.ico` va
kvadrat logotip `tools/brand-video/banners.cjs` bilan yasaladi (haqiqiy dastur ekrani bilan).

Landingni tizimga kirgan holda ko'rish: `/?landing`.

## Dizayn: och va qorong'i rejim

Butun loyihada ikkita rejim bor. Ular landing header'idagi, ilova header'idagi va kirish
sahifasidagi oy/quyosh tugmasi bilan almashadi. Tanlov `localStorage` dagi `bc.theme`
kalitida saqlanadi va boshqa oynalar bilan sinxronlanadi. Standart rejim — och.

- **Och ("fil suyagi")** — iliq qog'oz fon, siyoh rang matn, xira jez urg'u. Asosiy tugmalar mato
  yashilida.
- **Qorong'i ("tungi zal")** — neytral ko'mir rang. Qatlamlar (sahifa, karta, ko'tarilgan qatlam,
  hover) va chegaralar aniq ajralib turadi, yashil mato kartalar fonga qorishib ketmaydi. Asosiy
  tugmalar jez rangida.
- **Shrift:** ilovada sarlavhalar, raqamlar va tugmalar — logodagi **Unbounded**; uzun matnlar — **Onest**.
  Landingda sarlavha va tugmalar vazmin **Onest** (zich harf oralig'i bilan), Unbounded esa faqat
  logotip va kichik ustki yozuvlarda; demo oynalar ilovaning o'z shriftini saqlaydi.

**Qanday ishlaydi.** Ranglarning yagona manbasi — `client/src/theme/tokens.ts` (`PALETTES`).
`TOKENS.color.*` qiymatlari CSS o'zgaruvchilari (`var(--bg1)` …), shuning uchun inline uslublar,
CSS va SVG/grafiklar rejimga o'zi moslashadi. Rejimni `applyTheme()` qo'llaydi, antd mavzusini esa
`buildAntdTheme(mode)` quradi. Sahifa noto'g'ri rangda chaqnab qolmasligi uchun `index.html`
dagi erta skript rejimni CSS yuklanishidan oldin qo'llaydi.

Canvas (billiard stoli, o'yin) va logotip har doim o'zgarmas `BRAND` ranglarida chiziladi: stol
och rejimda ham stol bo'lib qoladi.

### Landing

- **Bo'limlar:** oddiy bo'limlar rejim fonida turadi, mahsulot ko'rsatiladigan qismlar (jonli
  demo, jonli sahnalar, imkoniyatlar, yakuniy CTA, footer) esa to'q mato-yashil "sahna"da. Qorong'i rejimda
  oddiy bo'limlar ko'mir rangda, sahnalar esa mato yashilida qoladi, ikkalasi bir-biridan aniq
  ajraladi. Fayllar: `client/src/pages/landing/theme.tsx` va `tones.css`.
- **Header:** tepada keng; pastga tushganda kapsulaga aylanadi (so'z belgisi yig'ilib, faqat "B"
  belgisi qoladi) va to'q sahna ustida o'zi qorong'ilashadi. Faol bo'lim kichik shar bilan
  belgilanadi. 1280px dan tor ekranda ikkinchi darajali havolalar yashiriladi, 1080px va undan
  torda — to'liq ekranli menyu. Har bir o'zgarishdan keyin header 1024–1920px da ikkala tilda
  tekshirilishi kerak (ruscha matn uzunroq).
- **Scroll animatsiyalari** (`Hero.tsx`, `Statement.tsx`, `scrollMotion.tsx`, `shared.tsx`, `theme.tsx`):
  - hero (kompyuter/planshet, 768px+ va 600px+ balandlik): sarlavha joyida qotadi, stol ekran
    pastidan 3D egilgan holda ko'tarilib uning ustiga chiqadi, so'ng atrof xiralashib stol ustida
    lampa yonadi; telefonda — oddiy oqim;
  - bo'lim sarlavhalari so'zma-so'z niqob ostidan ko'tariladi (`RevealWords`);
  - kartalar chuqurlikdan egilib chiqadi (`riseCard`), ikki ustunli bo'limlar yonlardan kiradi;
  - to'q sahna kirishda yumaloq kartadan butun kenglikka kengayadi, chiqishda torayadi;
  - bayonot matni so'zma-so'z yorishib ko'tariladi; demo oynasi "yotgan" holatdan tekislanadi.
- **Billiard stoli** (`components/ui/billiard/render.ts`): uch qalpoqli lampa — matoda uchta
  yorug' "ko'l", har shar uchta yumshoq soya va uchta yaltiroq aks; jez yoqali to'rli teshiklar,
  bortlarda lak yaltirog'i, mato tolasi. Soya va akslar oldindan chizilgan sprite — telefonda ham
  60 kadr.

  Hammasi faqat transform/opacity bilan ishlaydi va "Harakatni kamaytirish" yoqilganda o'chadi.
- **Kalkulyator** (`RoiCalculator.tsx`): yo'qotish to'rt manbaga bo'linadi (yozilmagan o'yin,
  yaxlitlash, bar, qarz), har biri — tegishli tushumdan o'zgartiriladigan foiz. Stollar soniga
  mos tarif (limitlar va narx — jonli tarif sozlamasidan) bilan solishtiriladi: sof foyda, o'zini
  oqlash kuni, qaytim va zararsizlik nuqtasi. Tizim yo'qotishning qanchasini to'xtatishini
  (30/50/80%) foydalanuvchi o'zi tanlaydi — natija "taxminiy" deb yoziladi, va'da emas.

## SEO

Landing ikki manzilda: `/` o'zbekcha, `/ru/` ruscha. Build paytida `client/vite-plugin-seo.ts`
har ommaviy sahifa uchun alohida HTML yasaydi:

- sarlavha, tavsif, canonical va hreflang;
- Open Graph va JSON-LD (tashkilot, dastur, tariflar, savol-javob);
- JavaScript ishlatmaydigan botlar uchun to'liq matn;
- `sitemap.xml`.

Ish joyi va admin sahifalari `noindex`. Ma'lumotlar bitta joyda: `client/src/seo/site.ts`.
Search Console, Yandex.Webmaster va keyingi qadamlar: **[docs/SEO.md](docs/SEO.md)**.

- **Qidiruv va ulashish matnlari alohida:** qidiruv sarlavhasi (`metaTitle`) brend va so'rovlar
  uchun ("Billiard Club — bilyard klub boshqaruv tizimi…"), Telegram/Facebook ko'rinishi
  (`ogTitle`, `ogDescription`) — hero shiori bilan. Brendning boshqa yozilishlari
  (`SITE_ALT_NAMES`: Bilyard Club, BilliardClub) JSON-LD `alternateName` da.
- **Bannerlar** (`og-cover.png`, `og-cover-ru.png`, 1200×630) saytning o'zidan yasaladi: shior
  tarjimalardan, stol — landingdagi haqiqiy canvas:
  `desktop/node_modules/.bin/electron tools/brand-video/banners.cjs --url=http://localhost:5173`.
  Rasm yangilanganda `OG_VERSION` ni oshiring — Telegram eski rasmni keshdan ko'rsatmaydi;
  deploy'dan keyin @WebpageBot ga sayt manzilini yuborib, havola ko'rinishini yangilang.

## Landing arizalari (savdo voronkasi)

Landing'dagi "Bepul konsultatsiya" formasi `POST /api/public/leads` ga yuboriladi:
ariza `leads` jadvaliga yoziladi va platforma egasiga **Telegram** orqali keladi
(*Sozlamalar → Telegram hodisalari → Yangi ariza*). Telegram sozlanmagan bo'lsa ham
ariza yo'qolmaydi — superadmin panelida **Arizalar** (`/admin/leads`) bo'limida
holat (yangi → bog'lanildi → mijozga aylandi / rad etildi) va ichki izoh bilan yuritiladi.
Spam himoyasi: IP bo'yicha soatiga 5 ta, honeypot maydon, bir raqamdan 10 daqiqa ichidagi
takroriy ariza yangi qator yaratmaydi.

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
npm test              # server va klient testlari
npm run test:integration # alohida vaqtinchalik PostgreSQL bazasida sinov himoyasi
```

Testlar sinov huquqi va pul hisoblash mantiqini tekshiradi:

- `server/test/` — Telegram tasdiqlashi, telefon/Telegram uchun bir martalik
  sinov, parallel registratsiya, tranzaksiya rollbacki va eski telefonlar tarixi.
  Integratsiya runneri ilovaning `.env` yoki haqiqiy bazasidan foydalanmaydi:
  mahalliy PostgreSQL binarlari bilan yangi vaqtinchalik bazani yaratadi va yopadi.
  CI uchun `TEST_POSTGRES_URL` alohida test PostgreSQL serverini ko'rsatadi.

- `server/test/plan-tiers.test.ts` va `06-plan-tiers.postgres.test.cjs` — tarif darajalari:
  yuqori daraja quyisidan kam bo'lmasligi, bar va buyurtmalar alohidaligi, yopiq bo'lim,
  7-stol va xodim qo'shish (faqat VIP; yoqilsa soni cheklanadi) rad etilishi, shartnoma darajani o'rnatishi. `client/src/utils/tiers.test.ts` — oyiga narx
  va tejash (buyurtmachi narxlari bilan), admin jadvali qoidasi; `tiers.sync.test.ts` —
  klient zaxirasi server standartidan uzoqlashmasligi.
- `client/src/utils/session.test.ts` — sessiya taymeri va summasi: pauza,
  transfer (segmentlar), kumulyativ yaxlitlash, muhrlangan narx. Bu fayl
  serverdagi `billSegments` formulasining nusxasi bo'lgani uchun har bir
  invariant testda muhrlangan.
- `server/test/session-limit.test.ts`, `08-session-limit.postgres.test.cjs` va
  `client/src/utils/limit.test.ts` — summa limiti: narx bo'yicha vaqtga aylantirish,
  chegaralar (server va klient bir xil), boshlash/o'zgartirish/ko'chirish/yakunlash,
  oflayn navbatdagi o'yin rad etilmasligi, DB cheklovlari; `session.test.ts` da
  ko'chirilgan o'yinning qolgan vaqti va "tugadi" payti chekdagi summa bilan mosligi.
- `client/src/offline/overlay.test.ts` — oflayn amallarning ekranda
  ko'rsatilishi: dublikat bo'lmasligi, pauza vaqti, bar summasi, xato
  yozuvning qoplanmasligi, oflayn hisob-kitobdan keyin stolning bo'shashi.
- `server/test/03-offline-checkout.postgres.test.cjs` — oflayn hisob-kitob: summa
  "Yakunlash" bosilgan paytga hisoblanadi, boshqa kassadagi bar farqi navbatni
  to'xtatmaydi (olingan pul yoziladi, farq belgilanadi), onlayn 409 himoyasi saqlanadi,
  vaqt chegaralanadi.
- `server/test/02-lights.postgres.test.cjs` — bridge vazifa navbati (bo'sh navbatda
  soxta vazifa yo'q), `returning-rows.test.ts` — `UPDATE ... RETURNING` shakli.
- `client/src/components/ui/billiard/physics.test.ts` — landing billiardi fizikasi:
  impuls saqlanishi, sharlar bir-biriga kirmasligi, energiya kamayishi, sirpanish→dumalash,
  bort qaytishi, cho'ntak va jag'.
- `client/src/api/gateway.test.ts` (proksi 5xx = aloqa yo'q), `client/src/utils/version.test.ts`
  (APK yangilanishi), `bridge/test/control.test.cjs` (javobsiz rele — bitta urinish),
  `desktop/test/offline.test.cjs` (oflayn ekran — ekranlash va avtomatik qayta ulanish).

## Yangi versiyani chiqarish (deploy) tartibi

1. `npm run typecheck && npm test && npm run build`
2. **`npm run migrate`** — MAJBURIY. Kutilayotgan migratsiyalar:
   `RefreshSessionAndOrderIndexes`, `IdempotencyKeys`, `DebtWriteOff`, `TrialClaims`,
   `TrialTelegramVerification`, `Leads`, `CashShifts`, `SessionPlannedMinutes`,
   `TableZones`, `AndroidReleases`, `TierPlans`, `ClubBlockReason`, `SessionLimitAmount`,
   `LightDriversLocalHub`, `TableRounding`, `OwnerTelegram` va `OwnerTelegramIntro`.
   Ularsiz qarzni hisobdan chiqarish, yangi foydalanuvchini ro‘yxatdan o‘tkazish,
   landing arizalari, kassa smenalari, belgilangan vaqtli o‘yin, stol zonalari,
   Android relizlari, tarif darajalari, blok sababi, summa limiti, chiroq markazi va
   stol summasini yaxlitlash ishlamaydi. `TierPlans` dan keyin hamma
   mavjud klublar **VIP** bo'ladi — hech kimning bo'limi to'satdan yopilmaydi
   ([docs/TARIFFS.md](docs/TARIFFS.md)).
3. Chiroqning `DIRECT` rejimidan foydalanadigan klub bo'lsa —
   `LIGHTS_DIRECT_ALLOWED_CIDRS` ni to'ldiring (pastdagi izohga qarang),
   aks holda DIRECT rejim ishlamaydi. `BRIDGE` rejimi ta'sirlanmaydi.
4. Serverni qayta ishga tushiring.
5. Ommaviy registratsiya uchun [Telegram tekshiruv botini sozlang](docs/TRIAL-PROTECTION.md).
6. Klub egalari hisobotlari mavjud botda ishlaydi — `.env` ga hech narsa qo'shish
   shart emas. Deploy'dan keyin
   `npm --prefix server run owner:telegram:setup -- https://API_DOMEN` ni bir marta ishga
   tushiring: u buyruqlar menyusini va tavsifni o'rnatadi
   ([docs/TELEGRAM-BOT.md](docs/TELEGRAM-BOT.md)).

## Production eslatmalari

- `server/.env` git'ga kirmaydi; kuchli `JWT_SECRET`/`JWT_REFRESH_SECRET` qo'ying:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- Eski git tarixida oldingi dev sirlari bor — ular almashtirilgan, lekin repo ommaviy bo'lsa tarixni tozalash tavsiya etiladi.
- Reverse proxy (nginx/Caddy) ortida TLS bilan ishga tushiring; `trust proxy` allaqachon sozlangan.
- Sayt sahifalariga xavfsizlik sarlavhalari (CSP, HSTS, clickjacking himoyasi) nginx'da qo'yiladi:
  [deploy/nginx/README.md](deploy/nginx/README.md). Oxirgi audit tahlili: [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md).
- `SEED_DEMO_CLUB=false` bo'lsin; superadmin parolini kuchli qiling.
- PostgreSQL uchun muntazam backup (pg_dump) sozlang — bu klublarning moliyaviy ma'lumotlari.

Desktop va telefon ilovasi, oflayn obuna chegaralari va tekshirish: [DESKTOP-MOBILE-SECURITY.md](docs/DESKTOP-MOBILE-SECURITY.md).
