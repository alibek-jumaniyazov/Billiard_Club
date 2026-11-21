'use strict';

/**
 * QO'SHIMCHA QIDIRUVCHILAR — LAN skaneri (lib/discover.js) topa olmaydigan qurilmalar:
 *   - USB rele (COM portlar)  — kompyuterga ulangan CH340/LCUS va RS485 adapterlar
 *   - mDNS                     — Sonoff (eWeLink LAN/DIY), Shelly, ESPHome
 *   - Tuya / Smart Life        — qurilmalarning UDP e'lonlari (6666/6667/7000)
 *   - USB HID rele             — "USBRelay2/4/8" platalari
 *
 * Har bir qidiruvchi: async ({ signal, log, subnet }) => Array<topilgan qurilma>.
 * Topilgan qurilma shakli: { driver, host?, serialPort?, id?, name?, model?, mac?,
 *   channels?, version?, encrypt?, needs?: string[] }  — `needs` — sozlashda
 *   foydalanuvchi qo'shimcha kiritishi kerak bo'lgan maydonlar (masalan Tuya kaliti).
 *
 * Modul topilmasa (masalan `serialport` o'rnatilmagan) qidiruvchi jim o'tkazib
 * yuboriladi — asosiy skanerga halaqit bermaydi.
 */

function optional(modulePath) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(modulePath);
  } catch {
    return null;
  }
}

/** Standart qidiruvchilar ro'yxati (mavjud modullardan yig'iladi) */
function defaultDiscoveryProviders({ log } = {}) {
  const providers = [];
  const serial = optional('./serial');
  if (serial && typeof serial.listPorts === 'function') {
    providers.push(async () => {
      const ports = await serial.listPorts();
      return ports.map((port) => ({
        driver: 'serial',
        serialPort: port.path,
        name: port.friendlyName || port.manufacturer || port.path,
        model: [port.manufacturer, port.vendorId && port.productId ? `${port.vendorId}:${port.productId}` : '']
          .filter(Boolean).join(' '),
        needs: ['bindChannels'],
      }));
    });
  }
  for (const [file, exportName] of [
    ['./mdns', 'discoverMdnsRelays'],
    ['./tuya-discover', 'discoverTuya'],
    ['./usb-hid', 'discoverHidRelays'],
  ]) {
    const mod = optional(file);
    if (mod && typeof mod[exportName] === 'function') {
      providers.push((ctx) => mod[exportName]({ ...ctx, log: ctx.log || log }));
    }
  }
  return providers;
}

module.exports = { defaultDiscoveryProviders };
