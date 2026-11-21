'use strict';

/**
 * USB HID RELE drayveri — "USBRelay1/2/4/8" platalari (www.dcttech.com, 16C0:05DF).
 * Protokol va `node-hid` bilan ishlash: lib/usb-hid.js.
 *
 * Sozlama (server UI aynan shuni yuboradi):
 *   config.serialNumber — plataning 5 belgili ID si (feature report dagi; USB serial
 *                         raqami bu platalarda bo'sh). Kompyuterga BITTA plata ulangan
 *                         bo'lsa shart emas; bir nechta bo'lsa MAJBURIY (aks holda xato).
 *   channel             — 0 dan sanaladi: platadagi rele raqami = channel + 1
 *   config.channels     — stolning qo'shimcha kanallari (masalan ikki chiroq)
 * Host kerak emas. Holatni o'qish mumkin (feature report dagi bitmaska).
 *
 * `node-hid` faqat shu drayver birinchi marta ishlatilganda yuklanadi; yo'q bo'lsa
 * write() tushunarli xato beradi, read() esa noma'lum (null) holat qaytaradi.
 */

const usbHid = require('../usb-hid');

/**
 * Stolning barcha kanallari: asosiy `channel` DOIM birinchi, jami ≤ 9.
 * (drivers/index.js dagi deviceChannels nusxasi — u faylni bu yerdan require qilish
 * aylanma bog'liqlik bo'lardi.) Yuqori chegara bu yerda qirqilmaydi: platada yo'q
 * kanal JIM tashlab yuborilmasin — lib/usb-hid.js aniq xato beradi.
 */
function relayChannels(device) {
  const base = Number.isInteger(device.channel) ? device.channel : 0;
  const list = [base];
  const extra = device.config && Array.isArray(device.config.channels) ? device.config.channels : [];
  for (const item of extra) {
    if (Number.isInteger(item) && item >= 0 && !list.includes(item)) list.push(item);
  }
  return list.slice(0, 9);
}

/** Sozlamadagi plata ID si ('' — ko'rsatilmagan) */
function serialOf(device) {
  return usbHid.normalizeSerial(device && device.config ? device.config.serialNumber : '');
}

function say(ctx, level, message) {
  if (ctx && typeof ctx.log === 'function') ctx.log(level, message);
}

module.exports = {
  name: 'usb_hid',
  readback: () => true,
  // HAMMA USB HID platalar uchun bitta navbat: plata ID sini topish uchun
  // boshqa platalar ham ochiladi — ikki amal bir qurilmada kesishmasin
  // (amallar millisekundlar oladi, navbat sezilmaydi)
  lockKey: () => 'usbhid',
  async write(device, physical, ctx) {
    const channels = relayChannels(device);
    const serialNumber = serialOf(device);
    say(ctx, 'debug', `stol #${device.tableNumber ?? device.tableId}: usb_hid ${serialNumber || 'yagona plata'} `
      + `rele ${channels.map((channel) => channel + 1).join(',')} <- ${physical ? 'ON' : 'OFF'}`);
    await usbHid.writeRelays({ serialNumber, channels, on: physical === true });
  },
  async read(device, ctx) {
    const channels = relayChannels(device);
    try {
      return await usbHid.readRelays({ serialNumber: serialOf(device), channels });
    } catch (err) {
      // Holatni o'qish majburiy emas: noma'lum = null (chaqiruvchi "tasdiqlanmadi" deydi)
      say(ctx, 'debug', `stol #${device.tableNumber ?? device.tableId}: usb_hid holati o'qilmadi — ${err.message}`);
      return channels.map(() => null);
    }
  },
};
