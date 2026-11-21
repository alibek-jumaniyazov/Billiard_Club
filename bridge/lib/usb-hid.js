'use strict';

/**
 * Billiard Club — bridge agenti: USB HID RELE platalari.
 *
 * Arzon "USB Relay" platalari: ishlab chiqaruvchi nomi "www.dcttech.com", mahsulot nomi
 * "USBRelay1" / "USBRelay2" / "USBRelay4" / "USBRelay8" (oxirgi raqam — rele soni).
 * VID 0x16C0 / PID 0x05DF — V-USB ning HID qurilmalar uchun UMUMIY juftligi, shuning
 * uchun plata VID/PID bo'yicha emas, MAHSULOT NOMI bo'yicha ajratiladi (shu ID dagi
 * boshqa V-USB qurilmalariga buyruq ketib qolmasin). Bu COM port EMAS — oddiy HID
 * qurilma: Windows 10/11 uni o'zining HID drayveri bilan taniydi, drayver o'rnatilmaydi.
 *
 * Protokol (pavel-a/usb-relay-hid, darrylb123/usbrelay va hidapi 0.15 manbalari bo'yicha):
 *   buyruq — 9 baytli FEATURE report, 0-bayt — report ID (bu platalarda doim 0):
 *     [0x00, 0xFF, n, 0, 0, 0, 0, 0, 0]   n-releni yoqish   (n = 1..8)
 *     [0x00, 0xFD, n, 0, 0, 0, 0, 0, 0]   n-releni o'chirish
 *     0xFE / 0xFC ("hammasini yoqish/o'chirish") ATAYIN ishlatilmaydi: bitta platada
 *     bir nechta stol bo'lishi mumkin — boshqa stolning chirog'iga tegmaslik kerak.
 *   holat — getFeatureReport(0, 9) -> [0x00, ID (5 bayt), 0, ?, holat]:
 *     1..5-baytlar — plataning ID si (USB "serial number" bu platalarda BO'SH),
 *     8-bayt — relelar bitmaskasi (bit n-1 = n-rele yoniq).
 *   Windows, Linux (hidraw) va macOS da hidapi report ID ni 0-baytda qoldiradi.
 *
 * `node-hid` paketi IXTIYORIY va faqat kerak bo'lganda (usb_hid stol yoki qidiruv)
 * yuklanadi. Yo'q bo'lsa boshqa drayverlar bemalol ishlaydi — faqat shu stol uchun
 * tushunarli xato yoziladi, qidiruv esa bo'sh ro'yxat qaytaradi.
 *
 * Plata HAR AMALDA qayta ochiladi: ochish -> buyruq(lar) yoki o'qish -> yopish (xatoda
 * ham). Ochiq handle saqlanmaydi: USB uzib-ulanganda eskirgan handle muammosi bo'lmaydi
 * va agent to'xtaganda yopiladigan narsa qolmaydi. node-hid ning SINXRON API si
 * ishlatiladi — butun amal bitta qadamda bajariladi, shuning uchun bitta plataga ikki
 * buyruq hech qachon aralashib ketmaydi. Bitta amal bir necha millisekund davom etadi
 * (past tezlikli USB control transfer).
 */

const { errText } = require('./common');

/** V-USB ning HID qurilmalar uchun umumiy VID/PID juftligi (voti.nl / obdev) */
const VENDOR_ID = 0x16c0;
const PRODUCT_ID = 0x05df;

/** Feature report: report ID (0) + 8 bayt ma'lumot */
const REPORT_ID = 0;
const REPORT_LENGTH = 9;

/** Buyruq kodlari (feature report ning 1-bayti) */
const CMD_ON = 0xff;
const CMD_OFF = 0xfd;

/** Platadagi eng ko'p rele soni (holat — bitta bayt) */
const MAX_RELAYS = 8;

/** Plata ID sining uzunligi */
const ID_LENGTH = 5;

/** Mahsulot nomi: "USBRelay" + rele soni (1..8) */
const PRODUCT_PATTERN = /^USBRelay([1-8])$/i;

