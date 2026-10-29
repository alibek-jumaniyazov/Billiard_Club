import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Android ilova = desktop qobig'i bilan bir xil yondashuv: ilova veb-ilovaning
 * NUSXASINI saqlamaydi, ishlayotgan serverni ochadi. Shuning uchun:
 *  - kassa, hisobot va boshqa hamma narsa serverdagi bilan bir xil versiyada;
 *  - yangi imkoniyatlar APK ni qayta o'rnatmasdan darhol keladi;
 *  - oflayn rejimni veb-ilovaning service worker'i ta'minlaydi.
 *
 * Boshqa server uchun yig'ish:  BILLIARDCLUB_URL=https://mening-serverim.uz npm run build:apk
 */
const APP_URL = (process.env.BILLIARDCLUB_URL || 'https://billiardclub.uz').replace(/\/+$/, '');

/**
 * APK versiyasi brauzer user-agent'iga yoziladi: `BilliardClubAndroid/1.1.0`.
 * Veb-ilova shundan qobiq eskirganini biladi va /download dagi yangi APK ni
 * taklif qiladi (client: NativeUpdateBanner). Veb qismi baribir serverdan
 * keladi — yangilanish faqat ikonka/splash kabi nativ qism uchun kerak.
 */
const { version: APP_VERSION } = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

const config: CapacitorConfig = {
  appId: 'uz.billiardclub.app',
  appName: 'Billiard Club',
  webDir: 'www',
  backgroundColor: '#090c0b',
  server: {
    url: APP_URL,
    // Faqat HTTPS — kassa ma'lumotlari ochiq tarmoqda yurmasin
    cleartext: APP_URL.startsWith('http://'),
    androidScheme: 'https',
    // Server ochilmasa (internet yo'q, birinchi ishga tushirish) — mahalliy sahifa
    errorPath: 'offline.html',
  },
  android: {
    backgroundColor: '#090c0b',
    allowMixedContent: false,
    appendUserAgent: `BilliardClubAndroid/${APP_VERSION}`,
  },
};

export default config;
