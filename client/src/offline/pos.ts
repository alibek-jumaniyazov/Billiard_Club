/**
 * OFLAYN KASSA AMALLARI — qaysi amal internetsiz bajariladi, qaysi biri yo'q.
 *
 * TANLOV ATAYLAB CHEKLANGAN. Kassa dasturida "hamma narsa oflayn ishlasin"
 * degan yondashuv xavfli: hisob-kitob (checkout) summasi boshqa terminalda
 * qo'shilgan bar buyurtmalariga, chegirmalarga va qarz holatiga bog'liq —
 * eskirgan ma'lumot ustida hisoblangan chek MIJOZDAN NOTO'G'RI PUL olishga
 * olib keladi va uni keyin tuzatib bo'lmaydi (pul allaqachon olingan).
 *
 * Shuning uchun:
 *
 *   OFLAYN BAJARILADI (navbatga tushadi, aloqa tiklanganda yuboriladi):
 *     · o'yin boshlash        — stolni band qilish, taymer boshlanishi
 *     · pauza / davom ettirish — vaqt hisobiga ta'sir qiladi, lekin pul yo'q
 *     · bar buyurtmasi        — qo'shimcha yozuv, mavjud summani o'zgartirmaydi
 *     · hisob-kitob (TO'LIQ to'lov) — mijoz internet uzilgani uchun kutib
 *       qolmasin. Summa shu kassadagi ma'lumotdan hisoblanadi, serverga
 *       "Yakunlash" bosilgan VAQT va OLINGAN pul yuboriladi. Server summani
 *       o'sha paytga qayta hisoblaydi; boshqa terminaldagi o'zgarish tufayli
 *       farq chiqsa rad etmaydi — olingan pulni yozadi va farqni belgilaydi
 *       (sessions.service.ts: end), kassirga esa ogohlantirish chiqadi.
 *
 *   INTERNET TALAB QILADI (aniq xabar bilan bloklanadi):
 *     · qarzga yozish va qo'lda tuzatish (mijoz/huquq tekshiruvi serverda),
 *       qarz to'lovi, sessiyani bekor qilish, boshqa stolga ko'chirish,
 *       sozlamalar/hisobotlar/xodimlar
 *
 * Taymer OFLAYN HAM to'g'ri yuradi (u `startTime` dan qayta hisoblanadi),
 * shuning uchun aloqa tiklangach yakuniy summa BIR TIYINGA ham yo'qolmaydi:
 * mijoz o'ynayveradi, hisob-kitob esa server bilan qilinadi.
 */

import type { BilliardTable, Session } from '../types';
import { sessionRefOf } from './overlay';
import { enqueue, newId } from './queue';
import { fullScope } from './cache';

/** Navbatga yozish uchun joriy doira; bo'lmasa oflayn amal qabul qilinmaydi */
const requireScope = (): string => {
  const scope = fullScope();
  if (!scope) throw new Error('OFFLINE_SCOPE_MISSING');
  return scope;
};

/**
 * Bir martalik amal kaliti. Sahifa amalni AVVAL onlayn yuborishga urinib,
 * tarmoq uzilsa navbatga o'tkazadi — ikkala yo'lda ham AYNAN SHU kalit
 * ishlatiladi. Shu tufayli "server bajardi, javob yo'qoldi" holatida
 * takroriy so'rov yangi yozuv yaratmaydi, birinchisining javobini oladi.
 */
export const newActionKey = (): string => newId();

/**
 * AMAL VAQTI — server soatiga moslangan.
 *
 * Kassa kompyuterining soati noto'g'ri bo'lishi mumkin, shuning uchun barcha
 * jonli hisoblar `Date.now() + offsetMs` bilan yuritiladi (offsetMs = oxirgi
 * javobdagi serverNow bilan farq, utils/session.ts). Navbatga yoziladigan
 * vaqt muhri ham AYNAN shu soatdan olinishi shart: aks holda ekranda
 * ko'rsatilgan taymer bilan serverga yoziladigan boshlanish vaqti bir-biriga
 * mos kelmasdi va mijozdan noto'g'ri summa olinardi.
 */
const nowIso = (offsetMs = 0): string => new Date(Date.now() + offsetMs).toISOString();

/**
 * O'yinni oflayn boshlash — natijada sessiyaning lokal identifikatori qaytadi.
 *
 * `offlineAt` SERVERGA YUBORILADI: aloqa tiklanganda server o'yin qachon
 * boshlanganini biladi. Busiz sessiya "hozir boshlangan" bo'lib yozilardi va
 * klub oflayn o'tgan BUTUN vaqt uchun pul olmasdi.
 */