/** Xato matnida ko'rsatiladigan platalar soni (matn qisqa qolsin) */
const MAX_LISTED = 6;

const NOT_FOUND_MESSAGE =
  'usb_hid: USB rele platasi topilmadi (USBRelay1/2/4/8, 16C0:05DF) — plata ulanganini tekshiring';

/* ------------------------------------------------------------------ */
/*  `node-hid` ni kechiktirib yuklash                                  */
/* ------------------------------------------------------------------ */

/** Yuklangan `node-hid` moduli (bir marta) */
let cachedModule = null;
/** Modulni yuklab bo'lmagan bo'lsa — sabab (har buyruqda qayta urinilmaydi) */
let loadError = null;

/** Xatoning birinchi qatori (require stacki va uzun izohlar panelga chiqmasin) */
function firstLine(err) {
  return errText(err).split('\n')[0].trim();
}

/** Ichki xato matni boshqa xabar ichida — "usb_hid:" takrorlanmasin */
function innerMessage(err) {
  return firstLine(err).replace(/^usb_hid:\s*/, '');
}

function friendlyLoadError(err) {
  return new Error(
    `USB HID rele uchun \`node-hid\` paketi kerak — bridge papkasida \`npm install node-hid\` bajaring (${firstLine(err)})`,
  );
}

/** Modul shaklini tekshiradi: { HID: class, devices: function } (ESM `default` ham) */
function normalizeModule(mod) {
  const root = mod && typeof mod.devices !== 'function' && mod.default ? mod.default : mod;
  if (!root || typeof root.HID !== 'function' || typeof root.devices !== 'function') {
    throw new Error('node-hid moduli kutilmagan shaklda');
  }
  return root;
}

/**
 * `node-hid` paketini yuklaydi. DIQQAT: node-hid native qismini birinchi chaqiruvda
 * yuklaydi — shuning uchun `devices()` / `new HID()` xatolari ham alohida ushlanadi.
 */
function loadHid() {
  if (cachedModule) return cachedModule;
  if (loadError) throw loadError;
  try {
    // eslint-disable-next-line global-require
    cachedModule = normalizeModule(require('node-hid'));
    return cachedModule;
  } catch (err) {
    loadError = friendlyLoadError(err);
    throw loadError;
  }
}

/** `node-hid` mavjudmi (loglarda ogohlantirish uchun) */
function isAvailable() {
  try {
    loadHid();
    return true;
  } catch {
    return false;
  }
}

/**
 * FAQAT testlar uchun: haqiqiy `node-hid` o'rniga soxta modul.
 *   object — soxta modul ({ HID, devices })
 *   Error  — paket o'rnatilmagan holatni taqlid qiladi (shu xato sabab sifatida)
 *   null   — asl holat: keyingi chaqiruvda haqiqiy `require('node-hid')`
 */
function __setHidModuleForTests(fakeModule) {
  cachedModule = null;
  loadError = null;
  if (fakeModule instanceof Error) loadError = friendlyLoadError(fakeModule);
  else if (fakeModule) cachedModule = normalizeModule(fakeModule);
}

/* ------------------------------------------------------------------ */
/*  Protokol yordamchilari                                             */
/* ------------------------------------------------------------------ */

/** HID satrini tozalaydi (oxiridagi NUL va bo'shliqlar) */
function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').trim() : '';
}

