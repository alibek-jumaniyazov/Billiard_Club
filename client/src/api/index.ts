import client from './client';
import type {
  ApiResponse,
  AuthData,
  BilliardTable,
  Category,
  Club,
  ClubInfo,
  ClubStats,
  Contract,
  ContractType,
  DashboardStats,
  Debt,
  DebtPayment,
  EndSessionResult,
  Order,
  PaymentMethod,
  PlatformOverview,
  Product,
  Report,
  Session,
  Settings,
  User,
} from '../types';

const get = async <T>(url: string, params?: object): Promise<ApiResponse<T>> =>
  (await client.get<ApiResponse<T>>(url, { params })).data;
const post = async <T>(url: string, body?: object): Promise<ApiResponse<T>> =>
  (await client.post<ApiResponse<T>>(url, body)).data;
const put = async <T>(url: string, body?: object): Promise<ApiResponse<T>> =>
  (await client.put<ApiResponse<T>>(url, body)).data;
const del = async <T>(url: string): Promise<ApiResponse<T>> =>
  (await client.delete<ApiResponse<T>>(url)).data;

export const authApi = {
  login: (username: string, password: string) =>
    post<AuthData>('/auth/login', { username, password }),
  me: () => get<{ user: User; club: ClubInfo | null }>('/auth/me'),
  logout: () => post<void>('/auth/logout'),
};

export const dashboardApi = {
  stats: () => get<DashboardStats>('/dashboard/stats'),
};

export const tablesApi = {
  list: () => get<BilliardTable[]>('/tables'),
  create: (body: object) => post<BilliardTable>('/tables', body),
  update: (id: number, body: object) => put<BilliardTable>(`/tables/${id}`, body),
  remove: (id: number) => del<void>(`/tables/${id}`),
};

export const sessionsApi = {
  list: (params?: object) => get<Session[]>('/sessions', params),
  detail: (id: number) => get<Session>(`/sessions/${id}`),
  start: (body: { tableId: number; customerName?: string; customerPhone?: string }) =>
    post<Session>('/sessions/start', body),
  end: (id: number, body: object) => put<EndSessionResult>(`/sessions/${id}/end`, body),
  pause: (id: number) => put<Session>(`/sessions/${id}/pause`),
  resume: (id: number) => put<Session>(`/sessions/${id}/resume`),
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
  remove: (id: number) => del<void>(`/products/${id}`),
};

export const ordersApi = {
  list: (params?: object) => get<Order[]>('/orders', params),
  todayStats: () => get<{ todayAmount: number; todayCount: number }>('/orders/stats/today'),
  create: (body: { sessionId: number; items: Array<{ productId: number; quantity: number }> }) =>
    post<Order>('/orders', body),
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
  update: (body: object) => put<Settings>('/settings', body),
};

/** Superadmin paneli */
export const adminApi = {
  clubs: () => get<Club[]>('/admin/clubs'),
  overview: () => get<PlatformOverview>('/admin/clubs/overview'),
  club: (id: number) => get<Club>(`/admin/clubs/${id}`),
  clubStats: (id: number) => get<ClubStats>(`/admin/clubs/${id}/stats`),
  createClub: (body: object) => post<Club>('/admin/clubs', body),
  updateClub: (id: number, body: object) => put<Club>(`/admin/clubs/${id}`, body),
  extend: (id: number, body: { months?: number; until?: string }) =>
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
    const res = (err as { response?: { data?: { message?: string } } }).response;
    if (res?.data?.message) return res.data.message;
  }
  return fallback;
};
