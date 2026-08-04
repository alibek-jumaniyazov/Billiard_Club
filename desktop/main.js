/**
 * BILLIARD CLUB — DESKTOP QOBIQ (Electron asosiy jarayoni).
 *
 * ARXITEKTURA QARORI (muhim): qobiq ilovaning NUSXASINI o'z ichiga olmaydi —
 * u to'g'ridan-to'g'ri ishlayotgan manzilni (standart: https://billiardclub.uz)
 * ochadi.
 *
 * Nega shunday:
 *  1. YAGONA MANBA. Klub egasi brauzerda ham, desktopda ham AYNAN bir xil
 *    ilovani ko'radi. Ikkita alohida build bo'lganida ular vaqt o'tib bir-biridan
 *    uzoqlashardi va "brauzerda ishlaydi, dasturda ishlamaydi" degan xatolar
 *    paydo bo'lardi.
 *  2. OFLAYN BARIBIR ISHLAYDI. Ilovaning service worker'i (client/sw/) qobiqni
 *    keshlaydi, ma'lumot esa IndexedDB da saqlanadi. Internet uzilganda
 *    Chromium navigatsiyani service worker'ga uzatadi va dastur ochilaveradi —
 *    lokal nusxa saqlashning hojati yo'q.
 *  3. XAVFSIZLIK VA COOKIE. Manzil haqiqiy HTTPS domen bo'lgani uchun
 *    httpOnly refresh cookie, CORS va CSP veb-versiyadagidek ishlaydi.
 *    `file://` dan yuklashda bularning hammasini buzib qayta yozishga
 *    to'g'ri kelardi.
 *  4. YANGILANISH. Server yangilanganda desktop foydalanuvchilari ham darhol
 *    yangi versiyani oladi — alohida imzolangan auto-updater infratuzilmasi
 *    talab qilinmaydi.
 *
 * Server manzilini o'zgartirish (o'z serveringizda yuritsangiz):
 *   - muhit o'zgaruvchisi: BILLIARDCLUB_URL=https://mening-serverim.uz
 *   - yoki foydalanuvchi papkasidagi config.json: { "url": "https://..." }
 */

const { app, BrowserWindow, Menu, dialog, shell, ipcMain, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { offlineFallbackHtml } = require('./offline');
const { initUpdater, stopUpdater } = require('./updater');

/** Standart manzil — ishlab turgan xizmat */
const DEFAULT_URL = 'https://billiardclub.uz';

/** Ilova foni (oq miltillashning oldini oladi) — client/src/theme/tokens.ts bg0 */
const BACKGROUND = '#0e1513';

const userDataFile = (name) => path.join(app.getPath('userData'), name);

/* ------------------------------------------------------------ Sozlamalar */

const readJson = (file, fallback) => {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return fallback;
  }
};

const writeJson = (file, value) => {
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  } catch {
    /* diskka yozib bo'lmasa — sozlama saqlanmaydi, ilova ishlayveradi */
  }
};