/** Sozlamadagi plata ID si: matn (yoki son) -> tozalangan matn; yo'q bo'lsa '' */
function normalizeSerial(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

/** Ikki ID bir xilmi (katta-kichik harf farqi hisobga olinmaydi) */
function sameId(a, b) {
  return Boolean(a) && Boolean(b) && a.toUpperCase() === b.toUpperCase();
}

/** "USBRelay4" -> 4; rele platasi bo'lmasa 0 */
function relayCountFromProduct(product) {
  const match = PRODUCT_PATTERN.exec(cleanText(product));
  return match ? Number(match[1]) : 0;
}

/** n-releni (1..8) yoqish/o'chirish buyrug'i — 9 bayt, report ID bilan */
function commandFrame(relay, on) {
  return [REPORT_ID, on ? CMD_ON : CMD_OFF, relay, 0, 0, 0, 0, 0, 0];
}

/** 5 baytli ID: birinchi 0 baytgacha, faqat ko'rinadigan ASCII (0x21..0x7E); aks holda null */
function parseId(bytes) {
  let text = '';
  for (const byte of bytes) {
    if (byte === 0) break;
    if (byte < 0x21 || byte > 0x7e) return null;
    text += String.fromCharCode(byte);
  }
  return text || null;
}

/**
 * getFeatureReport(0, 9) javobi -> { id: string|null, state: number }; tushunilmasa null.
 * hidapi raqamsiz reportlarda 0-baytga report ID (0) qo'yadi va uni uzunlikka ham
 * qo'shadi: [0x00, ID0..ID4, 0, ?, holat]. Ehtiyot uchun report ID siz 8 baytli javob
 * ham qabul qilinadi.
 */
function parseFeatureReport(raw) {
  if (!raw || typeof raw === 'string' || typeof raw.length !== 'number') return null;
  const bytes = Array.from(raw, (value) => Number(value) & 0xff);
  let payload;
  if (bytes.length >= REPORT_LENGTH) {
    if (bytes[0] !== REPORT_ID) return null;
    payload = bytes.slice(1, REPORT_LENGTH);
  } else if (bytes.length === REPORT_LENGTH - 1) {
    payload = bytes;
  } else {
    return null;
  }
  return { id: parseId(payload.slice(0, ID_LENGTH)), state: payload[7] };
}

/* ------------------------------------------------------------------ */
/*  Platalarni topish, ochish, yopish                                  */
/* ------------------------------------------------------------------ */

/** Ochish xatosiga Linux ruxsati haqida maslahat qo'shadi */
function openHint(message) {
  if (process.platform !== 'linux' || !/permission|EACCES|EPERM/i.test(message)) return '';
  return ' (Linux: /dev/hidraw* uchun udev ruxsati kerak)';
}

/** HID ro'yxatidan USB rele platalarini ajratadi (OCHMASDAN) */
function listCandidates(hid) {
  let list;
  try {
    list = hid.devices(VENDOR_ID, PRODUCT_ID);
  } catch (err) {
    throw new Error(`usb_hid: HID qurilmalar ro'yxatini olib bo'lmadi (node-hid) — ${firstLine(err)}`);
  }
  const seen = new Set();
  const boards = [];
  for (const info of Array.isArray(list) ? list : []) {
    // node-hid filtrlaydi, lekin ehtiyot uchun yana tekshiramiz
    if (!info || Number(info.vendorId) !== VENDOR_ID || Number(info.productId) !== PRODUCT_ID) continue;
    const path = typeof info.path === 'string' ? info.path : '';
    const product = cleanText(info.product);
    const channels = relayCountFromProduct(product);
    // Shu VID/PID dagi boshqa V-USB qurilmalari (nomi "USBRelayN" emas) e'tiborsiz
    if (!path || !channels || seen.has(path)) continue;
    seen.add(path);
    boards.push({ path, product, channels, usbSerial: cleanText(info.serialNumber) || null });
  }
  return boards;
}

/**
 * Bitta HID amali uchun vaqt chegarasi (ms). Windows da hidapi feature report
 * javobini cheksiz kutadi — javob bermay qolgan plata butun dasturni (kompyuter
 * dasturida — oynani ham) qotirib qo'ymasligi uchun amal alohida oqimda
 * (`HIDAsync`) bajariladi va shu muddatdan keyin xato bilan tugatiladi.
 */
const OP_TIMEOUT_MS = 3000;

function withTimeout(promise, what) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    // unref QILINMAYDI: osilib qolgan amal kutilayotganda jarayon jim tugab qolmasin
    timer = setTimeout(() => reject(new Error(`usb_hid: ${what} — plata ${OP_TIMEOUT_MS} ms ichida javob bermadi`)),
      OP_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Platani ochadi va BIR XIL async interfeys qaytaradi:
 *  - node-hid 3+: `HIDAsync` — amallar alohida oqimda, asosiy oqim bo'sh qoladi;
 *  - eski node-hid / testlardagi soxta modul: sinxron `HID` (async qobiqda).
 */
async function openPath(hid, path) {
  try {
    if (hid.HIDAsync && typeof hid.HIDAsync.open === 'function') {
      const device = await withTimeout(Promise.resolve(hid.HIDAsync.open(path)), 'platani ochish');
      return {
        sendFeatureReport: (data) => withTimeout(Promise.resolve(device.sendFeatureReport(data)), 'buyruq yuborish'),
        getFeatureReport: (id, length) => withTimeout(Promise.resolve(device.getFeatureReport(id, length)), "holatni o'qish"),
        close: () => device.close(),
      };
    }
    const device = new hid.HID(path);
    return {
      sendFeatureReport: async (data) => device.sendFeatureReport(data),
      getFeatureReport: async (id, length) => device.getFeatureReport(id, length),
      close: async () => device.close(),
    };
  } catch (err) {
    const message = firstLine(err);
    throw new Error(`usb_hid: platani ochib bo'lmadi — ${message}${openHint(message)}`);
  }
}

async function closeQuietly(handle) {
  if (!handle) return;
  try {
    await withTimeout(Promise.resolve(handle.close()), 'platani yopish');
  } catch {
    /* e'tiborsiz */
  }
}

/** Plataning feature reportini o'qiydi -> { id, state } */
async function readReport(handle) {
  let raw;
  try {
    raw = await handle.getFeatureReport(REPORT_ID, REPORT_LENGTH);
  } catch (err) {
    throw new Error(`usb_hid: plata holatini o'qib bo'lmadi — ${firstLine(err)}`);
  }
  const report = parseFeatureReport(raw);
  if (!report) throw new Error('usb_hid: plata javobi kutilgan formatda emas');
  return report;
}

/** Platani ochib ID sini o'qiydi va DARHOL yopadi (faqat xato matni uchun); xatoda null */
async function probeId(hid, board) {
  let handle = null;
  try {
    handle = await openPath(hid, board.path);
    return (await readReport(handle)).id || board.usbSerial;
  } catch {
    return board.usbSerial;
  } finally {
    await closeQuietly(handle);
  }
}

/** ID lar ro'yxati xato matni uchun; o'qilmagan ID — "?" */
function listIds(ids) {
  const shown = ids.slice(0, MAX_LISTED).map((id) => id || '?');
  if (ids.length > MAX_LISTED) shown.push('...');
  return shown.join(', ');
}

/**
 * Kerakli platani topib OCHADI. Qaytgan `handle` ni chaqiruvchi yopishi SHART.
 *
 * - `serialNumber` yo'q: kompyuterda aynan BITTA plata bo'lishi kerak. Bir nechta
 *   bo'lsa qaysi biriga yozishni taxmin qilmaymiz — aniq xato.
 * - `serialNumber` bor: har bir plata ochilib ID si o'qiladi. ID aynan shu ochilgan
 *   handle dan o'qilgani uchun "ID tekshirildi, boshqa plataga yozildi" holati bo'lmaydi.
 *   Bir xil ID li ikki plata — xato (boshqa stol chirog'ini yoqib yubormaslik uchun).
 *
 * @returns {{ handle: object, board: object, report: ({id: string|null, state: number}|null) }}
 */
async function openBoard(hid, serialNumber) {
  const boards = listCandidates(hid);
  if (!boards.length) throw new Error(NOT_FOUND_MESSAGE);
  const wanted = normalizeSerial(serialNumber);

  if (!wanted) {
    if (boards.length > 1) {
      const ids = [];
      // eslint-disable-next-line no-await-in-loop
      for (const board of boards) ids.push(await probeId(hid, board));
      throw new Error(`usb_hid: kompyuterga ${boards.length} ta USB rele platasi ulangan (${listIds(ids)}) — `
        + 'sozlamada "serialNumber" (plata ID si) ni ko\'rsating');
    }
    return { handle: await openPath(hid, boards[0].path), board: boards[0], report: null };
  }

  const probed = [];
  let chosen = null;
  let firstError = null;
  try {
    for (const board of boards) {
      let handle = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        handle = await openPath(hid, board.path);
        // eslint-disable-next-line no-await-in-loop
        const report = await readReport(handle);
        probed.push({ handle, board, report, id: report.id || board.usbSerial });
      } catch (err) {
        // eslint-disable-next-line no-await-in-loop
        await closeQuietly(handle);
        if (!firstError) firstError = err;
        probed.push({ handle: null, board, report: null, id: board.usbSerial });
      }
    }
    const usable = probed.filter((item) => item.handle);
    const exact = usable.filter((item) => item.id === wanted || item.board.usbSerial === wanted);
    const matches = exact.length
      ? exact
      : usable.filter((item) => sameId(item.id, wanted) || sameId(item.board.usbSerial, wanted));

    if (matches.length > 1) {
      throw new Error(`usb_hid: "${wanted}" ID li ${matches.length} ta plata ulangan — `
        + 'ulardan birining ID sini o\'zgartiring');
    }
    if (matches.length === 1) {
      [chosen] = matches;
      return { handle: chosen.handle, board: chosen.board, report: chosen.report };
    }
    // Hech bir platani ocha olmadik — asl sabab (masalan Linux ruxsati) muhimroq
    if (!usable.length && firstError) throw firstError;
    const failed = firstError ? `; ochilmagan plata bor: ${innerMessage(firstError)}` : '';
    throw new Error(`usb_hid: "${wanted}" ID li plata topilmadi (ulanganlar: `
      + `${listIds(probed.map((item) => item.id))})${failed}`);
  } finally {
    // eslint-disable-next-line no-await-in-loop
    for (const item of probed) if (item !== chosen) await closeQuietly(item.handle);
  }
}

/** Kanal ro'yxati: 0 dan sanaladigan butun sonlar (rele raqami = kanal + 1) */
function normalizeChannels(channels) {
  const list = Array.isArray(channels) && channels.length ? channels : [0];
  for (const channel of list) {
    if (!Number.isInteger(channel) || channel < 0) {
      throw new Error(`usb_hid: kanal raqami noto'g'ri (${channel})`);
    }
  }
  return list;
}

/* ------------------------------------------------------------------ */
/*  Ochiq API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Relelarni yoqadi yoki o'chiradi: ochish -> buyruqlar -> yopish (doim).
 * Amallar alohida oqimda bajariladi (asosiy oqim qotmaydi); bitta platadagi
 * buyruqlar chaqiruvchidagi qulf (lockKey) orqali navbat bilan ketadi.
 * Avval HAMMA kanal plataning rele soni bilan solishtiriladi — yarim bajarilgan
 * buyruq bo'lmasin. Buyruqlar idempotent (yoqish/o'chirish, TOGGLE emas).
 *
 * @param {object} options
 * @param {string} [options.serialNumber] plata ID si; kompyuterda bitta plata bo'lsa shart emas
 * @param {number[]} options.channels      0 dan sanaladigan kanallar
 * @param {boolean} options.on
 * @returns {Promise<{ id: string|null, model: string, channels: number }>}
 */
async function writeRelays({ serialNumber, channels, on } = {}) {
  const list = normalizeChannels(channels);
  const hid = loadHid();
  const { handle, board, report } = await openBoard(hid, serialNumber);
  try {
    for (const channel of list) {
      if (channel + 1 > board.channels) {
        throw new Error(`usb_hid: ${board.product} platasida ${board.channels} ta rele bor — `
          + `${channel + 1}-rele yo'q`);
      }
    }
    for (const channel of list) {
      const relay = channel + 1;
      let written;
      try {
        // eslint-disable-next-line no-await-in-loop
        written = await handle.sendFeatureReport(commandFrame(relay, on === true));
      } catch (err) {
        throw new Error(`usb_hid: ${relay}-relega buyruq yuborilmadi — ${firstLine(err)}`);
      }
      if (typeof written === 'number' && written <= 0) {
        throw new Error(`usb_hid: ${relay}-relega buyruq yuborilmadi`);
      }
    }
    return { id: report ? report.id : null, model: `USBRelay${board.channels}`, channels: board.channels };
  } finally {
    await closeQuietly(handle);
  }
}

/**
 * Relelar holatini o'qiydi: ochish -> o'qish -> yopish (doim).
 * Platada bo'lmagan kanal — null.
 *
 * @param {object} options { serialNumber?, channels: number[] }
 * @returns {Promise<Array<boolean|null>>}
 */
async function readRelays({ serialNumber, channels } = {}) {
  const list = normalizeChannels(channels);
  const hid = loadHid();
  const { handle, board, report: probed } = await openBoard(hid, serialNumber);
  try {
    // serialNumber bilan topilganda holat shu handle dan hozirgina o'qilgan
    const report = probed || await readReport(handle);
    return list.map((channel) => (channel < board.channels ? (report.state & (1 << channel)) !== 0 : null));
  } finally {
    await closeQuietly(handle);
  }
}

/**
 * Kompyuterga ulangan USB HID rele platalarini qidiradi (sozlash ustasi uchun).
 * HECH QACHON throw qilmaydi: `node-hid` yo'q yoki xato bo'lsa — bo'sh ro'yxat.
 * Relelarga TEGILMAYDI: faqat ID va holat o'qiladi.
 *
 * @param {{ log?: (level: string, message: string) => void, signal?: AbortSignal }} [ctx]
 * @returns {Promise<Array<{ driver: 'usb_hid', id: string|null, serialNumber: string|null,
 *   name: string, channels: number, model: string, needs: string[] }>>}
 */
async function discoverHidRelays(ctx) {
  const { log, signal } = ctx || {};
  const say = (level, message) => {
    try {
      if (typeof log === 'function') log(level, message);
    } catch {
      /* e'tiborsiz */
    }
  };
  try {
    if (signal && signal.aborted) return [];
    let hid;
    try {
      hid = loadHid();
    } catch (err) {
      say('debug', `USB HID relelar qidirilmadi: ${firstLine(err)}`);
      return [];
    }

    const found = [];
    for (const board of listCandidates(hid)) {
      if (signal && signal.aborted) break;
      let handle = null;
      let id = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        handle = await openPath(hid, board.path);
        // eslint-disable-next-line no-await-in-loop
        id = (await readReport(handle)).id;
      } catch (err) {
        say('error', `USB HID rele (${board.product}) ID sini o'qib bo'lmadi: ${innerMessage(err)}`);
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await closeQuietly(handle);
      }
      const serialNumber = id || board.usbSerial || null;
      found.push({
        driver: 'usb_hid',
        id: serialNumber,
        serialNumber,
        name: board.product,
        channels: board.channels,
        model: `USBRelay${board.channels}`,
        needs: ['bindChannels'],
      });
    }

    // Arzon platalarda ID takrorlanishi mumkin — bunday platalarni farqlab bo'lmaydi
    const counts = new Map();
    for (const item of found) {
      if (item.serialNumber) counts.set(item.serialNumber, (counts.get(item.serialNumber) || 0) + 1);
    }
    for (const [id, count] of counts) {
      if (count > 1) {
        say('error', `USB HID: "${id}" ID li ${count} ta plata topildi — ID lar farqli bo'lmasa ularni `
          + 'alohida boshqarib bo\'lmaydi');
      }
    }
    return found;
  } catch (err) {
    say('error', `USB HID relelarni qidirishda xato: ${innerMessage(err)}`);
    return [];
  }
}

module.exports = {
  VENDOR_ID,
  PRODUCT_ID,
  REPORT_LENGTH,
  CMD_ON,
  CMD_OFF,
  MAX_RELAYS,
  loadHid,
  isAvailable,
  normalizeSerial,
  relayCountFromProduct,
  commandFrame,
  parseFeatureReport,
  writeRelays,
  readRelays,
  discoverHidRelays,
  __setHidModuleForTests,
};
