/**
 * OFFLINE YOZUV NAVBATI — internet uzilganda bajarilgan amallar.
 *
 * MODEL (kassa uchun ataylab konservativ):
 *  1. Amal navbatga QAT'IY TARTIB bilan (FIFO) yoziladi va IndexedDB da
 *     saqlanadi — brauzer yopilib ochilsa ham yo'qolmaydi.
 *  2. Har bir amalga bir martalik `Idempotency-Key` biriktiriladi. Server shu
 *     kalitni eslab qoladi, shuning uchun tarmoq lipillashi sabab AYNAN BIR
 *     amal ikki marta yuborilsa ham PUL IKKI MARTA YOZILMAYDI.
 *  3. Ulanish tiklanganda navbat aynan yozilgan tartibda qayta yuboriladi.
 *  4. Bir amal DOIMIY xato (4xx) bilan qaytsa u "xato" holatida qoladi va
 *     foydalanuvchiga ko'rsatiladi — HECH QACHON jimgina tashlab yuborilmaydi.
 *     Undan keyingi amallardan faqat SHUNGA BOG'LIQLARI kutadi (masalan
 *     "sessiyani yakunlash" — "sessiyani boshlash" ga): ularni ko'r-ko'rona
 *     yuborish noto'g'ri hisob berardi. Boshqa stol/mijozga tegishli MUSTAQIL
 *     amallar esa yuborilaveradi — bitta rad etilgan buyurtma butun kassani
 *     to'xtatib qo'ymaydi. Bog'liqlik qoidalari pastdagi "BOG'LIQLIKLAR"
 *     bo'limida.
 *
 * LOKAL HAVOLALAR: offline'da yaratilgan yozuvning haqiqiy ID si hali yo'q.
 * Shuning uchun keyingi amallar `$local:<localId>` shaklidagi o'rin egallovchi
 * bilan yoziladi va qayta yuborishda oldingi javobdan olingan HAQIQIY ID ga
 * almashtiriladi (masalan: offline boshlangan sessiyani offline yakunlash).
 */

import type { AxiosError } from 'axios';
import client from '../api/client';
import { completeQueueEntry, idbDelete, idbGet, idbGetAll, idbPut, metaGet, STORE_QUEUE } from './db';
import { fullScope } from './cache';
import { effectiveNow, requireOfflineLease } from './license';

export type QueueMethod = 'post' | 'put' | 'delete';

export interface QueueEntry {
  /** autoIncrement kaliti — FIFO tartibi */
  seq?: number;
  /** Bu amal yaratgan yozuvga havola qilish uchun lokal identifikator */
  localId: string;
  /** Foydalanuvchi+klub doirasi — boshqa hisobda qayta yuborilmaydi */
  scope: string;
  method: QueueMethod;
  /** `$local:<localId>` o'rin egallovchisi bo'lishi mumkin */
  url: string;
  body?: unknown;
  idempotencyKey: string;
  /** UI da ko'rsatiladigan i18n kaliti va parametrlari */
  labelKey: string;
  labelParams?: Record<string, string | number>;
  /**
   * Interfeysni OPTIMISTIK yangilash uchun zarur ma'lumot (qaysi stol, qachon
   * boshlangan va h.k.). Serverga YUBORILMAYDI — faqat lokal ko'rinish uchun.
   * Manba yagona: ekrandagi oflayn holat aynan shu navbatdan hisoblanadi
   * (overlay.ts), shuning uchun ikkinchi "soya holat" saqlanmaydi.
   *
   * `meta.deps?: string[]` — amal qaysi obyektlarga tegishi (bog'liqlik
   * kalitlari: `table:3`, `session:$local:ab` ...). Xato amaldan keyin navbat
   * faqat shu kalitlari mos kelgan amallarni ushlab turadi ("BOG'LIQLIKLAR").
   */
  meta?: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: 'pending' | 'failed';
  /**
   * Xato turi (faqat `status: 'failed'` da):
   *  - 'rejected'  — server amalni RAD ETDI (4xx) yoki havola hal bo'lmadi:
   *    muammo SHU amalda, faqat unga bog'liq keyingi amallar kutadi;
   *  - 'exhausted' — vaqtinchalik xato urinishlar chegarasidan oshdi: sabab
   *    odatda aloqa/hisob/obunada, shuning uchun BUTUN navbat to'xtaydi.
   * Maydoni yo'q eski yozuv 'rejected' deb qaraladi.
   */
  failure?: 'rejected' | 'exhausted';
}

