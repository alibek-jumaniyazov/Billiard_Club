/**
 * OFLAYN OPERATSIYALAR — qarzlar, bronlar, mijozlar va smenalar ekranlari.
 *
 * pos.ts dagi kassa amallari bilan BIR XIL naqsh: amal avval onlayn
 * yuboriladi, tarmoq uzilgan bo'lsa (yoki aynan shu so'rovda uzilsa) AYNAN
 * SHU Idempotency-Key bilan navbatga tushadi. Server ikkinchi marta
 * bajarmaydi (server/src/common/idempotency), shuning uchun "server bajardi,
 * javob yo'qoldi" holatida ham to'lov ikki marta yozilmaydi.
 *
 * Har bir yozuvda:
 *  · `offlineAt` — tugma HAQIQATDA bosilgan payt (server soatiga moslangan
 *    monoton soat, license.ts: effectiveNow). Server uni biznes vaqti sifatida
 *    ishlatadi va oralig'ini tekshiradi (server/src/common/offline/offline-at.ts);
 *  · `meta.kind` — ekranda optimistik ko'rsatish uchun (pastdagi apply* lar);
 *  · `meta.deps` — bog'liqlik kalitlari: navbatda xato bo'lgan yozuv faqat
 *    SHU kalitlardan birini bo'lishgan keyingi yozuvlarni to'xtatadi.
 *
 * NIMA OFLAYN ISHLAYDI:
 *   · qarz to'lovi          — pul olinadi, qoldiq ekranda darhol kamayadi;
 *   · mijoz qo'shish        — `$local:` havola bilan, shu mijozga bron ham
 *                             oflayn yoziladi (server telefon bo'yicha
 *                             mavjud mijozga birlashtiradi);
 *   · bron yaratish va holati (tasdiqlash/o'tirdi/kelmadi/bekor) —
 *                             to'qnashuv navbat yuborilganda server tomonidan
 *                             RAD ETILADI (422) va "Yuborilmagan amallar"da
 *                             ko'rinadi — hech qachon jimgina emas;
 *   · smenani ochish/yopish — yopishda kutilgan naqd va farqni SERVER navbat
 *                             yetib kelganda o'z ma'lumotidan hisoblaydi.
 *
 * INTERNET TALAB QILADI (sahifalarda aniq xabar bilan bloklanadi):
 *   · qarzni hisobdan chiqarish (pulni yo'q qiladigan, faqat admin amali);
 *   · mijozni tahrirlash/o'chirish (o'chirish serverdagi ochiq qarzga bog'liq);
 *   · bron vaqti/stolini o'zgartirish (sahifada bunday amal yo'q).
 */

import type {
  BilliardTable,
  CashShift,
  Customer,
  Debt,
  PaymentMethod,
  Reservation,
  ReservationStatus,
  ShiftReport,
  ShiftSummary,
} from '../types';
import { formatMoney } from '../utils/format';
import { fullScope } from './cache';
import { effectiveNow } from './license';
import { enqueue, newId, queueList, type QueueEntry } from './queue';

/** Shu modul navbatga qo'yadigan amal turlari (`meta.kind`) */
export type OpsKind =
  | 'debt.pay'
  | 'customer.create'
  | 'reservation.create'
  | 'reservation.status'
  | 'shift.open'
  | 'shift.close';

/** Ekrandagi oflayn yozuv holati: navbatda kutmoqda yoki server rad etgan */
export type OfflineMark = 'pending' | 'failed';

