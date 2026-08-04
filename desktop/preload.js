/**
 * PRELOAD — renderer (veb-ilova) va Electron asosiy jarayoni orasidagi
 * YAGONA va JUDA TOR ko'prik.
 *
 * Qoida: veb-ilovaga Node yoki Electron API si BERILMAYDI. Faqat quyidagilar
 * ochiladi:
 *   1. `isDesktop` / `version` — ilova desktop qobiqda ishlayotganini va qaysi
 *      versiya ekanini bilishi uchun (masalan "Yuklab olish" tugmasini
 *      yashirish, /download sahifasida versiyani ko'rsatish);
 *   2. `reportPending(count)` — yuborilmagan oflayn amallar soni. Asosiy
 *      jarayon shu son asosida dastur yopilayotganda ogohlantiradi;
 *   3. Yangilanish: tekshirish, holatga obuna bo'lish, o'rnatish.
 *
 * Boshqa hech narsa. Shu sababli veb-ilovadagi har qanday XSS ham
 * kompyuterga chiqa olmaydi: bu yerdagi funksiyalar argument qabul qilmaydi
 * yoki qabul qilganini qat'iy tozalaydi.
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Ilova versiyasi asosiy jarayondan argument orqali keladi.
 *
 * `sandbox: true` bo'lgani uchun bu yerda `app.getVersion()` chaqirib
 * bo'lmaydi, `process.argv` esa mavjud. Ilgari bu yerda
 * `process.versions.electron` berilardi — u Electron ning o'z versiyasi
 * bo'lib, foydalanuvchi uchun umuman boshqa (va chalg'ituvchi) son edi.
 */
const APP_VERSION = (() => {
  const prefix = '--billiardclub-version=';
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : '0.0.0';
})();

contextBridge.exposeInMainWorld('billiardclubDesktop', {
  isDesktop: true,
  version: APP_VERSION,
  electron: process.versions.electron,

  /**
   * Yuborilmagan amallar sonini asosiy jarayonga uzatadi.
   * Faqat manfiy bo'lmagan butun son qabul qilinadi.
   */
  reportPending: (count) => {
    const n = Number(count);
    ipcRenderer.send('billiardclub:pending', Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  },

  /** Yangilanishni qo'lda tekshirish */
  checkForUpdates: () => ipcRenderer.send('billiardclub:check-updates'),

  /** Tayyor yangilanishni darhol o'rnatib, dasturni qayta ishga tushirish */
  quitAndInstall: () => ipcRenderer.send('billiardclub:quit-and-install'),

  /**
   * Yangilanish holatiga obuna. Qaytaradi: obunani bekor qiluvchi funksiya.
   *
   * Obuna bo'lish bilan JORIY holat ham darhol so'raladi: React komponenti
   * sahifa yuklangandan bir necha soniya keyin ulanadi va shu oraliqda
   * kelgan "yangilanish tayyor" hodisasini butunlay o'tkazib yuborardi.
   */
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};

    const handler = (_event, status) => callback(status);
    ipcRenderer.on('billiardclub:update-status', handler);

    void ipcRenderer
      .invoke('billiardclub:update-status')
      .then((status) => {
        if (status) callback(status);
      })
      .catch(() => {
        /* asosiy jarayon hali tayyor emas — hodisalar baribir keladi */
      });

    return () => ipcRenderer.removeListener('billiardclub:update-status', handler);
  },
});
