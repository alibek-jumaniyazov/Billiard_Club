import client from './client';
import type {
  ApiResponse,
  AuditLog,
  AuthData,
  AuthDeviceSession,
  BilliardTable,
  BridgeTokenResult,
  Category,
  ChangePasswordPayload,
  Club,
  ClubInfo,
  ClubNotification,
  ClubStats,
  Contract,
  ContractType,
  Coupon,
  CouponPayload,
  CreateFeedbackPayload,
  Customer,
  CustomerPayload,
  CustomerProfile,
  DashboardStats,
  Debt,
  DebtPayment,
  EndSessionPayload,
  EndSessionResult,
  Expense,
  ExpensePayload,
  Feedback,
  FeedbackStatus,
  FeedbackType,
  Invoice,
  InvoiceStatus,
  LightMode,
  LightSettingsPayload,
  LightsOverview,
  LightTestResult,
  NotificationAudience,
  NotificationBatch,
  NotificationRecipient,
  NotificationStats,
  Order,
  PaymentMethod,
  Plan,
  PlanPayload,
  PlatformHealth,
  PlatformOverview,
  PlatformStats,
  Product,
  ProductsReport,
  PurchasePayload,
  Report,
  Reservation,
  ReservationPayload,
  SendNotificationPayload,
  Session,
  SessionReceipt,
  Settings,
  StartSessionPayload,
  SubscriptionStatus,
  TableLightConfig,
  TableLightPayload,
  TelegramSettings,
  TokenPair,
  User,
} from '../types';

const get = async <T>(url: string, params?: object): Promise<ApiResponse<T>> =>
  (await client.get<ApiResponse<T>>(url, { params })).data;
const post = async <T>(url: string, body?: object): Promise<ApiResponse<T>> =>
  (await client.post<ApiResponse<T>>(url, body)).data;
const put = async <T>(url: string, body?: object): Promise<ApiResponse<T>> =>
  (await client.put<ApiResponse<T>>(url, body)).data;
/** DELETE tanasi axios da `config.data` orqali yuboriladi (ommaviy o'chirish) */
const del = async <T>(url: string, body?: object): Promise<ApiResponse<T>> =>
  (await client.delete<ApiResponse<T>>(url, { data: body })).data;

export const authApi = {
  login: (username: string, password: string) =>
    post<AuthData>('/auth/login', { username, password }),
  me: () => get<{ user: User; club: ClubInfo | null }>('/auth/me'),
  /** Refresh sessiya cookie orqali topilib bekor qilinadi */
  logout: () => post<void>('/auth/logout', {}),
  /** Faol qurilmalar (refresh sessiyalar) ro'yxati */
  sessions: () => get<AuthDeviceSession[]>('/auth/sessions'),
  /** Joriy qurilmadan tashqari barchasini bekor qilish */
  revokeOtherSessions: () => del<{ revoked: number }>('/auth/sessions'),
  revokeSession: (jti: string) => del<void>(`/auth/sessions/${jti}`),
  /** O'z parolini almashtirish — yangi token juftligi qaytadi */
  changePassword: (body: ChangePasswordPayload) => put<TokenPair>('/auth/password', body),
};

export const dashboardApi = {
  stats: () => get<DashboardStats>('/dashboard/stats'),
};

export const tablesApi = {
  /** Javob ildizida serverNow bor — driftsiz tiker uchun */
  list: () => get<BilliardTable[]>('/tables'),
  detail: (id: number) => get<BilliardTable>(`/tables/${id}`),
  create: (body: object) => post<BilliardTable>('/tables', body),
  update: (id: number, body: object) => put<BilliardTable>(`/tables/${id}`, body),
  remove: (id: number) => del<void>(`/tables/${id}`),
};

/**
 * Stol chiroqlari — butunlay ixtiyoriy imkoniyat (standart rejim 'off').
 * Sozlash amallari admin/superadmin uchun, override kassir va operatorga ham ochiq.
 */
