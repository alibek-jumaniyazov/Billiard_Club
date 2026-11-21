'use strict';

/**
 * Billiard Club — bridge agenti: USB (SERIAL) RELE drayveri.
 *
 * Eng arzon yechim: kassa kompyuteriga USB orqali ulanadigan 4/8 kanalli rele
 * platasi (COM3 / /dev/ttyUSB0). Plata odatda oddiy baytlarni kutadi:
 *   yoqish   -> A0 01 01 A2
 *   o'chirish -> A0 01 00 A1
 *
 * Ikki xil ishlatish:
 *   send()    — faqat YOZISH (LC Technology "LCUS" va hex buyruqli platalar);
 *   request() — so'rov/javob (Modbus RTU, USB-RS485 adapter): eski kiruvchi baytlarni
 *               tozalaydi, yozadi va javob to'liq kelguncha (isComplete) yoki timeout
 *               gacha baytlarni yig'adi. Bitta portga request() lar NAVBAT bilan ketadi.
 *
 * DIQQAT: bu YAGONA drayver npm paketiga muhtoj — `serialport` (ixtiyoriy).
 * Paket o'rnatilmagan bo'lsa boshqa drayverlar bemalol ishlaydi, faqat
 * shu stol uchun tushunarli xato yoziladi.
 *
 * Port bir marta ochiladi va ochiq holda saqlanadi (har buyruqda qayta ochish
 * ba'zi platalarni "reset" qilib yuboradi). Sozlama (tezlik, parity, stop bit)
 * o'zgarsa port yopiladi va yangi sozlama bilan qayta ochiladi. Agent to'xtaganda
 * closeAll() chaqiriladi.
 */

const { errText } = require('./common');

/** Yuklangan `serialport` moduli (bir marta) */
let cachedModule = null;
/** Modulni yuklab bo'lmagan bo'lsa — sabab */
let loadError = null;

/**
 * portPath -> { key, settings, port, promise, discarded }
 *
 * `promise` — portni OCHISH jarayoni. Bitta COM port bir nechta stolga biriktirilgan
 * bo'lsa ikkinchi chaqiruv yangi port ochmaydi, aynan shu promise ni kutadi
 * (aks holda ikkita ochish urinishi bo'lib, muvaffaqiyatsizi muvaffaqiyatlisini
 * ro'yxatdan o'chirib yuborardi va port abadiy yetim qolardi).
 * `key` — sozlamalar ("9600/8N1"): boshqacha so'ralsa port qayta ochiladi.
 */
const openPorts = new Map();

/**
 * port obyekti -> joriy request() ning qabul qiluvchisi { data(chunk), fail(err) }.
 * Qabul qiluvchi yo'q paytda kelgan baytlar (eski javob qoldig'i, shovqin) TASHLANADI.
 */
const sinks = new WeakMap();

/** portPath -> request() navbatining oxiri */
const queues = new Map();

/** baudRate chegarasi — server bilan bir xil (LightConfigDto) */
const BAUD_MIN = 300;
const BAUD_MAX = 921600;

/** Ruxsat etilgan parity qiymatlari */
const PARITIES = new Set(['none', 'even', 'odd']);

/** request() javob buferi chegarasi — shovqinli liniya xotirani to'ldirmasin */
const MAX_RESPONSE_BYTES = 4096;

/** Port yopilishini ko'pi bilan shuncha kutamiz (keyin baribir davom etamiz) */
const CLOSE_WAIT_MS = 1000;

/** Kiruvchi buferni tozalash (flush) javobini ko'pi bilan shuncha kutamiz */
const FLUSH_WAIT_MS = 200;