/** Navbatdagi oflayn holat belgilari (server turiga qo'shiladi) */
export interface OfflineFlags {
  /** Serverda hali yo'q yozuvning lokal identifikatori (`$local:` havolasi uchun) */
  offlineLocalId?: string;
  offlineMark?: OfflineMark;
  /** Server rad etgan bo'lsa — sababi (navbat yozuvidagi `lastError`) */
  offlineError?: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Bir martalik amal kaliti — onlayn urinish va navbatdagi takror uchun BIR XIL */
export const newOpKey = (): string => newId();

/**
 * Amal payti (ms) — server soatiga moslangan monoton soat.
 * Sahifa uni onlayn urinishdan OLDIN oladi: so'rov 20 soniya osilib, keyin
 * navbatga o'tsa ham vaqt muhri tugma bosilgan payt bo'lib qoladi.
 */
export const opNow = (): number => effectiveNow();

export const localRef = (localId: string): string => `$local:${localId}`;
export const isLocalRef = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('$local:');

/** Navbatga yozish uchun joriy doira; bo'lmasa oflayn amal qabul qilinmaydi */
const requireScope = (): string => {
  const scope = fullScope();
  if (!scope) throw new Error('OFFLINE_SCOPE_MISSING');
  return scope;
};

/**
 * BOG'LIQLIK KALITLARI (`meta.deps`).
 *
 * Qarz kaliti MIJOZ bo'yicha: bir mijozning to'lovlari ketma-ket o'tadi
 * (birinchisi rad etilsa, ikkinchisi qoldiqni noto'g'ri hisoblab o'tib
 * ketmasin). Ro'yxatdan o'tmagan qarzdor uchun — qarzning o'zi bo'yicha.
 *
 * Bron yaratishga `table:<id>` ATAYLAB qo'yilmaydi: rad etilgan (to'qnashgan)
 * bron shu stoldagi O'YIN amallarini to'xtatib qo'ymasligi kerak.
 */
export const depKeys = {
  customer: (ref: number | string): string => `customer:${ref}`,
  debt: (debt: Pick<Debt, 'id'> & { customerId?: number | null }): string =>
    debt.customerId ? `debt:${debt.customerId}` : `debt:#${debt.id}`,
  reservation: (ref: number | string): string => `reservation:${ref}`,
  shift: 'shift',
} as const;

const kindOf = (entry: QueueEntry): string | undefined =>
  (entry.meta as { kind?: string } | undefined)?.kind;

/**
 * Yozuvning bog'liqlik kalitlari — queue.ts dagi qoida bilan BIR XIL:
 * `meta.deps` bo'lsa o'sha; bo'lmasa (eski yozuv) `tableId`/`toTableId`/
 * `sessionRef` dan; hech narsa aniqlanmasa — 'all' (hammasiga bog'liq).
 */
const depsOfEntry = (entry: QueueEntry): string[] | 'all' => {
  const meta = (entry.meta ?? {}) as Record<string, unknown>;
  if (Array.isArray(meta.deps)) {
    const keys = meta.deps.filter((key): key is string => typeof key === 'string' && key.trim() !== '');
    return keys.length === meta.deps.length ? keys : 'all';
  }
  const keys: string[] = [];
  for (const [field, prefix] of [['tableId', 'table'], ['toTableId', 'table'], ['sessionRef', 'session']] as const) {
    const value = meta[field];
    if ((typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.trim() !== '')) {
      keys.push(`${prefix}:${value}`);
    }
  }
  return keys.length > 0 ? keys : 'all';
};

/**
 * Navbatda shu kalitlardan biriga tegadigan (yoki "hammasiga bog'liq")
 * yuborilmagan amal bormi. Bo'lsa, internet bor paytda ham YANGI amal
 * navbat orqali yuboriladi — aks holda u eski amaldan oldin serverga yetib,
 * tartibni buzardi (masalan bir mijozning ikki to'lovi teskari tartibda
 * kelib, birinchisi "qoldiqdan oshdi" bilan rad etilardi).
 */
export const hasQueuedDeps = (entries: QueueEntry[], keys: string[]): boolean =>
  entries.some((entry) => {
    const deps = depsOfEntry(entry);
    return deps === 'all' || deps.some((key) => keys.includes(key));
  });

const bySeq = (a: QueueEntry, b: QueueEntry): number => (a.seq ?? 0) - (b.seq ?? 0);

/** Berilgan turdagi yozuvlar — navbat tartibida */
const opsOf = (entries: QueueEntry[], kind: OpsKind): QueueEntry[] =>
  entries.filter((entry) => kindOf(entry) === kind).sort(bySeq);

/** Shu modulning amali bormi (sahifa navbat bo'shaganda qayta yuklash uchun) */
export const countOps = (entries: QueueEntry[], kinds: readonly OpsKind[]): number =>
  entries.filter((entry) => kinds.includes(kindOf(entry) as OpsKind)).length;

/**
 * Sintetik MANFIY ID — serverdagi haqiqiy ID bilan hech qachon to'qnashmaydi,
 * React kaliti sifatida barqaror (overlay.ts bilan bir xil qoida).
 */
const syntheticId = (entry: QueueEntry): number => {
  if (entry.seq !== undefined) return -entry.seq;
  let h = 0;
  for (let i = 0; i < entry.localId.length; i += 1) h = (h * 31 + entry.localId.charCodeAt(i)) | 0;
  return -(Math.abs(h) % 1_000_000) - 1_000_000;
};

const markOf = (entry: QueueEntry): Pick<OfflineFlags, 'offlineMark' | 'offlineError'> => ({
  offlineMark: entry.status,
  ...(entry.status === 'failed' && entry.lastError ? { offlineError: entry.lastError } : {}),
});

/* =========================================================== QARZ TO'LOVI */

interface DebtPayMeta {
  kind: 'debt.pay';
  debtId: number;
  customerId: number | null;
  customerName: string;
  customerPhone: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  at: string;
  deps: string[];
}

/**
 * Qarz to'lovini oflayn qabul qilish. Ekrandagi qoldiq darhol kamayadi
 * (applyDebtPayments); server to'lovni `offlineAt` vaqtiga yozadi.
 */
export const queueDebtPayment = async (
  debt: Pick<Debt, 'id' | 'customerName' | 'customerPhone'> & { customerId?: number | null },
  payment: { amount: number; paymentMethod: PaymentMethod },
  idempotencyKey?: string,
  atMs: number = opNow(),
): Promise<string> => {
  const amount = round2(payment.amount);
  const at = new Date(atMs).toISOString();
  const meta: DebtPayMeta = {
    kind: 'debt.pay',
    debtId: debt.id,
    customerId: debt.customerId ?? null,
    customerName: debt.customerName,
    customerPhone: debt.customerPhone ?? null,
    amount,
    paymentMethod: payment.paymentMethod,
    at,
    deps: [depKeys.debt(debt)],
  };
  return enqueue({
    scope: requireScope(),
    idempotencyKey,
    method: 'post',
    url: `/debts/${debt.id}/pay`,
    body: { amount, paymentMethod: payment.paymentMethod, offlineAt: at },
    labelKey: 'debts.offlinePay',
    labelParams: { name: debt.customerName, amount: formatMoney(amount) },
    meta: { ...meta },
  });
};

/** Navbatdagi to'lovlar hisobga olingan qarz ko'rinishi */
export type DebtView = Debt & {
  /** Navbatda (hali yuborilmagan) to'lovlar yig'indisi — qoldiqdan allaqachon ayirilgan */
  offlinePaid?: number;
  /** Shu qarz bo'yicha server rad etgan oflayn to'lov bor */
  offlineFailed?: boolean;
};

/**
 * Navbatdagi to'lovlarni qarzlar ro'yxati ustiga qoplaydi (OPTIMISTIK).
 *
 * FAQAT kutayotgan to'lov qoldiqni kamaytiradi. Server rad etgan to'lov
 * qoldiqqa TEGMAYDI (pul hisobda yo'q) — faqat qizil belgi bilan ko'rinadi,
 * kassir uni "Yuborilmagan amallar"da hal qiladi. Kirish massivi o'zgarmaydi.
 */
export const applyDebtPayments = (debts: Debt[], entries: QueueEntry[]): DebtView[] => {
  const pending = new Map<number, number>();
  const failed = new Set<number>();
  for (const entry of opsOf(entries, 'debt.pay')) {
    const meta = entry.meta as unknown as DebtPayMeta;
    if (entry.status === 'pending') {
      pending.set(meta.debtId, round2((pending.get(meta.debtId) ?? 0) + meta.amount));
    } else {
      failed.add(meta.debtId);
    }
  }
  if (pending.size === 0 && failed.size === 0) return debts;
  return debts.map((debt) => {
    const paid = pending.get(debt.id) ?? 0;
    const isFailed = failed.has(debt.id);
    if (paid === 0 && !isFailed) return debt;
    const remainingDebt = round2(Math.max(0, debt.remainingDebt - paid));
    return {
      ...debt,
      paidAmount: round2(debt.paidAmount + paid),
      remainingDebt,
      isPaid: debt.isPaid || remainingDebt <= 0,
      ...(paid > 0 ? { offlinePaid: paid } : {}),
      ...(isFailed ? { offlineFailed: true } : {}),
    };
  });
};

/** Server qidiruvi bilan bir xil moslik: ism, telefon yoki telefon raqamlari */
const matchesSearch = (name: string | null | undefined, phone: string | null | undefined, search: string): boolean => {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  if ((name ?? '').toLowerCase().includes(q)) return true;
  const ph = (phone ?? '').toLowerCase();
  if (ph.includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  return digits.length > 0 && ph.includes(digits);
};

/**
 * "Undirilishi kerak (jami)" kartasidan ayiriladigan summa — server
 * yig'indisi BUTUN filtr bo'yicha, shuning uchun filtrga mos KUTAYOTGAN
 * to'lovlar ham butun navbat bo'yicha olinadi (faqat joriy sahifa emas).
 * "To'langan"/"hisobdan chiqarilgan" filtrlarida qoldiq yig'indisi o'zgarmaydi.
 */
export const pendingDebtPaymentsTotal = (
  entries: QueueEntry[],
  filter: { status: string; search: string },
): number => {
  if (filter.status !== 'unpaid' && filter.status !== 'all') return 0;
  let sum = 0;
  for (const entry of opsOf(entries, 'debt.pay')) {
    if (entry.status !== 'pending') continue;
    const meta = entry.meta as unknown as DebtPayMeta;
    if (matchesSearch(meta.customerName, meta.customerPhone, filter.search)) sum += meta.amount;
  }
  return round2(sum);
};

/** Bitta qarzning navbatdagi to'lovlari — "To'lovlar tarixi" oynasi uchun */
export const offlineDebtPayments = (
  entries: QueueEntry[],
  debtId: number,
): Array<{ key: string; amount: number; paymentMethod: PaymentMethod; at: string } & OfflineFlags> =>
  opsOf(entries, 'debt.pay')
    .filter((entry) => (entry.meta as unknown as DebtPayMeta).debtId === debtId)
    .map((entry) => {
      const meta = entry.meta as unknown as DebtPayMeta;
      return {
        key: entry.localId,
        amount: meta.amount,
        paymentMethod: meta.paymentMethod,
        at: meta.at,
        ...markOf(entry),
      };
    });

/* ================================================================ MIJOZLAR */

interface CustomerCreateMeta {
  kind: 'customer.create';
  name: string;
  phone: string | null;
  notes: string | null;
  at: string;
  deps: string[];
}

/**
 * Mijozni oflayn qo'shish. Qaytadi: lokal ID — `localRef(id)` keyingi
 * amallarda (masalan shu mijozga bron) havola sifatida ishlatiladi va navbat
 * yuborishda haqiqiy ID ga almashtiriladi.
 */
export const queueCustomerCreate = async (
  values: { name: string; phone?: string; notes?: string },
  idempotencyKey?: string,
  atMs: number = opNow(),
): Promise<string> => {
  const localId = newId();
  const at = new Date(atMs).toISOString();
  const name = values.name.trim();
  const meta: CustomerCreateMeta = {
    kind: 'customer.create',
    name,
    phone: values.phone?.trim() || null,
    notes: values.notes?.trim() || null,
    at,
    deps: [depKeys.customer(localRef(localId))],
  };
  return enqueue({
    scope: requireScope(),
    localId,
    idempotencyKey,
    method: 'post',
    url: '/customers',
    body: {
      name,
      phone: meta.phone ?? undefined,
      notes: meta.notes ?? undefined,
      offlineAt: at,
    },
    labelKey: 'customers.offlineCreate',
    labelParams: { name },
    meta: { ...meta },
  });
};

export type CustomerView = Customer & OfflineFlags;

const customerFromEntry = (entry: QueueEntry): CustomerView => {
  const meta = entry.meta as unknown as CustomerCreateMeta;
  return {
    id: syntheticId(entry),
    clubId: 0,
    name: meta.name,
    phone: meta.phone,
    notes: meta.notes,
    createdAt: meta.at,
    updatedAt: meta.at,
    offlineLocalId: entry.localId,
    ...markOf(entry),
  };
};

/**
 * Navbatdagi (serverda hali yo'q) mijozlar ro'yxat BOSHIGA qo'shiladi —
 * qidiruv bo'lsa, unga mos kelganlari. Server rad etgani ham ko'rinadi
 * (qizil belgi bilan), jimgina yo'qolmaydi.
 */
export const applyCustomerCreates = (
  customers: Customer[],
  entries: QueueEntry[],
  search = '',
): CustomerView[] => {
  const local = opsOf(entries, 'customer.create')
    .filter((entry) => {
      const meta = entry.meta as unknown as CustomerCreateMeta;
      return matchesSearch(meta.name, meta.phone, search);
    })
    .map(customerFromEntry);
  return local.length > 0 ? [...local, ...customers] : customers;
};

/**
 * Bron oynasidagi "Ro'yxatdagi mijoz" tanlovi uchun oflayn mijozlar.
 * Qiymat — `$local:` havola (son emas): bron ham navbatga tushadi va
 * yuborishda haqiqiy ID ga almashtiriladi. Faqat KUTAYOTGANLARI: rad etilgan
 * mijozga bog'langan bron baribir yuborila olmasdi.
 */
export const offlineCustomerOptions = (
  entries: QueueEntry[],
  search = '',
): Array<{ value: string; name: string; phone: string | null }> =>
  opsOf(entries, 'customer.create')
    .filter((entry) => entry.status === 'pending')
    .map((entry) => ({ entry, meta: entry.meta as unknown as CustomerCreateMeta }))
    .filter(({ meta }) => matchesSearch(meta.name, meta.phone, search))
    .map(({ entry, meta }) => ({ value: localRef(entry.localId), name: meta.name, phone: meta.phone }));

/* ================================================================= BRONLAR */

export type ReservationNextStatus = Extract<ReservationStatus, 'confirmed' | 'seated' | 'no_show' | 'cancelled'>;

interface ReservationCreateMeta {
  kind: 'reservation.create';
  tableId: number;
  tableName: string;
  tableNumber: number | null;
  /** Son (ro'yxatdagi mijoz) yoki `$local:` (oflayn qo'shilgan mijoz) */
  customerId: number | string | null;
  customerName: string | null;
  customerPhone: string | null;
  startsAt: string;
  durationMinutes: number | null;
  notes: string | null;
  at: string;
  deps: string[];
}

interface ReservationStatusMeta {
  kind: 'reservation.status';
  /** Server ID si (satr) yoki `$local:` */
  reservationRef: string;
  status: ReservationNextStatus;
  at: string;
  deps: string[];
}

/**
 * Bronni oflayn yaratish. Qaytadi: lokal ID (holat o'zgarishlari uchun havola).
 * `timeLabel` — navbat oynasidagi tavsif uchun klub vaqtidagi "DD.MM HH:mm".
 */
export const queueReservationCreate = async (
  values: {
    tableId: number;
    tableName: string;
    tableNumber?: number | null;
    customerId?: number | string | null;
    customerName?: string;
    customerPhone?: string;
    startsAt: string;
    durationMinutes?: number | null;
    notes?: string;
  },
  timeLabel: string,
  idempotencyKey?: string,
  atMs: number = opNow(),
): Promise<string> => {
  const localId = newId();
  const at = new Date(atMs).toISOString();
  const customerId = values.customerId ?? null;
  const meta: ReservationCreateMeta = {
    kind: 'reservation.create',
    tableId: values.tableId,
    tableName: values.tableName,
    tableNumber: values.tableNumber ?? null,
    customerId,
    customerName: values.customerName?.trim() || null,
    customerPhone: values.customerPhone?.trim() || null,
    startsAt: values.startsAt,
    durationMinutes: values.durationMinutes ?? null,
    notes: values.notes?.trim() || null,
    at,
    deps: [
      depKeys.reservation(localRef(localId)),
      ...(customerId !== null ? [depKeys.customer(customerId)] : []),
    ],
  };
  return enqueue({
    scope: requireScope(),
    localId,
    idempotencyKey,
    method: 'post',
    url: '/reservations',
    body: {
      tableId: values.tableId,
      // `$local:` qiymat navbat yuborishda SONGA almashtiriladi (queue.ts: resolveRefs)
      ...(customerId !== null ? { customerId } : {}),
      customerName: meta.customerName ?? undefined,
      customerPhone: meta.customerPhone ?? undefined,
      startsAt: values.startsAt,
      durationMinutes: meta.durationMinutes ?? undefined,
      notes: meta.notes ?? undefined,
      offlineAt: at,
    },
    labelKey: 'reservations.offlineCreate',
    labelParams: { table: values.tableName, time: timeLabel },
    meta: { ...meta },
  });
};

const STATUS_LABEL: Record<ReservationNextStatus, string> = {
  confirmed: 'reservations.offlineConfirm',
  seated: 'reservations.offlineSeat',
  no_show: 'reservations.offlineNoShow',
  cancelled: 'reservations.offlineCancel',
};

/**
 * Bron holatini oflayn o'zgartirish. `ref` — server ID si yoki oflayn
 * yaratilgan bron uchun `$local:` havola. Bekor qilish alohida endpoint.
 */
export const queueReservationStatus = async (
  target: { ref: number | string; name: string; timeLabel: string },
  next: ReservationNextStatus,
  idempotencyKey?: string,
  atMs: number = opNow(),
): Promise<string> => {
  const ref = String(target.ref);
  const at = new Date(atMs).toISOString();
  const meta: ReservationStatusMeta = {
    kind: 'reservation.status',
    reservationRef: ref,
    status: next,
    at,
    deps: [depKeys.reservation(ref)],
  };
  return enqueue({
    scope: requireScope(),
    idempotencyKey,
    method: next === 'cancelled' ? 'post' : 'put',
    url: next === 'cancelled' ? `/reservations/${ref}/cancel` : `/reservations/${ref}`,
    body: next === 'cancelled' ? { offlineAt: at } : { status: next, offlineAt: at },
    labelKey: STATUS_LABEL[next],
    labelParams: { name: target.name, time: target.timeLabel },
    meta: { ...meta },
  });
};

export type ReservationView = Reservation &
  OfflineFlags & {
    /** Holat o'zgarishi navbatda (serverga hali yetmagan) */
    offlineStatusPending?: boolean;
  };

/** Bron havolasi: oflayn yaratilgan bo'lsa `$local:`, aks holda server ID si */
export const reservationRefOf = (reservation: Pick<ReservationView, 'id' | 'offlineLocalId'>): string =>
  reservation.offlineLocalId ? localRef(reservation.offlineLocalId) : String(reservation.id);

/**
 * Navbatdagi bron amallarini kun ro'yxati ustiga qoplaydi.
 *
 *  · oflayn yaratilgan bron — shu KUNga (klub vaqti, `dayOf`) to'g'ri kelsa
 *    va holat filtri ruxsat bersa qo'shiladi (kutayotgan ham, rad etilgan
 *    ham — rad etilgani qizil belgi va sabab bilan, jimgina yo'qolmaydi);
 *  · holat o'zgarishi — KUTAYOTGANI ekranda darhol qo'llanadi, rad etilgani
 *    qo'llanmaydi, faqat sababi bilan belgilanadi.
 */
export const applyReservationOps = (
  reservations: Reservation[],
  entries: QueueEntry[],
  view: { day: string; status: ReservationStatus | null; dayOf: (iso: string) => string },
): ReservationView[] => {
  const creates = opsOf(entries, 'reservation.create');
  const changes = opsOf(entries, 'reservation.status');
  if (creates.length === 0 && changes.length === 0) return reservations;

  const rows: ReservationView[] = reservations.map((r) => ({ ...r }));
  const byRef = new Map<string, ReservationView>(rows.map((r) => [String(r.id), r]));

  const ordered = [...creates, ...changes].sort(bySeq);
  for (const entry of ordered) {
    if (kindOf(entry) === 'reservation.create') {
      const meta = entry.meta as unknown as ReservationCreateMeta;
      if (view.dayOf(meta.startsAt) !== view.day) continue;
      const row: ReservationView = {
        id: syntheticId(entry),
        clubId: 0,
        tableId: meta.tableId,
        customerId: typeof meta.customerId === 'number' ? meta.customerId : null,
        customerName: meta.customerName,
        customerPhone: meta.customerPhone,
        startsAt: meta.startsAt,
        durationMinutes: meta.durationMinutes,
        status: 'pending',
        notes: meta.notes,
        createdAt: meta.at,
        updatedAt: meta.at,
        table: { id: meta.tableId, name: meta.tableName, number: meta.tableNumber ?? 0 } as BilliardTable,
        customer: null,
        offlineLocalId: entry.localId,
        ...markOf(entry),
      };
      byRef.set(localRef(entry.localId), row);
      if (view.status === null || view.status === 'pending') rows.push(row);
      continue;
    }
    const meta = entry.meta as unknown as ReservationStatusMeta;
    const row = byRef.get(meta.reservationRef);
    if (!row) continue;
    if (entry.status === 'pending') {
      row.status = meta.status;
      row.offlineStatusPending = true;
    } else {
      row.offlineMark = 'failed';
      if (entry.lastError) row.offlineError = entry.lastError;
    }
  }

  return rows.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id);
};

/**
 * Bronlar to'qnashuvi (oflayn oldindan tekshiruv). Server oyna formulasi
 * bilan bir xil: [boshlanish, boshlanish + davomiylik), davomiylik
 * ko'rsatilmasa 60 daqiqa; faqat faol (kutilmoqda/tasdiqlangan/o'tirdi).
 */
export const findReservationOverlaps = (
  rows: ReservationView[],
  candidate: { tableId: number; startsAt: string; durationMinutes?: number | null },
): ReservationView[] => {
  const DEFAULT_MIN = 60;
  const start = Date.parse(candidate.startsAt);
  const end = start + (candidate.durationMinutes ?? DEFAULT_MIN) * 60_000;
  return rows.filter((r) => {
    if (r.tableId !== candidate.tableId) return false;
    if (r.offlineMark === 'failed' && r.offlineLocalId) return false;
    if (!['pending', 'confirmed', 'seated'].includes(r.status)) return false;
    const rStart = Date.parse(r.startsAt);
    const rEnd = rStart + (r.durationMinutes ?? DEFAULT_MIN) * 60_000;
    return rStart < end && rEnd > start;
  });
};

/* ================================================================ SMENALAR */

interface ShiftOpenMeta {
  kind: 'shift.open';
  openingCash: number;
  note: string | null;
  at: string;
  deps: string[];
}

interface ShiftCloseMeta {
  kind: 'shift.close';
  /** Server ID si (satr) yoki `$local:` (oflayn ochilgan smena) */
  shiftRef: string;
  countedCash: number;
  cashOut: number;
  note: string | null;
  at: string;
  deps: string[];
}

/** Smenani oflayn ochish. Qaytadi: lokal ID (shu smenani oflayn yopish uchun) */
export const queueShiftOpen = async (
  values: { openingCash: number; note?: string },
  idempotencyKey?: string,
  atMs: number = opNow(),
): Promise<string> => {
  const localId = newId();
  const at = new Date(atMs).toISOString();
  const openingCash = round2(values.openingCash);
  const meta: ShiftOpenMeta = {
    kind: 'shift.open',
    openingCash,
    note: values.note?.trim() || null,
    at,
    deps: [depKeys.shift],
  };
  return enqueue({
    scope: requireScope(),
    localId,
    idempotencyKey,
    method: 'post',
    url: '/shifts/open',
    body: { openingCash, note: meta.note ?? undefined, offlineAt: at },
    labelKey: 'shifts.offlineOpen',
    labelParams: { amount: formatMoney(openingCash) },
    meta: { ...meta },
  });
};

/**
 * Smena yopilishi kutishi shart bo'lgan kalitlar — navbatda undan OLDIN
 * turgan barcha PUL amallarining kalitlari.
 *
 * NEGA: server Z-hisobotni yopilish yetib kelgan paytdagi ma'lumotdan
 * hisoblaydi va MUHRLAYDI. Agar oldingi hisob-kitob yoki qarz to'lovi xato
 * bilan to'xtab qolgan bo'lsa-yu, yopish o'tib ketsa, o'sha pul keyin
 * yopilgan smena oynasiga tushadi, lekin muhrlangan hisobotda bo'lmaydi —
 * kassir soxta "ortiqcha" bilan qoladi. Shuning uchun yopish o'sha amallar
 * bilan kalit bo'lishadi va ular o'tmaguncha kutadi.
 * Bron/mijoz kalitlari pulga ta'sir qilmaydi — ular qo'shilmaydi.
 */
export const shiftCloseBarrierDeps = (entries: QueueEntry[], scope: string): string[] => {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (entry.scope !== scope) continue;
    // Kalitsiz ("hammasiga bog'liq") eski yozuvni navbatning o'zi ushlaydi:
    // u ushlab turilsa, kalitli har bir amal — shu yopish ham — kutadi
    const deps = depsOfEntry(entry);
    if (deps === 'all') continue;
    for (const key of deps) {
      if (key.startsWith('reservation:') || key.startsWith('customer:')) continue;
      keys.add(key);
    }
  }
  keys.delete(depKeys.shift);
  return [...keys].sort();
};

