import type {
  ClubNotificationType,
  ClubStatus,
  CouponType,
  FeedbackPriority,
  FeedbackStatus,
  FeedbackType,
  InvoiceStatus,
  PaymentMethod,
  ReservationStatus,
  SessionStatus,
  UserRole,
} from './types';
import { TOKENS } from './theme/tokens';

/** Rol ranglari — Sidebar va Staff sahifasида bir xil (palitra: theme/tokens.ts) */
export const ROLE_COLORS: Record<UserRole, string> = {
  superadmin: TOKENS.color.semantic.error,
  admin: TOKENS.color.gold.base,
  kassir: TOKENS.color.semantic.info,
  operator: TOKENS.color.text.tertiary,
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

// ==================== Fikr-mulohaza ====================

export const FEEDBACK_TYPES: readonly FeedbackType[] = [
  'suggestion',
  'complaint',
  'bug',
  'feature',
] as const;

export const FEEDBACK_PRIORITIES: readonly FeedbackPriority[] = ['low', 'medium', 'high'] as const;

export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  'unread',
  'read',
  'resolved',
  'rejected',
] as const;

/** antd Tag ranglari */
export const FEEDBACK_TYPE_COLORS: Record<FeedbackType, string> = {
  suggestion: 'blue',
  complaint: 'volcano',
  bug: 'red',
  feature: 'purple',
};

export const FEEDBACK_PRIORITY_COLORS: Record<FeedbackPriority, string> = {
  low: 'default',
  medium: 'gold',
  high: 'red',
};

export const FEEDBACK_STATUS_COLORS: Record<FeedbackStatus, string> = {
  unread: 'red',
  read: 'blue',
  resolved: 'green',
  rejected: 'default',
};

// ==================== Bronlar ====================

export const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  'pending',
  'confirmed',
  'seated',
  'cancelled',
  'no_show',
] as const;

export const RESERVATION_STATUS_COLORS: Record<ReservationStatus, string> = {
  pending: 'gold',
  confirmed: 'blue',
  seated: 'green',
  cancelled: 'default',
  no_show: 'red',
};

// ==================== Xarajatlar ====================

/**
 * Tavsiya etiladigan toifalar (server: /expenses/categories bilan bir xil).
 * category maydoni erkin matn — bu ro'yxat select/autocomplete uchun taklif.
 * i18n kaliti: expenses.category.<qiymat>
 */
export const EXPENSE_CATEGORY_SUGGESTIONS = [
  'rent',
  'utilities',
  'salary',
  'products',
  'equipment',
  'repair',
  'marketing',
  'tax',
  'other',
] as const;

export type ExpenseCategorySuggestion = (typeof EXPENSE_CATEGORY_SUGGESTIONS)[number];

// ==================== Obuna / billing ====================

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'pending',
  'paid',
  'cancelled',
  'expired',
] as const;

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  pending: 'gold',
  paid: 'green',
  cancelled: 'default',
  expired: 'red',
};

export const COUPON_TYPES: readonly CouponType[] = ['percent', 'fixed'] as const;

/**
 * Tarif davri yorliqlari: durationDays -> i18n kaliti (plans.period.<key>).
 * Superadmin tarif yaratishda tez tanlov, obuna sahifasida yorliq uchun.
 */
export const PLAN_PERIODS = [
  { days: 30, labelKey: 'monthly' },
  { days: 90, labelKey: 'quarterly' },
  { days: 180, labelKey: 'semiannual' },
  { days: 365, labelKey: 'yearly' },
] as const;

export type PlanPeriod = (typeof PLAN_PERIODS)[number];

/** durationDays ga mos davr yorlig'i kaliti (topilmasa 'custom') */
export const planPeriodKey = (durationDays: number): string =>
  PLAN_PERIODS.find((p) => p.days === durationDays)?.labelKey ?? 'custom';

// ==================== Xabarnomalar ====================

export const NOTIFICATION_TYPES: readonly ClubNotificationType[] = [
  'info',
  'warning',
  'promo',
  'maintenance',
] as const;

export const NOTIFICATION_TYPE_COLORS: Record<ClubNotificationType, string> = {
  info: 'blue',
  warning: 'orange',
  promo: 'purple',
  maintenance: 'red',
};

// ==================== Platforma (superadmin) ====================

/** Telegram hodisalari — server DEFAULT_TELEGRAM_EVENTS bilan bir xil ro'yxat */
export const TELEGRAM_EVENTS = [
  'login',
  'new_trial',
  'new_club',
  'payment',
  'purchase_request',
  'feedback',
  'critical_error',
  'subscription_expiring',
] as const;

export type TelegramEvent = (typeof TELEGRAM_EVENTS)[number];

// ==================== Aloqa ====================

/** Platforma egasining aloqa telefoni (blok ekranida ko'rsatiladi) */
export const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE || '';

/** Obuna sotib olish uchun Telegram havolasi (blok ekrani va landing) */
export const SUPPORT_TELEGRAM =
  import.meta.env.VITE_SUPPORT_TELEGRAM || 'https://t.me/control_billiard_bot';
