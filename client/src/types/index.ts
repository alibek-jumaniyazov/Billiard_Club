/** Server bilan umumiy domen tiplari */

export type UserRole = 'superadmin' | 'admin' | 'kassir' | 'operator';
export type ClubStatus = 'trial' | 'active' | 'expired' | 'blocked';
export type TableStatus = 'free' | 'busy';
export type SessionStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type OrderStatus = 'open' | 'closed' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'transfer';

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

export interface Session {
  id: number;
  clubId: number;
  tableId: number;
  userId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  startTime: string;
  endTime: string | null;
  pausedAt: string | null;
  totalPausedMs: number;
  /** Sessiya boshlanganida muhrlangan soatlik narx */
  pricePerHour: number | null;
  durationMinutes: number | null;
  tableAmount: number;
  barAmount: number;
  totalAmount: number;
  status: SessionStatus;
  paymentMethod: PaymentMethod | null;
  isPaid: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  table?: BilliardTable;
  user?: User | null;
  orders?: Order[];
}

export interface EndSessionResult {
  sessionId: number;
  durationMinutes: number;
  tableAmount: number;
  barAmount: number;
  discount: number;
  totalAmount: number;
  paidNow: number;
  totalDebt: number;
  debtId: number | null;
  isDebt: boolean;
  session: Session;
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
  logo: string | null;
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
  paymentBreakdown: Record<PaymentMethod, number>;
}

export interface Report {
  period: { from: string; to: string; type: string };
  sessions: Session[];
  summary: ReportSummary;
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
}

export interface AuthData {
  user: User;
  club: ClubInfo | null;
  accessToken: string;
  refreshToken: string;
}
