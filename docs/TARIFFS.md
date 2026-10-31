# Tarif darajalari: Standart, Pro va VIP

Har bir klub uchta darajadan birida ishlaydi. Har bir daraja 1, 3, 6 oy yoki 1 yilga
sotiladi, ya'ni jami 12 ta tarif bor. Yuqori daraja quyi darajadagi hamma narsani oladi:
Pro'da Standartdagi hamma imkoniyat bor, VIP'da esa Pro'dagi hamma imkoniyat bor.
Quyi daraja esa yuqorisiga xos bo'limlarni ochmaydi.

## Narxlar

Narxlar so'mda, buyurtmachi tomonidan tasdiqlangan (2026-11-01). Ularni istalgan payt
superadmin panelida o'zgartirish mumkin.

| Daraja | 1 oy | 3 oy | 6 oy | 1 yil |
|---|---|---|---|---|
| Standart | 179 000 | 499 000 (oyiga ≈166 333, 38 000 tejash) | 949 000 (≈158 167, 125 000 tejash) | 1 790 000 (≈149 167, 358 000 tejash) |
| Pro | 249 000 | 699 000 | 1 319 000 | 2 490 000 |
| VIP | 349 000 | 979 000 | 1 849 000 | 3 490 000 |

Oyiga narx va tejash summasi o'sha darajaning 1 oylik narxidan **avtomatik** hisoblanadi.
Bu hisob obuna sahifasida, landingda va admin jadvalida bir xil ishlaydi.
Landingda eng katta tejash beradigan muddat "Eng yaxshi taklif" deb belgilanadi.

## Standart imkoniyatlar

| | Standart | Pro | VIP |
|---|---|---|---|
| Stollar | 6 tagacha | 15 tagacha | Cheksiz |
| Foydalanuvchilar (egasi bilan) | Faqat egasi | Faqat egasi | Cheksiz |
| Bar: mahsulotlar va stolga sotish | ✓ | ✓ | ✓ |
| Buyurtmalar bo'limi (ro'yxat va statistika) | — | ✓ | ✓ |
| Qarzlar daftari | ✓ | ✓ | ✓ |
| Moliyaviy hisobotlar | ✓ | ✓ | ✓ |
| Mijozlar bazasi | — | ✓ | ✓ |
| Stol bron qilish | — | ✓ | ✓ |
| Xarajatlar hisobi | — | ✓ | ✓ |
| Kassa smenasi va Z-hisobot | — | ✓ | ✓ |
| Xodim qo'shish (kassir, operator, admin) | — | — | ✓ |
| Chiroq avtomatikasi | — | — | ✓ |

**Bar va buyurtmalar alohida.** "Bar" — mahsulotlar ombori va stolga mahsulot qo'shish
(stol kartasidagi bar tugmasi). "Buyurtmalar bo'limi" — barcha buyurtmalar ro'yxati va
bugungi statistika. Buyurtmalar bo'limi bar'siz yoqilmaydi: jadval buni o'zi kuzatadi,
server ham bunday sozlamani rad etadi.

**Xato qo'shilgan mahsulotni bekor qilish** — bar'ning o'zida, ya'ni Standartda ham bor.
Stolning bar oynasida "Stolda" bloki bor: u yerda shu stolga qo'shilgan mahsulotlar
ko'rinadi. Kassir yoki admin ularni bekor qila oladi, operator esa yo'q. Stolning bar
buyurtmasi bitta, shuning uchun bekor qilish stoldagi barcha bar mahsulotlarini birga
oladi va to'g'risi qayta qo'shiladi. Mahsulotlar omborga qaytadi, amal jurnalga yoziladi.

**Xodim qo'shish.** O'chiq darajada klubda faqat egasi ishlaydi. Mavjud xodimlar o'chirilmaydi
va ularni boshqarish (bloklash, parol almashtirish) ochiq qoladi, faqat yangisini qo'shish yoki
bloklanganini qayta yoqish yopiladi. "Foydalanuvchilar" soni xodim qo'shish yoqilgan darajada
ishlaydi (Standart 3, Pro 8 — tayyor qiymatlar).

Stol taymeri, pauza va stolni o'tkazish, soatbay hisob, oflayn rejim hamda Windows va
Android ilovalari **hamma darajada** bor. Ular darajaga bog'liq emas.

## Superadmin qanday sozlaydi

Sozlash joyi: superadmin menyusidagi alohida **Tariflar** sahifasi. Unda ikkita tab bor:
**Tarif darajalari** va **Tarif qatorlari**.

- **Imkoniyatlar va cheklovlar jadvali.** Kalitlar bilan bo'limlarni yoqasiz yoki
  o'chirasiz. Stollar va foydalanuvchilar sonini yozasiz yoki "Cheksiz" ni belgilaysiz.
  Xodim qo'shish o'chiq darajada foydalanuvchilar katagida "Faqat egasi" yoziladi.
  Jadval qoidani o'zi saqlaydi: Standartda yoqilgan imkoniyat Pro va VIP'da ham yoqiladi,
  VIP'da o'chirilgani esa quyidagilarda ham o'chadi. Server ham qoidaga zid sozlamani
  rad etadi va `400` qaytaradi.
- **Nomi va qisqa tavsifi** — uz/ru. Bular obuna sahifasida va landingda ko'rinadi.
- **Narxlar jadvali** — daraja × muddat. Har katakda narx va "Sotuvda" kaliti bor.
  O'chirilgan tarif sotuvda ko'rinmaydi.
- **Tariflar → Tarif qatorlari** — har bir tarif qatori va uning "Daraja" maydoni. Shu yerda
  maxsus tarif ham qo'shish mumkin, masalan 45 kunlik aksiya. 1/3/6/12 oyga tushmaydigan
  tarif obuna sahifasida "Boshqa takliflar" bo'limida chiqadi.
