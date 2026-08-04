/**
 * OFLAYN QOPLAMA (overlay) — navbatdagi amallarni EKRANDA ko'rsatish.
 *
 * Muammo: internet yo'q paytda kassir "O'yin boshlash" ni bosadi. So'rov
 * navbatga tushadi, lekin stollar ro'yxati keshdan kelgani uchun stol hamon
 * "bo'sh" bo'lib turadi. Kassir amal ishlamadi deb o'ylab, ikkinchi marta
 * bosadi — natijada ikkita sessiya navbatga tushadi.
 *
 * Yechim: ro'yxat ekranga chiqarilishidan oldin navbatdagi amallar ustiga
 * QOPLANADI. Kassir o'z amalining natijasini darhol ko'radi.
 *
 * YAGONA MANBA: qoplama alohida "soya holat" saqlamaydi — u har safar
 * NAVBATNING O'ZIDAN hisoblanadi. Amal serverga yuborilishi bilan navbatdan
 * chiqadi va qoplama ham o'z-o'zidan yo'qoladi, o'rniga serverdan kelgan
 * haqiqiy ma'lumot qoladi. Shu sababli ikki holat bir-biridan ayrila olmaydi.
 */

import type { BilliardTable, Session } from '../types';
import type { QueueEntry } from './queue';

/** Navbatdagi amal turi — `meta.kind` da saqlanadi */
export type OfflineOpKind = 'session.start' | 'session.pause' | 'session.resume' | 'order.create';

/** `meta` ning qoplama uchun ishlatiladigan maydonlari */
interface OpMeta {
  kind?: OfflineOpKind;
  tableId?: number;
  /** Sessiyaga havola: server ID si (son) yoki `$local:<localId>` */
  sessionRef?: string;
  startTime?: string;
  pricePerHour?: number;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  /** order.create uchun — buyurtma summasi */
  amount?: number;
  at?: string;
}

/**
 * Oflayn sessiyaning sintetik `id` si.
 *
 * MANFIY bo'lishi SHART: React kaliti sifatida noyob bo'lsin va serverdagi
 * haqiqiy ID bilan hech qachon to'qnashmasin. `seq` — IndexedDB ning
 * autoIncrement kaliti, ya'ni barqaror (qayta render da o'zgarmaydi).
 */
const syntheticId = (seq: number | undefined, localId: string): number =>
  seq !== undefined ? -seq : -(Math.abs(hash(localId)) % 1_000_000) - 1_000_000;

/** Barqaror kichik xesh — `seq` hali yozilmagan noyob holat uchun zaxira */
const hash = (value: string): number => {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
};

/** Sessiyaga havola satri: oflayn sessiya uchun `$local:...`, aks holda ID */
export const sessionRefOf = (session: Pick<Session, 'id' | 'offlineLocalId'>): string =>
  session.offlineLocalId ? `$local:${session.offlineLocalId}` : String(session.id);

/** Havola shu sessiyaga tegishlimi */
const refMatches = (ref: string | undefined, session: Session): boolean => {
  if (!ref) return false;
  if (ref.startsWith('$local:')) return session.offlineLocalId === ref.slice(7);
  return String(session.id) === ref;
};

/** Bo'sh (yangi boshlangan) sessiyaning to'liq shakli */
const makeSession = (
  table: BilliardTable,
  entry: QueueEntry,
  meta: OpMeta,
  nowIso: string,
): Session => ({
  id: syntheticId(entry.seq, entry.localId),
  clubId: table.clubId,
  tableId: table.id,
  userId: null,
  customerName: meta.customerName ?? null,
  customerPhone: meta.customerPhone ?? null,
  customerId: null,
  startTime: meta.startTime ?? nowIso,
  endTime: null,
  pausedAt: null,
  totalPausedMs: 0,
  pricePerHour: meta.pricePerHour ?? table.pricePerHour,
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
  notes: meta.notes ?? null,
  createdAt: meta.startTime ?? nowIso,
  updatedAt: nowIso,
  // Bu belgi bo'yicha interfeys hisob-kitob va ko'chirishni bloklaydi:
  // sessiyaning serverda hali ID si yo'q
  offlineLocalId: entry.localId,
});

