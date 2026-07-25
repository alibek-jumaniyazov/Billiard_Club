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
  SHELLY_GEN2 = 'shelly_gen2',
  TASMOTA = 'tasmota',
  HTTP = 'http',
}

/** Klubning chiroq boshqaruv rejimi: o'chiq / lokal agent orqali / to'g'ridan-to'g'ri */
export enum LightMode {
  OFF = 'off',
  BRIDGE = 'bridge',
  DIRECT = 'direct',
}