/** `serialport` paketini yuklaydi (v9 va v10+ eksport shakllari qo'llab-quvvatlanadi) */
function loadSerialPort() {
  if (cachedModule) return cachedModule;
  if (loadError) throw loadError;

  try {
    // eslint-disable-next-line global-require
    const mod = require('serialport');
    const Ctor = mod && (mod.SerialPort || mod.default || mod);
    if (typeof Ctor !== 'function') throw new Error('modul kutilmagan shaklda');
    cachedModule = { SerialPort: Ctor };
    return cachedModule;
  } catch (err) {
    // Xato matnining faqat BIRINCHI qatori olinadi: require stacki panelga chiqmasin
    const reason = errText(err).split('\n')[0];
    loadError = new Error(
      `USB rele uchun \`serialport\` paketi kerak — bridge papkasida \`npm install serialport\` bajaring (${reason})`,
    );
    throw loadError;
  }
}

/** `serialport` mavjudmi (loglarda ogohlantirish uchun) */
function isAvailable() {
  try {
    loadSerialPort();
    return true;
  } catch {
    return false;
  }
}

/**
 * Windows da COM nomi katta-kichik harfni farqlamaydi: "com4" va "COM4" — bitta port.
 * Bir xil yozilmasa ikkita ochish urinishi bo'lib, ikkinchisi "Access denied" olardi.
 */
function canonicalPath(value) {
  const text = String(value || '').trim();
  return process.platform === 'win32' && /^com\d+$/i.test(text) ? text.toUpperCase() : text;
}

/**
 * Yozuvni ro'yxatdan chiqaradi.
 * DIQQAT: faqat O'ZI yaratgan yozuv o'chiriladi — boshqa (muvaffaqiyatli) urinish
 * ochib qo'ygan portni yetim qoldirib ketmaslik uchun.
 */
function dropEntry(portPath, entry) {
  if (openPorts.get(portPath) === entry) openPorts.delete(portPath);
}

