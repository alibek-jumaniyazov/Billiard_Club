import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { notificationsApi } from '../api';
import { useAuth } from './AuthContext';

/** Yangi xabarlarni tekshirish oralig'i (ms) — YAGONA manba */
const POLL_INTERVAL_MS = 60_000;

interface NotificationsContextValue {
  /** Klubdagi jami o'qilmagan xabarlar soni */
  unreadCount: number;
  /** Mutatsiya javobidagi ildiz `unreadCount` ni darhol qo'llash */
  syncUnread: (value: number | undefined) => void;
  /** Serverdan yengil qayta o'qish (GET /notifications/unread-count) */
  refreshUnread: () => Promise<void>;
  /**
   * Har polling tsiklida va har mutatsiyada oshadi. Sahifa va qo'ng'iroq
   * shu qiymatga qarab ro'yxatini yangilaydi — ikkalasi hech qachon
   * bir-biriga zid raqam ko'rsatmaydi.
   */
  version: number;
  bump: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Xabarnomalar holatining yagona egasi.
 *
 * MUAMMO EDI: header qo'ng'irog'i va /notifications sahifasi har biri
 * o'zining `unreadCount` state'ini yuritardi. Sahifada xabarni o'qilgan deb
 * belgilaganda qo'ng'iroq badge'i 60 soniyagacha eski raqamni ko'rsatib
 * turardi (va aksincha).
 */
export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const isClubAdmin = user?.role === 'admin';

  const [unreadCount, setUnreadCount] = useState(0);
  const [version, setVersion] = useState(0);

  const syncUnread = useCallback((value: number | undefined) => {
    if (typeof value === 'number') setUnreadCount(Math.max(0, value));
  }, []);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const refreshUnread = useCallback(async () => {
    if (!isClubAdmin) return;
    try {
      const res = await notificationsApi.unreadCount();
      setUnreadCount(Math.max(0, res.unreadCount ?? 0));
    } catch {
      // Fon so'rovi — xato jimgina o'tkaziladi (keyingi tsiklda qayta uriniladi)
    }
  }, [isClubAdmin]);

  useEffect(() => {
    if (!isClubAdmin) {
      setUnreadCount(0);
      return;
    }

    void refreshUnread();

    const tick = () => {
      // Yashirin varaqda tarmoqni band qilmaymiz
      if (document.visibilityState !== 'visible') return;
      void refreshUnread();
      bump();
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    // Varaqqa qaytilganda darhol yangilash — 60 soniya kutilmasin
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isClubAdmin, refreshUnread, bump]);

  const value = useMemo(
    () => ({ unreadCount, syncUnread, refreshUnread, version, bump }),
    [unreadCount, syncUnread, refreshUnread, version, bump],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
};

export const useNotifications = (): NotificationsContextValue => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications NotificationsProvider ichida ishlatilishi kerak');
  return ctx;
};
