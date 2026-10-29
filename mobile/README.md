# Billiard Club — Android ilova

`mobile/` — Android ilova (APK). [Capacitor](https://capacitorjs.com) qobig'i:
desktop dasturi kabi ilova veb-ilovaning **nusxasini saqlamaydi**, ishlayotgan
serverni ochadi (standart: `https://billiardclub.uz`).

Natija:

- kassa, hisobot va boshqa hamma narsa serverdagi bilan **bir xil versiyada**;
- yangi imkoniyatlar APK ni qayta o'rnatmasdan **darhol** keladi;
- internet uzilsa — veb-ilovaning service worker'i ishlaydi (oflayn navbat);
  server umuman ochilmasa — `www/offline.html` (qayta urinish tugmasi bilan).

## APK yig'ish

```bash
cd mobile
npm install
npm run build:apk          # imzolangan release APK → mobile/dist/BilliardClub-<versiya>.apk
npm run build:apk:debug    # debug APK (sinov uchun)
```

Talablar: **JDK 21** va **Android SDK** (platform 36, build-tools 35/36).
Skript ularni avval `JAVA_HOME` / `ANDROID_HOME` dan, bo'lmasa loyiha ichidagi
`runtime.local/android-toolchain/` dan oladi (git'ga kirmaydi).

Boshqa server uchun:

```bash
BILLIARDCLUB_URL=https://mening-serverim.uz npm run build:apk
```

## Imzo kaliti (MUHIM)

Birinchi release yig'ishda skript kalitni o'zi yaratadi:

- `android/keystore/billiard-release.jks`
- `android/keystore.properties` (parol)

Ikkalasi ham **git'ga kirmaydi**. Ularni xavfsiz joyda zaxiralang: kalit
yo'qolsa, o'rnatilgan ilovalarni yangi versiyaga **yangilab bo'lmaydi**
(Android imzosi mos kelmaydigan APK ni rad etadi).

## Tarqatish

1. `npm run build:apk` → `mobile/dist/BilliardClub-<versiya>.apk`
2. Superadmin paneli → **Desktop relizlari** → platforma: **Android (APK)** → yuklash → **Nashr etish**
3. Klublar `/download` sahifasini telefonda ochadi — APK va o'rnatish qadamlari ko'rinadi.

Yangi versiya: `mobile/package.json` dagi `version` ni oshiring (versionCode
avtomatik hisoblanadi: `1.2.3` → `10203`).

Ilova o'z versiyasini user-agent'ga yozadi (`BilliardClubAndroid/<versiya>`,
`capacitor.config.ts`). Veb-ilova shu bo'yicha eski APK ni aniqlab, ilova ichida
bir martalik "Yangilash" bannerini ko'rsatadi; APK tizim brauzerida yuklanadi
(`MainActivity.java` — WebView fayllarni o'zi yuklamaydi). Imzo kaliti har doim
bir xil bo'lishi SHART — aks holda yangi APK eski ustiga o'rnatilmaydi.

## Ikonka va splash

`node desktop/build/make-icons.mjs` — desktop, PWA va Android ikonkalari hamda
splash ekranlarni bitta brend belgisidan qayta chizadi (bog'liqliksiz).

## Bulutda yig'ish (GitHub Actions)

`.github/workflows/android.yml` — `mobile-v*` tegi yoki qo'lda ishga tushirilganda
debug APK yig'adi va artefakt sifatida saqlaydi. Release imzosi uchun
repozitoriy sirlariga `ANDROID_KEYSTORE_BASE64` va `ANDROID_KEYSTORE_PASSWORD`
qo'shing — workflow ular bo'lsa imzolangan release APK yig'adi.
