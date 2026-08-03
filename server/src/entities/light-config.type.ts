/**
 * Stol chirog'ining drayverga xos qo'shimcha sozlamalari (`tables."lightConfig"` jsonb).
 *
 * Bu tur ATAYLAB entity papkasida turadi va hech narsani import qilmaydi:
 * uni ham `Table` entity si (ustun turi sifatida), ham drayver qatlami
 * (`modules/lights/drivers/light-driver.ts`), ham DTO/servis qatlami ishlatadi.
 * Agar u drayver faylida e'lon qilinganida entity → modul → entity ko'rinishidagi
 * aylanma import paydo bo'lar edi.
 *
 * Drayver qatlami uni `light-driver.ts` dan ham re-export qiladi — mavjud
 * importlar buzilmasin va "drayver shartnomasi" bitta joydan o'qilsin.
 *
 * DIQQAT (maxfiylik): bu obyektga PAROL/TOKEN yozilmaydi — ular alohida
 * `lightAuth` ustunida (`select: false`) saqlanadi.
 */
export interface LightDeviceConfig {
  /** Qo'shimcha rele kanallari (bitta stolda 2–3 lampa). Asosiy `channel` bilan BIRGA qo'llanadi. */
  channels?: number[];

  // --- home_assistant ---
  /** 'switch.stol_3' (majburiy) — nuqtagacha bo'lgan qism xizmat domeni (switch/light) */
  entityId?: string;
  // auth maydonida "Bearer" token saqlanadi: `lightAuth` = long-lived access token (user:pass EMAS)

  // --- esphome ---
  /** switch obyekt nomi: 'relay_1' (majburiy) */
  entity?: string;

  // --- mqtt (faqat bridge) ---
  /** buyruq mavzusi, masalan 'zigbee2mqtt/stol3/set' yoki 'cmnd/tasmota_1/POWER' */
  topic?: string;
  /** default: 'ON' */
  onPayload?: string;
  /** default: 'OFF' */
  offPayload?: string;
  /** holat mavzusi (ixtiyoriy, verify uchun) */
  stateTopic?: string;
  /** default: 'ON' (JSON kelsa {"state":"ON"} ichidan ham qidiriladi) */
  stateOnValue?: string;
  /** default: false */
  retain?: boolean;
  /** default: 0 */
  qos?: 0 | 1;

  // --- modbus_tcp (faqat bridge) ---
  /** default 1 */
  unitId?: number;
  /** default = `channel` */
  coil?: number;

  // --- tcp (faqat bridge) ---
  /** 'A00101A2' (probel/`:` ajratkichlarga ruxsat) */
  onHex?: string;
  offHex?: string;
  /** hex o'rniga matn ('ON\r\n' — \n,\r,\t escape qo'llab-quvvatlanadi) */
  onAscii?: string;
  offAscii?: string;
  /** ixtiyoriy: javobda kutilgan bosh baytlar */
  expectHex?: string;

  // --- serial (faqat bridge) ---
  /** 'COM3' | '/dev/ttyUSB0' */
  serialPort?: string;
  /** default 9600 */
  baudRate?: number;
  // onHex/offHex/onAscii/offAscii — tcp bilan bir xil

  /** Shu stol uchun holatni o'qib tekshirish (klub sozlamasidan ustun) */
  verify?: boolean;
}
