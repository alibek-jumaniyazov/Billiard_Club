'use strict';

/**
 * Billiard Club — bridge agenti: MODBUS RTU kadrlari (framing).
 *
 * RTU kadri:  [unitId] [PDU: funksiya kodi + ma'lumot] [CRC lo] [CRC hi]
 *   - PDU Modbus TCP dagi bilan AYNAN bir xil — farq faqat "o'ram"da:
 *     TCP da MBAP sarlavha, RTU da manzil bayti + CRC16.
 *   - CRC16 (Modbus varianti): boshlang'ich qiymat 0xFFFF, polinom 0xA001
 *     (0x8005 ning teskarisi), natija LITTLE-ENDIAN yoziladi (avval kichik bayt).
 *     Tekshiruv qiymati (CRC katalogi, CRC-16/MODBUS): "123456789" -> 0x4B37.
 *
 * Modul faqat baytlar bilan ishlaydi (tarmoq ham, port ham yo'q) — shu sababli bir
 * xil kod USB-RS485 adapter (COM port) va "transparent" RS485↔Ethernet konverter
 * (oddiy TCP) uchun ishlatiladi.
 *
 * Javobni ajratish (parseResponse) real simlardagi muammolarga chidamli:
 *   - javob bo'laklab keladi (USB adapter / konverter baytlarni paketlab yuboradi);
 *   - kadrdan OLDIN axlat baytlar bo'ladi (RS485 yo'nalishi almashganda 00/FF,
 *     konverterning "ro'yxatdan o'tish" paketi, eski javob qoldig'i);
 *   - xato (exception) javobi: [unitId] [fc | 0x80] [kod] [CRC];
 *   - CRC si mos kelmagan yoki boshqa so'rovga tegishli kadr tashlab yuboriladi.
 *
 * npm bog'liqligi YO'Q.
 */

/** CRC16 jadvali (polinom 0xA001) — modul yuklanganda bir marta hisoblanadi */
const CRC_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    table[index] = crc;
  }
  return table;
})();

/** Eng qisqa RTU javobi — xato javobi: unitId, fc|0x80, kod, CRC(2) */
const MIN_FRAME = 5;

/** RTU kadrining eng katta uzunligi (Modbus spetsifikatsiyasi) */
const MAX_FRAME = 256;

/** Modbus CRC16 — `buffer[start..end)` uchun (natija 0..0xFFFF) */
function crc16(buffer, start = 0, end = buffer.length) {
  let crc = 0xffff;
  for (let index = start; index < end; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xff];
  }
  return crc;
}

/** RTU kadrini yig'adi: unitId + PDU + CRC (little-endian) */
function buildFrame(unitId, pdu) {
  if (!Number.isInteger(unitId) || unitId < 0 || unitId > 247) {
    throw new Error(`modbus: unitId noto'g'ri (${unitId})`);
  }
  if (!Buffer.isBuffer(pdu) || !pdu.length || pdu.length > MAX_FRAME - 3) {
    throw new Error("modbus: so'rov (PDU) noto'g'ri");
  }
  const frame = Buffer.allocUnsafe(pdu.length + 3);
  frame[0] = unitId;
  pdu.copy(frame, 1);
  frame.writeUInt16LE(crc16(frame, 0, pdu.length + 1), pdu.length + 1);
  return frame;
}

/** Kadr butunmi: oxirgi ikki bayt — qolgan qismining CRC si (little-endian) */
function hasValidCrc(buffer, start, end) {
  return end - start >= 4 && crc16(buffer, start, end - 2) === buffer.readUInt16LE(end - 2);
}

/**
 * `offset` dan boshlanadigan JAVOB kadrining to'liq uzunligi (unitId dan CRC gacha).
 * null — hali aniqlab bo'lmaydi (bayt yetishmaydi); -1 — funksiya kodi tanish emas.
 */
function responseLength(buffer, offset) {
  if (buffer.length < offset + 2) return null;
  const functionCode = buffer[offset + 1];
  if (functionCode & 0x80) return MIN_FRAME; // xato javobi
  switch (functionCode) {
    case 0x01: // coillarni o'qish
    case 0x02: // diskret kirishlarni o'qish
    case 0x03: // holding registrlarni o'qish
    case 0x04: // input registrlarni o'qish
      if (buffer.length < offset + 3) return null;
      return 5 + buffer[offset + 2]; // unitId, fc, baytlar soni, ma'lumot, CRC(2)
    case 0x05: // bitta coil yozish — javob so'rovning aks-sadosi
    case 0x06: // bitta registr yozish — javob so'rovning aks-sadosi
    case 0x0f: // bir nechta coil yozish
    case 0x10: // bir nechta registr yozish
      return 8;
    default:
      return -1;
  }
}

/**
 * Kelgan baytlar ichidan KUTILGAN javob kadrini qidiradi.
 *
 * Har bir pozitsiya nomzod sifatida ko'riladi (axlat baytlarni o'tkazib yuborish
 * uchun): unitId va funksiya kodi mos, uzunlik yetarli, CRC to'g'ri bo'lsa — kadr.
 * Chala nomzod javobni to'xtatib qo'ymaydi: undan keyin to'liq va to'g'ri kadr
 * bo'lsa, demak chala nomzod axlat bo'lgan.
 *
 * @param {Buffer} buffer  hozirgacha kelgan baytlar
 * @param {object} expect  { unitId, functionCode, accept?(pdu) -> boolean }
 *   accept — oddiy javobni (xato javobini emas) qo'shimcha tekshiradi: masalan FC05/FC06
 *   aks-sadosidagi manzil so'ralgan manzilga tengmi (eski javob qoldig'ini tashlash).
 * @returns {null | { pdu: Buffer, exception: number|null, start: number, end: number }}
 *   null — to'liq va to'g'ri kadr hali yo'q (yana bayt kutish kerak).
 *   pdu  — funksiya kodi + ma'lumot (unitId va CRC siz) — Modbus TCP dagi PDU bilan bir xil.
 */
function parseResponse(buffer, expect) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MIN_FRAME) return null;
  const unitId = expect.unitId;
  const functionCode = expect.functionCode & 0x7f;
  for (let start = 0; start <= buffer.length - MIN_FRAME; start += 1) {
    if (buffer[start] !== unitId) continue;
    const code = buffer[start + 1];
    if (code !== functionCode && code !== (functionCode | 0x80)) continue;
    const length = responseLength(buffer, start);
    if (length === null || length < MIN_FRAME) continue;
    const end = start + length;
    // Chala yoki buzilgan nomzod — keyingi pozitsiyadan qidirishda davom etamiz
    if (end > buffer.length || !hasValidCrc(buffer, start, end)) continue;
    const pdu = Buffer.from(buffer.subarray(start + 1, end - 2));
    if (code & 0x80) return { pdu, exception: pdu[1], start, end };
    if (typeof expect.accept === 'function' && !expect.accept(pdu)) continue; // boshqa so'rovga tegishli
    return { pdu, exception: null, start, end };
  }
  return null;
}

/** Baytlarni o'qiladigan ko'rinishga keltiradi: "01 05 00 00 FF 00 8C 3A" (log uchun) */
function toHex(buffer) {
  return Array.from(buffer || [], (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

module.exports = {
  crc16,
  buildFrame,
  hasValidCrc,
  responseLength,
  parseResponse,
  toHex,
  MIN_FRAME,
  MAX_FRAME,
};
