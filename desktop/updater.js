/**
 * AVTOMATIK YANGILANISH — o'z serverimizdan (GitHub ISHLATILMAYDI).
 *
 * OQIM. electron-updater `<server>/api/public/updates/latest.yml` ni so'raydi,
 * ichidagi versiyani o'zinikiga solishtiradi, yangisi bo'lsa faylni fonda
 * yuklab oladi va `sha512` ni tekshiradi. Mos kelmasa — o'rnatmaydi. Ya'ni
 * yo'lda almashtirilgan fayl hech qachon ishga tushmaydi.
 *
 * FEED MANZILI DINAMIK: klub o'z serverida ishlashi mumkin (config.json dagi
 * `url`), shuning uchun manzil qurilish paytida emas, ISHGA TUSHGANDA
 * o'rnatiladi. package.json dagi `publish` bloki faqat electron-builder
 * `app-update.yml` ni yaratishi uchun kerak — haqiqiy manba shu yerdagi
 * `setFeedURL`.
 *
 * O'RNATISH VAQTI. Yangilanish AVTOMATIK o'rnatilmaydi — u dastur yopilganda
 * qo'llaniladi. Kassa smenasi o'rtasida dasturni o'zi qayta ishga tushirib
 * yuborish (va shu payt ekrandagi ochiq hisob-kitobni yo'qotish) mumkin emas.
 * Foydalanuvchi xohlasa /download sahifasidagi tugma bilan darhol o'rnatadi.
 */

const { app, ipcMain } = require('electron');

/** Fon tekshiruvi oralig'i — 4 soat */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Ishga tushgandan keyin birinchi tekshiruvgacha kutish — ilova yuklanib olsin */
const FIRST_CHECK_DELAY_MS = 20 * 1000;

/** Renderer ga yuboriladigan oxirgi holat (kech ulangan oyna ham ko'rsin) */
let lastStatus = { state: 'idle' };

let updater = null;
let getWindow = () => null;
let timer = null;

const send = (status) => {
  lastStatus = status;
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('billiardclub:update-status', status);
  }
};

/**
 * Tekshiruvni ishga tushirish.
 * @param manual foydalanuvchi o'zi bosdimi (fon tekshiruvida "yangilanish yo'q"
 *   xabarini ko'rsatish shart emas, qo'lda bosganda esa javob KERAK)
 */
const check = (manual) => {
  if (!updater) {
    // Paketlanmagan (dev) yoki electron-updater o'rnatilmagan holat.
    // Qo'lda bosilganda jimgina turib qolmaymiz — sabab ko'rsatiladi.
    if (manual) {
      send({
        state: 'error',
        message: app.isPackaged
          ? "Yangilanish moduli mavjud emas"
          : "Yangilanish faqat o'rnatilgan dasturda tekshiriladi",
      });
    }
    return;
  }
  send({ state: 'checking' });
  updater.checkForUpdates().catch((err) => {
    send({ state: 'error', message: String(err && err.message ? err.message : err) });
  });
};

/**
 * @param {object} options
 * @param {string} options.feedBase  Server manzili (masalan https://billiardclub.uz)
 * @param {() => Electron.BrowserWindow | null} options.getWindow
 * @param {() => boolean} options.allowRestart  Hozir qayta ishga tushsa bo'ladimi
 *   (yuborilmagan oflayn amallar bo'lsa main.js `false` qaytaradi)
 */
const initUpdater = ({ feedBase, getWindow: resolveWindow, allowRestart }) => {
  getWindow = resolveWindow;

  /* --- Renderer bilan aloqa: bular HAR DOIM ro'yxatdan o'tadi --- */

  // Holatni so'rash. `handle` (invoke) ishlatiladi — obuna bo'lgan komponent
  // joriy holatni DARHOL oladi va oradagi hodisani o'tkazib yubormaydi.
  ipcMain.handle('billiardclub:update-status', () => lastStatus);

  ipcMain.on('billiardclub:check-updates', () => check(true));

  ipcMain.on('billiardclub:quit-and-install', () => {
    if (!updater || lastStatus.state !== 'ready') return;
    // Yuborilmagan amal bo'lsa qayta ishga tushirmaymiz: ular IndexedDB da
    // saqlangan va yo'qolmaydi, lekin foydalanuvchi buni ko'rmasdan
    // dasturni yopib yuborishi kerak emas.
    if (!allowRestart()) return;
    // isSilent=false: o'rnatgich ko'rinadi. isForceRunAfter=true: o'rnatgach
    // dastur o'zi qayta ochiladi — kassir uni qo'lda topib ochmasin.
    updater.quitAndInstall(false, true);
  });

  /* --- Dev rejimida bu yerda to'xtaymiz --- */

  // Paketlanmagan ilovada electron-updater ataylab xato beradi ("dev-app-update.yml
  // topilmadi"). Uni chaqirmaymiz: `npm run dev` da konsol xato bilan to'lardi.
  if (!app.isPackaged) return;

  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch {
    // Bog'liqlik o'rnatilmagan — qobiq baribir ishlashi kerak
    updater = null;
    return;
  }

  updater.autoDownload = true;
  // O'rnatish FAQAT dastur yopilganda — yuqoridagi izohga qarang
  updater.autoInstallOnAppQuit = true;
  updater.logger = null;

  updater.setFeedURL({
    provider: 'generic',
    url: `${feedBase.replace(/\/+$/, '')}/api/public/updates`,
    // Kanal fayli nomi platformaga qarab o'zi tanlanadi
    // (latest.yml / latest-mac.yml / latest-linux.yml)
  });

  updater.on('update-available', (info) => send({ state: 'available', version: info.version }));
  updater.on('update-not-available', () => send({ state: 'uptodate' }));
  updater.on('download-progress', (p) => send({ state: 'downloading', percent: p.percent }));
  updater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }));
  updater.on('error', (err) => {
    // Xato KO'RSATILADI, lekin ilova ishini to'xtatmaydi: internet yo'q
    // bo'lgan klubda bu oddiy holat va u kassaga hech qanday ta'sir qilmaydi.
    send({ state: 'error', message: String(err && err.message ? err.message : err) });
  });

  setTimeout(() => check(false), FIRST_CHECK_DELAY_MS);
  timer = setInterval(() => check(false), CHECK_INTERVAL_MS);
};

/** Dastur yopilayotganda taymerni to'xtatish */
const stopUpdater = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { initUpdater, stopUpdater };
