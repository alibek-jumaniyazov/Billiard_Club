import {
  createContext,
  CSSProperties,
  ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { formatElapsed } from '../../utils/format';

/**
 * Ticker — 1 soniyalik markazlashtirilgan "tik" tarqatuvchi.
 *
 * Muammo: sahifa ildizidagi 1s setInterval BUTUN sahifani har soniyada qayta
 * render qiladi (Tables/Dashboard auditida qayd etilgan).
 *
 * Yechim: bitta TickerProvider yagona setInterval ushlaydi va obunachilarga
 * `now` (Date.now, ms) ni tarqatadi. useNow() ni FAQAT taymer ko'rsatadigan
 * eng kichik barg komponent ichida chaqiring — shunda har soniyada faqat o'sha
 * barglar qayta render bo'ladi.
 *
 * Interval obunachi yo'q payt ishlamaydi (0 ta faol sessiya = 0 yuk).
 *
 * Foydalanish:
 * ```tsx
 * // main.tsx da (allaqachon ulangan):
 * <TickerProvider><App /></TickerProvider>
 *
 * // Barg komponentda:
 * const now = useNow();
 * const elapsed = sessionElapsedMs(session, now);
 *
 * // Yoki tayyor komponent bilan:
 * <ElapsedTime from={session.startTime} totalPausedMs={session.totalPausedMs} />
 * ```
 */

interface TickerStore {
  /** Obuna bo'lish; qaytargan funksiya obunani bekor qiladi */
  subscribe: (onTick: () => void) => () => void;
  /** So'nggi tarqatilgan vaqt (ms, Date.now) */
  getNow: () => number;
}

const TickerContext = createContext<TickerStore | null>(null);

/**
 * Yagona 1s intervalli provayder — ilova ildiziga bir marta o'rnatiladi.
 * Interval faqat kamida bitta obunachi bo'lganda ishlaydi.
 */
export const TickerProvider = ({ children }: { children: ReactNode }) => {
  const store = useMemo<TickerStore>(() => {
    let now = Date.now();
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const listeners = new Set<() => void>();

    const start = () => {
      if (intervalId !== null) return;
      now = Date.now();
      intervalId = setInterval(() => {
        now = Date.now();
        listeners.forEach((listener) => listener());
      }, 1000);
    };

    const stop = () => {
      if (intervalId !== null && listeners.size === 0) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    return {
      subscribe: (onTick) => {
        listeners.add(onTick);
        start();
        return () => {
          listeners.delete(onTick);
          stop();
        };
      },
      getNow: () => now,
    };
  }, []);

  return <TickerContext.Provider value={store}>{children}</TickerContext.Provider>;
};

/**
 * Har soniyada yangilanadigan joriy vaqt (ms).
 * FAQAT taymer barg komponentlarida chaqiring — chaqirgan komponentgina
 * har soniyada qayta render bo'ladi.
 */
export const useNow = (): number => {
  const store = useContext(TickerContext);
  if (!store) throw new Error('useNow TickerProvider ichida ishlatilishi kerak');
  return useSyncExternalStore(store.subscribe, store.getNow);
};

interface ElapsedTimeProps {
  /** Boshlanish vaqti (ISO satr, ms yoki Date) */
  from: string | number | Date;
  /** Jami pauza davomiyligi (ms) — serverdagi totalPausedMs */
  totalPausedMs?: number;
  /** Joriy pauza boshlangan vaqt (pauzada bo'lsa) — hisobdan ayiriladi */
  pausedAt?: string | number | Date | null;
  /** true bo'lsa .timer-paused miltillash klassi qo'shiladi */
  paused?: boolean;
  /** Standart hisob o'rniga maxsus hisob (masalan sessionElapsedMs) */
  computeMs?: (now: number) => number;
  className?: string;
  style?: CSSProperties;
}

/**
 * HH:MM:SS jonli taymer — o'zi mustaqil "tik"laydi, ota komponentni
 * qayta render qilmaydi. Tables/Dashboard jonli sessiyalari uchun.
 *
 * ```tsx
 * <ElapsedTime
 *   from={session.startTime}
 *   totalPausedMs={session.totalPausedMs}
 *   pausedAt={session.status === 'paused' ? session.pausedAt : null}
 *   paused={session.status === 'paused'}
 * />
 * ```
 */
export const ElapsedTime = ({
  from,
  totalPausedMs = 0,
  pausedAt,
  paused = false,
  computeMs,
  className,
  style,
}: ElapsedTimeProps) => {
  const now = useNow();

  let elapsed: number;
  if (computeMs) {
    elapsed = computeMs(now);
  } else {
    elapsed = now - new Date(from).getTime() - totalPausedMs;
    if (pausedAt) elapsed -= now - new Date(pausedAt).getTime();
  }

  return (
    <span
      className={`timer-display${paused ? ' timer-paused' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden
    >
      {formatElapsed(Math.max(0, elapsed))}
    </span>
  );
};
