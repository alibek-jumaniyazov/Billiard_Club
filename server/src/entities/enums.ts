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
