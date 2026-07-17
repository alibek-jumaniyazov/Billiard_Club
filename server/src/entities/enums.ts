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