/** Server manzili: muhit o'zgaruvchisi > config.json > standart */
const resolveUrl = () => {
  const fromEnv = (process.env.BILLIARDCLUB_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const cfg = readJson(userDataFile('config.json'), {});
  const fromFile = typeof cfg.url === 'string' ? cfg.url.trim() : '';
  return (fromFile || DEFAULT_URL).replace(/\/+$/, '');
};

const APP_URL = resolveUrl();
const APP_ORIGIN = (() => {
  try {
    return new URL(APP_URL).origin;
  } catch {
    return new URL(DEFAULT_URL).origin;
  }
})();

/* ------------------------------------------------- Oyna holatini saqlash */

const WINDOW_STATE_FILE = () => userDataFile('window-state.json');
const DEFAULT_STATE = { width: 1360, height: 860, x: undefined, y: undefined, maximized: true };

const loadWindowState = () => readJson(WINDOW_STATE_FILE(), DEFAULT_STATE);

const saveWindowState = (win) => {
  if (!win || win.isDestroyed()) return;
  const maximized = win.isMaximized();
  // Yoyilgan oynada getBounds() ekran o'lchamini beradi — tiklanganda
  // oyna butun ekranni egallab qolmasin uchun normal o'lchov saqlanadi
  const bounds = maximized ? win.getNormalBounds() : win.getBounds();
  writeJson(WINDOW_STATE_FILE(), { ...bounds, maximized });
};

/* --------------------------------------------------------- Oyna yaratish */

/** Renderer xabar qilgan yuborilmagan amallar soni (yopishdan oldin ogohlantirish) */
let pendingActions = 0;
/** Foydalanuvchi ogohlantirishni tasdiqlaganmi (takroriy so'ramaslik uchun) */
let closeConfirmed = false;

let mainWindow = null;

const createWindow = () => {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: BACKGROUND,
    title: 'Billiard Club',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Xavfsizlik: veb-sahifa Node API lariga UMUMAN kira olmaydi
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
      // Ilova versiyasini preload ga uzatish. `sandbox: true` da preload da
      // `app` yo'q, `process.argv` esa bor — shuning uchun argument orqali.
      // (Ilgari veb-ilovaga Electron versiyasi ko'rsatilardi, u esa
      // foydalanuvchi uchun ma'nosiz son edi.)
      additionalArguments: [`--billiardclub-version=${app.getVersion()}`],
    },
  });

  if (state.maximized) mainWindow.maximize();

  // Oq miltillash bo'lmasin — oyna faqat kontent tayyor bo'lgach ko'rinadi
  mainWindow.once('ready-to-show', () => mainWindow.show());

  /* --- Navigatsiya cheklovlari: qobiq FAQAT o'z ilovasini ko'rsatadi --- */

  const isAppUrl = (url) => {
    try {
      return new URL(url).origin === APP_ORIGIN;
    } catch {
      return false;
    }
  };

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // target="_blank" va window.open — tashqi havolalar tizim brauzerida ochiladi
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Ruxsat so'rovlari: kassa dasturiga kamera/mikrofon/joylashuv KERAK EMAS.
  // Faqat bildirishnoma va to'liq ekran ruxsat etiladi.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications' || permission === 'fullscreen');
  });

  /* --- Yuklash xatosi: internet yo'q va service worker hali o'rnatilmagan --- */

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, failingUrl, isMainFrame) => {
    // -3 = ABORTED (foydalanuvchi navigatsiyani to'xtatdi) — xato emas
    if (!isMainFrame || errorCode === -3) return;
    void mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        offlineFallbackHtml({ url: failingUrl || APP_URL, reason: errorDescription }),
      )}`,
    );
  });

  void mainWindow.loadURL(APP_URL);

  /* --- Oyna holati --- */

  let saveTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(mainWindow), 400);
  };
  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);
  mainWindow.on('maximize', scheduleSave);
  mainWindow.on('unmaximize', scheduleSave);

  /**
   * YOPISHDAN OLDIN OGOHLANTIRISH — kassa uchun kritik: internet yo'q paytda
   * kiritilgan amallar hali serverga yuborilmagan bo'lishi mumkin. Dastur
   * yopilsa ular YO'QOLMAYDI (IndexedDB da saqlanadi), lekin foydalanuvchi
   * buni bilishi va aloqa tiklanguncha kutishi kerak.
   */
  mainWindow.on('close', (event) => {
    if (closeConfirmed || pendingActions <= 0) {
      saveWindowState(mainWindow);
      return;
    }
    event.preventDefault();
    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Kutaman', 'Baribir yopish'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: 'Yuborilmagan amallar bor',
      message: `${pendingActions} ta amal hali serverga yuborilmagan.`,
      detail:
        "Ular kompyuterda saqlangan va internet tiklanganda o'zi yuboriladi. " +
        'Dasturni hozir yopsangiz, yuborish keyingi ochilishgacha kechikadi.',
    });
    if (response === 1) {
      closeConfirmed = true;
      saveWindowState(mainWindow);
      mainWindow.close();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

/* ------------------------------------------------------------------ Menyu */

const buildMenu = () => {
  const template = [
    {
      label: 'Dastur',
      submenu: [
        {
          label: 'Yangilash',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload(),
        },
        {
          label: 'Bosh sahifa',
          click: () => mainWindow && void mainWindow.loadURL(APP_URL),
        },
        { type: 'separator' },
        {
          label: 'Server manzili…',
          click: async () => {
            if (!mainWindow) return;
            const { response } = await dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Server manzili',
              message: `Hozirgi manzil:\n${APP_URL}`,
              detail:
                'Boshqa serverga ulanish uchun quyidagi faylni tahrirlang va dasturni qayta ishga tushiring:\n\n' +
                `${userDataFile('config.json')}\n\nNamuna: { "url": "https://mening-serverim.uz" }`,
              buttons: ['Yopish', 'Papkani ochish'],
              defaultId: 0,
            });
            if (response === 1) void shell.openPath(app.getPath('userData'));
          },
        },
        { type: 'separator' },
        {
          label: 'Yangilanishni tekshirish',
          // Menyudan bosilgani ham renderer'dagi tugma bilan BIR XIL yo'lga
          // tushadi: holat /download sahifasida ko'rinadi va ikkita alohida
          // "yangilanish tekshiruvi" mantig'i paydo bo'lmaydi.
          click: () => ipcMain.emit('billiardclub:check-updates'),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Chiqish' },
      ],
    },
    {
      label: "Ko'rinish",
      submenu: [
        { role: 'resetZoom', label: 'Asl o‘lcham' },
        { role: 'zoomIn', label: 'Kattalashtirish' },
        { role: 'zoomOut', label: 'Kichiklashtirish' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'To‘liq ekran' },
      ],
    },
    {
      label: 'Tahrirlash',
      submenu: [
        { role: 'undo', label: 'Bekor qilish' },
        { role: 'redo', label: 'Qaytarish' },
        { type: 'separator' },
        { role: 'cut', label: 'Kesish' },
        { role: 'copy', label: 'Nusxalash' },
        { role: 'paste', label: 'Qo‘yish' },
        { role: 'selectAll', label: 'Hammasini tanlash' },
      ],
    },
    {
      label: 'Yordam',
      submenu: [
        {
          label: 'Telegram orqali bog‘lanish',
          click: () => void shell.openExternal('https://t.me/avilab_uz'),
        },
        {
          label: 'Diagnostika oynasi',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
        { type: 'separator' },
        {
          label: 'Dastur haqida',
          click: () => {
            if (!mainWindow) return;
            void dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Billiard Club',
              message: `Billiard Club — desktop\nVersiya ${app.getVersion()}`,
              detail: `Server: ${APP_URL}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
              buttons: ['Yopish'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

/* -------------------------------------------------------------- Ishga tushish */

// Bitta nusxa: kassa kompyuterida ikkita oyna ochilib, ikki xil holat
// ko'rsatilishi chalkashlik va xatoga olib keladi
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    buildMenu();
    createWindow();

    initUpdater({
      feedBase: APP_URL,
      getWindow: () => mainWindow,
      /**
       * Yuborilmagan oflayn amal bo'lsa qayta ishga tushirishga RUXSAT
       * BERILMAYDI. Amallar diskda saqlangan va yo'qolmaydi, lekin dastur
       * qayta ochilib navbatni yuborguncha vaqt ketadi — kassir esa buni
       * kutmagan bo'ladi. Foydalanuvchi ogohlantiriladi va o'zi hal qiladi.
       */
      allowRestart: () => {
        if (pendingActions <= 0) return true;
        const response = dialog.showMessageBoxSync(mainWindow, {
          type: 'warning',
          buttons: ['Bekor qilish', 'Baribir yangilash'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          title: 'Yuborilmagan amallar bor',
          message: `${pendingActions} ta amal hali serverga yuborilmagan.`,
          detail:
            "Ular saqlangan va yo'qolmaydi, lekin yangilanish uchun dastur yopiladi va " +
            'yuborish keyingi ochilishgacha kechikadi. Yangilanish dastur oddiy yopilganda ' +
            "ham o'zi o'rnatiladi — shoshilish shart emas.",
        });
        if (response !== 1) return false;
        // Yopish oynasi ikkinchi marta so'ramasin
        closeConfirmed = true;
        return true;
      },
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    stopUpdater();
    if (process.platform !== 'darwin') app.quit();
  });

  /** Renderer yuborilmagan amallar sonini xabar qiladi (preload orqali) */
  ipcMain.on('billiardclub:pending', (_event, count) => {
    pendingActions = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  });
}
