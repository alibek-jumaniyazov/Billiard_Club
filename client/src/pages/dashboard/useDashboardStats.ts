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
  /**
   * Qo'lda "Yangilash" muvaffaqiyatsiz tugadi (eski holat ekranda qoldi) —
   * bosish JIM ketmasin, foydalanuvchi ma'lumot eskirganini bilsin
   */
  refreshError: boolean;
  /** Oxirgi MUVAFFAQIYATLI yangilanish vaqti (ms) — "oxirgi holat HH:mm" uchun */
  lastUpdatedAt: number | null;
  /** serverNow - Date.now(): jonli taymerlar soat siljishisiz ishlashi uchun */
  clockOffset: number;
}

/**
 * Bosh sahifa ma'lumotlari: /dashboard/stats ni har 30 soniyada JIM
 * so'raydi (toast/spinner yo'q). Faqat birinchi yuklash skelet/xato
 * ko'rsatadi; keyingi xatolarda oxirgi muvaffaqiyatli holat qoladi.
 */
export const useDashboardStats = (scope?: number) => {
  const [state, setState] = useState<DashboardState>({
    stats: null,
    loading: true,
    error: false,
    refreshing: false,
    refreshError: false,
    lastUpdatedAt: null,
    clockOffset: 0,
  });
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  const fetchStats = useCallback(async (manual = false) => {
    const request = ++requestRef.current;
    if (manual && mountedRef.current) {
      setState((s) => ({ ...s, refreshing: true, refreshError: false }));
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
      if (mountedRef.current && request === requestRef.current) {
        setState({
          stats,
          loading: false,
          error: false,
          refreshing: false,
          refreshError: false,
          lastUpdatedAt: Date.now(),
          clockOffset: clockOffsetMs(res.serverNow),
        });
      }
    } catch {
      if (mountedRef.current && request === requestRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          // Faqat hali hech narsa yuklanmagan bo'lsa xato paneli
          error: s.stats === null,
          refreshing: false,
          // A failed background refresh also means the displayed numbers are old.
          refreshError: s.stats !== null,
        }));
      }
    }
  }, []);

  // Poller FAQAT tab ko'rinib turganda so'raydi (NotificationsContext naqshi):
  // fon rejimidagi/uxlab qolgan planshet dashboard statistikasini bekorga
  // qayta-qayta yuklamaydi. Tabga qaytilganda darhol jim yangilanadi.
  useEffect(() => {
    mountedRef.current = true;
    setState({ stats: null, loading: true, error: false, refreshing: false,
      refreshError: false, lastUpdatedAt: null, clockOffset: 0 });
    void fetchStats();
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchStats();
    };
    const interval = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchStats();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [fetchStats, scope]);

  const refresh = useCallback(() => void fetchStats(true), [fetchStats]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: false, refreshError: false }));
    void fetchStats();
  }, [fetchStats]);

  return { ...state, refresh, retry };
};