/**
 * Onlayn paytda ham yopishni NAVBATGA o'tkazish kerakmi: navbatda smena yoki
 * pul amali (hisob-kitob, bar, qarz to'lovi, smena) hali yuborilmagan yoki
 * rad etilgan bo'lsa — ha. To'g'ridan-to'g'ri yopish ulardan OLDIN o'tib
 * ketib, ular muhrlangan Z-hisobotdan tushib qolardi. Bron va mijoz amallari
 * pulga ta'sir qilmaydi. Noma'lum turdagi yozuv ehtiyot uchun hisobga olinadi.
 */
export const closeMustQueue = (entries: QueueEntry[]): boolean =>
  entries.some((entry) => {
    const kind = kindOf(entry) ?? '';
    return !kind.startsWith('reservation.') && !kind.startsWith('customer.');
  });

/**
 * Smenani oflayn yopish. Kutilgan naqd va farqni SERVER navbat yetib
 * kelganda o'z ma'lumotidan hisoblaydi — bu yerda faqat kassir sanagan
 * summa va "Yopish" bosilgan payt yuboriladi.
 */
export const queueShiftClose = async (
  shiftRef: number | string,
  values: { countedCash: number; cashOut?: number; note?: string },
  idempotencyKey?: string,
  atMs: number = opNow(),
): Promise<string> => {
  const scope = requireScope();
  const ref = String(shiftRef);
  const at = new Date(atMs).toISOString();
  const barrier = shiftCloseBarrierDeps(await queueList(), scope);
  const meta: ShiftCloseMeta = {
    kind: 'shift.close',
    shiftRef: ref,
    countedCash: round2(values.countedCash),
    cashOut: round2(values.cashOut ?? 0),
    note: values.note?.trim() || null,
    at,
    deps: [depKeys.shift, ...barrier],
  };
  return enqueue({
    scope,
    idempotencyKey,
    method: 'post',
    url: `/shifts/${ref}/close`,
    body: {
      countedCash: meta.countedCash,
      cashOut: meta.cashOut,
      note: meta.note ?? undefined,
      offlineAt: at,
    },
    labelKey: 'shifts.offlineClose',
    labelParams: { amount: formatMoney(meta.countedCash) },
    meta: { ...meta },
  });
};

