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
 *  4. Bir amal DOIMIY xato (4xx) bilan qaytsa navbat TO'XTAYDI va foydalanuvchiga
 *     ko'rsatiladi. Undan keyingi amallar odatda shunga bog'liq (masalan
 *     "sessiyani yakunlash" — "sessiyani boshlash" ga), shuning uchun ularni
 *     ko'r-ko'rona yuborish noto'g'ri hisob beradi. HECH QACHON jimgina
 *     tashlab yuborilmaydi.
 *
 * LOKAL HAVOLALAR: offline'da yaratilgan yozuvning haqiqiy ID si hali yo'q.
 * Shuning uchun keyingi amallar `$local:<localId>` shaklidagi o'rin egallovchi
 * bilan yoziladi va qayta yuborishda oldingi javobdan olingan HAQIQIY ID ga
 * almashtiriladi (masalan: offline boshlangan sessiyani offline yakunlash).
 */

import type { AxiosError } from 'axios';
import client from '../api/client';
import { idbDelete, idbGet, idbGetAll, idbPut, metaGet, metaSet, STORE_QUEUE } from './db';

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
   */
  meta?: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: 'pending' | 'failed';
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

const rememberLocalId = async (localId: string, serverId: number): Promise<void> => {
  const map = await readLocalMap();
  map[localId] = serverId;
  // Xarita cheksiz o'smasin — oxirgi 200 ta bog'lanish yetarli
  const keys = Object.keys(map);
  if (keys.length > 200) {
    for (const k of keys.slice(0, keys.length - 200)) delete map[k];
  }
  await metaSet(LOCAL_MAP_KEY, map);
};

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

/* ------------------------------------------------------- Navbat amallari */

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((fn) => fn());

/** Navbat o'zgarishiga obuna (UI hisoblagichi uchun) */
export const onQueueChange = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const queueList = async (): Promise<QueueEntry[]> => {
  const rows = await idbGetAll<QueueEntry>(STORE_QUEUE);
  return rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
};

export const queueCount = async (): Promise<{ pending: number; failed: number }> => {
  const rows = await queueList();
  return {
    pending: rows.filter((r) => r.status === 'pending').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  };
};

/** Amalni navbatga qo'yish. Qaytadi: yozuvning localId si */
export const enqueue = async (
  entry: Omit<QueueEntry, 'seq' | 'createdAt' | 'attempts' | 'status' | 'idempotencyKey' | 'localId'> &
    Partial<Pick<QueueEntry, 'localId' | 'idempotencyKey'>>,
): Promise<string> => {
  const localId = entry.localId ?? newId();
  const row: QueueEntry = {
    ...entry,
    localId,
    idempotencyKey: entry.idempotencyKey ?? newId(),
    createdAt: Date.now(),
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
  await idbPut(STORE_QUEUE, { ...row, status: 'pending', attempts: 0, lastError: undefined });
  notify();
};

/* ------------------------------------------------------------- Sinxron */

export interface FlushResult {
  sent: number;
  /** Doimiy xato tufayli to'xtadimi */
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
export const flushQueue = async (scope: string): Promise<FlushResult> => {
  if (flushing) return { sent: 0, blocked: false, offline: false };
  flushing = true;
  let sent = 0;
  try {
    const rows = await queueList();
    for (const row of rows) {
      if (row.scope !== scope) continue;
      // Oldida hal qilinmagan xato yozuv bo'lsa — undan keyingilar kutadi
      if (row.status === 'failed') return { sent, blocked: true, offline: false };

      /**
       * YUBORISHDAN OLDIN yozuv HALI NAVBATDAMI — qayta tekshiriladi.
       *
       * Ro'yxat sikl boshida bir marta o'qiladi, sikl esa tarmoq so'rovlari
       * tufayli soniyalarcha davom etishi mumkin. Shu oraliqda foydalanuvchi
       * "voz kechish" bosgan bo'lsa, tekshiruvsiz holatda BEKOR QILINGAN amal
       * baribir serverga ketardi — kassir uchun bu eng chalg'ituvchi xatti-harakat.
       */
      if (row.seq !== undefined) {
        const still = await idbGet<QueueEntry>(STORE_QUEUE, row.seq);
        if (!still) continue;
      }

      const map = await readLocalMap();
      let url: string;
      let body: unknown;
      try {
        url = resolveRefs(row.url, map);
        body = row.body === undefined ? undefined : resolveRefs(row.body, map);
      } catch (err) {
        await idbPut(STORE_QUEUE, {
          ...row,
          status: 'failed',
          lastError: (err as Error).message,
        });
        notify();
        return { sent, blocked: true, offline: false };
      }

      try {
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
        const id = (res.data as { data?: { id?: number } })?.data?.id;
        if (typeof id === 'number') await rememberLocalId(row.localId, id);
        if (row.seq !== undefined) await idbDelete(STORE_QUEUE, row.seq);
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
          return { sent, blocked: false, offline: true };
        }
        // 4xx — DOIMIY xato: bu amal shu holida hech qachon o'tmaydi.
        // Jimgina tashlab yubormaymiz: foydalanuvchi ko'rsin va hal qilsin.
        await idbPut(STORE_QUEUE, {
          ...row,
          attempts: row.attempts + 1,
          status: 'failed',
          lastError: axiosErr.response?.data?.message ?? `HTTP ${status}`,
        });
        notify();
        return { sent, blocked: true, offline: false };
      }
    }
    return { sent, blocked: false, offline: false };
  } finally {
    flushing = false;
  }
};

/** Chiqishda navbatni tozalash MUMKIN EMAS — yuborilmagan pul amallari
 *  yo'qolmasin. Faqat foydalanuvchi ochiq ravishda "voz kechish" desa
 *  queueRemove() chaqiriladi. */