const LOCAL_MAP_KEY = 'localIdMap';
const LOCAL_REF = /^\$local:(.+)$/;

/**
 * Vaqtinchalik xato bo'lgan amalni nechta marta qayta yuborib ko'ramiz.
 * 20 urinish x 20 soniya ≈ 7 daqiqa: shundan keyin ham o'tmasa bu
 * "vaqtinchalik" emas — foydalanuvchiga ko'rsatiladi.
 */
const MAX_ATTEMPTS = 20;

/** Tasodifiy identifikator — crypto bo'lmagan muhitda ham ishlaydi */
export const newId = (): string => {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/* --------------------------------------------------- Lokal ID xaritasi */

type LocalMap = Record<string, number>;

const readLocalMap = async (): Promise<LocalMap> => (await metaGet<LocalMap>(LOCAL_MAP_KEY)) ?? {};

/** URL/tanadagi `$local:<id>` o'rin egallovchilarini haqiqiy ID ga almashtiradi */
const resolveRefs = <T>(value: T, map: LocalMap): T => {
  if (typeof value === 'string') {
    const match = LOCAL_REF.exec(value);
    if (match) {
      const serverId = map[match[1]];
      if (serverId === undefined) throw new Error(`UNRESOLVED_REF:${match[1]}`);
      // BUTUN qiymat havola bo'lsa — SON qaytariladi. Bu muhim: server DTO lari
      // `@IsInt()` bilan tekshiriladi va implicit konvertatsiya O'CHIQ, ya'ni
      // tanadagi "12" satri validatsiyadan o'tmasdi (URL ichidagi almashtirish
      // esa pastda, satr sifatida bajariladi).
      return serverId as unknown as T;
    }
    // URL ichida joylashgan havola: /sessions/$local:abc/end
    return value.replace(/\$local:([A-Za-z0-9-]+)/g, (_match, id: string) => {
      const serverId = map[id];
      if (serverId === undefined) throw new Error(`UNRESOLVED_REF:${id}`);
      return String(serverId);
    }) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, map)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveRefs(v, map);
    }
    return out as T;
  }
  return value;
};

/* --------------------------------------------------------- Bog'liqliklar */

/** Bog'liqligi aniqlanmagan amal — o'zidan oldingi HAMMA narsaga bog'liq */
const ALL = 'all';
type Deps = ReadonlySet<string> | typeof ALL;

/** `$local:<localId>` havolasi — identifikator belgilari resolveRefs bilan bir xil */
const LOCAL_REFS = /\$local:([A-Za-z0-9-]+)/g;

const isRefValue = (value: unknown): value is string | number =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.trim() !== '');

