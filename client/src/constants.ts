import type { ClubStatus, PaymentMethod, SessionStatus, UserRole } from './types';

/** Rol ranglari — Sidebar va Staff sahifasида bir xil */
export const ROLE_COLORS: Record<UserRole, string> = {
  superadmin: '#f5222d',
  admin: '#faad14',
  kassir: '#1677ff',
  operator: '#8c8c8c',
};

/** antd Tag ranglari */
export const ROLE_TAG_COLORS: Record<UserRole, string> = {
  superadmin: 'red',
  admin: 'gold',
  kassir: 'blue',
  operator: 'default',
};

export const SESSION_STATUS_COLORS: Record<SessionStatus, string> = {
  active: 'green',
  paused: 'orange',
  completed: 'blue',
  cancelled: 'default',
};

export const CLUB_STATUS_COLORS: Record<ClubStatus, string> = {
  trial: 'blue',
  active: 'green',
  expired: 'orange',
  blocked: 'red',
};

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer'];

/** Platforma egasining aloqa telefoni (blok ekranida ko'rsatiladi) */
export const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE || '';

/** Obuna sotib olish uchun Telegram havolasi (blok ekrani va landing) */
export const SUPPORT_TELEGRAM =
  import.meta.env.VITE_SUPPORT_TELEGRAM || 'https://t.me/control_billiard_bot';
