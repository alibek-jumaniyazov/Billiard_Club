'use strict';

/**
 * Billiard Club — bridge agenti: USB (SERIAL) RELE drayveri.
 *
 * Eng arzon yechim: kassa kompyuteriga USB orqali ulanadigan 4/8 kanalli rele
 * platasi (COM3 / /dev/ttyUSB0). Plata odatda oddiy baytlarni kutadi:
 *   yoqish   -> A0 01 01 A2
 *   o'chirish -> A0 01 00 A1
 *
 * DIQQAT: bu YAGONA drayver npm paketiga muhtoj — `serialport` (ixtiyoriy).
 * Paket o'rnatilmagan bo'lsa boshqa drayverlar bemalol ishlaydi, faqat
 * shu stol uchun tushunarli xato yoziladi.
 *
 * Port bir marta ochiladi va ochiq holda saqlanadi (har buyruqda qayta ochish
 * ba'zi platalarni "reset" qilib yuboradi). Agent to'xtaganda closeAll() chaqiriladi.
 */

const { errText } = require('./common');

/** Yuklangan `serialport` moduli (bir marta) */
let cachedModule = null;
/** Modulni yuklab bo'lmagan bo'lsa — sabab */
let loadError = null;

/**
 * portPath -> { baudRate, port, promise, discarded }
 *
 * `promise` — portni OCHISH jarayoni. Bitta COM port bir nechta stolga biriktirilgan
 * bo'lsa ikkinchi chaqiruv yangi port ochmaydi, aynan shu promise ni kutadi
 * (aks holda ikkita ochish urinishi bo'lib, muvaffaqiyatsizi muvaffaqiyatlisini
 * ro'yxatdan o'chirib yuborardi va port abadiy yetim qolardi).
 */
const openPorts = new Map();

/** baudRate chegarasi — server bilan bir xil (LightConfigDto) */
const BAUD_MIN = 300;
const BAUD_MAX = 921600;

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
 * Yozuvni ro'yxatdan chiqaradi.
 * DIQQAT: faqat O'ZI yaratgan yozuv o'chiriladi — boshqa (muvaffaqiyatli) urinish
 * ochib qo'ygan portni yetim qoldirib ketmaslik uchun.
 */
function dropEntry(portPath, entry) {
  if (openPorts.get(portPath) === entry) openPorts.delete(portPath);
}

/** Ochiq portni qaytaradi yoki yangisini ochadi */
function getPort(portPath, baudRate) {
  const existing = openPorts.get(portPath);
  if (existing && existing.baudRate === baudRate) {
    // Hali ochilmoqda (port === null) yoki ochiq — ikkala holatda ham SHU promise kutiladi
    if (existing.port === null || existing.port.isOpen) return existing.promise;
  }
  if (existing) {
    // Tezlik boshqacha yoki port yopilib qolgan — eskisini tashlab, yangisini ochamiz
    existing.discarded = true;
    try {
      if (existing.port && existing.port.isOpen) existing.port.close();
    } catch {
      /* e'tiborsiz */
    }
    dropEntry(portPath, existing);
  }

  const { SerialPort } = loadSerialPort();

  const entry = { baudRate, port: null, promise: null, discarded: false };
  // Yozuv promise YARATILISHIDAN OLDIN ro'yxatga qo'yiladi: `new Promise(...)` tanasi
  // SINXRON bajariladi, shuning uchun `new SerialPort` darhol throw qilsa (native
  // binding xatosi) quyidagi `dropEntry` yozuvni haqiqatan o'chira olsin. Aks holda
  // rad etilgan promise keshda abadiy qolib, port boshqa hech qachon ochilmasdi.
  openPorts.set(portPath, entry);
  entry.promise = new Promise((resolve, reject) => {
    let port;
    try {
      port = new SerialPort({ path: portPath, baudRate, autoOpen: true }, (err) => {
        if (err) {
          dropEntry(portPath, entry);
          reject(new Error(`serial: portni ochib bo'lmadi (${portPath}) — ${errText(err)}`));
          return;
        }
        entry.port = port;
        if (entry.discarded) {
          // Kutish paytida boshqa tezlik so'ralgan — bu portni ushlab qolmaymiz
          try {
            port.close();
          } catch {
            /* e'tiborsiz */
          }
          reject(new Error(`serial: port (${portPath}) boshqa tezlik bilan qayta ochildi`));
          return;
        }
        resolve(port);
      });
    } catch (err) {
      dropEntry(portPath, entry);
      reject(new Error(`serial: portni ochib bo'lmadi (${portPath}) — ${errText(err)}`));
      return;
    }

    // Uzilgan USB qurilma jarayonni o'ldirmasin
    port.on('error', () => {
      dropEntry(portPath, entry);
    });
    port.on('close', () => {
      dropEntry(portPath, entry);
    });
  });

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

/**
 * Baytlarni USB rele platasiga yuboradi.
 * @param {object} options { path, baudRate, data: Buffer, timeoutMs }
 */
async function send(options) {
  const portPath = String(options.path || '').trim();
  if (!portPath) throw new Error("serial: port nomi ko'rsatilmagan (masalan COM3)");

  const data = options.data;
  if (!Buffer.isBuffer(data) || !data.length) {
    throw new Error('serial: yuboriladigan baytlar tayyorlanmagan');
  }

  const baudRate = normalizeBaudRate(options.baudRate);
  const timeoutMs = Number(options.timeoutMs) || 3000;
  const port = await getPort(portPath, baudRate);

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

/** Barcha ochiq portlarni yopadi (agent to'xtaganda) */
function closeAll() {
  for (const [portPath, entry] of openPorts) {
    // Hali ochilayotgan port ham keyin yopilsin (discarded belgisi orqali)
    entry.discarded = true;
    try {
      if (entry.port && entry.port.isOpen) entry.port.close();
    } catch {
      /* e'tiborsiz */
    }
    openPorts.delete(portPath);
  }
}

module.exports = { send, closeAll, isAvailable, BAUD_MIN, BAUD_MAX };