/**
 * BOG'LIQLIK KALITLARI (`meta.deps`) — amal qaysi obyektga tegadi.
 *
 * NEGA KERAK: avval bitta amal rad etilsa (4xx) BUTUN navbat to'xtardi.
 * Masalan 3-stoldagi bar buyurtmasi rad etilsa, 7-stolda boshlangan o'yin va
 * boshqa barcha mustaqil amallar ham serverga yetmay qolardi. Endi xato amal
 * faqat O'ZIGA BOG'LIQ amallarni ushlab turadi.
 *
 * KALITLAR (satr): table:<id> · session:<ref> · customer:<ref> ·
 * reservation:<ref> · debt:<customerId> · shift
 * `<ref>` — server ID si yoki oflayn yaratilgan obyekt uchun `$local:<localId>`.
 * Obyekt serverga yetib borgach `$local:` haqiqiy ID ga almashtirib
 * solishtiriladi: `session:$local:ab` va `session:42` — bitta kalit.
 *
 * QOIDALAR (FIFO tartibida, faqat joriy doira ichida):
 *  1. Amal KUTADI, agar u oldingi xato yoki kutayotgan amal bilan kamida
 *     bitta umumiy kalitga ega bo'lsa, yoki URL/tanasi/kalitlarida xato yoki
 *     kutayotgan amalning `$local:<localId>` iga havola bo'lsa. Kutayotgan
 *     amal ham o'z navbatida keyingilarni ushlaydi (zanjir).
 *  2. `meta.deps` yo'q (eski) yozuvda kalitlar `meta.tableId`,
 *     `meta.sessionRef`, `meta.toTableId` dan olinadi.
 *  3. Hech narsa aniqlanmasa (yoki `deps` buzuq bo'lsa) — amal ehtiyot uchun
 *     "HAMMASIGA bog'liq" deb qaraladi: oldida ushlab turilgan biror amal bo'lsa
 *     kutadi, o'zi ushlansa — keyingi har bir kalitli amalni ushlaydi.
 *     `deps: []` — ataylab mustaqil amal: uni faqat `$local:` havolasi ushlaydi.
 *  4. Kutayotgan amal "xato" deb BELGILANMAYDI va o'chirilmaydi: xato amal
 *     qayta urinib o'tkazilishini yoki undan voz kechilishini kutadi.
 *  5. Vaqtinchalik xato (tarmoq/5xx/401/403/429/409) urinishlar chegarasidan
 *     oshsa ('exhausted'), sabab odatda amalda emas — aloqa, hisob yoki
 *     obunada (obuna tugasa HAR BIR so'rov 403 oladi). Bunday yozuv avvalgidek
 *     BUTUN navbatni to'xtatadi: aks holda mustaqil amallar ham birin-ketin
 *     "xato" bo'lib, kassir ularni bittalab qayta yuborishiga to'g'ri kelardi.
 *
 * Natija: kalitlar to'plami (serverga yetgan `$local:` — haqiqiy ID bilan)
 * yoki ALL.
 */
const depsOf = (row: QueueEntry, map: LocalMap): Deps => {
  const meta = row.meta ?? {};
  const keys: string[] = [];
  if (Array.isArray(meta.deps)) {
    for (const key of meta.deps as unknown[]) {
      // Buzuq qiymat — kalitlarga ishonib bo'lmaydi, konservativ yo'l
      if (typeof key !== 'string' || key.trim() === '') return ALL;
      keys.push(key.trim());
    }
  } else {
    if (isRefValue(meta.tableId)) keys.push(`table:${meta.tableId}`);
    if (isRefValue(meta.toTableId)) keys.push(`table:${meta.toTableId}`);
    if (isRefValue(meta.sessionRef)) keys.push(`session:${meta.sessionRef}`);
    if (keys.length === 0) return ALL;
  }
  return new Set(
    keys.map((key) =>
      key.replace(LOCAL_REFS, (ref, id: string) => (map[id] === undefined ? ref : String(map[id]))),
    ),
  );
};

/** Amal havola qiladigan, hali serverda yo'q obyektlar (URL, tana, kalitlar) */
const localRefsOf = (row: QueueEntry, deps: Deps): string[] => {
  const text = [row.url, JSON.stringify(row.body ?? null), deps === ALL ? '' : [...deps].join(' ')].join(' ');
  return Array.from(text.matchAll(LOCAL_REFS), (match) => match[1]);
};

