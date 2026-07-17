/** Server bilan umumiy domen tiplari */

export type UserRole = 'superadmin' | 'admin' | 'kassir' | 'operator';
export type ClubStatus = 'trial' | 'active' | 'expired' | 'blocked';
export type TableStatus = 'free' | 'busy';
export type SessionStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type OrderStatus = 'open' | 'closed' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'transfer';
export type InvoiceStatus = 'pending' | 'paid' | 'cancelled' | 'expired';
export type CouponType = 'percent' | 'fixed';
export type FeedbackType = 'suggestion' | 'complaint' | 'bug' | 'feature';
export type FeedbackPriority = 'low' | 'medium' | 'high';
export type FeedbackStatus = 'unread' | 'read' | 'resolved' | 'rejected';
export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show';
export type ClubNotificationType = 'info' | 'warning' | 'promo' | 'maintenance';

export interface User {
  id: number;
  name: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  lastLogin: string | null;
  clubId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClubInfo {
  id: number;
  name: string;
  status: ClubStatus;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  effectiveEndsAt: string | null;
  isExpired: boolean;
}

export interface Club extends ClubInfo {
  ownerName: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  daysLeft: number | null;
  createdAt: string;
  updatedAt: string;
}

export type ContractType = 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'custom';

export interface Contract {
  id: number;
  clubId: number;
  type: ContractType;
  amount: number;
  startDate: string;
  endDate: string;
  notes: string | null;
  createdAt: string;
  club?: Club;
}

export interface PlatformOverview {
  clubs: { total: number; trial: number; active: number; expired: number; blocked: number };
  income: { total: number; thisMonth: number; thisYear: number };
  incomeByMonth: Array<{ month: string; amount: number }>;
  expiringSoon: Club[];
  recentContracts: Contract[];
}

export interface ClubStats {
  club: Club;
  adminUsername: string | null;
  users: number;
  tables: number;
  activeSessions: number;
  totalSessions: number;
  monthlyRevenue: number;
  unpaidDebts: number;
  lastActivityAt: string | null;
}

export interface BilliardTable {
  id: number;
  clubId: number;
  name: string;
  number: number;
  pricePerHour: number;
  status: TableStatus;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  sessions?: Session[];
  todayCompletedSessions?: number;
}

/** Ro'yxatdagi doimiy mijoz */
export interface Customer {
  id: number;
  clubId: number;
  name: string;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mijoz profili: statistika + so'nggi sessiyalar (GET /customers/:id) */
export interface CustomerProfile {
  customer: Customer;
  stats: { totalSessions: number; totalSpent: number; openDebt: number };
  recentSessions: Session[];
}

/** Sessiya segmenti — transfer tarixi (stol/narx oralig'i) */
export interface SessionSegment {
  id: number;
  sessionId: number;
  tableId: number;
  pricePerHour: number;
  startedAt: string;
  endedAt: string | null;
  pausedMs: number;
  createdAt: string;
  table?: BilliardTable;
}

/** Segment bo'yicha hisoblangan band (chek/receipt va end natijasi uchun) */
export interface SegmentBillingItem {
  id: number;
  tableId: number;
  pricePerHour: number;
  startedAt: string;
  endedAt: string | null;
  pausedMs: number;
  billedSeconds: number;
  amount: number;
}

/** Bo'lib to'lash yozuvi (split payment) */
export interface SessionPayment {
  id: number;
  clubId: number;
  sessionId: number;
  saleId: number | null;
  method: PaymentMethod;
  amount: number;
  createdAt: string;
}

/** Hisob-kitob yozuvi — sessiya yakunida haqiqatda to'langan pul */
export interface Sale {
  id: number;
  clubId: number;
  sessionId: number;
  userId: number | null;
  tableAmount: number;
  barAmount: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  discount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user?: User | null;
}

export interface Session {
  id: number;
  clubId: number;
  tableId: number;
  userId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  /** Ro'yxatdagi mijoz (bo'lsa) */
  customerId: number | null;
  startTime: string;
  endTime: string | null;
  pausedAt: string | null;
  totalPausedMs: number;
  /** Sessiya boshlanganida muhrlangan soatlik narx */
  pricePerHour: number | null;
  durationMinutes: number | null;
  /** Faol o'yin davomiyligi soniyalarda (sekundlik hisob) */
  durationSeconds: number | null;
  tableAmount: number;
  barAmount: number;
  totalAmount: number;
  status: SessionStatus;
  paymentMethod: PaymentMethod | null;
  isPaid: boolean;
  /** Qo'lda tuzatish: musbat — ustama, manfiy — chegirma */
  adjustmentAmount: number;
  adjustmentReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  table?: BilliardTable;
  user?: User | null;
  customer?: Customer | null;
  orders?: Order[];
  sale?: Sale | null;
  segments?: SessionSegment[];
  payments?: SessionPayment[];
  /** Detal javobida keladi — soat siljishini hisoblash uchun */
  serverNow?: string;
}

/** Chek oldindan ko'rish (GET /sessions/:id/receipt) — live yoki yakunlangan */
export interface SessionReceipt {
  serverNow: string;
  sessionId: number;
  status: SessionStatus;
  live: boolean;
  startTime: string;
  endTime?: string | null;
  pausedAt?: string | null;
  totalPausedMs: number;
  durationSeconds: number | null;
  durationMinutes: number | null;
  /** Faqat live chekda: joriy segment narxi */
  pricePerHour?: number;
  tableAmount: number;
  barAmount: number;
  /** Faqat yakunlangan chekda */
  adjustmentAmount?: number;
  adjustmentReason?: string | null;
  totalAmount?: number;
  /** Faqat live chekda: stol + bar */
  grossAmount?: number;
  segments: Array<SessionSegment | SegmentBillingItem>;
}

export interface EndSessionResult {
  sessionId: number;
  durationSeconds: number;
  durationMinutes: number;
  tableAmount: number;
  barAmount: number;
  discount: number;
  adjustmentAmount: number;
  adjustmentReason: string | null;
  totalAmount: number;
  paidNow: number;
  payments: Array<{ method: PaymentMethod; amount: number }>;
  totalDebt: number;
  debtId: number | null;
  isDebt: boolean;
  segments: SegmentBillingItem[] | null;
  session: Session;
  serverNow: string;
}

export interface Category {
  id: number;
  clubId: number;
  name: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  products?: Product[];
}

export interface Product {
  id: number;
  clubId: number;
  categoryId: number;
  name: string;
  price: number;
  stock: number;
  unit: string;
  description: string | null;
  isActive: boolean;
  category?: Category;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  price: number;
  subtotal: number;
  product?: Product;
}

export interface Order {
  id: number;
  clubId: number;
  sessionId: number | null;
  tableId: number | null;
  userId: number | null;
  totalAmount: number;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  items?: OrderItem[];
  table?: BilliardTable | null;
  user?: User | null;
}

export interface Debt {
  id: number;
  clubId: number;
  sessionId: number | null;
  userId: number | null;
  customerName: string;
  customerPhone: string | null;
  tableAmount: number;
  barAmount: number;
  totalDebt: number;
  paidAmount: number;
  remainingDebt: number;
  description: string | null;
  isPaid: boolean;
  paidAt: string | null;
  dueDate: string | null;
  createdAt: string;
  session?: Session | null;
  user?: User | null;
}

export interface DebtPayment {
  id: number;
  debtId: number;
  clubId: number;
  userId: number | null;
  amount: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  user?: User | null;
}

export interface Settings {
  id: number;
  clubId: number;
  clubName: string;
  phone: string | null;
  address: string | null;
  currency: string;
  currencySymbol: string;
  defaultTablePrice: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  /** Klub vaqt mintaqasi — "bugun/hafta/oy" chegaralari shu bo'yicha */
  timezone: string;
  logo: string | null;
}

/** Dashboard "so'nggi to'lovlar" qatori */
export interface RecentPayment {
  amount: number;
  method: PaymentMethod;
  createdAt: string;
  sessionId: number | null;
  customerName: string | null;
  tableId: number | null;
  tableName: string | null;
  tableNumber: number | null;
}

export interface DashboardStats {
  totalTables: number;
  freeTables: number;
  busyTables: number;
  dailyRevenue: number;
  monthlyRevenue: number;
  totalCustomers: number;
  activeSessions: number;
  activeSessionsData: Session[];
  recentSessions: Session[];
  last7Days: Array<{ date: string; revenue: number }>;
  weekRevenue: number;
  monthRevenue: number;
  occupancyPercent: number;
  mostUsedTables: Array<{
    tableId: number | null;
    name: string | null;
    number: number | null;
    sessions: number;
    revenue: number;
  }>;
  topCustomers: Array<{
    customerId: number | null;
    name: string | null;
    sessions: number;
    totalSpent: number;
  }>;
  peakHours: Array<{ hour: number; sessions: number }>;
  expenses: { today: number; week: number; month: number };
  recentPayments: RecentPayment[];
  timezone: string;
}

export interface ReportSummary {
  collectedRevenue: number;
  billedRevenue: number;
  tableRevenue: number;
  barRevenue: number;
  totalSessions: number;
  avgSessionDuration: number;
  debtsCreated: number;
  debtsCollected: number;
  expensesTotal: number;
  profit: number;
  paymentBreakdown: Record<PaymentMethod, number>;
}

export interface Report {
  period: { from: string; to: string; type: string };
  sessions: Session[];
  pagination: Pagination;
  summary: ReportSummary;
}

/** Bar/mahsulot savdosi hisoboti qatori (GET /reports/products) */
export interface ProductSalesRow {
  productId: number;
  productName: string;
  categoryName: string | null;
  quantity: number;
  revenue: number;
}

export interface ProductsReport {
  period: { from: string; to: string; type: string };
  products: ProductSalesRow[];
  totals: { quantity: number; revenue: number };
}

/** Xarajat yozuvi */
export interface Expense {
  id: number;
  clubId: number;
  userId: number | null;
  category: string;
  amount: number;
  description: string | null;
  spentAt: string;
  createdAt: string;
  user?: User | null;
}

/** Bron — stolni oldindan band qilish */
export interface Reservation {
  id: number;
  clubId: number;
  tableId: number;
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  startsAt: string;
  durationMinutes: number | null;
  status: ReservationStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  table?: BilliardTable;
  customer?: Customer | null;
}

/** Obuna tarifi (uz+ru nomlar birga keladi, klient tanlaydi) */
export interface Plan {
  id: number;
  code: string;
  nameUz: string;
  nameRu: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  durationDays: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
  features: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Chegirma kuponi */
export interface Coupon {
  id: number;
  code: string;
  type: CouponType;
  value: number;
  maxUses: number | null;
  usedCount: number;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  planId: number | null;
  plan?: Plan | null;
  createdAt: string;
}

/** Hisob-faktura — obuna to'lovi yozuvi */
export interface Invoice {
  id: number;
  clubId: number;
  planId: number | null;
  contractId: number | null;
  number: string;
  amount: number;
  discountAmount: number;
  couponId: number | null;
  status: InvoiceStatus;
  paymentMethod: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  club?: Club;
  plan?: Plan | null;
  contract?: Contract | null;
  coupon?: Coupon | null;
}

/** Obuna holati (GET /subscription) */
export interface SubscriptionStatus {
  club: {
    id: number;
    name: string;
    status: ClubStatus;
    trialEndsAt: string | null;
    subscriptionEndsAt: string | null;
    effectiveEndsAt: string | null;
    isExpired: boolean;
    daysLeft: number | null;
  };
  currentInvoice: Invoice | null;
  lastInvoice: Invoice | null;
  activePlan: Plan | null;
}

/** Fikr-mulohaza (taklif / shikoyat / xatolik / imkoniyat) */
export interface Feedback {
  id: number;
  clubId: number;
  userId: number;
  type: FeedbackType;
  priority: FeedbackPriority;
  category: string | null;
  subject: string;
  message: string;
  attachments: string[] | null;
  status: FeedbackStatus;
  reply: string | null;
  repliedById: number | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  club?: Club;
  user?: User;
  repliedBy?: User | null;
}

/** Klub xabarnomasi (superadmindan) */
export interface ClubNotification {
  id: number;
  clubId: number;
  title: string;
  body: string;
  type: ClubNotificationType | string;
  createdById: number | null;
  readAt: string | null;
  createdAt: string;
  club?: Club;
  createdBy?: User | null;
}

/** Audit jurnali yozuvi */
export interface AuditLog {
  id: number;
  clubId: number | null;
  userId: number | null;
  actorRole: string | null;
  action: string;
  entity: string | null;
  entityId: number | null;
  method: string | null;
  path: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  club?: Club | null;
}

/** Platforma statistikasi (GET /admin/platform/stats) */
export interface PlatformStats {
  clubsByStatus: Record<ClubStatus, number>;
  newClubsPerMonth: Array<{ month: string; count: number }>;
  conversion: { totalClubs: number; convertedClubs: number; ratePercent: number };
  revenuePerMonth: Array<{ month: string; revenue: number }>;
  sessions: { activeNow: number; startedToday: number };
}

/** Telegram hodisa sozlamalari (GET/PUT /admin/platform/telegram-settings) */
export interface TelegramSettings {
  events: Record<string, boolean>;
  updatedAt?: string | null;
}

/** Texnik holat (GET /admin/platform/health) */
export interface PlatformHealth {
  status: 'ok' | 'degraded';
  db: { status: 'up' | 'down'; latencyMs: number | null };
  uptimeSeconds: number;
  version: string;
  memory: { rssMb: number; heapUsedMb: number };
}

/** Faol refresh sessiya (qurilma) — GET /auth/sessions */
export interface AuthDeviceSession {
  jti: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  code?: string;
  data: T;
  pagination?: Pagination;
  totals?: Record<string, number>;
  errors?: unknown;
  /** Tanlangan javoblarda: server vaqti (soat siljishini hisoblash uchun) */
  serverNow?: string;
  /** GET /notifications: o'qilmaganlar soni */
  unreadCount?: number;
  /** GET /expenses: filtrga mos xarajatlar yig'indisi */
  sum?: number;
  /** POST /admin/notifications: nechta klubga yuborildi */
  count?: number;
  /** POST/PUT /reservations: to'qnashuv ogohlantirishi */
  warning?: string;
  overlaps?: Reservation[];
}

export interface AuthData {
  user: User;
  club: ClubInfo | null;
  accessToken: string;
  /** Eski klientlar mosligi uchun tanada ham keladi — endi SAQLANMAYDI (httpOnly cookie) */
  refreshToken?: string;
}

/** PUT /auth/password natijasi — yangi token juftligi */
export interface TokenPair {
  accessToken: string;
  refreshToken?: string;
}

// ==================== So'rov tanasi (payload) tiplari ====================

export interface StartSessionPayload {
  tableId: number;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

export interface EndSessionPayload {
  paymentMethod?: PaymentMethod;
  /** Bo'lib to'lash: yig'indi (totalAmount - qarz) ga teng bo'lishi shart */
  payments?: Array<{ method: PaymentMethod; amount: number }>;
  /** Qo'lda tuzatish: musbat — ustama, manfiy — chegirma; sabab majburiy */
  adjustment?: { amount: number; reason: string };
  discount?: number;
  notes?: string;
  isDebt?: boolean;
  isTableDebt?: boolean;
  isBarDebt?: boolean;
  customerName?: string;
  customerPhone?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface PurchasePayload {
  planId: number;
  couponCode?: string;
}

export interface PlanPayload {
  code?: string;
  nameUz?: string;
  nameRu?: string;
  descriptionUz?: string;
  descriptionRu?: string;
  durationDays?: number;
  price?: number;
  sortOrder?: number;
  isActive?: boolean;
  features?: Record<string, unknown>;
}

export interface CouponPayload {
  code?: string;
  type?: CouponType;
  value?: number;
  maxUses?: number;
  validFrom?: string;
  validTo?: string;
  planId?: number;
  isActive?: boolean;
}

export interface CreateFeedbackPayload {
  type: FeedbackType;
  priority: FeedbackPriority;
  category?: string;
  subject: string;
  message: string;
  /** base64 data-URL lar, eng ko'pi 3 ta */
  attachments?: string[];
}

export interface SendNotificationPayload {
  title: string;
  body: string;
  type?: ClubNotificationType;
  /** Berilmasa — barcha bloklanmagan klublarga */
  clubId?: number;
}

export interface CustomerPayload {
  name?: string;
  phone?: string;
  notes?: string;
}

export interface ExpensePayload {
  category?: string;
  amount?: number;
  description?: string;
  spentAt?: string;
}

export interface ReservationPayload {
  tableId?: number;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  startsAt?: string;
  durationMinutes?: number;
  status?: ReservationStatus;
  notes?: string;
}