export const lightsApi = {
  /** Klub rejimi + agent holati + BARCHA stollarning chiroq sozlamalari */
  overview: () => get<LightsOverview>('/lights'),
  updateSettings: (body: LightSettingsPayload) =>
    put<{ mode: LightMode; offOnPause: boolean }>('/lights/settings', body),
  /** Faqat yuborilgan maydonlar yangilanadi; bo'sh satr — qiymatni tozalaydi */
  updateTable: (id: number, body: TableLightPayload) =>
    put<TableLightConfig>(`/lights/tables/${id}`, body),
  /** Relega sinov buyrug'i; BRIDGE rejimida javobda queued: true */
  test: (id: number, on: boolean) => post<LightTestResult>(`/lights/tables/${id}/test`, { on }),
  /** Qo'lda yoqish/o'chirish; on=null — override bekor qilinadi */
  override: (id: number, on: boolean | null, minutes?: number) =>
    post<TableLightConfig>(`/lights/tables/${id}/override`, {
      on,
      ...(minutes !== undefined ? { minutes } : {}),
    }),
  /** XOM token faqat shu javobda qaytadi — eski token darhol kuchini yo'qotadi */
  issueBridgeToken: (name?: string) =>
    post<BridgeTokenResult>('/lights/bridge/token', name ? { name } : {}),
};

export const sessionsApi = {
  list: (params?: object) => get<Session[]>('/sessions', params),
  detail: (id: number) => get<Session>(`/sessions/${id}`),
  /** Chek oldindan ko'rish — yakunlamasdan joriy summalar (checkout modal) */
  receipt: (id: number) => get<SessionReceipt>(`/sessions/${id}/receipt`),
  start: (body: StartSessionPayload) => post<Session>('/sessions/start', body),
  end: (id: number, body: EndSessionPayload) =>
    put<EndSessionResult>(`/sessions/${id}/end`, body),
  pause: (id: number) => put<Session>(`/sessions/${id}/pause`),
  resume: (id: number) => put<Session>(`/sessions/${id}/resume`),
  /** Faol sessiyani boshqa stolga ko'chirish */
  transfer: (id: number, tableId: number) =>
    post<Session>(`/sessions/${id}/transfer`, { tableId }),
  cancel: (id: number) => put<Session>(`/sessions/${id}/cancel`),
};

export const categoriesApi = {
  list: () => get<Category[]>('/categories'),
  create: (body: object) => post<Category>('/categories', body),
  update: (id: number, body: object) => put<Category>(`/categories/${id}`, body),
  remove: (id: number) => del<void>(`/categories/${id}`),
};

export const productsApi = {
  list: (params?: object) => get<Product[]>('/products', params),
  create: (body: object) => post<Product>('/products', body),
  update: (id: number, body: object) => put<Product>(`/products/${id}`, body),
  /** Ombor qoldig'ini DELTA bo'yicha to'g'irlash (mutlaq qiymat yuborilmaydi) */
  adjustStock: (id: number, delta: number, reason?: string) =>
    post<Product>(`/products/${id}/stock`, { delta, ...(reason ? { reason } : {}) }),
  remove: (id: number) => del<void>(`/products/${id}`),
};

export const ordersApi = {
  list: (params?: object) => get<Order[]>('/orders', params),
  todayStats: () => get<{ todayAmount: number; todayCount: number }>('/orders/stats/today'),
  create: (body: { sessionId: number; items: Array<{ productId: number; quantity: number }> }) =>
    post<Order>('/orders', body),
  /** Ochiq buyurtmani bekor qilish (ombor qaytariladi) */
  cancel: (id: number) => post<Order>(`/orders/${id}/cancel`),
};

export const debtsApi = {
  list: (params?: object) => get<Debt[]>('/debts', params),
  payments: (id: number) => get<DebtPayment[]>(`/debts/${id}/payments`),
  pay: (id: number, amount: number, paymentMethod: PaymentMethod) =>
    post<Debt>(`/debts/${id}/pay`, { amount, paymentMethod }),
  remove: (id: number) => del<void>(`/debts/${id}`),
};