/** Portni yopadi; yopilish tugaganda (yoki CLOSE_WAIT_MS dan keyin) resolve bo'ladi */
function closeQuietly(port) {
  return new Promise((resolve) => {
    if (!port || !port.isOpen) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, CLOSE_WAIT_MS);
    if (typeof timer.unref === 'function') timer.unref();
    try {
      port.close(() => {
        clearTimeout(timer);
        resolve();
      });
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

/** Sozlamalar kaliti: "9600/8N1" */
function settingsKey(settings) {
  return `${settings.baudRate}/${settings.dataBits}${settings.parity[0].toUpperCase()}${settings.stopBits}`;
}

/** Yangi port ochadi (getPort ichidan) */
function openPort(SerialPort, portPath, entry) {
  return new Promise((resolve, reject) => {
    if (entry.discarded) {
      // Eski port yopilishini kutayotganda yana boshqa sozlama so'ralgan
      reject(new Error(`serial: port (${portPath}) boshqa sozlama bilan qayta ochildi`));
      return;
    }
    let port;
    try {
      port = new SerialPort({ path: portPath, ...entry.settings, autoOpen: true }, (err) => {
        if (err) {
          dropEntry(portPath, entry);
          reject(new Error(`serial: portni ochib bo'lmadi (${portPath}) — ${errText(err)}`));
          return;
        }
        entry.port = port;
        if (entry.discarded) {
          // Kutish paytida boshqa sozlama so'ralgan — bu portni ushlab qolmaymiz
          void closeQuietly(port).then(() => {
            reject(new Error(`serial: port (${portPath}) boshqa sozlama bilan qayta ochildi`));
          });
          return;
        }
        resolve(port);
      });
    } catch (err) {
      dropEntry(portPath, entry);
      reject(new Error(`serial: portni ochib bo'lmadi (${portPath}) — ${errText(err)}`));
      return;
    }

    // Kelgan baytlar faqat joriy request() ga boradi; so'rov yo'q paytda — tashlanadi
    // (port "flowing" rejimda: eski baytlar ichki buferda yig'ilib qolmaydi)
    port.on('data', (chunk) => {
      const sink = sinks.get(port);
      if (sink) sink.data(chunk);
    });
    // Uzilgan USB qurilma jarayonni o'ldirmasin
    port.on('error', (err) => {
      dropEntry(portPath, entry);
      const sink = sinks.get(port);
      if (sink) sink.fail(new Error(`serial: ${errText(err)}`));
      // Ro'yxatdan chiqqan port ochiq qolmasin — aks holda keyingi ochish "band" xatosini oladi
      void closeQuietly(port);
    });
    port.on('close', () => {
      dropEntry(portPath, entry);
      const sink = sinks.get(port);
      if (sink) sink.fail(new Error(`serial: port yopildi (${portPath})`));
    });
  });
}

/**
 * Ochiq portni qaytaradi yoki yangisini ochadi.
 * @param {string} portPath
 * @param {object} settings { baudRate, dataBits, parity, stopBits } — normallashtirilgan
 */
function getPort(portPath, settings) {
  const key = settingsKey(settings);
  const existing = openPorts.get(portPath);
  if (existing && existing.key === key && !existing.discarded) {
    // Hali ochilmoqda (port === null) yoki ochiq — ikkala holatda ham SHU promise kutiladi
    if (existing.port === null || existing.port.isOpen) return existing.promise;
  }

  const { SerialPort } = loadSerialPort();

  let previousClosed = Promise.resolve();
  if (existing) {
    // Sozlama boshqacha yoki port yopilib qolgan — eskisini yopib, keyin yangisini ochamiz.
    // Windows da hali yopilmagan COM portni qayta ochib bo'lmaydi ("Access denied").
    existing.discarded = true;
    dropEntry(portPath, existing);
    previousClosed = existing.port
      ? closeQuietly(existing.port)
      : existing.promise.then(() => undefined, () => undefined); // ochilish tugasa o'zi yopiladi
  }

  const entry = { key, settings, port: null, promise: null, discarded: false };
  // Yozuv promise YARATILISHIDAN OLDIN ro'yxatga qo'yiladi: shu port uchun parallel
  // chaqiruvlar yangi ochish boshlamasdan aynan shu promise ni kutsin. Ochish xato
  // bersa (masalan `new SerialPort` darhol throw qilsa) yozuv dropEntry bilan o'chadi —
  // rad etilgan promise keshda abadiy qolib, port boshqa hech qachon ochilmay qolmaydi.
  openPorts.set(portPath, entry);
  entry.promise = previousClosed.then(() => openPort(SerialPort, portPath, entry));
  return entry.promise;
}

/**
 * baudRate ni tekshiradi. Chegaradan chiqqan qiymat JIMGINA qisqartirilmaydi —
 * xato qaytadi (aks holda foydalanuvchi noto'g'ri tezlikda ishlayotganini bilmaydi).
 */
function normalizeBaudRate(value) {
  if (value === undefined || value === null || value === '') return 9600;
  const num = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(num) || num < BAUD_MIN || num > BAUD_MAX) {
    throw new Error(`serial: "baudRate" ${BAUD_MIN}..${BAUD_MAX} oralig'ida bo'lishi kerak (${value})`);
  }
  return num;
}

/** Bo'sh sozlama (kiritilmagan) */
function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

/** Port sozlamalari: baudRate, dataBits (8), parity ('none'), stopBits (1) */
function normalizeSettings(options) {
  const parity = isBlank(options.parity) ? 'none' : String(options.parity).trim().toLowerCase();
  if (!PARITIES.has(parity)) {
    throw new Error(`serial: "parity" none, even yoki odd bo'lishi kerak (${options.parity})`);
  }
  const stopBits = isBlank(options.stopBits) ? 1 : Number(options.stopBits);
  if (stopBits !== 1 && stopBits !== 2) {
    throw new Error(`serial: "stopBits" 1 yoki 2 bo'lishi kerak (${options.stopBits})`);
  }
  const dataBits = isBlank(options.dataBits) ? 8 : Number(options.dataBits);
  if (![5, 6, 7, 8].includes(dataBits)) {
    throw new Error(`serial: "dataBits" 5..8 bo'lishi kerak (${options.dataBits})`);
  }
  return { baudRate: normalizeBaudRate(options.baudRate), dataBits, parity, stopBits };
}

/**
 * Baytlarni USB rele platasiga yuboradi.
 * @param {object} options { path, baudRate, data: Buffer, timeoutMs }
 */
async function send(options) {
  const portPath = canonicalPath(options.path);
  if (!portPath) throw new Error("serial: port nomi ko'rsatilmagan (masalan COM3)");

  const data = options.data;
  if (!Buffer.isBuffer(data) || !data.length) {
    throw new Error('serial: yuboriladigan baytlar tayyorlanmagan');
  }

  const baudRate = normalizeBaudRate(options.baudRate);
  const timeoutMs = Number(options.timeoutMs) || 3000;
  const port = await getPort(portPath, { baudRate, dataBits: 8, parity: 'none', stopBits: 1 });

  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error('serial: yozish timeouti')), timeoutMs);

    port.write(data, (writeErr) => {
      if (writeErr) {
        finish(new Error(`serial: ${errText(writeErr)}`));
        return;
      }
      port.drain((drainErr) => {
        if (drainErr) finish(new Error(`serial: ${errText(drainErr)}`));
        else finish(null);
      });
    });
  });
}

