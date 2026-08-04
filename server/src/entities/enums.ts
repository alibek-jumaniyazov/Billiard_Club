/**
 * Til-neytral enum qiymatlari — DB da inglizcha saqlanadi,
 * UI da uz/ru ga tarjima qilinadi.
 */
export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  KASSIR = 'kassir',
  OPERATOR = 'operator',
}

export enum ClubStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  BLOCKED = 'blocked',
}

export enum TableStatus {
  FREE = 'free',
  BUSY = 'busy',
}

export enum SessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum OrderStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  TRANSFER = 'transfer',
}

export enum InvoiceStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum CouponType {
  PERCENT = 'percent',
  FIXED = 'fixed',
}

export enum FeedbackType {
  SUGGESTION = 'suggestion',
  COMPLAINT = 'complaint',
  BUG = 'bug',
  FEATURE = 'feature',
}

export enum FeedbackPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum FeedbackStatus {
  UNREAD = 'unread',
  READ = 'read',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

export enum ReservationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SEATED = 'seated',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

/** Stol chirog'ini boshqaruvchi rele turi ('none' — chiroq ulanmagan) */
export enum LightDriver {
  NONE = 'none',
  SHELLY_GEN1 = 'shelly_gen1',
  SHELLY_GEN2 = 'shelly_gen2', // Gen2/Gen3/Plus/Pro (RPC) — digest auth qo'llab-quvvatlanadi
  TASMOTA = 'tasmota',
  ESPHOME = 'esphome', // ESPHome web server REST
  HOME_ASSISTANT = 'home_assistant', // HA REST API (Bearer token)
  MQTT = 'mqtt', // FAQAT bridge rejimida
  TCP = 'tcp', // FAQAT bridge — xom TCP baytlar
  MODBUS_TCP = 'modbus_tcp', // FAQAT bridge — FC5 write coil
  SERIAL = 'serial', // FAQAT bridge — USB rele (COM/ttyUSB)
  HTTP = 'http', // umumiy URL shabloni
}

/**
 * Serverning O'ZI (direct rejim) bajara oladigan drayverlar — hammasi HTTP
 * ustida ishlaydi, shuning uchun bulut server relega to'g'ridan-to'g'ri
 * murojaat qila oladi (SSRF himoyasi doirasida: faqat lokal IPv4).
 */
export const SERVER_CAPABLE_DRIVERS: LightDriver[] = [
  LightDriver.SHELLY_GEN1,
  LightDriver.SHELLY_GEN2,
  LightDriver.TASMOTA,
  LightDriver.ESPHOME,
  LightDriver.HOME_ASSISTANT,
  LightDriver.HTTP,
];

/**
 * Faqat klubdagi agent (bridge) bajara oladigan drayverlar — bular HTTP emas
 * (MQTT broker, xom TCP, Modbus, USB rele), ya'ni klub tarmog'i ichidan
 * ulanish talab qiladi. Klub rejimi 'direct' bo'lsa bu drayverlar taqiqlanadi.
 */
export const BRIDGE_ONLY_DRIVERS: LightDriver[] = [
  LightDriver.MQTT,
  LightDriver.TCP,
  LightDriver.MODBUS_TCP,
  LightDriver.SERIAL,
];

/** Klubning chiroq boshqaruv rejimi: o'chiq / lokal agent orqali / to'g'ridan-to'g'ri */
export enum LightMode {
  OFF = 'off',
  BRIDGE = 'bridge',
  DIRECT = 'direct',
}

/**
 * Desktop dastur relizi qaysi platforma uchun.
 *
 * Qiymatlar electron-updater ning kanal fayllari bilan bevosita bog'liq:
 * win -> latest.yml, mac -> latest-mac.yml, linux -> latest-linux.yml.
 */
export enum ReleasePlatform {
  WIN = 'win',
  MAC = 'mac',
  LINUX = 'linux',
}