/** Shu yuborish davrida ushlab turilgan (xato yoki kutayotgan) amallar izi */
interface Hold {
  /** Band kalitlar */
  keys: Set<string>;
  /** Ushlab turilgan amallarning localId lari — ularga havola qilgan amal kutadi */
  localIds: Set<string>;
  /** Kamida bitta amal ushlab turilibdi */
  any: boolean;
  /** "Hammasiga bog'liq" amal ushlab turilibdi — har bir kalitli amal kutadi */
  all: boolean;
}

const newHold = (): Hold => ({ keys: new Set(), localIds: new Set(), any: false, all: false });

/** Amal oldin ushlab turilgan biror amalga bog'liqmi */
const mustWait = (hold: Hold, row: QueueEntry, deps: Deps): boolean => {
  if (!hold.any) return false;
  if (deps === ALL) return true;
  if (localRefsOf(row, deps).some((id) => hold.localIds.has(id))) return true;
  if (deps.size > 0 && hold.all) return true;
  return [...deps].some((key) => hold.keys.has(key));
};

/** Amalni ushlab turilganlar qatoriga qo'shish — endi u ham keyingilarni ushlaydi */
const holdBack = (hold: Hold, row: QueueEntry, deps: Deps): void => {
  hold.any = true;
  hold.localIds.add(row.localId);
  if (deps === ALL) hold.all = true;
  else deps.forEach((key) => hold.keys.add(key));
};

/* ------------------------------------------------------- Navbat amallari */

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((fn) => fn());

/** Navbat o'zgarishiga obuna (UI hisoblagichi uchun) */
export const onQueueChange = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/**
 * Yuborilgan amal haqida kassir BILISHI SHART bo'lgan server natijasi.
 * Hozircha bitta tur: oflayn hisob-kitobda olingan pul server hisobidan farq
 * qildi (boshqa kassada bar o'zgargan) — server rad etmaydi, lekin kassir
 * mijoz bilan hal qilishi uchun darhol ogohlantiriladi.
 */
export interface SyncNotice {
  kind: 'offlineMismatch';
  labelParams?: Record<string, string | number>;
  expected: number;
  collected: number;
  difference: number;
}
const noticeListeners = new Set<(notice: SyncNotice) => void>();
export const onSyncNotice = (fn: (notice: SyncNotice) => void): (() => void) => {
  noticeListeners.add(fn);
  return () => noticeListeners.delete(fn);
};

export const queueList = async (): Promise<QueueEntry[]> => {
  const rows = await idbGetAll<QueueEntry>(STORE_QUEUE);
  return rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
};

/** Kutayotgan va xato amallar soni; `scope` berilsa — faqat shu doiradagilar */
export const queueCount = async (scope?: string): Promise<{ pending: number; failed: number }> => {
  const rows = (await queueList()).filter((r) => scope === undefined || r.scope === scope);
  return {
    pending: rows.filter((r) => r.status === 'pending').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  };
};

/** Amalni navbatga qo'yish. Qaytadi: yozuvning localId si */
export const enqueue = async (
  entry: Omit<QueueEntry, 'seq' | 'createdAt' | 'attempts' | 'status' | 'failure' | 'idempotencyKey' | 'localId'> &
    Partial<Pick<QueueEntry, 'localId' | 'idempotencyKey'>>,
): Promise<string> => {
  await requireOfflineLease(entry.scope);
  if (fullScope() !== entry.scope) throw new Error('OFFLINE_SCOPE_MISSING');
  const localId = entry.localId ?? newId();
  const row: QueueEntry = {
    ...entry,
    localId,
    idempotencyKey: entry.idempotencyKey ?? newId(),
    createdAt: effectiveNow(),
    attempts: 0,
    status: 'pending',
  };

  /**
   * YOZUV MUVAFFAQIYATINI TEKSHIRISH SHART.
   *
   * `idbPut` xatoga chidamli — IndexedDB yopiq bo'lsa (Safari private,
   * korporativ siyosat, kvota to'lgan) u jimgina `null` qaytaradi. Buni
   * tekshirmasdan `localId` qaytarish eng yomon holatga olib borardi: kassirga
   * "oflayn saqlandi" deb yashil xabar chiqadi, aslida esa amal HECH QAYERGA
   * yozilmagan — pul jim ketadi. Shuning uchun bu yerda xato ATAYLAB
   * yuqoriga uzatiladi va chaqiruvchi haqiqiy xato ko'rsatadi.
   */
  const key = await idbPut(STORE_QUEUE, row);
  if (key === null) throw new Error('OFFLINE_QUEUE_WRITE_FAILED');

  notify();
  return localId;
};

