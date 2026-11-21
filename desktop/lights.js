'use strict';

/**
 * CHIROQ MARKAZI — kassa kompyuterining O'ZIDA (Electron asosiy jarayoni).
 *
 * Nega dastur ichida: internet (provayder) uzilsa ham klubning Wi-Fi/LAN tarmog'i
 * ishlayveradi. Kassa kompyuteri relelar bilan bir tarmoqda, shuning uchun kassir
 * o'yinni boshlashi/tugatishi bilan chiroq bulutsiz, to'g'ridan-to'g'ri yonib-o'chadi.
 * Alohida agent (Node.js, NSSM, token ko'chirish) o'rnatish ham shart emas.
 *
 * Dvigatel — bridge agenti bilan AYNAN bir xil kod (bridge/lib/hub.js), yig'ishda
 * dastur ichiga ko'chiriladi (scripts/sync-bridge.cjs -> bridge-lib/).
 *
 * XAVFSIZLIK:
 *  - Bridge tokeni Windows DPAPI (safeStorage) bilan shifrlab saqlanadi va
 *    veb-sahifaga HECH QACHON qaytarilmaydi.
 *  - Barcha IPC chaqiruvlari faqat dasturning o'z oynasidan (asosiy freym, o'z
 *    domeni) qabul qilinadi.
 *  - Sinov faqat SERVERDA SAQLANGAN stol sozlamasi bilan bajariladi — sahifadan
 *    ixtiyoriy manzil/URL kelmaydi, ya'ni saytdagi xato (XSS) klub tarmog'iga
 *    ixtiyoriy so'rov yubora olmaydi.
 *  - Tarmoqni skanerlash chastotasi cheklangan.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, ipcMain, safeStorage } = require('electron');

/** Bridge dvigatelini yuklaydi: o'rnatilgan dasturda ichki nusxa, ishlab chiqishda repo */
function loadEngine() {
  const candidates = [path.join(__dirname, 'bridge-lib')];
  if (!app.isPackaged) candidates.push(path.join(__dirname, '..', 'bridge', 'lib'));
  let lastError = null;
  for (const dir of candidates) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const hub = require(path.join(dir, 'hub.js'));
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const providers = require(path.join(dir, 'discovery-providers.js'));
      let tuyaCloud = null;
      try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        tuyaCloud = require(path.join(dir, 'tuya-cloud.js'));
      } catch {
        /* Tuya bulut importi ixtiyoriy */
      }
      return { ...hub, ...providers, tuyaCloud };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('chiroq dvigateli topilmadi');
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;
const DISCOVER_MIN_GAP_MS = 8000;

/**
 * @param {object} options
 * @param {string} options.appUrl        server manzili (dastur shu serverga ulangan)
 * @param {() => Electron.BrowserWindow|null} options.getWindow
 * @param {(event: Electron.IpcMainEvent) => boolean} options.isTrusted
 * @param {(enabled: boolean) => void} [options.onEnabledChange]  tray/avtoyuklash uchun
 */
