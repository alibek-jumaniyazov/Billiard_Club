import type { CapacitorConfig } from '@capacitor/cli';

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

const config: CapacitorConfig = {
  appId: 'uz.billiardclub.app',
  appName: 'Billiard Club',
  webDir: 'www',
  backgroundColor: '#0b0d0c',
  server: {
    url: APP_URL,
    // Faqat HTTPS — kassa ma'lumotlari ochiq tarmoqda yurmasin
    cleartext: APP_URL.startsWith('http://'),
    androidScheme: 'https',
    // Server ochilmasa (internet yo'q, birinchi ishga tushirish) — mahalliy sahifa
    errorPath: 'offline.html',
  },
  android: {
    backgroundColor: '#0b0d0c',
    allowMixedContent: false,
  },
};

export default config;