/** Bitta port uchun navbat: request() lar hech qachon bir-biriga aralashmaydi */
function enqueue(portPath, fn) {
  const previous = queues.get(portPath) || Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  queues.set(portPath, tail);
  void tail.then(() => {
    if (queues.get(portPath) === tail) queues.delete(portPath);
  });
  return run;
}

/** Eski kiruvchi baytlarni tashlaydi: OS buferidagi o'qilmagan qoldiq ham (flush) */
function clearInput(port) {
  sinks.delete(port);
  if (typeof port.flush !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, FLUSH_WAIT_MS);
    try {
      port.flush(() => {
        clearTimeout(timer);
        resolve();
      });
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

/** Bitta so'rov/javob almashinuvi (navbat ichida) — timeout portni ochishni ham qamraydi */
function exchange(portPath, settings, data, isComplete, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let port = null;
    let received = Buffer.alloc(0);

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (port && sinks.get(port) === sink) sinks.delete(port);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve(value);
    };

    const sink = {
      data(chunk) {
        received = received.length ? Buffer.concat([received, chunk]) : Buffer.from(chunk);
        if (received.length > MAX_RESPONSE_BYTES) received = received.subarray(received.length - MAX_RESPONSE_BYTES);
        let complete = false;
        try {
          complete = isComplete(received) === true;
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        if (complete) finish(null, received);
      },
      fail: (err) => finish(err),
    };

    const timer = setTimeout(() => {
      if (port === null) finish(new Error(`serial: port ochilmadi (${portPath}) — timeout`));
      else if (received.length) {
        finish(new Error(
          `serial: javob chala yoki noto'g'ri (${received.length} bayt) — baudRate/parity/unitId ni tekshiring`,
        ));
      } else finish(new Error('serial: qurilma javob bermadi (timeout)'));
    }, timeoutMs);
    const onAbort = () => finish(new Error("serial: so'rov to'xtatildi"));

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    (async () => {
      const opened = await getPort(portPath, settings);
      if (settled) return;
      port = opened;
      await clearInput(opened);
      if (settled) return;
      sinks.set(opened, sink);
      opened.write(data, (writeErr) => {
        if (writeErr) {
          finish(new Error(`serial: ${errText(writeErr)}`));
          return;
        }
        opened.drain((drainErr) => {
          if (drainErr) finish(new Error(`serial: ${errText(drainErr)}`));
        });
      });
    })().catch((err) => finish(err instanceof Error ? err : new Error(String(err))));
  });
}

