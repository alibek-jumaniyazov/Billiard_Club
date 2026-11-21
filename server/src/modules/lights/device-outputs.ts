import { LightDriver } from '../../entities/enums';
import type { LightTarget } from './drivers/light-driver';

/**
 * Rele CHIQISHINING identifikatori (bitta plata/qurilmaning bitta kanali).
 * Ikki stol bir xil chiqishni egallamasligi uchun ishlatiladi — masalan 8 kanalli
 * platada 3-kanal faqat bitta stolga tegishli bo'lishi kerak.
 *
 * Faqat SOZLAMA bo'yicha: bitta qurilmaning turli manzillari (alias) yoki fizik
 * ulanishni bilib bo'lmaydi — buni joyida sinov ko'rsatadi.
 */
export function lightOutputKeys(target: LightTarget): string[] {
  const config = target.config ?? {};
  const httpHost = (target.host ?? '').trim().toLowerCase().replace(/:80$/, '');
  const host = (target.host ?? '').trim().toLowerCase();
  const channels = [...new Set([target.channel, ...(config.channels ?? [])])];
  const keys = (type: string, values: Array<string | number>, address = httpHost) =>
    values.map((value) => JSON.stringify([type, address, value]));
  // Modbus: g'altak (FC05) yoki registr (FC06) manzillari
  const modbusAddresses = (): Array<string | number> => (config.mode === 'register'
    ? [...new Set([config.register ?? target.channel + 1, ...(config.channels ?? []).map((ch) => ch + 1)])]
      .map((value) => `r${value}`)
    : [...new Set([config.coil ?? target.channel, ...(config.channels ?? [])])]);
  switch (target.driver) {
    case LightDriver.SHELLY_GEN1:
    case LightDriver.SHELLY_GEN2:
      return keys('shelly', channels);
    case LightDriver.TASMOTA:
      return keys('tasmota', channels);
    case LightDriver.MODBUS_TCP:
      return keys(`modbus:${config.unitId ?? 1}`, modbusAddresses(), host.replace(/:502$/, ''));
    case LightDriver.MODBUS_RTU:
      return config.serialPort
        ? keys(`modbus:${config.unitId ?? 1}`, modbusAddresses(), `serial:${config.serialPort.trim().toLowerCase()}`)
        : [];
    case LightDriver.ESPHOME:
      return config.entity ? keys('esphome', [config.entity]) : [];
    case LightDriver.HOME_ASSISTANT:
      return config.entityId ? keys('home_assistant', [config.entityId]) : [];
    case LightDriver.MQTT:
      return config.topic ? keys('mqtt', [config.topic], '') : [];
    case LightDriver.TUYA:
      // Qurilma ID si manzildan ishonchliroq (IP o'zgarishi mumkin)
      return config.deviceId
        ? keys('tuya', config.dps?.length ? config.dps : channels.map((ch) => ch + 1), config.deviceId.toLowerCase())
        : [];
    case LightDriver.SONOFF:
      return keys('sonoff', channels, config.deviceId ? config.deviceId.toLowerCase() : host.replace(/:8081$/, ''));
    case LightDriver.USB_HID:
      return keys('usb_hid', channels, (config.serialNumber ?? '').toLowerCase());
    case LightDriver.SERIAL:
      // Faqat LCUS shablonida kanal aniq; erkin baytlarda chiqishni bilib bo'lmaydi
      return config.preset === 'lcus' && config.serialPort
        ? keys('lcus', channels, config.serialPort.trim().toLowerCase())
        : [];
    default:
      return []; // Arbitrary TCP/serial/HTTP commands cannot identify an output safely.
  }
}
