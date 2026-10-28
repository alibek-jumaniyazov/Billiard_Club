import type {
  ClubNotificationType,
  ClubStatus,
  CouponType,
  FeedbackPriority,
  FeedbackStatus,
  FeedbackType,
  InvoiceStatus,
  NotificationAudience,
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

/**
 * Xabarnoma turi -> StatusTag semantik kaliti.
 * IKKALA tomon (klub sahifasi va superadmin paneli) shu yagona xaritadan
 * foydalanadi — compose oynasidagi jonli preview aynan klub ko'radigan
 * ko'rinishni bersin.
 */
export const NOTIFICATION_TAG_KEY: Record<ClubNotificationType, string> = {
  info: 'info',
  warning: 'warning',
  promo: 'promo',
  maintenance: 'maintenance',
};

/** Ommaviy e'lon auditoriyalari */
export const NOTIFICATION_AUDIENCES: readonly NotificationAudience[] = [
  'all',
  'trial',
  'active',
  'expired',
] as const;

/** Klub sahifasidagi o'qilganlik filtri */
export const NOTIFICATION_READ_FILTERS = ['all', 'unread', 'read'] as const;
export type NotificationReadFilter = (typeof NOTIFICATION_READ_FILTERS)[number];

/**
 * Ro'yxat tepasiga yopishtiriladigan muhim turlar — server tomondagi
 * PINNED_TYPES bilan bir xil ro'yxat bo'lishi shart.
 */
export const NOTIFICATION_PINNED_TYPES: readonly string[] = ['maintenance', 'warning'];

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
  'lead',
] as const;

export type TelegramEvent = (typeof TELEGRAM_EVENTS)[number];

// ==================== Navigatsiya (command palette + tab sarlavhalari) ====================

/**
 * Ilova sahifalari — YAGONA manba: command palette (Ctrl+K) ham, AppLayout tab
 * sarlavhasi ham shundan o'qiydi (drift bo'lmasin). Rollar App.tsx dagi
 * `<Protected roles={...}>` bilan bir xil — palette foydalanuvchi kira olmaydigan
 * sahifani ko'rsatmaydi. Dinamik marshrutlar (masalan /admin/clubs/:id/data)
 * bu yerda yo'q. `titleKey` — mavjud `menu.*` i18n kalitlari.
 */
export const NAV_DESTINATIONS: ReadonlyArray<{
  path: string;
  titleKey: string;
  roles: readonly UserRole[];
}> = [
  { path: '/dashboard', titleKey: 'menu.dashboard', roles: ['admin', 'kassir'] },
  { path: '/tables', titleKey: 'menu.tables', roles: ['admin', 'kassir', 'operator'] },
  { path: '/sessions', titleKey: 'menu.sessions', roles: ['admin', 'kassir', 'operator'] },
  { path: '/orders', titleKey: 'menu.orders', roles: ['admin', 'kassir', 'operator'] },
  { path: '/products', titleKey: 'menu.products', roles: ['admin', 'kassir', 'operator'] },
  { path: '/customers', titleKey: 'menu.customers', roles: ['admin', 'kassir', 'operator'] },
  { path: '/reservations', titleKey: 'menu.reservations', roles: ['admin', 'kassir', 'operator'] },
  { path: '/game', titleKey: 'menu.game', roles: ['admin', 'kassir', 'operator'] },
  { path: '/debts', titleKey: 'menu.debts', roles: ['admin', 'kassir'] },
  { path: '/reports', titleKey: 'menu.reports', roles: ['admin', 'kassir'] },
  { path: '/expenses', titleKey: 'menu.expenses', roles: ['admin', 'kassir'] },
  { path: '/shifts', titleKey: 'menu.shifts', roles: ['admin', 'kassir'] },
  { path: '/feedback', titleKey: 'menu.feedback', roles: ['admin', 'kassir', 'operator'] },
  { path: '/notifications', titleKey: 'menu.notifications', roles: ['admin'] },
  { path: '/subscription', titleKey: 'menu.subscription', roles: ['admin'] },
  { path: '/staff', titleKey: 'menu.staff', roles: ['admin'] },
  { path: '/settings', titleKey: 'menu.settings', roles: ['admin'] },
  { path: '/profile', titleKey: 'menu.profile', roles: ['superadmin', 'admin', 'kassir', 'operator'] },
  { path: '/admin', titleKey: 'menu.adminDashboard', roles: ['superadmin'] },
  { path: '/admin/clubs', titleKey: 'menu.clubs', roles: ['superadmin'] },
  { path: '/admin/billing', titleKey: 'menu.adminBilling', roles: ['superadmin'] },
  { path: '/admin/leads', titleKey: 'menu.adminLeads', roles: ['superadmin'] },
  { path: '/admin/feedback', titleKey: 'menu.adminFeedback', roles: ['superadmin'] },
  { path: '/admin/notifications', titleKey: 'menu.adminNotifications', roles: ['superadmin'] },
  { path: '/admin/releases', titleKey: 'menu.adminReleases', roles: ['superadmin'] },
  { path: '/admin/logs', titleKey: 'menu.adminLogs', roles: ['superadmin'] },
  { path: '/admin/settings', titleKey: 'menu.adminSettings', roles: ['superadmin'] },
];

// ==================== Aloqa (avilab.uz) ====================
// Yagona manba: barcha aloqa kanallari avilab.uz ga tegishli.
// Env orqali qayta sozlash mumkin, aks holda quyidagi standart qiymatlar ishlatiladi.

/** Aloqa telefoni (blok ekrani va landing kontakt bo'limi) */
export const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE || '+998 95 850 08 80';

/** Aloqa uchun Telegram havolasi (blok ekrani va landing) */
export const SUPPORT_TELEGRAM =
  import.meta.env.VITE_SUPPORT_TELEGRAM || 'https://t.me/avilab_uz';

/** Aloqa emaili (landing kontakt bo'limi) */
export const SUPPORT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL || 'avilab.com@gmail.com';

/** Instagram sahifasi (footer / kontakt) */
export const SUPPORT_INSTAGRAM =
  import.meta.env.VITE_SUPPORT_INSTAGRAM || 'https://www.instagram.com/avilab.uz';

/** Ishlab chiquvchi / operator brendi (footer atribusiyasi) */
export const VENDOR_NAME = 'avilab.uz';