export const reportsApi = {
  get: (type: string, params?: object) => get<Report>(`/reports/${type}`, params),
  /** Bar/mahsulot savdosi hisoboti */
  products: (type: string, params?: object) =>
    get<ProductsReport>('/reports/products', { type, ...params }),
  /** Excel faylni yuklab olish */
  exportExcel: async (type: string, params?: Record<string, string>) => {
    const res = await client.get('/reports/export/excel', {
      params: { type, ...params },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hisobot_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const staffApi = {
  list: (params?: object) => get<User[]>('/staff', params),
  create: (body: object) => post<User>('/staff', body),
  update: (id: number, body: object) => put<User>(`/staff/${id}`, body),
  remove: (id: number) => del<void>(`/staff/${id}`),
};

export const settingsApi = {
  get: () => get<Settings>('/settings'),
  timezones: () => get<string[]>('/settings/timezones'),
  update: (body: object) => put<Settings>('/settings', body),
};

/** Doimiy mijozlar ro'yxati */
export const customersApi = {
  list: (params?: { search?: string; page?: number; limit?: number }) =>
    get<Customer[]>('/customers', params),
  /** Mijoz profili: statistika + so'nggi sessiyalar */
  profile: (id: number) => get<CustomerProfile>(`/customers/${id}`),
  create: (body: CustomerPayload & { name: string }) => post<Customer>('/customers', body),
  update: (id: number, body: CustomerPayload) => put<Customer>(`/customers/${id}`, body),
  remove: (id: number) => del<void>(`/customers/${id}`),
};

/** Xarajatlar (operator ko'rmaydi) */
export const expensesApi = {
  /** Javob ildizida sum — filtrga mos yig'indi */
  list: (params?: { from?: string; to?: string; category?: string; page?: number; limit?: number }) =>
    get<Expense[]>('/expenses', params),
  categories: () => get<string[]>('/expenses/categories'),
  create: (body: ExpensePayload & { category: string; amount: number }) =>
    post<Expense>('/expenses', body),
  update: (id: number, body: ExpensePayload) => put<Expense>(`/expenses/${id}`, body),
  remove: (id: number) => del<void>(`/expenses/${id}`),
};

/** Bronlar — javobda warning/overlaps bo'lishi mumkin (qat'iy blok emas) */
export const reservationsApi = {
  list: (params?: {
    from?: string;
    to?: string;
    status?: string;
    tableId?: number;
    page?: number;
    limit?: number;
  }) => get<Reservation[]>('/reservations', params),
  detail: (id: number) => get<Reservation>(`/reservations/${id}`),
  create: (body: ReservationPayload & { tableId: number; startsAt: string }) =>
    post<Reservation>('/reservations', body),
  update: (id: number, body: ReservationPayload) => put<Reservation>(`/reservations/${id}`, body),
  cancel: (id: number) => post<Reservation>(`/reservations/${id}/cancel`),
};

/** Klub egasi (admin) obuna sahifasi — LOCKED holatda ham ishlaydi */
export const subscriptionApi = {
  status: () => get<SubscriptionStatus>('/subscription'),
  plans: () => get<Plan[]>('/subscription/plans'),
  purchase: (body: PurchasePayload) => post<Invoice>('/subscription/purchase', body),
  invoices: (params?: { page?: number; limit?: number }) =>
    get<Invoice[]>('/subscription/invoices', params),
  cancelInvoice: (id: number) => del<Invoice>(`/subscription/invoices/${id}`),
};

/** Superadmin savdo paneli: tariflar, kuponlar, hisob-fakturalar */
export const adminBillingApi = {
  plans: () => get<Plan[]>('/admin/plans'),
  createPlan: (body: PlanPayload & { code: string; nameUz: string; nameRu: string; durationDays: number; price: number }) =>
    post<Plan>('/admin/plans', body),
  updatePlan: (id: number, body: PlanPayload) => put<Plan>(`/admin/plans/${id}`, body),
  /** Yumshoq o'chirish — tarif faolsizlantiriladi */
  deactivatePlan: (id: number) => del<Plan>(`/admin/plans/${id}`),

  coupons: () => get<Coupon[]>('/admin/coupons'),
  createCoupon: (body: CouponPayload & { code: string; type: string; value: number }) =>
    post<Coupon>('/admin/coupons', body),
  updateCoupon: (id: number, body: CouponPayload) => put<Coupon>(`/admin/coupons/${id}`, body),
  deactivateCoupon: (id: number) => del<Coupon>(`/admin/coupons/${id}`),

  invoices: (params?: { status?: InvoiceStatus; clubId?: number; page?: number; limit?: number }) =>
    get<Invoice[]>('/admin/invoices', params),
  /** To'lovni tasdiqlash: faktura PAID + shartnoma + obuna uzaytmasi */
  confirmInvoice: (id: number, paymentMethod?: string) =>
    post<Invoice>(`/admin/invoices/${id}/confirm`, paymentMethod ? { paymentMethod } : {}),
  rejectInvoice: (id: number, reason?: string) =>
    post<Invoice>(`/admin/invoices/${id}/reject`, reason ? { reason } : {}),
};

/** Fikr-mulohaza — klub tomoni (blok ekranidan ham ishlaydi) */
export const feedbackApi = {
  submit: (body: CreateFeedbackPayload) => post<Feedback>('/feedback', body),
  list: (params?: { page?: number; limit?: number }) => get<Feedback[]>('/feedback', params),
  /** Biriktirilgan rasm — autentifikatsiyalangan blob (statik /uploads yo'q) */
  attachment: (id: number, index: number) =>
    client
      .get<Blob>(`/feedback/${id}/attachments/${index}`, { responseType: 'blob' })
      .then((res) => res.data),
};

/** Fikr-mulohaza — superadmin paneli */
export const adminFeedbackApi = {
  list: (params?: {
    status?: FeedbackStatus;
    type?: FeedbackType;
    clubId?: number;
    page?: number;
    limit?: number;
  }) => get<Feedback[]>('/admin/feedback', params),
  /** Ochilganda unread -> read ga avtomatik o'tadi */
  detail: (id: number) => get<Feedback>(`/admin/feedback/${id}`),
  updateStatus: (id: number, status: FeedbackStatus) =>
    put<Feedback>(`/admin/feedback/${id}/status`, { status }),
  reply: (id: number, reply: string) => post<Feedback>(`/admin/feedback/${id}/reply`, { reply }),
  /** Biriktirilgan rasm — autentifikatsiyalangan blob (statik /uploads yo'q) */
  attachment: (id: number, index: number) =>
    client
      .get<Blob>(`/admin/feedback/${id}/attachments/${index}`, { responseType: 'blob' })
      .then((res) => res.data),
};

/**
 * Klub egasi xabarnomalari. Har bir mutatsiya javobining ildizida yangi
 * `unreadCount` keladi — qo'ng'iroq badge'i qayta so'rovsiz yangilanadi.
 */
export const notificationsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    status?: 'all' | 'unread' | 'read';
    type?: string;
    search?: string;
  }) => get<ClubNotification[]>('/notifications', params),
  /** Qo'ng'iroq polling'i uchun arzon so'rov */
  unreadCount: () => get<null>('/notifications/unread-count'),
  detail: (id: number) => get<ClubNotification>(`/notifications/${id}`),
  readAll: () => put<null>('/notifications/read-all'),
  read: (id: number) => put<ClubNotification>(`/notifications/${id}/read`),
  unread: (id: number) => put<ClubNotification>(`/notifications/${id}/unread`),
  bulkRead: (ids: number[], read: boolean) =>
    put<null>('/notifications/bulk-read', { ids, read }),
  remove: (id: number) => del<null>(`/notifications/${id}`),
  bulkRemove: (ids: number[]) => del<null>('/notifications', { ids }),
};

/** Superadmin — xabarnoma yuborish va E'LON (batch) bo'yicha tarix */
export const adminNotificationsApi = {
  /** clubId/clubIds berilmasa — auditoriya bo'yicha fan-out (javobda count, batchId) */
  send: (body: SendNotificationPayload) =>
    post<ClubNotification | null>('/admin/notifications', body),
  /** Bitta e'lon = bitta qator (qabul qiluvchilar va o'qish hisobi bilan) */
  history: (params?: {
    page?: number;
    limit?: number;
    type?: string;
    clubId?: number;
    createdById?: number;
    search?: string;
    from?: string;
    to?: string;
    target?: 'any' | 'single' | 'broadcast';
  }) => get<NotificationBatch[]>('/admin/notifications', params),
  batch: (batchId: string) => get<NotificationBatch>(`/admin/notifications/batches/${batchId}`),
  recipients: (
    batchId: string,
    params?: { page?: number; limit?: number; status?: 'all' | 'read' | 'unread'; search?: string },
  ) =>
    get<NotificationRecipient[]>(`/admin/notifications/batches/${batchId}/recipients`, params),
  /** onlyUnread=true — o'qilgan nusxalar saqlanadi (javobda keptCount) */
  recall: (batchId: string, onlyUnread: boolean) =>
    del<null>(`/admin/notifications/batches/${batchId}?onlyUnread=${onlyUnread}`),
  removeRow: (id: number) => del<null>(`/admin/notifications/${id}`),
  stats: () => get<NotificationStats>('/admin/notifications/stats'),
  /** Yuborishdan oldingi "nechta klubga boradi" — javobda count */
  audienceCount: (params: { audience?: NotificationAudience; includeBlocked?: boolean }) =>
    get<null>('/admin/notifications/audience-count', params),
};

/** Platforma boshqaruvi — faqat superadmin */
export const platformApi = {
  stats: () => get<PlatformStats>('/admin/platform/stats'),
  auditLogs: (params?: {
    action?: string;
    clubId?: number;
    userId?: number;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => get<AuditLog[]>('/admin/platform/audit-logs', params),
  telegramSettings: () => get<TelegramSettings>('/admin/platform/telegram-settings'),
  updateTelegramSettings: (events: Record<string, boolean>) =>
    put<TelegramSettings>('/admin/platform/telegram-settings', { events }),
  health: () => get<PlatformHealth>('/admin/platform/health'),
};

/** Superadmin paneli — klublar */
export const adminApi = {
  /** Sahifalangan ro'yxat: ?search=&status=&page=&limit= */
  clubs: (params?: { search?: string; status?: string; page?: number; limit?: number }) =>
    get<Club[]>('/admin/clubs', params),
  overview: () => get<PlatformOverview>('/admin/clubs/overview'),
  club: (id: number) => get<Club>(`/admin/clubs/${id}`),
  clubStats: (id: number) => get<ClubStats>(`/admin/clubs/${id}/stats`),
  createClub: (body: object) => post<Club>('/admin/clubs', body),
  updateClub: (id: number, body: object) => put<Club>(`/admin/clubs/${id}`, body),
  /** months yoki until — aynan bittasi; allowShorten: muddatni qisqartirishga rozilik */
  extend: (id: number, body: { months?: number; until?: string; allowShorten?: boolean }) =>
    post<Club>(`/admin/clubs/${id}/extend`, body),
  block: (id: number) => post<Club>(`/admin/clubs/${id}/block`),
  unblock: (id: number) => post<Club>(`/admin/clubs/${id}/unblock`),
  resetPassword: (id: number, password: string) =>
    post<{ username: string }>(`/admin/clubs/${id}/reset-password`, { password }),
  removeClub: (id: number) => del<void>(`/admin/clubs/${id}`),
  contracts: (id: number) => get<Contract[]>(`/admin/clubs/${id}/contracts`),
  addContract: (
    id: number,
    body: { type: ContractType; amount: number; endDate?: string; notes?: string },
  ) => post<Contract>(`/admin/clubs/${id}/contracts`, body),
  removeContract: (id: number, contractId: number) =>
    del<void>(`/admin/clubs/${id}/contracts/${contractId}`),
};

/** Landing sahifadan ro'yxatdan o'tish (autentifikatsiyasiz) */
export const publicApi = {
  /** Ommaviy tariflar — superadmin boshqaradigan faol tariflar (landing narxlari) */
  plans: () => get<Plan[]>('/public/plans'),
  register: (body: {
    clubName: string;
    ownerName: string;
    phone: string;
    address: string;
    username: string;
    password: string;
    /** Honeypot maydoni — bo'sh bo'lishi kerak */
    website?: string;
  }) => post<AuthData>('/public/register', body),
};

/** Server xatosidan foydalanuvchiga ko'rsatiladigan xabarni ajratib oladi */
export const errorMessage = (err: unknown, fallback: string): string => {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const res = (err as { response?: { data?: { message?: unknown } } }).response;
    // Faqat satr xabar ko'rsatiladi: blob/binar tana yoki obyekt kelsa
    // "[object Object]" o'rniga zaxira matn qaytadi
    if (typeof res?.data?.message === 'string' && res.data.message) return res.data.message;
  }
  return fallback;
};
