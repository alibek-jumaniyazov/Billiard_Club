import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboardApi, debtsApi } from '../../api';
import { clockOffsetMs } from '../../utils/session';
import type { LiveDashboardStats } from './types';

/** Jim fon yangilanishi oralig'i */
const POLL_MS = 30_000;

interface DashboardState {
  stats: LiveDashboardStats | null;
  /** Faqat birinchi yuklash — skeletlar shu paytda ko'rinadi */
  loading: boolean;
  /** Birinchi yuklash muvaffaqiyatsiz — retry paneli */
  error: boolean;
  /** Qo'lda yangilash tugmasi aylanishi */
  refreshing: boolean;
  /** serverNow - Date.now(): jonli taymerlar soat siljishisiz ishlashi uchun */
  clockOffset: number;
}

/**
 * Bosh sahifa ma'lumotlari: /dashboard/stats ni har 30 soniyada JIM
 * so'raydi (toast/spinner yo'q). Faqat birinchi yuklash skelet/xato
 * ko'rsatadi; keyingi xatolarda oxirgi muvaffaqiyatli holat qoladi.
 */
export const useDashboardStats = () => {
  const [state, setState] = useState<DashboardState>({
    stats: null,
    loading: true,
    error: false,
    refreshing: false,
    clockOffset: 0,
  });
  const mountedRef = useRef(true);

  const fetchStats = useCallback(async (manual = false) => {
    if (manual && mountedRef.current) {
      setState((s) => ({ ...s, refreshing: true }));
    }
    try {
      const res = await dashboardApi.stats();
      const stats = res.data as LiveDashboardStats;
      if (stats.openDebtsTotal === undefined) {
        // Eski server javobi: ochiq qarzlar jamini alohida so'rov bilan olamiz
        try {
          const debts = await debtsApi.list({ status: 'unpaid', limit: 1 });
          stats.openDebtsTotal = debts.totals?.totalRemaining;
        } catch {
          // Jim — karta "—" ko'rsatadi
        }
      }
      if (mountedRef.current) {
        setState({
          stats,
          loading: false,
          error: false,
          refreshing: false,
          clockOffset: clockOffsetMs(res.serverNow),
        });
      }
    } catch {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          // Faqat hali hech narsa yuklanmagan bo'lsa xato paneli
          error: s.stats === null,
          refreshing: false,
        }));
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchStats();
    const interval = setInterval(() => void fetchStats(), POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchStats]);

  const refresh = useCallback(() => void fetchStats(true), [fetchStats]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: false }));
    void fetchStats();
  }, [fetchStats]);

  return { ...state, refresh, retry };
};
