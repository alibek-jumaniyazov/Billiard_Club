# Bepul sinovni qayta olishdan himoya

Ommaviy ro‘yxatdan o‘tishda bepul muddat faqat **birinchi marta tasdiqlangan telefon raqami va Telegram hisobiga** beriladi. Foydalanuvchi saytdagi tekshiruv tugmasidan botga o‘tadi va botdagi telefonni yuborish tugmasini bosadi. Server kontakt egasi aynan xabar yuborgan Telegram foydalanuvchisi ekanini tekshiradi. Begona kontaktni jo‘natish tasdiqlash hisoblanmaydi.

Bu oqim pullik SMS servisidan foydalanmaydi. Telegram botining oddiy kontakt so‘rovi ishlatiladi; Telegram Premium talab qilinmaydi. Telegram [kontakt tugmasi](https://core.telegram.org/bots/api#keyboardbutton) shaxsiy chatda telefonni yuboradi, [Contact](https://core.telegram.org/bots/api#contact) esa kontakt egasining `user_id` qiymatini taqdim etadi.

## Bir marta sozlash

1. [@BotFather](https://t.me/BotFather) orqali alohida bot yarating. Bot username va tokenini oling. Alohida bot mavjud xabarnoma yoki boshqa xizmat webhookiga ta’sir qilmaydi.
2. `server/.env` fayliga quyidagi qiymatlarni kiriting. Token va webhook sirini Git, klient kodi, skrinshot yoki chatga qo‘ymang:

   ```dotenv
   TRIAL_TELEGRAM_BOT_TOKEN=BOTFATHER_BERGAN_TOKEN
   TRIAL_TELEGRAM_BOT_USERNAME=sizning_trial_bot
   TRIAL_TELEGRAM_WEBHOOK_SECRET=32_256_BELGILI_TASODIFIY_SIR
   ```

   Username `@` belgisiz yoziladi. `TRIAL_TELEGRAM_BOT_TOKEN` bo‘sh bo‘lsa, server mavjud `TELEGRAM_BOT_TOKEN` qiymatidan foydalanadi. Username va webhook siri baribir kerak. Mavjud botga boshqa dastur `getUpdates` orqali ulangan bo‘lsa, alohida bot yarating: webhook va polling bir vaqtda ishlamaydi.

   Webhook siri 32–256 ta `A-Z`, `a-z`, `0-9`, `_`, `-` belgisidan iborat bo‘lishi kerak. Uni mahalliy terminalda yarating va `.env` ga saqlang:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. PostgreSQL nusxasini oling, yangi kod va migratsiyalarni o‘rnating. Loyiha ildizidan:

   ```bash
   npm ci --prefix server
   npm ci --prefix client
   npm run typecheck
   npm test
   npm run build
   npm run migrate
   ```

   `TrialClaims1784248400000` va `TrialTelegramVerification1784248500000` migratsiyalari bajarilgan bo‘lishi kerak. Production faqat yig‘ilgan server bilan ishlasa, `server/` ichida `npm run migration:run:prod` ishlating. Migratsiyalarni qaytarish sinov tarixi jadvallarini o‘chiradi; oddiy kod rollbacki uchun bu jadvallarni o‘chirmang.

4. Serverni yangi `.env` qiymatlari bilan qayta ishga tushiring. Reverse proxy TLS sertifikati bilan ochiq bo‘lsin va quyidagi manzilni serverga yo‘naltirsin:

   ```text
   https://sizning-domen.uz/api/public/trial-verification/telegram/webhook
   ```

5. `server/` ichida webhookni sozlang:

   ```bash
   npm run trial:telegram:setup -- https://sizning-domen.uz
   ```

   Faqat saytning HTTPS origin manzilini kiriting, `/api` yoki boshqa path qo‘shmang. Buyruq botni va username qiymatini tekshiradi, serverdagi webhook manziliga maxfiy sarlavhali bo‘sh so‘rov yuborib tayyorligini tekshiradi, keyin webhookni o‘rnatadi va natijani Telegramdan qayta o‘qiydi. Bo‘sh tekshiruv foydalanuvchiga xabar yubormaydi. Username bo‘sh yoki xato bo‘lsa, to‘g‘ri `.env` qiymatini ko‘rsatib to‘xtaydi. Server tekshiruvi muvaffaqiyatsiz bo‘lsa yoki boshqa URLga webhook o‘rnatilgan bo‘lsa, webhook o‘zgartirilmaydi. Boshqa xizmat ishlatayotgan bot uchun alohida bot yarating. Navbatdagi Telegram xabarlari ataylab o‘chirilmaydi.

Webhook so‘rovlari maxfiy `X-Telegram-Bot-Api-Secret-Token` sarlavhasi bilan tekshiriladi; [Telegram setWebhook hujjati](https://core.telegram.org/bots/api#setwebhook) bu mexanizmni belgilaydi. Reverse proxy sarlavhani saqlashi kerak. Sirni o‘zgartirsangiz, serverni qayta ishga tushiring va sozlash buyrug‘ini qayta bajaring.

**Token, username yoki webhook siri yetishmasa, tasdiqlanmagan ro‘yxatdan o‘tish ochilmaydi.** Mavjud foydalanuvchilar oddiy login orqali ishlashda davom etadi. Faqat kodni yangilash bot webhookini avtomatik o‘rnatmaydi.

## Qaysi holatlar yopiladi

- Yangi login, klub nomi, brauzer yoki IP bilan bir xil telefon yoxud Telegram hisobidan ikkinchi bepul sinov ochish.
- Telefonni `+998…`, `00998…`, bo‘shliqli yoki 9 xonali mahalliy ko‘rinishda qayta kiritish.
- Bir vaqtda ikkita ro‘yxatdan o‘tish so‘rovi bilan tekshiruvdan o‘tishga urinish: telefon va Telegram hisobiga da’vo PostgreSQL unique kalitlari bilan bitta tranzaksiyada saqlanadi.
- Klub o‘chirilishi yoki telefonining o‘zgartirilishi orqali tarixni yo‘qotish: `trial_claims` va `telegram_trial_claims` klubga cascade bog‘lanmagan. Eski va yangi telefonlar tarixda qoladi.

Migratsiya bazada hozir bor klublarning telefonlarini holatidan qat’i nazar tarixga qo‘shadi. Telefon formatlari birlashtiriladi. Migratsiyadan **oldin o‘chirib yuborilgan** klubning telefoni mavjud bazada qolmagan bo‘lsa, uni qayta tiklab bo‘lmaydi; ishonchli eski nusxadan ma’lumot alohida ko‘chirilishi kerak.

IP manzili insonning doimiy identifikatori emas: bitta internetdan bir nechta halol klub foydalanishi mumkin, foydalanuvchi esa tarmoqni almashtira oladi. Shu sababli bepul sinovning asosiy kaliti tasdiqlangan telefon va Telegram hisobidir. Cheklov serverda va bazada bajariladi; bu [OWASP biznes mantiqi himoyasi](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html) tamoyiliga mos.

## Tekshirish va chegaralar

`npm test` serverdagi HTTP/telefon/sozlash testlari va klient testlarini bajaradi.
`npm run test:integration` esa mahalliy PostgreSQL binarlari bilan alohida vaqtinchalik
baza yaratib, haqiqiy tranzaksiyalarda parallel so‘rovlar, rollback va tarixni tekshiradi.
CI bu testlarni ham bajaradi; ishlab turgan ilova bazasi test uchun ishlatilmaydi.

Mahalliy testlar bilan real Telegram va production sozlamalari tekshiruvi alohida. Sozlash buyrug‘i webhook manzilini tasdiqlaydi, lekin to‘liq ro‘yxatdan o‘tish muvaffaqiyatli ekanini isbotlamaydi. Deploydan keyin yangi test Telegram hisobi/telefoni bilan bot orqali tasdiqlashni, birinchi registratsiyani va takroriy registratsiyaning rad etilishini tekshiring. Tasdiqlashni o‘tkazib yuborib yoki begona kontakt jo‘natib registratsiya qilish ham rad etilishi kerak.

Sinov tarixi saqlangani sababli productiondagi test hisobini o‘chirish unga yana bepul muddat bermaydi. Takrorlanadigan tekshiruvlar uchun alohida staging bazasidan foydalaning.

Bir inson **butunlay boshqa telefon va boshqa Telegram hisobini** olsa, bu tizim uni avvalgi inson deb ishonchli taniy olmaydi. Telegram tasdiqlashi shaxsning pasportini yoki biznes egasini aniqlamaydi. Superadminning ataylab klub yaratish, sinov yoki obuna muddatini berish huquqi saqlanadi; ommaviy registratsiya shu vakolatlarni ololmaydi.

Telefon va Telegram identifikatori sinov tarixida saqlanishini maxfiylik matnida tushuntiring. Tarixni oddiy tozalash ishlariga qo‘shmang: undan yozuv o‘chirilsa, aynan o‘sha identifikatorga qayta bepul sinov olish yo‘li ochiladi.