export const queueStartSession = async (
  table: BilliardTable,
  values: { customerName?: string; customerPhone?: string; notes?: string; plannedMinutes?: number },
  idempotencyKey?: string,
  offsetMs = 0,
): Promise<string> => {
  const startTime = nowIso(offsetMs);
  return enqueue({
    scope: requireScope(),
    idempotencyKey,
    method: 'post',
    url: '/sessions/start',
    body: { tableId: table.id, ...values, offlineAt: startTime },
    labelKey: 'offline.actStart',
    labelParams: { table: `${table.name} (№${table.number})` },
    meta: {
      kind: 'session.start',
      tableId: table.id,
      startTime,
      pricePerHour: table.pricePerHour,
      customerName: values.customerName ?? null,
      customerPhone: values.customerPhone ?? null,
      notes: values.notes ?? null,
      plannedMinutes: values.plannedMinutes ?? null,
    },
  });
};

/**
 * Pauza / davom ettirish — sessiya oflayn boshlangan bo'lsa `$local:` havolasi
 * ishlatiladi.
 *
 * `offlineAt` SERVERGA YUBORILADI: pauza qachon bosilgani muhim. Busiz server
 * pauzani navbat yuborilgan paytdan hisoblab, oflayn o'tgan pauza vaqtini
 * mijozga yozib qo'yardi (ortiqcha pul).
 */
export const queuePauseResume = async (
  table: BilliardTable,
  session: Session,
  resume: boolean,
  idempotencyKey?: string,
  offsetMs = 0,
): Promise<string> => {
  const ref = sessionRefOf(session);
  const at = nowIso(offsetMs);
  return enqueue({
    scope: requireScope(),
    idempotencyKey,
    method: 'put',
    url: `/sessions/${ref}/${resume ? 'resume' : 'pause'}`,
    body: { offlineAt: at },
    labelKey: resume ? 'offline.actResume' : 'offline.actPause',
    labelParams: { table: `${table.name} (№${table.number})` },
    meta: {
      kind: resume ? 'session.resume' : 'session.pause',
      sessionRef: ref,
      tableId: table.id,
      at,
    },
  });
};

/** Bar buyurtmasi — ekrandagi bar summasiga darhol qo'shiladi */
export const queueOrder = async (
  table: BilliardTable,
  session: Session,
  items: Array<{ productId: number; quantity: number }>,
  amount: number,
  idempotencyKey?: string,
): Promise<string> => {
  const ref = sessionRefOf(session);
  // Tanaga SON yuboriladi. Oflayn boshlangan sessiyada haqiqiy ID hali yo'q,
  // shuning uchun `$local:` o'rin egallovchisi qo'yiladi — navbat uni
  // yuborish paytida songa almashtiradi (queue.ts: resolveRefs).
  const sessionIdBody: number | string = session.offlineLocalId
    ? `$local:${session.offlineLocalId}`
    : session.id;
  return enqueue({
    scope: requireScope(),
    idempotencyKey,
    method: 'post',
    url: '/orders',
    body: { sessionId: sessionIdBody, items },
    labelKey: 'offline.actOrder',
    labelParams: { table: `${table.name} (№${table.number})` },
    meta: { kind: 'order.create', sessionRef: ref, tableId: table.id, amount },
  });
};

/**
 * Hisob-kitobni oflayn yakunlash.
 *
 * `payments` HAR DOIM aniq yuboriladi (bitta usul bo'lsa ham): server
 * kassada haqiqatda olingan summani bilishi shart — u o'z hisobini shu bilan
 * solishtiradi. `endedAtMs` — "Yakunlash" bosilgan payt (server soatiga
 * moslangan). Summa AYNAN shu payt bo'yicha hisoblangan bo'lishi kerak —
 * server ham o'sha paytga hisoblaydi, ya'ni soniya chegarasidan o'tib ketgan
 * "1 soniyalik" farq ham chiqmaydi.
 */
export const queueEndSession = async (
  table: BilliardTable,
  session: Session,
  body: {
    payments: Array<{ method: string; amount: number }>;
    discount?: number;
    expectedBarAmount: number;
    notes?: string;
    customerName?: string;
    customerPhone?: string;
  },
  total: number,
  idempotencyKey: string | undefined,
  endedAtMs: number,
): Promise<string> => {
  const ref = sessionRefOf(session);
  const at = new Date(endedAtMs).toISOString();
  return enqueue({
    scope: requireScope(),
    idempotencyKey,
    method: 'put',
    url: `/sessions/${ref}/end`,
    body: { ...body, offlineAt: at },
    labelKey: 'offline.actEnd',
    labelParams: { table: `${table.name} (№${table.number})` },
    meta: { kind: 'session.end', sessionRef: ref, tableId: table.id, at, amount: total },
  });
};