export type ShiftViewShift = CashShift & OfflineFlags;

export interface ShiftView {
  /** Ekrandagi joriy smena (server yoki oflayn ochilgan); yopilgan bo'lsa null */
  shift: ShiftViewShift | null;
  /** Server hisoboti (oflayn ochilgan smenada hali yo'q) */
  summary: ShiftSummary | null;
  expectedCash: number | null;
  /** Joriy smena oflayn ochilgan — serverda hali yo'q */
  openPending: boolean;
  /** Smena oflayn yopilgan, yopish serverga yuborilishi kutilmoqda */
  closePending: { countedCash: number; at: string } | null;
  /** Server rad etgan smena amallari — sahifada sababi bilan ko'rsatiladi */
  failed: QueueEntry[];
}

/**
 * Navbatdagi smena amallarini joriy smena hisoboti ustiga qoplaydi.
 * Faqat KUTAYOTGAN amallar qo'llanadi (overlay.ts qoidasi): rad etilgan
 * ochish/yopish ekranda "bajarilgan" ko'rinmaydi, `failed` ro'yxatida turadi.
 */
export const applyShiftOps = (report: ShiftReport | null, entries: QueueEntry[]): ShiftView => {
  let shift: ShiftViewShift | null = report?.shift && !report.shift.closedAt ? report.shift : null;
  let summary = shift ? report?.summary ?? null : null;
  let expectedCash = shift ? report?.expectedCash ?? null : null;
  let openPending = false;
  let closePending: ShiftView['closePending'] = null;
  const failed: QueueEntry[] = [];

  const ops = entries
    .filter((entry) => kindOf(entry) === 'shift.open' || kindOf(entry) === 'shift.close')
    .sort(bySeq);
  for (const entry of ops) {
    if (entry.status !== 'pending') {
      failed.push(entry);
      continue;
    }
    if (kindOf(entry) === 'shift.open') {
      const meta = entry.meta as unknown as ShiftOpenMeta;
      shift = {
        id: syntheticId(entry),
        clubId: 0,
        openedById: null,
        openedByName: null,
        openedAt: meta.at,
        openingCash: meta.openingCash,
        openingNote: meta.note,
        closedById: null,
        closedByName: null,
        closedAt: null,
        cashOut: null,
        expectedCash: null,
        countedCash: null,
        difference: null,
        closingNote: null,
        summary: null,
        createdAt: meta.at,
        updatedAt: meta.at,
        offlineLocalId: entry.localId,
        offlineMark: 'pending',
      };
      summary = null;
      expectedCash = null;
      openPending = true;
      closePending = null;
      continue;
    }
    const meta = entry.meta as unknown as ShiftCloseMeta;
    if (!shift) continue;
    const ref = shift.offlineLocalId ? localRef(shift.offlineLocalId) : String(shift.id);
    if (meta.shiftRef !== ref) continue;
    shift = null;
    summary = null;
    expectedCash = null;
    openPending = false;
    closePending = { countedCash: meta.countedCash, at: meta.at };
  }

  return { shift, summary, expectedCash, openPending, closePending, failed };
};

/** Smena havolasi: oflayn ochilgan bo'lsa `$local:`, aks holda server ID si */
export const shiftRefOf = (shift: Pick<ShiftViewShift, 'id' | 'offlineLocalId'>): string =>
  shift.offlineLocalId ? localRef(shift.offlineLocalId) : String(shift.id);
