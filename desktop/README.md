# Billiard Club — Desktop (Windows / macOS / Linux)

Kassa kompyuterida brauzer varag'i emas, **o'z ikonkasi va o'z oynasi bilan dastur**
sifatida ishlaydigan qobiq. Ichida — aynan o'sha ilova (yangi nusxa emas).

## Nima uchun qobiq ilovaning nusxasini saqlamaydi

Qobiq `https://billiardclub.uz` ni ochadi va shu holicha ko'rsatadi. Sabablari:

| Qaror | Sabab |
|---|---|
| **Yagona manba** | Brauzerda ham, desktopda ham AYNAN bir xil ilova. Ikki alohida build vaqt o'tib bir-biridan uzoqlashardi va "brauzerda ishlaydi, dasturda ishlamaydi" xatolari paydo bo'lardi. |
| **Oflayn baribir ishlaydi** | Ilovaning service worker'i (`client/sw/service-worker.js`) qobiqni keshlaydi, ma'lumot esa IndexedDB da (`client/src/offline/`). Internet uzilganda Chromium navigatsiyani service worker'ga uzatadi — dastur ochilaveradi. |
| **Cookie va CORS** | Manzil haqiqiy HTTPS domen bo'lgani uchun `httpOnly` refresh cookie, CORS va CSP veb-versiyadagidek ishlaydi. `file://` dan yuklashda bularning hammasini buzib qayta yozishga to'g'ri kelardi. |
| **Yangilanish** | Ilovaning O'ZI server yangilanishi bilan darhol yangilanadi. Qobiqning o'zi (Electron, oyna mantig'i) esa auto-updater orqali yangilanadi — pastga qarang. |

## Qobiq nima qo'shadi

- **O'z oynasi va ikonkasi** — Boshlash menyusi va ish stolida yorliq, tab/URL paneli yo'q
- **Oyna holati eslab qolinadi** — o'lcham, joylashuv, yoyilgan holat
- **Bitta nusxa** — ikkinchi marta ochilsa mavjud oyna faollashadi (ikki xil holat ko'rsatilmaydi)
- **Yopishdan oldin ogohlantirish** — yuborilmagan oflayn amallar bo'lsa aytadi
- **Tashqi havolalar tizim brauzerida** ochiladi, qobiq ichida emas
- **Qat'iy xavfsizlik**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`;
  veb-sahifaga faqat ikkita funksiya ochiladi (`preload.js`)
- **Zaxira ekran** — birinchi ochilishda internet bo'lmasa tushunarli xabar (`offline.js`)

## Ishga tushirish (dasturchi uchun)

```bash
cd desktop
npm install

# Ishlab turgan xizmat bilan
npm start

# Lokal dev serverga ulanib
npm run dev            # BILLIARDCLUB_URL=http://localhost:5173
```

## Windows uchun o'rnatgich yasash

```bash
cd desktop
npm install
npm run dist:win
```

Natija: `desktop/release/Billiard Club Setup <versiya>.exe` — NSIS o'rnatgichi
(o'rnatish papkasini tanlash mumkin, ish stoli va Boshlash menyusi yorliqlari bilan).

> **Kod imzolash**: ishlab chiqarishga tarqatishda `.exe` ni imzolash tavsiya etiladi,
> aks holda Windows SmartScreen "noma'lum nashriyot" ogohlantirishini ko'rsatadi.
> Sertifikat olingach, `electron-builder` ga `win.certificateFile`/`certificatePassword`
> (yoki `CSC_LINK`/`CSC_KEY_PASSWORD` muhit o'zgaruvchilari) bering.

macOS: `npm run dist` → `.dmg`. Linux: `npm run dist` → `.AppImage`.

## Avtomatik yangilanish (o'z serveringizdan — GitHub ishlatilmaydi)

Qobiq `electron-updater` bilan **o'z serveringizdan** yangilanadi. Reliz
fayllari ham, yangilanish "feed" i ham platformaning o'zida turadi:

```
<server>/api/public/updates/latest.yml        <- Windows kanal fayli
<server>/api/public/updates/latest-mac.yml    <- macOS
<server>/api/public/updates/latest-linux.yml  <- Linux
<server>/api/public/updates/<fayl>            <- o'rnatgichning o'zi
```

Manzil **ishga tushganda** aniqlanadi (`updater.js` → `setFeedURL`), ya'ni klub
o'z serverida ishlasa yangilanishni ham o'sha serverdan oladi.
`package.json` dagi `publish` bloki faqat `app-update.yml` yaratish uchun.

**Oqim:** ishga tushgandan 20 soniya keyin va har 4 soatda tekshiriladi →
yangi versiya bo'lsa fonda yuklab olinadi → `sha512` tekshiriladi →
**dastur yopilganda o'rnatiladi**.

Smena o'rtasida dastur o'zini qayta ishga tushirib yubormaydi — bu ataylab.
Foydalanuvchi xohlasa ilovadagi `/download` sahifasidan yoki menyudagi
*Dastur → Yangilanishni tekshirish* dan darhol o'rnatishi mumkin; agar
yuborilmagan oflayn amallar bo'lsa dastur avval ogohlantiradi.

Yangilanish **dev rejimida ishlamaydi** (`app.isPackaged === false`) — bu
kutilgan holat, tekshirganda sabab ekranda ko'rsatiladi.

### Yangi versiya chiqarish

```bash
# 1. desktop/package.json dagi "version" ni oshiring (masalan 1.0.1)
cd desktop && npm run dist:win

# 2. Hosil bo'lgan release/Billiard Club Setup 1.0.1.exe ni
#    superadmin panelidan yuklang va "Nashr etish" ni bosing.
```

Nashr etilmagan reliz `/download` da ham, auto-update feed'ida ham
**ko'rinmaydi** — avval o'zingiz sinab ko'rishingiz mumkin.

> **Kod imzolash muhim.** Imzolanmagan `.exe` da Windows SmartScreen
> ogohlantiradi va `electron-updater` ham imzoni tekshira olmaydi.

## Boshqa serverga ulash (o'z serveringizda yuritsangiz)

Ikki yo'l:

1. **Muhit o'zgaruvchisi** — `BILLIARDCLUB_URL=https://mening-serverim.uz`
2. **Sozlama fayli** — dastur menyusidan *Dastur → Server manzili…* ni oching,
   "Papkani ochish" ni bosing va `config.json` yarating:

   ```json
   { "url": "https://mening-serverim.uz" }
   ```

   Fayl joyi: Windows'da `%APPDATA%\Billiard Club\config.json`.

## Ikonkalar

`build/icon.ico` va `build/icon.png` **qo'lda generatsiya qilinadi** — muhitda
ImageMagick/sharp yo'q, shuning uchun belgi `build/make-icons.mjs` da Node ning
o'zi bilan chiziladi va PNG/ICO ga kodlanadi (geometriya va ranglar
`client/public/favicon.svg` hamda `client/src/theme/tokens.ts` bilan bir xil).

Belgini o'zgartirsangiz qayta yuriting:

```bash
node desktop/build/make-icons.mjs
```

Bu buyruq veb tomondagi PWA ikonkalarini ham (`client/public/icon-*.png`,
`apple-touch-icon.png`) yangilaydi.
