# Klub egasi uchun Telegram bot

Klub egasi klubda bo'lmasa ham hammasini bilib turadi. Bot uch narsani qiladi:

1. **Kunlik hisobot**: har kuni belgilangan soatda (standart 09:00, klub vaqti bo'yicha)
   kechagi kun hisobotini yuboradi.
2. **Darhol xabarlar**: pul bilan bog'liq muhim amal bajarilgan zahoti xabar beradi.
3. **Buyruqlar**: egasi istalgan payt `/bugun`, `/hozir`, `/hafta` bilan holatni so'raydi.

Raqamlar ilovadagi **«Hisobotlar»** sahifasi bilan bir xil manbadan olinadi
(`ReportsService.getReport`). Shu sababli Telegramdagi tushum ilovadagi tushumga aynan teng.

**Yangi bot shart emas.** Platformaning mavjud boti ishlatiladi — egalar saytda ro'yxatdan
o'tayotganda telefonini tasdiqlash uchun aynan shu botga Start bosadi. Shuning uchun:

- yangi ega ro'yxatdan o'tishi bilan uning Telegrami klubga **avtomatik ulanadi**;
- avval ro'yxatdan o'tgan egalar ham bir marta avtomatik ulanadi (6-bo'lim);
- platforma xabarlari (yangi klub, to'lov va h.k.) avvalgidek faqat sizning guruhingizga
  (`TELEGRAM_CHAT_ID`) boradi. Egalar faqat o'z klubi haqidagi xabarni oladi.

---

## 1. Egasi nimani oladi

### Kunlik hisobot (kechagi kun, 00:00–23:59)

| Qator | Mazmuni | Tarif sharti |
|---|---|---|
| 💰 Tushum | Haqiqatda olingan pul (hisob-kitob + qarz to'lovlari), naqd / karta / o'tkazma | hammaga |
| ▲/▼ taqqoslash | O'tgan haftaning shu kuniga nisbatan, foizda | «Hisobotlar» |
| 🎱 O'yinlar | Soni, o'rtacha va jami vaqt; stol va bar tushumi | hammaga |
| 🏷 Chegirmalar | Kun davomida berilgan chegirmalar jami | hammaga |
| 🏆 Eng band stollar | Eng ko'p o'ynalgan 3 ta stol | «Hisobotlar» |
| 🍺 Bar TOP | Eng ko'p sotilgan 3 ta mahsulot | «Hisobotlar» + «Bar» |
| 👥 Kassada | Qaysi xodim qancha pul oldi (hisob-kitoblar soni bilan) | «Hisobotlar» |
| 💸 Xarajat / Foyda | Kun xarajatlari va foyda | «Xarajatlar» |
| 📒 Qarz | Yangi yozilgan va undirilgan qarz; jami qarzdorlik, muddati o'tganlar soni | «Qarzlar» |
| 🧾 Smena | Yopilgan smenalar: vaqti, kim yopgani, kassa farqi | «Smena» |
| ⚠️ Bekor qilingan o'yinlar | Soni, o'chirilgan summa va kim bekor qilgani | hammaga |
| 💡 Chiroqlar | Nechta rele ishlayapti / javob bermayapti | «Chiroq» (rejim yoqilgan) |
| ⏳ Obuna | Obuna tugashiga 7 kun yoki undan kam qolganda eslatma | hammaga |

Qo'shimcha bloklar (sozlamada o'chirib qo'yish mumkin):

- **Dushanba** kungi hisobotga o'tgan hafta yakuni qo'shiladi: tushum, oldingi haftaga
  nisbatan o'zgarish, o'yinlar soni va foyda.
- **Oyning 1-kuni**gi hisobotga o'tgan oy yakuni qo'shiladi.

### Darhol xabarlar

Har bir chat uchun alohida yoqiladi yoki o'chiriladi.

| Tur | Qachon keladi | Standart |
|---|---|---|
| `cancel` | O'yin yoki bar buyurtmasi bekor qilinsa. Xabarda kim bekor qilgani, stol, o'yin davomiyligi, o'chirilgan summa va sababi bo'ladi | yoqiq |
| `discount` | Chegirma berilsa yoki hisobga qo'lda tuzatish kiritilsa | yoqiq |
| `shift` | Smena ochilsa, yoki yopilsa. Yopilganda: yig'ilgan pul, to'lov usullari, kutilgan va sanalgan naqd, **kamomad/ortiqcha** | yoqiq |
| `debt` | Qarz hisobdan chiqarilsa | yoqiq |
| `prices` | Stolning soatlik narxi yoki mahsulot narxi o'zgartirilsa | yoqiq |
| `stock` | Ombor qoldig'i qo'lda o'zgartirilsa | o'chiq (tez-tez bo'ladi) |

Egasining **o'zi** bajargan amali haqida uning shaxsiy chatiga xabar kelmaydi. Guruhga esa
keladi, chunki sheriklar ko'rishi kerak.

### Buyruqlar

| Buyruq | Javobi |
|---|---|
| `/hisobot` | Kechagi kunlik hisobot |
| `/bugun` | Bugun hozirgacha |
| `/hozir` | Hozir qaysi stollar band: vaqt, joriy summa (kassadagi chek bilan bir xil hisob) va mijoz |
| `/hafta` | So'nggi 7 kun: tushum, oldingi haftaga nisbatan, kunlar bo'yicha ustunlar |
| `/stop` | Xabarlarni to'xtatish (`/start` bosilsa qayta yoqiladi) |

## 2. Egasi qanday ulaydi

**Avtomatik (asosiy yo'l).** Saytda ro'yxatdan o'tishda ega botga Start bosib, telefonini
tasdiqlaydi. Ro'yxatdan o'tish tugashi bilan bot unga «🎉 Klub ro'yxatdan o'tdi» xabarini
yuboradi, ertasi kuni ertalab esa birinchi kunlik hisobot keladi. Egaga hech narsa qilish
shart emas.

**Qo'lda (qo'shimcha chat, sherik yoki guruh uchun):**

1. Ilovada **Boshqaruv → Telegram bot** bo'limini oching. Bo'lim faqat klub egasiga
   (admin) ko'rinadi; kassir va operator uni ko'rmaydi, serverda ham yopiq.
2. **«Telegram'ni ulash»** tugmasini bosing. QR kod va bir martalik havola chiqadi
   (15 daqiqa amal qiladi).
3. Telefon kamerasi bilan QR kodni skanerlang, Telegram'da **Start** ni bosing.
4. Ilovadagi oynada **«Ulandi»** chiqadi va bot salomlashuv xabarini yuboradi.

**Sheriklar guruhi** uchun oynadagi «Sheriklar guruhiga qo'shish» havolasini bosing:
botni guruhga qo'shasiz va hisobotni guruhdagi hamma ko'radi. Bitta klubga ko'pi bilan
10 ta chat ulash mumkin.

Har chat sozlamalari (o'zgarish darhol saqlanadi):

- kunlik hisobot (yoqish / o'chirish) va yuborish vaqti;
- hafta va oy yakuni bloklari;
- til (o'zbekcha / ruscha);
- darhol xabar turlari.

Har chatda yana:

- «Sinov xabari» tugmasi;
- «Hozir yuborish» tugmasi (kechagi hisobot, bugun, 7 kun yoki hozirgi holat);
- chatni o'chirish tugmasi.

Sahifaning o'ng tomonida **hisobot namunasi** turadi. U Telegram'dagi ko'rinishning o'zi,
klubning haqiqiy raqamlari bilan.

## 3. Platformada sozlash (bir marta)

### Standart: mavjud bot (tavsiya etiladi)

Ro'yxatdan o'tish boti (`TRIAL_TELEGRAM_BOT_TOKEN`, bo'lmasa `TELEGRAM_BOT_TOKEN`,
`TRIAL_TELEGRAM_BOT_USERNAME`, `TRIAL_TELEGRAM_WEBHOOK_SECRET`) allaqachon sozlangan bo'lsa,
yangi bot ham, yangi `.env` qiymati ham kerak emas. `OWNER_TELEGRAM_*` bo'sh qoladi.

1. Deploy qiling. Tartib: `npm run migrate` (migratsiyalar: `OwnerTelegram`,
   `OwnerTelegramIntro`), keyin serverni qayta ishga tushirish.
2. Server papkasida bir marta ishga tushiring:
   ```
   npm run owner:telegram:setup -- https://SIZNING-API-DOMENINGIZ
   ```
   Skript quyidagilarni bajaradi:
   - webhook manzilini o'zgartirmaydi (ro'yxatdan o'tish marshruti qoladi);
   - unga `my_chat_member` hodisasini qo'shadi — ega botni bloklasa, ilovada darhol
     ko'rinadi;
   - buyruqlar menyusini (uz/ru) va botning umumiy tavsifini o'rnatadi.
3. Ilovada «Telegram bot» bo'limini oching — o'zingizning chatingiz ko'rinadi (agar siz
   ham saytda ro'yxatdan o'tgan bo'lsangiz). «Sinov xabari»ni bosib tekshiring.

Webhook bitta: Telegram yuborgan har bir yangilanish server ichida ikkiga ajratiladi.
Telefonni tasdiqlash (`/start trial_…` va kontakt) ro'yxatdan o'tish xizmatiga boradi.
Klub egasi buyruqlari, guruhlar va botni bloklash esa hisobot xizmatiga boradi.

### Ixtiyoriy: alohida bot

Egalar uchun alohida bot kerak bo'lsa, quyidagilarni bajaring:

1. [@BotFather](https://t.me/BotFather) da yangi bot yarating.
2. `.env` ga `OWNER_TELEGRAM_BOT_TOKEN`, `OWNER_TELEGRAM_BOT_USERNAME` va
   `OWNER_TELEGRAM_WEBHOOK_SECRET` ni yozing.
3. Yuqoridagi buyruqni ishga tushiring — u alohida botga o'z webhookini o'rnatadi.

Bu rejimda avtomatik ulash ishlamaydi: ega u botga hech qachon Start bosmagan. Egalar
ilovadagi QR orqali ulanadi.

## 4. Nosozliklar

| Belgi | Sabab va yechim |
|---|---|
| Chat holati **«Bot bloklangan»** | Egasi botni bloklagan yoki bot guruhdan chiqarilgan. Telegram'da botni ochib `/start` bosing, yoki chatni o'chirib qayta ulang |
| **«To'xtatilgan»** | `/stop` bosilgan. `/start` bosilsa qayta yoqiladi |
| Hisobot kelmadi | Klub vaqt mintaqasini tekshiring (Sozlamalar). Obuna faol bo'lishi kerak: muddati tugagan yoki bloklangan klubga hisobot ketmaydi. Chatda «Oxirgi xato» ko'rinadi |
| «Havola eskirgan» | Havola 15 daqiqa va bir marta amal qiladi. Ilovadan yangisini oling |
| Bo'lim «bot hali sozlanmagan» deydi | Ro'yxatdan o'tish boti sozlanmagan: `TRIAL_TELEGRAM_BOT_USERNAME`, `TRIAL_TELEGRAM_WEBHOOK_SECRET` va token (`TRIAL_TELEGRAM_BOT_TOKEN` yoki `TELEGRAM_BOT_TOKEN`) |
| Yangi ega avtomatik ulanmadi | Ega telefonini bot orqali tasdiqlaganini tekshiring (ro'yxatdan o'tishning majburiy qadami). Alohida bot (`OWNER_TELEGRAM_*`) sozlangan bo'lsa, avtomatik ulash o'chadi |
| Setup skripti «Server webhooki tayyor emas» deydi | Deploy va migratsiyani, HTTPS/nginx va `.env` dagi `OWNER_TELEGRAM_*` qiymatlarini tekshiring |

## 5. Texnik tafsilotlar

- **Bot tanlash** (`owner-bot.config.ts`):
  - `OWNER_TELEGRAM_*` bo'sh bo'lsa, ro'yxatdan o'tish boti ishlatiladi (`shared: true`);
  - bu holatda webhook tekshiruvi ham ro'yxatdan o'tish siri bilan bo'ladi;
  - yangilanishlarni `isOwnerUpdate` ajratadi, controller esa
    `public.controller.ts` → `trialTelegramWebhook`.
- **Ro'yxatdan o'tishda ulash** — `PublicService.register` ichida, klub va admin bilan bitta
  tranzaksiyada:
  - chat ID — telefonini tasdiqlagan Telegram akkaunti
    (`TrialVerificationService.claimedTelegramUser`);
  - ulash bo'lmasa, ro'yxatdan o'tish ham bekor bo'ladi (va aksincha);
  - salomlashuv tranzaksiyadan keyin, kutmasdan yuboriladi.

- **Modul**: `server/src/modules/owner-telegram/`.
- **Bir marta yuborish**:
  - cron har daqiqa ishlaydi, `withCronLock` bilan, shuning uchun ko'p instansiyada ham bitta ishga tushadi;
  - `lastReportDate` (klub sanasi) faqat xabar yuborilgandan keyin yoziladi, shuning uchun server o'chib qolsa, qaytgach o'sha kun hisoboti baribir boradi;
  - vaqtinchalik xatoda 5 marta qayta urinadi.
- **Darhol xabarlar**:
  - `AuditService.subscribe` orqali keladi, ya'ni audit jurnaliga yoziladigan hodisalardan;
  - boshqa modullar bu modulga bog'lanmaydi;
  - xabar xatosi kassa oqimini hech qachon to'xtatmaydi.
- **Xavfsizlik**:
  - ulash tokenining faqat SHA-256 hash'i saqlanadi; u bir martalik va 15 daqiqalik;
  - webhook `X-Telegram-Bot-Api-Secret-Token` bilan tekshiriladi;
  - boshqaruv API'si (`/api/owner-telegram`) faqat `admin` roliga ochiq;
  - havola yaratish, sinov va «hozir yuborish» soatlik limitlangan.
- **Telegram cheklovlari**:
  - bitta chatga xabarlar ketma-ket va orasida pauza bilan yuboriladi;
  - 429 javobida kutib, qayta yuboriladi;
  - guruh supergroup'ga aylanganda yangi ID avtomatik saqlanadi;
  - 4096 belgidan uzun xabar qatorlar chegarasida bo'linadi.
- **Testlar**:
  - `server/test/owner-telegram.test.ts` — matnlar, formatlar, API xatolari, bot tanlash va
    yangilanishlar taqsimoti;
  - `server/test/15-owner-telegram-autolink.postgres.test.cjs` — ro'yxatdan o'tishda ulash,
    alohida bot rejimi, eski egalarni ulash va tanishtiruv;
  - `server/test/owner-telegram-setup.test.ts` — sozlash skripti;
  - `server/test/14-owner-telegram.postgres.test.cjs` — to'liq oqim haqiqiy Postgres bilan.

## 6. Avval ro'yxatdan o'tgan egalar

Server yangi versiya bilan birinchi marta ishga tushganda (faqat mavjud bot rejimida), bir
marta va avtomatik ravishda, saytda o'zi ro'yxatdan o'tgan barcha egalar ulanadi.

- **Bog'lash usuli.** Ro'yxatdan o'tishda klub, tasdiqlangan telefon (`trial_claims`) va
  Telegram akkaunti (`telegram_trial_claims`) bitta tranzaksiyada yoziladi. Shuning uchun
  ularning vaqt belgisi aynan bir xil. Klub shu vaqt bilan **va** telefon raqami bilan
  bog'lanadi. Bitta vaqtga bir nechta akkaunt to'g'ri kelsa, klub ulanmaydi.
- **Kim ulanmaydi.** Superadmin qo'lda yaratgan klublar (telefon tasdig'i yo'q). Ular QR
  orqali ulanadi.
- **Birinchi xabar.** Ulangan egaga birinchi kunlik hisobotdan oldin qisqa tanishtiruv
  boradi: bot nima uchun yozayotgani va `/stop` bilan to'xtatish mumkinligi. Hisobot
  keyingi ertalab soat 09:00 da keladi (klub vaqti bo'yicha).
- **Faqat bir marta.** Ish bajarilgani `platform_settings` (`owner_telegram_autolink_v1`)
  ga yoziladi. Ega chatni ilovadan o'chirsa, u qayta paydo bo'lmaydi.
- **Ko'p instansiya.** Bir nechta server nusxasi bo'lsa ham, ishni faqat bittasi bajaradi
  (`withCronLock`).
