import { useCallback, useEffect, useRef, useState } from 'react';
import { Segmented } from 'antd';
import { AppstoreOutlined, BarsOutlined } from '@ant-design/icons';
import { useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MoneyText, useNow } from '../../components/ui';
import { useCurrency } from '../../context/AppSettingsContext';
import type { BilliardTable, Session } from '../../types';
import { formatClock, formatNumber } from '../../utils/format';
import { sessionTableAmount } from '../../utils/session';
import TableCard from '../tables/TableCard';
import '../../styles/tables-workspace.css';

/**
 * "Tizim ichidan" demosidagi stollar paneli — ilovadagi HAQIQIY TableCard
 * (bir xil dizayn: yog'och bort, mato yorug'i, shar-raqam, taymer, tugmalar).
 * Ma'lumot namunaviy, amallar sahifa ichida simulyatsiya qilinadi: boshlash,
 * pauza, bar, hisob-kitob, ko'chirish, bekor qilish va chiroq ishlaydi —
 * API chaqirilmaydi. Panel ekranda turganda va mehmon tegmayotganda zal o'zi
 * "yashaydi": kimdir o'yin boshlaydi, bar buyurtma qiladi, hisob-kitob qiladi.
 */

type Density = 'comfortable' | 'compact';

interface DemoTable {
  id: number;
  number: number;
  vip?: boolean;
  price: number;
  completed: number;
  /** Bron vaqti (ms) — kartada "Bron 21:40 · Aziza" belgisi */
  reservationAt?: number;
  /** Chiroqni qo'lda boshqarish (null — o'yinga qarab avtomatik) */
  lightOverride: boolean | null;
}

interface Board {
  tables: DemoTable[];
  sessions: Record<number, Session | null>;
  collected: number;
  cash: number;
}

interface LogLine {
  id: number;
  at: number;
  text: string;
}

const MIN = 60_000;
const FAR_FUTURE = '2999-01-01T00:00:00.000Z';
const GUESTS = ['Aziz', 'Rustam', 'Dilshod', 'Sardor', 'Malika', 'Javohir', 'Otabek', 'Kamola'];
const ITEMS = [
  { key: 'cola', price: 9000 },
  { key: 'tea', price: 8000 },
  { key: 'chips', price: 12000 },
  { key: 'coffee', price: 15000 },
  { key: 'water', price: 4000 },
] as const;
/** Zal o'zi ishlaganda amallar oralig'i va mehmon tegingandan keyingi tanaffus */
const AUTO_EVERY_MS = 4200;
const USER_QUIET_MS = 12_000;

let nextSessionId = 500;
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

const makeSession = (tableId: number, price: number, startedMsAgo: number, patch: Partial<Session> = {}): Session => {
  const start = new Date(Date.now() - startedMsAgo).toISOString();
  return {
    id: nextSessionId++,
    clubId: 0,
    tableId,
    userId: null,
    customerName: null,
    customerPhone: null,
    customerId: null,
    startTime: start,
    endTime: null,
    pausedAt: null,
    totalPausedMs: 0,
    plannedMinutes: null,
    pricePerHour: price,
    durationMinutes: null,
    durationSeconds: null,
    tableAmount: 0,
    barAmount: 0,
    totalAmount: 0,
    status: 'active',
    paymentMethod: null,
    isPaid: false,
    adjustmentAmount: 0,
    adjustmentReason: null,
    notes: null,
    createdAt: start,
    updatedAt: start,
    ...patch,
  };
};

const initialBoard = (): Board => {
  const now = Date.now();
  return {
    tables: [
      { id: 1, number: 1, price: 30000, completed: 3, lightOverride: null },
      { id: 2, number: 2, vip: true, price: 50000, completed: 2, lightOverride: null },
      { id: 3, number: 3, price: 30000, completed: 4, reservationAt: now + 40 * MIN, lightOverride: null },
      { id: 4, number: 4, price: 30000, completed: 1, lightOverride: null },
      { id: 5, number: 5, price: 30000, completed: 5, lightOverride: null },
      { id: 6, number: 6, price: 30000, completed: 2, lightOverride: null },
    ],
    sessions: {
      1: makeSession(1, 30000, 72 * MIN + 14_000, { customerName: 'Akmal' }),
      2: makeSession(2, 50000, 24 * MIN + 49_000, { customerName: 'Bobur', barAmount: 18000 }),
      3: null,
      4: makeSession(4, 30000, 55 * MIN, {
        customerName: 'Jasur',
        barAmount: 9000,
        status: 'paused',
        pausedAt: new Date(now - 8 * MIN).toISOString(),
      }),
      5: makeSession(5, 30000, 125 * MIN + 42_000, { customerName: 'Sherzod', barAmount: 32000 }),
      6: null,
    },
    collected: 1_245_000,
    cash: 780_000,
  };
};

