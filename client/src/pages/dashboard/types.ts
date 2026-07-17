import type { DashboardStats } from '../../types';

/** Tushum-xarajat grafigi nuqtasi (klub-lokal kun, YYYY-MM-DD) */
export interface RevenuePoint {
  date: string;
  revenue: number;
  /** Eski server javobida bo'lmasligi mumkin — grafik feature-detect qiladi */
  expense?: number;
}

/**
 * /dashboard/stats javobining jonli panel uchun kengaytirilgan ko'rinishi.
 * last30Days va openDebtsTotal — yangi server maydonlari; eski serverda
 * kelmasa ham sahifa ishlashda davom etadi (ixtiyoriy maydonlar).
 */
export type LiveDashboardStats = Omit<DashboardStats, 'last7Days'> & {
  last7Days: RevenuePoint[];
  last30Days?: RevenuePoint[];
  openDebtsTotal?: number;
};
