# Brend videolari (logo animatsiyasi)

`render.cjs` "B" logotipi animatsiyasini kadrma-kadr chizadi va ffmpeg bilan MP4 ga kodlaydi.
Animatsiya sayt va dasturlardagi intro bilan **bitta kod**: `client/src/brand/logoMotion.ts`.
Shuning uchun videodagi va dastur ichidagi animatsiya kadrma-kadr bir xil.

Ovoz `audio.cjs` da to'liq sintez qilinadi (tayyor ovoz fayllari ishlatilmagan, litsenziya kerak
emas). Har bir tovush animatsiya lahzasiga bog'langan:

- chiroq yonganda elektr "chirt"lari;
- chiziq chizilganda shitirlash;
- kiyning shuvillashi va "tak" ovozi;
- sharlarning dumalashi va bir-biriga "chiq" etib tegishi;
- yaltirash qo'ng'irog'i;
- yozuv chiqqanda past "bum" va iliq akkord.

## Natija — `client/public/brand/`

| Fayl | O'lcham | Qayerga |
|---|---|---|
| `billiardclub-logo-16x9.mp4` | 1920×1080 | YouTube intro, taqdimot, sayt |
| `billiardclub-logo-9x16.mp4` | 1080×1920 | Instagram/Telegram story, Reels, TikTok |
| `billiardclub-logo-1x1.mp4` | 1080×1080 | Instagram/Telegram post |
| `billiardclub-logo-*.jpg` | xuddi shu | Muqova (poster) |

Texnik ko'rsatkichlar:

- **Video:** 6 soniya, 60 fps, H.264 High, BT.709.
- **Ovoz:** AAC 192 kb/s, balandlik −16 LUFS, cho'qqi −1 dBFS dan oshmaydi.
- **Aylanma ijro:** video qorong'idan boshlanib qorong'iga so'nadi, shuning uchun takrorlanganda chok sezilmaydi.

Deploydan keyin fayllar saytda ham ochiladi, masalan `https://billiardclub.uz/brand/billiardclub-logo-9x16.mp4`.

## Qayta yaratish

Quyidagilar kerak:

- `client` va `desktop` papkalarida `npm install` (esbuild va Electron shu yerdan olinadi);
- ffmpeg: `--ffmpeg=…` parametri, `FFMPEG_PATH` muhit o'zgaruvchisi yoki PATH orqali.

```bash
desktop/node_modules/.bin/electron tools/brand-video/render.cjs --ffmpeg=C:/ffmpeg/bin/ffmpeg.exe
```

| Parametr | Vazifasi |
|---|---|
| `--only=9x16` | faqat bitta format |
| `--out=papka` | boshqa papkaga (standart: `client/public/brand`) |
| `--audio=false` | ovozsiz |
| `--preview=16x9 --out=sheet.png` | dizaynni tekshirish uchun 16 lahzalik kontakt varaq |
| `--still=16x9 --t=4.4 --out=kadr.png` | bitta kadr |

Logotip yoki animatsiya (`logoMotion.ts`) o'zgarsa, videolarni qayta yarating. Sayt intro'si
yangi kod bilan avtomatik yangilanadi.

## Bannerlar va ikonkalar — `banners.cjs`

Landingdagi jonli demo panel (haqiqiy stol kartalari) suratga olinib, brend kompozitsiyasiga
joylanadi. Natija:

| Fayl | Nima uchun |
|---|---|
| `client/public/og-cover.png` | 1200×630, o'zbekcha: Google, Telegram, Facebook havola ko'rinishi |
| `client/public/og-cover-ru.png` | 1200×630, ruscha |
| `client/public/favicon.ico` | 48×48: qidiruv natijasidagi ikonka |
| `client/public/brand/billiardclub-logo-1024.png` | Kvadrat logotip: Google Business, 2GIS, kataloglar |

```bash
desktop/node_modules/.bin/electron tools/brand-video/banners.cjs --url=http://localhost:5173 --ffmpeg=C:/ffmpeg/bin/ffmpeg.exe
```

`--url` — landing ochiladigan manzil: dev server (`npm run dev`) yoki `https://billiardclub.uz`.
Banner matnlari skript ichida (`TEXT`). Sahifadagi SEO matnlari esa landing tarjimalaridan
olinadi (`docs/SEO.md`).