- **Klublar** — har bir klubning darajasi ro'yxatda ko'rinadi. Tahrirlash oynasida darajani
  qo'lda almashtirish mumkin. Shartnoma qo'shilganda ham darajani tanlash mumkin; tanlanmasa
  joriy daraja saqlanadi.
- **Sozlamalar → Platforma qoidalari → Sinov davridagi tarif** — yangi klub sinov kunlarida
  qaysi daraja bilan ishlaydi. Standart qiymat — VIP: mijoz hammasini ko'rib, keyin tanlaydi.
  Saytda "sinovda barcha imkoniyatlar ochiq" deb yozilgan. Boshqa daraja tanlansa, o'sha
  matnlarni ham o'zgartiring.

Sozlama `platform_settings` jadvalida (`plan_tiers` kaliti) saqlanadi. Server uni 60 soniya
keshlaydi, saqlanganda esa kesh darhol yangilanadi.

## Sotib olish, oshirish va pasaytirish

- Klub egasi **Obuna** sahifasida darajani va muddatni tanlaydi. Shu tanlovdan faktura
  yaratiladi. Kupon oqimi avvalgidek ishlaydi.
- Superadmin to'lovni tasdiqlaganda klub o'sha tarif darajasiga o'tadi va muddat uzayadi.
  **Qolgan kunlar ham yangi darajada davom etadi.** Masalan, sinovning 7 kuni qolganida
  Pro 3 oylik tasdiqlansa, klub 97 kun Pro'da ishlaydi.
- Pastroq darajani tanlaganda xarid oynasi buni ogohlantiradi.
- Cheklov **mavjud ma'lumotni o'chirmaydi**. Masalan, 8 ta stoli bor klub Standartga o'tsa,
  stollari joyida qoladi, lekin yangi stol qo'sha olmaydi. Obuna sahifasidagi kartada
  "Sizda hozir 8 ta — bu tarifda 6 tagacha" deb ko'rsatiladi.
- Tarif tasdiqlangach klub ilovasi menyusi darhol yangilanadi: Obuna sahifasi yangi
  huquqlarni sessiyaga yozadi.

## Qayerda tekshiriladi

| Qatlam | Nima qiladi |
|---|---|
| Server (asosiy himoya) | `SubscriptionGuard` + `@RequireFeature('…')` yopiq bo'limga `403 FEATURE_LOCKED` qaytaradi. Stol yoki foydalanuvchi qo'shishda limit oshsa `403 LIMIT_REACHED` qaytadi. Stolga mahsulot qo'shish va stoldagi buyurtmani bekor qilish `bar` ni, buyurtmalar ro'yxati va statistikasi `orders` ni, xodim qo'shish `staff` ni, qarzga yopish `debts` ni, chiroq agenti esa `lights` ni tekshiradi |
| Klient (qulaylik) | Menyuda qulf belgisi va "Pro tarifida" izohi chiqadi. Yopiq sahifa o'rnida "Tarifni oshirish" kartasi ko'rinadi. Pastki mobil panelda va bosh sahifadagi tezkor amallarda yopiq bo'lim ko'rsatilmaydi. Stol qo'shish tugmasi limitda o'chadi. Xodimlar sahifasida qo'shish tugmasi o'chadi va "Xodim qo'shish — VIP tarifida" izohi chiqadi |

Superadmin (klubni ko'rish rejimida ham) hech qanday cheklovga tushmaydi.

## Fayllar

- `server/src/common/plan-tiers/tiers.ts` — darajalar, standart sozlama va narxlar, qoida tekshiruvi.
- `server/src/common/plan-tiers/plan-tiers.service.ts` — sozlamani o'qish/saqlash, `assertFeature`, `assertLimit`.
- `server/src/database/migrations/1784249100000-TierPlans.ts` — `clubs.tier`, `plans.tier` va 12 ta tarif.
- `client/src/utils/tiers.ts` — klient hisoblari: oyiga narx, tejash, guruhlash, jadval qoidasi.
  Bu yerdagi standart narxlar va imkoniyatlar landing zaxirasi va SEO matni uchun ishlatiladi.
- `client/src/pages/admin/TierSettings.tsx` — superadmin jadvali.
- `client/src/components/subscription/SubscriptionPlans.tsx` — obuna sahifasidagi kartalar.
- `client/src/pages/landing/PricingTiers.tsx` — landingdagi narxlar bo'limi.

**Standart narx yoki imkoniyatni kodda o'zgartirsangiz**, server
(`DEFAULT_TIERS`, `DEFAULT_TIER_PRICES`) va klient (`client/src/utils/tiers.ts`) birga
o'zgarishi kerak. `client/src/utils/tiers.sync.test.ts` farq bo'lsa testni yiqitadi.
Panelda o'zgartirilgan narxlar esa landingga API orqali o'zi chiqadi. Faqat qidiruv
tizimlari uchun statik matn build paytidagi standart qiymatlardan yig'iladi.

## Deploy

1. `npm run migrate` — `TierPlans` migratsiyasi. U `clubs.tier` va `plans.tier` ustunlarini
   va 12 ta tarifni qo'shadi. Eski `monthly`, `semiannual` va `yearly` tariflarini
   sotuvdan oladi; ular o'chirilmaydi va eski fakturalar joyida qoladi.
2. **Hamma mavjud klublar VIP bo'ladi.** Hech kimning ishlayotgan bo'limi to'satdan
   yopilmaydi. Keyingi to'lovda klub o'zi tanlagan darajaga o'tadi. Kerak bo'lsa, darajani
   Klublar sahifasidan qo'lda almashtirasiz.
3. Narxlar tasdiqlangan; o'zgartirish kerak bo'lsa — **Tariflar → Tarif darajalari**.