/**
 * Navbatdagi amallarni stollar ro'yxati ustiga qoplaydi.
 * Kirish massivlari O'ZGARTIRILMAYDI (yangi nusxa qaytadi).
 */
export const applyQueueToTables = (
  tables: BilliardTable[],
  entries: QueueEntry[],
  now: number = Date.now(),
): BilliardTable[] => {
  if (entries.length === 0) return tables;

  const nowIso = new Date(now).toISOString();
  // Amallar navbatga yozilgan TARTIBDA qo'llanadi (start -> pause -> resume)
  const ordered = [...entries].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  // Har bir stolning sessiyasini alohida nusxada olib boramiz
  const next: BilliardTable[] = tables.map((tbl) => ({
    ...tbl,
    sessions: tbl.sessions ? tbl.sessions.map((s) => ({ ...s })) : tbl.sessions,
  }));

  const tableById = new Map(next.map((tbl) => [tbl.id, tbl]));

  /** Havola bo'yicha faol sessiyani topish */
  const findSession = (ref: string | undefined): Session | null => {
    if (!ref) return null;
    for (const tbl of next) {
      const s = tbl.sessions?.[0];
      if (s && refMatches(ref, s)) return s;
    }
    return null;
  };

  for (const entry of ordered) {
    /**
     * FAQAT kutayotgan (pending) amallar qoplanadi.
     *
     * XATO bo'lgan yozuv serverda bajarilMAGAN va qayta urinilmaguncha
     * bajarilMAYDI ham — uni ekranda "bajarilgan" qilib ko'rsatish kassirni
     * chalg'itardi (masalan xato bilan to'xtagan buyurtma bar summasiga
     * qo'shilib turardi). Bunday yozuvlar yuqoridagi qizil chiziq va
     * "Yuborilmagan amallar" oynasida ko'rinadi.
     */
    if (entry.status !== 'pending') continue;

    const meta = (entry.meta ?? {}) as OpMeta;

    switch (meta.kind) {
      case 'session.start': {
        const table = meta.tableId !== undefined ? tableById.get(meta.tableId) : undefined;
        // Stol allaqachon band bo'lsa qoplama qo'llanmaydi: server javobi
        // kelgan (yoki boshqa terminal boshlagan) — haqiqat ustun turadi
        if (!table || (table.sessions && table.sessions.length > 0)) break;
        table.sessions = [makeSession(table, entry, meta, nowIso)];
        table.status = 'busy';
        break;
      }

      case 'session.pause': {
        const session = findSession(meta.sessionRef);
        if (!session || session.status !== 'active') break;
        session.status = 'paused';
        session.pausedAt = meta.at ?? nowIso;
        break;
      }

      case 'session.resume': {
        const session = findSession(meta.sessionRef);
        if (!session || session.status !== 'paused') break;
        // Pauza davomiyligi yig'indiga qo'shiladi — hisob formulasi
        // (utils/session.ts) undan keyin to'g'ri ishlaydi
        const pausedAtMs = session.pausedAt ? Date.parse(session.pausedAt) : NaN;
        const resumedAtMs = meta.at ? Date.parse(meta.at) : now;
        if (!Number.isNaN(pausedAtMs)) {
          session.totalPausedMs += Math.max(0, resumedAtMs - pausedAtMs);
        }
        session.status = 'active';
        session.pausedAt = null;
        break;
      }

      case 'order.create': {
        const session = findSession(meta.sessionRef);
        if (!session || !meta.amount) break;
        session.barAmount = Number((session.barAmount + meta.amount).toFixed(2));
        break;
      }

      default:
        break;
    }
  }

  return next;
};

/** Ro'yxatda kamida bitta oflayn (serverda hali yo'q) sessiya bormi */
export const hasOfflineSession = (tables: BilliardTable[]): boolean =>
  tables.some((tbl) => tbl.sessions?.some((s) => !!s.offlineLocalId));