/**
 * Yozuvni navbatdan olib tashlash (foydalanuvchi "voz kechish" desa).
 *
 * BOG'LIQ AMALLAR HAM OLIB TASHLANADI. Masalan oflayn boshlangan sessiyadan
 * voz kechilsa, o'sha sessiyaga tegishli pauza va bar buyurtmasi endi hech
 * qachon yubora olmaydi — ular navbatda qolsa, birma-bir "UNRESOLVED_REF"
 * xatosi bilan yiqilib, foydalanuvchini bir xil oynaga qayta-qayta qaytarardi.
 * Shuning uchun zanjir bir marta va to'liq tozalanadi.
 *
 * @returns nechta yozuv olib tashlangani (foydalanuvchiga aytish uchun)
 */
export const queueRemove = async (seq: number): Promise<number> => {
  const rows = await queueList();
  const target = rows.find((r) => r.seq === seq);
  if (!target) return 0;

  /**
   * Bu yozuv yaratadigan obyektga havola qiluvchilarni topamiz.
   *
   * Moslik ANIQ bo'lishi shart: oddiy `includes` da `$local:abc` qidiruvi
   * `$local:abcd` ichida ham topilib, BEGONA amal ham o'chib ketardi.
   * Shuning uchun havoladan keyin identifikator belgisi (harf/raqam/defis)
   * kelmasligi tekshiriladi.
   */
  const escaped = target.localId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const refRe = new RegExp(`\\$local:${escaped}(?![A-Za-z0-9-])`);
  const referencesTarget = (row: QueueEntry): boolean =>
    refRe.test(row.url) ||
    refRe.test(JSON.stringify(row.body ?? null)) ||
    refRe.test(JSON.stringify(row.meta ?? null));

  const doomed = rows.filter(
    (r) => r.seq === seq || (r.seq !== undefined && r.seq > seq && referencesTarget(r)),
  );

  for (const row of doomed) {
    if (row.seq !== undefined) await idbDelete(STORE_QUEUE, row.seq);
  }
  notify();
  return doomed.length;
};

/**
 * Xato bo'lgan yozuvni qayta urinishga tayyorlash.
 *
 * `attempts` NOLGA QAYTARILADI: aks holda MAX_ATTEMPTS ga yetgan yozuv
 * "qayta urinish" tugmasidan keyin ham darhol yana xato holatiga tushib,
 * foydalanuvchi undan chiqa olmasdi.
 */
export const queueRetry = async (seq: number): Promise<void> => {
  const rows = await queueList();
  const row = rows.find((r) => r.seq === seq);
  if (!row) return;
  await idbPut(STORE_QUEUE, { ...row, status: 'pending', attempts: 0, lastError: undefined, failure: undefined });
  notify();
};

/* ------------------------------------------------------------- Sinxron */

export interface FlushResult {
  sent: number;
  /**
   * Yuborilmay qolgan amal bormi: xato bo'lgani, unga bog'liq bo'lib
   * kutayotgani yoki yuborish xavfsizlik uchun to'xtatilgani
   */
  blocked: boolean;
  /** Tarmoq hali yo'q — keyinroq qayta urinamiz */
  offline: boolean;
}

let flushing = false;

