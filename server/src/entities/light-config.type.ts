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

  // --- serial: tayyor shablon ---
  /** 'lcus' — LC Technology USB rele (CH340): baytlar kanal bo'yicha O'ZI hisoblanadi */
  preset?: 'lcus';

  // --- tuya (Smart Life) ---
  /** Qurilma ID si (gwId/devId) — lokal kalit `lightAuth` da */
  deviceId?: string;
  /** Lokal protokol versiyasi: '3.1' | '3.3' | '3.4' | '3.5' (standart 3.3) */
  version?: '3.1' | '3.3' | '3.4' | '3.5';
  /** Kanal tartibidagi aniq DP raqamlari (berilmasa DP = kanal + 1) */
  dps?: number[];

  // --- sonoff (eWeLink LAN / DIY) ---
  // deviceId — yuqoridagi maydon (shifrlangan rejimda majburiy); devicekey `lightAuth` da
  /** true — eWeLink "LAN control" (shifrlangan); false — DIY rejimi */
  encrypt?: boolean;
  /** true — ko'p kanalli API (/zeroconf/switches, outlet bo'yicha) */
  outlets?: boolean;

  // --- modbus_tcp / modbus_rtu ---
  /** modbus_tcp: 'tcp' (MBAP) yoki 'rtu' (RS485↔Ethernet o'tkazgich orqali RTU kadr) */
  framing?: 'tcp' | 'rtu';
  /** 'coil' (FC05/FC01) yoki 'register' (FC06/FC03 — ko'p arzon platalar) */
  mode?: 'coil' | 'register';
  /** register rejimida asosiy registr manzili (standart: kanal + 1) */
  register?: number;
  /** register rejimida yoqish/o'chirish qiymatlari (standart 0x0100 / 0x0200) */
  registerOn?: number;
  registerOff?: number;
  /** register rejimida holatni o'qish (ko'p platalar qo'llamaydi — standart o'chiq) */
  registerReadback?: boolean;
  /** modbus_rtu: juftlik tekshiruvi va stop bitlar */
  parity?: 'none' | 'even' | 'odd';
  stopBits?: 1 | 2;

  // --- usb_hid ---
  /** Plata seriya raqami (bir nechta plata ulangan bo'lsa majburiy) */
  serialNumber?: string;
}
