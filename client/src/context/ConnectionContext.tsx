import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fullScope, lastSyncAt } from '../offline/cache';
// Global `window.billiardclubDesktop` turi shu modulda e'lon qilingan —
// import qilinmasa `reportPending` chaqiruvi TS uchun noma'lum bo'lardi.
import '../offline/desktop';
import { onNetworkChange, isOnline as readOnline } from '../offline/net-status';
import {
  flushQueue,
  onQueueChange,
  queueList,
  queueRemove,
  queueRetry,
  type QueueEntry,
} from '../offline/queue';
import { useAuth } from './AuthContext';

/**
 * ULANISH KONTEKSTI — "internet bormi va yuborilmagan amal bormi".
 *
 * Butun interfeys shu yagona manbadan foydalanadi: yuqoridagi holat chizig'i,
 * sarlavhadagi belgi va oflayn amallar ro'yxati. Har bir sahifa o'zicha
 * `navigator.onLine` ni tekshirmaydi — bu holat bir joyda va aniq turadi.
 */
interface ConnectionContextValue {
  /** Server bilan aloqa bormi (haqiqiy so'rovlar natijasidan) */
  online: boolean;
  /** Yuborilishini kutayotgan amallar soni */
  pending: number;
  /** Doimiy xato bilan to'xtagan amallar soni — foydalanuvchi hal qilishi kerak */
  failed: number;
  /** Oxirgi muvaffaqiyatli ma'lumot olingan vaqt (ms) */
  lastSync: number | null;
  /** Navbatdagi amallarning to'liq ro'yxati (oflayn oynasi uchun) */
  entries: QueueEntry[];
  /** Navbatni hoziroq yuborishga urinish */
  sync: () => Promise<void>;
  /** Xato bo'lgan amalni qayta urinish */
  retry: (seq: number) => Promise<void>;
  /**
   * Amaldan voz kechish (yozuv serverga BORMAYDI).
   * Bu amalga BOG'LIQ keyingi amallar ham olib tashlanadi.
   * @returns nechta yozuv olib tashlangani
   */
  discard: (seq: number) => Promise<number>;
  /** Ro'yxatni qayta o'qish */
  reload: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

/** Ulanish tiklanganda navbatni qayta yuborishga urinish oralig'i (ms) */
const RETRY_INTERVAL_MS = 20_000;

export const ConnectionProvider = ({ children }: { children: ReactNode }) => {
  const { user, restoredOffline, refreshMe } = useAuth();
  const [online, setOnline] = useState(readOnline);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);

  /**
   * Navbat FAQAT joriy doira (foydalanuvchi + klub) bo'yicha ko'rsatiladi.
   *
   * Navbat chiqishda ATAYLAB tozalanmaydi — yuborilmagan pul amali
   * yo'qolmasligi kerak. Lekin shu sababli bir kassa kompyuterida ikkinchi
   * xodim kirganda birinchisining yozuvlari IndexedDB da turaveradi.
   * Filtrsiz holatda ular yangi xodimning ekranida ko'rinardi va oflayn
   * qoplama (overlay) uning stollarini noto'g'ri "band" qilib qo'yardi.
   * Yuborish (flushQueue) allaqachon doira bo'yicha cheklangan — ko'rinish
   * ham xuddi shunday bo'lishi shart.
   */
  const reload = useCallback(async () => {
    const scope = fullScope();
    const [rows, sync] = await Promise.all([queueList(), lastSyncAt()]);
    const mine = scope ? rows.filter((r) => r.scope === scope) : [];
    setEntries(mine);
    setPending(mine.filter((r) => r.status === 'pending').length);
    setFailed(mine.filter((r) => r.status === 'failed').length);
    setLastSync(sync);
  }, []);

  // Tarmoq holati — haqiqiy so'rovlar natijasidan (net-status.ts)
  useEffect(() => onNetworkChange(setOnline), []);

  /**
   * Aloqa tiklandi va sessiya OFLAYN suratdan tiklangan edi — foydalanuvchi
   * va klub holatini serverdan qayta so'raymiz. Bu ikki narsani beradi:
   *  1) yangi access token (interceptor refresh orqali) — navbat yuborilishi uchun;
   *  2) klubning HAQIQIY obuna holati — oflayn suratda u eskirgan bo'lishi mumkin
   *     (masalan superadmin klubni bloklagan bo'lsa, blok ekrani chiqishi shart).
   */
  useEffect(() => {
    if (!online || !user || !restoredOffline) return;
    void refreshMe().catch(() => undefined);
  }, [online, user, restoredOffline, refreshMe]);

  // Navbat o'zgarishlari. `user` bog'liqlikda: kirish/chiqishda doira
  // o'zgaradi va ro'yxat yangi egasi bo'yicha qayta filtrlanishi kerak
  useEffect(() => {
    void reload();
    return onQueueChange(() => void reload());
  }, [reload, user]);

  const sync = useCallback(async () => {
    const scope = fullScope();
    if (!scope) return;
    await flushQueue(scope);
    await reload();
  }, [reload]);

  /**
   * Avtomatik yuborish: ulanish tiklanganda darhol, so'ng navbat bo'shamaguncha
   * har 20 soniyada. Foydalanuvchi hech narsa qilmasa ham amallar o'z-o'zidan
   * serverga yetib boradi.
   */
  const syncRef = useRef(sync);
  syncRef.current = sync;

  useEffect(() => {
    if (!user || !online || pending === 0) return undefined;
    void syncRef.current();
    const timer = setInterval(() => void syncRef.current(), RETRY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user, online, pending]);

  /**
   * Desktop qobig'iga yuborilmagan amallar sonini bildiramiz — dastur
   * yopilayotganda foydalanuvchi ogohlantiriladi (desktop/main.js).
   */
  useEffect(() => {
    window.billiardclubDesktop?.reportPending(pending + failed);
  }, [pending, failed]);

  const retry = useCallback(async (seq: number) => {
    await queueRetry(seq);
    await syncRef.current();
  }, []);

  const discard = useCallback(async (seq: number) => queueRemove(seq), []);

  const value = useMemo(
    () => ({ online, pending, failed, lastSync, entries, sync, retry, discard, reload }),
    [online, pending, failed, lastSync, entries, sync, retry, discard, reload],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
};

export const useConnection = (): ConnectionContextValue => {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection ConnectionProvider ichida ishlatilishi kerak');
  return ctx;
};