/**
 * Navbatni serverga qayta yuborish. Bir vaqtda faqat bitta oqim ishlaydi.
 *
 * @param scope joriy foydalanuvchi+klub doirasi — faqat SHU doiradagi
 *   yozuvlar yuboriladi (boshqa hisobning amali begona hisobga tushmasin)
 */
const flushWithLock = async (scope: string): Promise<FlushResult> => {
  if (flushing) return { sent: 0, blocked: false, offline: false };
  flushing = true;
  let sent = 0;
  // Xato va unga bog'liq bo'lib kutayotgan amallar — keyingilar shu bilan solishtiriladi
  const hold = newHold();
  try {
    const rows = await queueList();
    for (const listed of rows) {
      if (fullScope() !== scope) return { sent, blocked: true, offline: false };
      if (listed.scope !== scope) continue;

      /**
       * YUBORISHDAN OLDIN yozuv HALI NAVBATDAMI — qayta tekshiriladi.
       *
       * Ro'yxat sikl boshida bir marta o'qiladi, sikl esa tarmoq so'rovlari
       * tufayli soniyalarcha davom etishi mumkin. Shu oraliqda foydalanuvchi
       * "voz kechish" bosgan bo'lsa, tekshiruvsiz holatda BEKOR QILINGAN amal
       * baribir serverga ketardi — kassir uchun bu eng chalg'ituvchi xatti-harakat.
       * Qaror ham shu YANGI nusxa bo'yicha qilinadi: shu orada xato amal
       * "qayta urinish" ga qo'yilgan bo'lishi mumkin.
       */
      let row = listed;
      if (listed.seq !== undefined) {
        const still = await idbGet<QueueEntry>(STORE_QUEUE, listed.seq);
        if (!still) continue;
        row = still;
      }

      const map = await readLocalMap();
      const deps = depsOf(row, map);

      if (row.status === 'failed') {
        // Urinishlari tugagan vaqtinchalik xato — sabab umumiy, navbat to'xtaydi
        if (row.failure === 'exhausted') return { sent, blocked: true, offline: false };
        // Rad etilgan amal — faqat unga bog'liqlar kutadi
        holdBack(hold, row, deps);
        continue;
      }

      // Oldingi xato amalga bog'liq — kutadi. "Xato" deb belgilanmaydi:
      // havolasi baribir hal bo'lmasdi, lekin bu amalning o'zida aybi yo'q
      if (mustWait(hold, row, deps)) {
        holdBack(hold, row, deps);
        continue;
      }

      let url: string;
      let body: unknown;
      try {
        url = resolveRefs(row.url, map);
        body = row.body === undefined ? undefined : resolveRefs(row.body, map);
      } catch (err) {
        await idbPut(STORE_QUEUE, {
          ...row,
          status: 'failed',
          failure: 'rejected',
          lastError: (err as Error).message,
        });
        notify();
        holdBack(hold, row, deps);
        continue;
      }

      try {
        if (fullScope() !== scope) return { sent, blocked: true, offline: false };
        const res = await client.request({
          method: row.method,
          url,
          data: body,
          headers: {
            'Idempotency-Key': row.idempotencyKey,
            /**
             * OFLAYN KELIB CHIQISHI — server auditi uchun.
             *
             * Qiymat: amal navbatga QO'YILGAN payt (klient soati, ms).
             * Server uni o'z vaqti bilan solishtirib jurnalga yozadi, shunda
             * "bu yozuv internetsiz paytda kiritilgan va 3 soat kechikib
             * kelgan" degani keyin ko'rinib turadi. `Idempotency-Key` ning
             * o'zi bu ma'noni bermaydi — u onlayn amallarda ham ishlatiladi.
             */
            'X-Offline-Origin': String(row.createdAt),
          },
        });
        // Javobdagi haqiqiy ID ni lokal havolaga bog'laymiz
        const data = (res.data as {
          data?: { id?: number; offlineMismatch?: Omit<SyncNotice, 'kind' | 'labelParams'> | null };
        })?.data;
        const id = data?.id;
        if (data?.offlineMismatch) {
          const notice: SyncNotice = { kind: 'offlineMismatch', labelParams: row.labelParams, ...data.offlineMismatch };
          noticeListeners.forEach((fn) => fn(notice));
        }
        if (row.seq === undefined || !(await completeQueueEntry(row.seq, row.localId, typeof id === 'number' ? id : undefined))) {
          // Keep the original idempotency key; replay recovers an acknowledged response.
          return { sent, blocked: true, offline: false };
        }
        sent += 1;
        notify();
      } catch (err) {
        const axiosErr = err as AxiosError<{ message?: string }>;
        const status = axiosErr.response?.status;
        /**
         * VAQTINCHALIK xatolar — tartibni buzmasdan to'xtaymiz, keyingi
         * urinishda davom etadi:
         *   javob yo'q (tarmoq/timeout) · 5xx · 429 (chegara) ·
         *   409 (server AYNAN shu kalitli amalni hozir bajarayapti —
         *        idempotency.interceptor.ts dagi "band qilingan kalit") ·
         *   401/403 (sessiya) — bu ATAYLAB vaqtinchalik deb qaraladi:
         *        access token muddati oflayn turgan paytda tugagan bo'lishi
         *        mumkin va uni tiklash uchun TARMOQ kerak. "Doimiy xato" deb
         *        belgilansa, kassirning butun smena davomida yig'ilgan navbati
         *        bir marta muddati o'tgan token sababli bloklanib qolardi.
         *        Foydalanuvchi qayta kirgach navbat o'zi ketadi.
         */
        const retryable =
          status === undefined ||
          status >= 500 ||
          status === 429 ||
          status === 409 ||
          status === 401 ||
          status === 403;
        // Cheksiz urinmaymiz: kutilmagan holatda navbat abadiy aylanmasin,
        // foydalanuvchi buni ko'rib o'zi hal qilsin
        if (retryable && row.attempts + 1 < MAX_ATTEMPTS) {
          await idbPut(STORE_QUEUE, { ...row, attempts: row.attempts + 1 });
          notify();
          const anyFailed = rows.some((r) => r.scope === scope && r.status === 'failed');
          return { sent, blocked: hold.any || anyFailed, offline: true };
        }
        // 4xx — DOIMIY xato: bu amal shu holida hech qachon o'tmaydi (yoki
        // vaqtinchalik xato urinishlari tugadi). Jimgina tashlab yubormaymiz:
        // foydalanuvchi ko'rsin va hal qilsin.
        const failure = retryable ? 'exhausted' : 'rejected';
        await idbPut(STORE_QUEUE, {
          ...row,
          attempts: row.attempts + 1,
          status: 'failed',
          failure,
          lastError: axiosErr.response?.data?.message ?? `HTTP ${status}`,
        });
        notify();
        // Urinishlar tugadi — sabab umumiy (aloqa/obuna), navbat avvalgidek to'xtaydi
        if (failure === 'exhausted') return { sent, blocked: true, offline: false };
        holdBack(hold, row, deps);
      }
    }
    return { sent, blocked: hold.any, offline: false };
  } finally {
    flushing = false;
  }
};

/** Serialize replay across tabs/windows as well as within this module. */
export const flushQueue = async (scope: string): Promise<FlushResult> => {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return await navigator.locks.request('billiardclub-queue-replay', { ifAvailable: true },
      (lock) => lock ? flushWithLock(scope) : Promise.resolve({ sent: 0, blocked: false, offline: false }));
  }
  return flushWithLock(scope);
};

/** Chiqishda navbatni tozalash MUMKIN EMAS — yuborilmagan pul amallari
 *  yo'qolmasin. Faqat foydalanuvchi ochiq ravishda "voz kechish" desa
 *  queueRemove() chaqiriladi. */