function initLights({ appUrl, getWindow, isTrusted, onEnabledChange }) {
  const dir = path.join(app.getPath('userData'), 'lights');
  const configFile = path.join(dir, 'hub.json');
  const stateFile = path.join(dir, 'state.json');
  const logFile = path.join(dir, 'hub.log');

  let engine = null;
  let engineError = null;
  try {
    engine = loadEngine();
  } catch (err) {
    engineError = err instanceof Error ? err.message : String(err);
  }

  let hub = null;
  let lastDiscoverAt = 0;
  let discovering = null;

  /* ------------------------------------------------------------ Log fayli */

  // Kichik aylanma log: 1 MB dan oshsa eski nusxaga o'tkaziladi (diagnostika uchun)
  const log = (level, message) => {
    if (level === 'debug') return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      try {
        if (fs.statSync(logFile).size > 1024 * 1024) fs.renameSync(logFile, `${logFile}.1`);
      } catch {
        /* fayl hali yo'q */
      }
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`);
    } catch {
      /* diskka yozib bo'lmasa — jim */
    }
  };

  /* ------------------------------------------------------ Shifrlangan sozlama */

  const canEncrypt = () => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  };

  const secretCodec = {
    seal: (text) => safeStorage.encryptString(String(text)).toString('base64'),
    open: (text) => safeStorage.decryptString(Buffer.from(String(text), 'base64')),
  };

  const readConfig = () => {
    try {
      const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  };

  const writeConfig = (data) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  };

  /* ------------------------------------------------------- Markazni boshqarish */

  const sendStatus = () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    try {
      win.webContents.send('billiardclub:lights:status', publicStatus());
    } catch {
      /* oyna yopilayotgan bo'lishi mumkin */
    }
  };

  const startHub = (token) => {
    if (!engine) throw new Error(engineError || 'chiroq dvigateli yuklanmadi');
    if (hub) void hub.stop();
    hub = new engine.LightHub({
      kind: 'desktop',
      agentVersion: `${app.getVersion()}-desktop`,
      serverUrl: appUrl,
      token,
      stateFile,
      secretCodec: canEncrypt() ? secretCodec : null,
      discoveryProviders: engine.defaultDiscoveryProviders({ log }),
      log,
    });
    hub.on('status', () => sendStatus());
    hub.start();
    log('info', `Chiroq markazi ishga tushdi (v${app.getVersion()})`);
  };

  const stopHub = async () => {
    if (!hub) return;
    const current = hub;
    hub = null;
    await current.stop();
    log('info', "Chiroq markazi to'xtatildi");
  };

  const isEnabled = () => readConfig().enabled === true && typeof readConfig().tokenSealed === 'string';

  function publicStatus() {
    return {
      available: Boolean(engine),
      error: engine ? null : engineError,
      encryption: canEncrypt(),
      enabled: isEnabled(),
      running: Boolean(hub && hub.running),
      hub: hub ? hub.status() : null,
    };
  }

  /** Dastur ochilganda: avval yoqilgan bo'lsa markaz darhol ishga tushadi (internetsiz ham) */
  const boot = () => {
    const config = readConfig();
    if (config.enabled !== true || typeof config.tokenSealed !== 'string') return;
    if (!canEncrypt()) {
      log('error', "Windows shifrlash xizmati mavjud emas — token o'qilmadi");
      return;
    }
    try {
      startHub(secretCodec.open(config.tokenSealed));
    } catch (err) {
      log('error', `Chiroq markazini ishga tushirib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /* ------------------------------------------------------------------- IPC */

  const guard = (handler) => async (event, payload) => {
    if (!isTrusted(event)) throw new Error('ruxsat yo‘q');
    return handler(payload ?? {});
  };

  ipcMain.handle('billiardclub:lights:status', guard(() => publicStatus()));

  /** Yoqish: admin serverdan olgan bridge tokeni bilan (token sahifaga qaytmaydi) */
  ipcMain.handle('billiardclub:lights:enable', guard(async ({ token }) => {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new Error('token noto‘g‘ri');
    if (!engine) throw new Error(engineError || 'chiroq dvigateli yuklanmadi');
    if (!canEncrypt()) throw new Error('Windows shifrlash xizmati mavjud emas — tokenni xavfsiz saqlab bo‘lmaydi');
    writeConfig({ enabled: true, tokenSealed: secretCodec.seal(token), since: new Date().toISOString() });
    startHub(token);
    onEnabledChange?.(true);
    sendStatus();
    return publicStatus();
  }));

  ipcMain.handle('billiardclub:lights:disable', guard(async () => {
    await stopHub();
    writeConfig({ enabled: false });
    try {
      fs.unlinkSync(stateFile);
    } catch {
      /* yo'q bo'lsa — muammo emas */
    }
    onEnabledChange?.(false);
    sendStatus();
    return publicStatus();
  }));

  /** Kassa ekranidagi stollar holati — internetsiz ham chiroq o'yinga ergashadi */
  ipcMain.on('billiardclub:lights:view', (event, view) => {
    if (!isTrusted(event) || !hub || !view || typeof view !== 'object') return;
    const tables = Array.isArray(view.tables) ? view.tables.slice(0, 500).map((item) => ({
      tableId: Number(item && item.tableId),
      session: item && (item.session === 'active' || item.session === 'paused') ? item.session : null,
      since: item && (typeof item.since === 'string' || typeof item.since === 'number') ? item.since : null,
      pending: Boolean(item && item.pending === true),
      endedAt: item && (typeof item.endedAt === 'string' || typeof item.endedAt === 'number') ? item.endedAt : null,
    })) : [];
    hub.pushView({
      fetchedAt: typeof view.fetchedAt === 'string' || typeof view.fetchedAt === 'number' ? view.fetchedAt : null,
      serverNow: typeof view.serverNow === 'string' || typeof view.serverNow === 'number' ? view.serverNow : null,
      tables,
    });
  });

  /** Qo'lda boshqaruv (internetsiz ham): bitta/bir nechta stol yoki hammasi */
  ipcMain.handle('billiardclub:lights:override', guard(({ tableIds, on, minutes }) => {
    if (!hub) throw new Error('chiroq markazi yoqilmagan');
    const ids = Array.isArray(tableIds) ? tableIds.slice(0, 500).map(Number).filter(Number.isInteger) : null;
    return hub.setOverride({ tableIds: ids, on: typeof on === 'boolean' ? on : null, minutes: Number(minutes) || 30 });
  }));

  /** Sinov — faqat serverda saqlangan stol sozlamasi bilan */
  ipcMain.handle('billiardclub:lights:test', guard(async ({ tableId, on }) => {
    if (!hub) throw new Error('chiroq markazi yoqilmagan');
    const device = hub.devices.get(Number(tableId));
    if (!device) throw new Error('bu stol uchun saqlangan rele sozlamasi hali yetib kelmadi');
    return hub.testDevice(device, on === true);
  }));

  /** Qurilmalarni qidirish: LAN (Shelly/Tasmota/ESPHome/Sonoff/Tuya) + USB (COM, HID) */
  ipcMain.handle('billiardclub:lights:discover', guard(async ({ subnet }) => {
    if (!engine) throw new Error(engineError || 'chiroq dvigateli yuklanmadi');
    if (discovering) return discovering;
    if (Date.now() - lastDiscoverAt < DISCOVER_MIN_GAP_MS) throw new Error('qidiruv biroz oldin bajarildi — bir necha soniyadan keyin qayta urining');
    lastDiscoverAt = Date.now();
    const scanner = hub || new engine.LightHub({ kind: 'desktop', log, discoveryProviders: engine.defaultDiscoveryProviders({ log }) });
    const cleanSubnet = typeof subnet === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(subnet.trim()) ? subnet.trim() : '';
    discovering = scanner.discoverLocal({ subnet: cleanSubnet })
      .finally(() => { discovering = null; });
    return discovering;
  }));

  /**
   * Tuya kalitlarini Tuya IoT bulutidan olish (sozlashda bir marta, internet bilan).
   * Kalitlar sahifaga qaytadi — admin ularni stollarga biriktirib serverga saqlaydi.
   */
  ipcMain.handle('billiardclub:lights:tuya-cloud', guard(async ({ accessId, accessSecret, region, userId }) => {
    if (!engine || !engine.tuyaCloud || typeof engine.tuyaCloud.fetchTuyaCloudDevices !== 'function') {
      throw new Error('Tuya bulut importi bu versiyada mavjud emas');
    }
    const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
    return engine.tuyaCloud.fetchTuyaCloudDevices({
      accessId: text(accessId, 64),
      accessSecret: text(accessSecret, 128),
      region: text(region, 8),
      userId: text(userId, 64) || undefined,
    });
  }));

  boot();

  return {
    isEnabled,
    stop: () => stopHub(),
  };
}

module.exports = { initLights };