/** Mehmon to'lashi kerak bo'lgan summa: sekundlik stol hisobi + bar */
const sessionTotal = (session: Session, price: number, now: number) =>
  Math.round(sessionTableAmount(session, price, now, null) + (session.barAmount || 0));

/** "Ochiq stollarda" — har soniyada faqat shu barg qayta chiziladi */
const OpenTotal = ({ board, currency }: { board: Board; currency: string }) => {
  const now = useNow();
  const total = board.tables.reduce((sum, table) => {
    const session = board.sessions[table.id];
    return session ? sum + sessionTotal(session, table.price, now) : sum;
  }, 0);
  return <MoneyText amount={total} currency={currency} size="lg" />;
};

const DemoBoard = () => {
  const { t } = useTranslation();
  const currency = useCurrency();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { amount: 0.25 });
  const reduce = useReducedMotion() ?? false;
  const [board, setBoard] = useState(initialBoard);
  const boardRef = useRef(board);
  boardRef.current = board;
  const [log, setLog] = useState<LogLine | null>(null);
  const [flash, setFlash] = useState<{ tableId: number; key: number } | null>(null);
  const [density, setDensity] = useState<Density>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 600px)').matches ? 'compact' : 'comfortable',
  );
  const lastUserAt = useRef(0);
  // Juda tor telefonda (demo oynasi ilovadan torroq) chiroq tugmasisiz — xuddi
  // chiroq boshqaruvi ulanmagan klubdagidek; asosiy tugma qatorga sig'adi
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 400px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 400px)');
    if (!query) return;
    const update = () => setNarrow(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const nameOf = useCallback(
    (table: DemoTable) => `${table.vip ? 'VIP ' : ''}${t('common.table')} ${table.number}`,
    [t],
  );

  /** Amal natijasi: yangi holat + jurnal qatori + kartani yoritish */
  const commit = useCallback((next: Board, tableId: number, text: string) => {
    boardRef.current = next;
    setBoard(next);
    const now = Date.now();
    setLog({ id: now, at: now, text });
    setFlash({ tableId, key: now });
  }, []);

  const tableById = (id: number) => boardRef.current.tables.find((table) => table.id === id);

  const start = useCallback(
    (id: number) => {
      const b = boardRef.current;
      const table = tableById(id);
      if (!table || b.sessions[id]) return;
      const guest = pick(GUESTS);
      commit(
        {
          ...b,
          sessions: { ...b.sessions, [id]: makeSession(id, table.price, 0, { customerName: guest }) },
          tables: b.tables.map((x) => (x.id === id ? { ...x, lightOverride: null, reservationAt: undefined } : x)),
        },
        id,
        t('landing.demoLogStart', { table: nameOf(table), guest }),
      );
    },
    [commit, nameOf, t],
  );

  const pauseResume = useCallback(
    (id: number) => {
      const b = boardRef.current;
      const table = tableById(id);
      const session = b.sessions[id];
      if (!table || !session) return;
      const now = Date.now();
      const paused = session.status === 'paused';
      const next: Session = paused
        ? {
            ...session,
            status: 'active',
            pausedAt: null,
            totalPausedMs: session.totalPausedMs + (session.pausedAt ? now - Date.parse(session.pausedAt) : 0),
          }
        : { ...session, status: 'paused', pausedAt: new Date(now).toISOString() };
      commit(
        { ...b, sessions: { ...b.sessions, [id]: next } },
        id,
        t(paused ? 'landing.demoLogResume' : 'landing.demoLogPause', { table: nameOf(table) }),
      );
    },
    [commit, nameOf, t],
  );

  const order = useCallback(
    (id: number) => {
      const b = boardRef.current;
      const table = tableById(id);
      const session = b.sessions[id];
      if (!table || !session) return;
      const item = pick(ITEMS);
      commit(
        { ...b, sessions: { ...b.sessions, [id]: { ...session, barAmount: session.barAmount + item.price } } },
        id,
        t('landing.demoLogOrder', {
          table: nameOf(table),
          item: t(`landing.demoProduct_${item.key}`),
          amount: formatNumber(item.price),
        }),
      );
    },
    [commit, nameOf, t],
  );

  const checkout = useCallback(
    (id: number) => {
      const b = boardRef.current;
      const table = tableById(id);
      const session = b.sessions[id];
      if (!table || !session) return;
      const amount = sessionTotal(session, table.price, Date.now());
      commit(
        {
          ...b,
          sessions: { ...b.sessions, [id]: null },
          tables: b.tables.map((x) => (x.id === id ? { ...x, completed: x.completed + 1, lightOverride: null } : x)),
          collected: b.collected + amount,
          cash: b.cash + Math.round(amount * 0.6),
        },
        id,
        t('landing.demoLogCheckout', { table: nameOf(table), amount: formatNumber(amount) }),
      );
    },
    [commit, nameOf, t],
  );

  const cancel = useCallback(
    (id: number) => {
      const b = boardRef.current;
      const table = tableById(id);
      if (!table || !b.sessions[id]) return;
      commit(
        {
          ...b,
          sessions: { ...b.sessions, [id]: null },
          tables: b.tables.map((x) => (x.id === id ? { ...x, lightOverride: null } : x)),
        },
        id,
        t('landing.demoLogCancel', { table: nameOf(table) }),
      );
    },
    [commit, nameOf, t],
  );

  const transfer = useCallback(
    (id: number) => {
      const b = boardRef.current;
      const from = tableById(id);
      const session = b.sessions[id];
      const to = b.tables.find((x) => !b.sessions[x.id] && x.id !== id);
      if (!from || !session) return;
      if (!to) {
        const now = Date.now();
        setLog({ id: now, at: now, text: t('landing.demoLogNoFree') });
        return;
      }
      commit(
        {
          ...b,
          sessions: { ...b.sessions, [id]: null, [to.id]: { ...session, tableId: to.id } },
          tables: b.tables.map((x) =>
            x.id === id || x.id === to.id ? { ...x, lightOverride: null, reservationAt: x.id === to.id ? undefined : x.reservationAt } : x,
          ),
        },
        to.id,
        t('landing.demoLogTransfer', { from: nameOf(from), to: nameOf(to) }),
      );
    },
    [commit, nameOf, t],
  );

  const setLight = useCallback(
    (id: number, on: boolean | null) => {
      const b = boardRef.current;
      const table = tableById(id);
      if (!table) return;
      commit(
        { ...b, tables: b.tables.map((x) => (x.id === id ? { ...x, lightOverride: on } : x)) },
        id,
        t(on === null ? 'landing.demoLogLightAuto' : on ? 'landing.demoLogLightOn' : 'landing.demoLogLightOff', {
          table: nameOf(table),
        }),
      );
    },
    [commit, nameOf, t],
  );

  /** Mehmon bosgan amal — zalning o'zi ishlashi bir muddat to'xtaydi */
  const byUser = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    lastUserAt.current = Date.now();
    fn(...args);
  };

  /* ------------------------------------------- Zal o'zi ishlaydi (autoplay) */
  const autoStep = useCallback(() => {
    const b = boardRef.current;
    const busy = b.tables.filter((x) => b.sessions[x.id]);
    const free = b.tables.filter((x) => !b.sessions[x.id] && !x.reservationAt);
    const active = busy.filter((x) => b.sessions[x.id]?.status === 'active');
    const paused = busy.filter((x) => b.sessions[x.id]?.status === 'paused');
    const options: Array<[number, () => void]> = [];
    if (free.length && busy.length < 5) options.push([3, () => start(pick(free).id)]);
    if (active.length) options.push([3, () => order(pick(active).id)]);
    if (paused.length) options.push([2, () => pauseResume(pick(paused).id)]);
    if (active.length > 2) options.push([1, () => pauseResume(pick(active).id)]);
    if (busy.length > 3) options.push([2, () => checkout(pick(busy).id)]);
    const total = options.reduce((sum, [weight]) => sum + weight, 0);
    let roll = Math.random() * total;
    for (const [weight, run] of options) {
      roll -= weight;
      if (roll <= 0) {
        run();
        return;
      }
    }
  }, [checkout, order, pauseResume, start]);

  useEffect(() => {
    if (!inView || reduce) return;
    const id = window.setInterval(() => {
      if (Date.now() - lastUserAt.current >= USER_QUIET_MS) autoStep();
    }, AUTO_EVERY_MS);
    return () => window.clearInterval(id);
  }, [autoStep, inView, reduce]);

  const toTable = (table: DemoTable, session: Session | null): BilliardTable => ({
    id: table.id,
    clubId: 0,
    name: nameOf(table),
    number: table.number,
    pricePerHour: table.price,
    status: session ? 'busy' : 'free',
    description: null,
    zone: null,
    isActive: true,
    createdAt: FAR_FUTURE,
    updatedAt: FAR_FUTURE,
    lightControl: true,
    lightState: table.lightOverride ?? Boolean(session),
    lightFreshUntil: FAR_FUTURE,
    lightError: null,
    lightOverrideOn: table.lightOverride,
    lightOverrideUntil: table.lightOverride === null ? null : FAR_FUTURE,
    todayCompletedSessions: table.completed,
  });

  return (
    <div ref={rootRef} className="lp-board">
      <div className="tables-money" aria-label={t('tables.moneyStrip')}>
        <div className="tables-money__cell is-live">
          <span>{t('tables.moneyExpected')}</span>
          <OpenTotal board={board} currency={currency} />
        </div>
        <div className="tables-money__cell">
          <span>{t('tables.moneyCollected')}</span>
          <MoneyText amount={board.collected} currency={currency} size="lg" />
        </div>
        <div className="tables-money__cell">
          <span>{t('tables.moneyCash')}</span>
          <MoneyText amount={board.cash} currency={currency} size="lg" />
        </div>
      </div>

      <div className="lp-board__bar">
        <div className="lp-board__log" aria-live="polite">
          <i aria-hidden />
          {log ? (
            <span key={log.id}>
              {formatClock(log.at)} · {log.text}
            </span>
          ) : (
            <span>{t('landing.demoTryHint')}</span>
          )}
        </div>
        <Segmented<Density>
          className="tables-board-density"
          value={density}
          onChange={setDensity}
          aria-label={t('tables.densityLabel')}
          options={[
            { value: 'comfortable', label: <AppstoreOutlined aria-label={t('tables.densityComfortable')} /> },
            { value: 'compact', label: <BarsOutlined aria-label={t('tables.densityCompact')} /> },
          ]}
        />
      </div>

      <div className={`tables-board-grid tables-board-grid--${density}`}>
        {board.tables.map((table) => {
          const session = board.sessions[table.id] ?? null;
          return (
            <div key={table.id} className="lp-board__cell">
              <TableCard
                variant={density === 'compact' ? 'row' : 'card'}
                table={toTable(table, session)}
                session={session}
                segments={null}
                offsetMs={0}
                online
                pending={false}
                canCheckout
                canManage
                reservation={
                  table.reservationAt && !session
                    ? `${t('tables.reservationChip', { time: formatClock(table.reservationAt) })} · Aziza`
                    : undefined
                }
                onStart={byUser((x: BilliardTable) => start(x.id))}
                onOrder={byUser((x: BilliardTable) => order(x.id))}
                onTransfer={byUser((x: BilliardTable) => transfer(x.id))}
                onCheckout={byUser((x: BilliardTable) => checkout(x.id))}
                onPauseResume={byUser((_: Session, x: BilliardTable) => pauseResume(x.id))}
                onCancel={byUser((s: Session) => cancel(s.tableId))}
                onLightToggle={narrow ? undefined : byUser((x: BilliardTable, on: boolean) => setLight(x.id, on))}
                onLightAuto={narrow ? undefined : byUser((x: BilliardTable) => setLight(x.id, null))}
              />
              {flash?.tableId === table.id && <span key={flash.key} className="lp-board__flash" aria-hidden />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DemoBoard;