/**
 * So'rov yuborib javobni kutadi (Modbus RTU va boshqa so'rov/javob protokollari).
 * Ochiq port qayta ishlatiladi; sozlama boshqacha bo'lsa port qayta ochiladi.
 *
 * @param {object} options
 *   path        'COM4' | '/dev/ttyUSB0'
 *   baudRate    300..921600 (default 9600)
 *   parity      'none' | 'even' | 'odd' (default 'none')
 *   stopBits    1 | 2 (default 1)
 *   dataBits    5..8 (default 8)
 *   data        Buffer — yuboriladigan baytlar
 *   isComplete  (buffer) => boolean — hozirgacha kelgan baytlar to'liq javobmi
 *   timeoutMs   butun almashinuv (port ochish + yozish + javob) uchun (default 3000)
 *   signal      AbortSignal (ixtiyoriy)
 * @returns {Promise<Buffer>} kelgan baytlar (javobdan oldingi axlat bilan birga —
 *   ajratish chaqiruvchida, masalan modbus-rtu.parseResponse)
 */
async function request(options) {
  const portPath = canonicalPath(options.path);
  if (!portPath) throw new Error("serial: port nomi ko'rsatilmagan (masalan COM3)");

  const data = options.data;
  if (!Buffer.isBuffer(data) || !data.length) {
    throw new Error('serial: yuboriladigan baytlar tayyorlanmagan');
  }
  if (typeof options.isComplete !== 'function') {
    throw new Error('serial: javob tugashini aniqlovchi isComplete() berilmagan');
  }

  const settings = normalizeSettings(options);
  const timeoutMs = Number(options.timeoutMs) || 3000;
  const signal = options.signal || null;
  if (signal && signal.aborted) throw new Error("serial: so'rov to'xtatildi");

  return enqueue(portPath, () => exchange(portPath, settings, data, options.isComplete, timeoutMs, signal));
}

/**
 * Kompyuterdagi COM portlar ro'yxati (sozlash ustasida USB rele topish uchun).
 * `serialport` bo'lmasa bo'sh ro'yxat qaytadi.
 * @returns {Promise<Array<{path:string, manufacturer?:string, vendorId?:string, productId?:string, friendlyName?:string}>>}
 */
async function listPorts() {
  let mod;
  try {
    mod = loadSerialPort();
  } catch {
    return [];
  }
  const list = typeof mod.SerialPort.list === 'function' ? mod.SerialPort.list : null;
  if (!list) return [];
  try {
    const ports = await list.call(mod.SerialPort);
    return (Array.isArray(ports) ? ports : [])
      .filter((port) => port && typeof port.path === 'string')
      .map((port) => ({
        path: port.path,
        manufacturer: port.manufacturer || undefined,
        vendorId: port.vendorId || undefined,
        productId: port.productId || undefined,
        friendlyName: port.friendlyName || undefined,
      }));
  } catch {
    return [];
  }
}

/** Barcha ochiq portlarni yopadi (agent to'xtaganda) */
function closeAll() {
  for (const [portPath, entry] of openPorts) {
    // Hali ochilayotgan port ham keyin yopilsin (discarded belgisi orqali)
    entry.discarded = true;
    if (entry.port && entry.port.isOpen) void closeQuietly(entry.port);
    openPorts.delete(portPath);
  }
}

/**
 * FAQAT TESTLAR UCHUN: haqiqiy `serialport` o'rniga soxta SerialPort klassi.
 * Klassning o'zi yoki { SerialPort } qabul qilinadi; `null` — asl holatga qaytaradi
 * (keyingi chaqiruvda haqiqiy paket yuklanadi). Ochiq portlar yopiladi.
 */
function __setSerialPortModuleForTests(mod) {
  closeAll();
  queues.clear();
  cachedModule = null;
  loadError = null;
  if (mod === null || mod === undefined) return;
  const Ctor = typeof mod === 'function' ? mod : mod.SerialPort || mod.default;
  if (typeof Ctor !== 'function') throw new Error('serial: test uchun SerialPort klassi kerak');
  cachedModule = { SerialPort: Ctor };
}

module.exports = {
  send,
  request,
  closeAll,
  isAvailable,
  listPorts,
  loadSerialPort,
  __setSerialPortModuleForTests,
  BAUD_MIN,
  BAUD_MAX,
};
