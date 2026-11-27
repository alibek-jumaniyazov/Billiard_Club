/**
 * OFLAYN KASSA AMALLARI — qaysi amal internetsiz bajariladi, qaysi biri yo'q.
 *
 * TAMOYIL: internet 24 soatgacha uzilsa ham kassa to'xtamasligi kerak, lekin
 * eskirgan ma'lumot ustida MIJOZDAN NOTO'G'RI PUL olinmasligi ham shart.
 * Shuning uchun har bir oflayn amal:
 *  - navbatga AMAL VAQTI (`offlineAt`, server soati bo'yicha) bilan yoziladi —
 *    server natijani AYNAN o'sha paytga hisoblaydi, navbat qancha kechiksa ham;
 *  - bir martalik Idempotency-Key bilan yuboriladi — takror yuborish amalni
 *    ikki marta yozmaydi;
 *  - `meta.deps` bog'liqlik kalitlarini oladi (`table:<id>`, `session:<ref>`,
 *    `customer:<id>`, `debt:<customerId>`): server rad etgan amal faqat o'ziga
 *    bog'liq amallarni to'xtatadi, boshqa stollar navbati yuraveradi;
 *  - serverda QAYTA tekshiriladi. Rad etilsa navbatda "xato" bo'lib qoladi va
 *    kassirga ko'rinadi — hech biri jimgina yo'qolmaydi.
 *
 *   OFLAYN BAJARILADI (navbatga tushadi, aloqa tiklanganda yuboriladi):
 *     · o'yin boshlash (belgilangan vaqt yoki summa limiti bilan)
 *     · pauza / davom ettirish
 *     · bar buyurtmasi — pozitsiya HAQIQIY vaqti bilan yoziladi
 *     · o'yin vaqti / summa limitini o'zgartirish (+30, +60, limit, olib tashlash)
 *     · boshqa stolga ko'chirish — vaqt va narx BOSILGAN PAYTDA bo'linadi
 *       (o'sha paytdagi onlayn ko'chirish bilan bir xil). O'yin oraliqda boshqa
 *       kassada ko'chirilgan yoki maqsad stol band bo'lsa server rad etadi
 *     · bekor qilish — o'yin bosilgan paytda to'xtaydi; kassir chegarasi
 *       (barsiz va 10 daqiqagacha) serverda o'sha payt bo'yicha qayta tekshiriladi
 *     · hisob-kitob: to'liq to'lov, bo'lib to'lash, nol to'lov (to'liq chegirma,
 *       bepul stol). Server summani o'sha paytga qayta hisoblaydi; boshqa
 *       kassadagi o'zgarish tufayli farq chiqsa rad etmaydi — OLINGAN pulni
 *       yozadi (bo'sh to'lov ro'yxati = hech narsa olinmagan) va farqni
 *       belgilaydi, kassirga ogohlantirish chiqadi (sessions.service.ts: end)
 *     · stolsiz bar savdosi (o'yinsiz mijozga bardan sotish) — pul kassada olingan,
 *       server rad etmaydi: savdo kassada bosilgan vaqt va O'SHA narx bilan yoziladi,
 *       ombor yetmasa noldan pastga tushmaydi, farq jurnalga yoziladi
 *     · hisobning bir qismi yoki hammasi QARZGA — faqat shu kassada saqlangan
 *       «Mijozlar» ro'yxatidan tanlangan MAVJUD mijozga (customer-directory.ts).
 *       Server mijozni va qarz qoidalarini qayta tekshiradi; mijoz topilmasa
 *       amal "xato" bo'ladi
 *
 *   INTERNET TALAB QILADI (aniq sababi bilan bloklanadi):
 *     · ro'yxatda YO'Q mijozni qarzga yozish (yangi yoki internetsiz qo'shilgan
 *       mijoz, erkin yozilgan ism); tarifda «Mijozlar» bo'limi bo'lmasa yoki
 *       ro'yxat bu kompyuterda saqlanmagan bo'lsa — oflayn qarz umuman
 *     · qo'lda tuzatish (admin; huquq va sabab serverda tekshiriladi)
 *     · stoldagi bar buyurtmasini bekor qilish (ochiq buyurtma serverda)
 *     · qarz to'lovi va qarzni tuzatish/hisobdan chiqarish (Qarzlar sahifasi —
 *       bu fayl ularni navbatga qo'ymaydi), sozlamalar, hisobotlar, xodimlar,
 *       stollarni boshqarish
 *
 * Taymer OFLAYN HAM to'g'ri yuradi (u `startTime` dan qayta hisoblanadi),
 * shuning uchun aloqa tiklangach yakuniy summa BIR TIYINGA ham yo'qolmaydi.
 *
 * TARTIB: sessiya yoki stol bo'yicha navbatda hali yuborilmagan amal bo'lsa,
 * internet bor bo'lsa ham YANGI amal navbat orqali yuboriladi
 * (overlay.ts: hasPendingOps) — aks holda u eski amaldan oldin serverga yetib,
 * tartibni buzardi (masalan oflayn ko'chirish yuborilmay turib hisob yopilardi).
 */

import type { BilliardTable, Session, SessionPlanPayload } from '../types';
import type { BarSalePayload } from '../utils/barSale';
import { formatNumber } from '../utils/format';
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

/** Navbatdagi amal tavsifi uchun stol nomi */
const tableLabel = (table: BilliardTable): string => `${table.name} (№${table.number})`;

/**
 * NAVBAT BOG'LIQLIK KALITLARI (queue.ts: `meta.deps`). Server rad etgan amal
 * faqat shu kalitlardan birortasi mos keladigan keyingi amallarni to'xtatadi:
 * bir stoldagi xato boshqa stollarning pul amallarini ushlab turmaydi.
 */
const dep = {
  table: (id: number) => `table:${id}`,
  /** `ref` — server ID si (son) yoki oflayn sessiya uchun `$local:<id>` */
  session: (ref: string) => `session:${ref}`,
  customer: (id: number) => `customer:${id}`,
  debt: (customerId: number) => `debt:${customerId}`,
  /** Stolsiz bar savdosi — har biri o'z kaliti: smena yopilishi ularni kutadi, bir-birini to'smaydi */
  barSale: (localId: string) => `bar:${localId}`,
};

/** Sessiya amali uchun standart kalitlar: shu sessiya + u turgan stol */
const sessionDeps = (ref: string, tableId: number): string[] => [dep.session(ref), dep.table(tableId)];

/**
 * O'yinni oflayn boshlash — natijada sessiyaning lokal identifikatori qaytadi.
 *
 * `offlineAt` SERVERGA YUBORILADI: aloqa tiklanganda server o'yin qachon
 * boshlanganini biladi. Busiz sessiya "hozir boshlangan" bo'lib yozilardi va
 * klub oflayn o'tgan BUTUN vaqt uchun pul olmasdi.
 *
 * Lokal ID OLDINDAN yaratiladi: bog'liqlik kalitiga `session:$local:<id>`
 * qo'shiladi — boshlash rad etilsa, shu sessiyaning keyingi amallari (pauza,
 * buyurtma, ko'chirish, hisob) ham to'g'ridan-to'g'ri kutib turadi.
 */
export const queueStartSession = async (
  table: BilliardTable,
  values: {
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    plannedMinutes?: number;
    /** Summa limiti — plannedMinutes bilan birga berilmaydi */
    limitAmount?: number;
  },
  idempotencyKey?: string,
  offsetMs = 0,
  /**
   * Klub sozlamasidagi yaxlitlash qadami — internetsiz o'yinning jonli summasi
   * shu bilan ko'rsatiladi (server ham boshlashda sozlamadagi qadamni muhrlaydi)
   */
  roundingStep = 0,
): Promise<string> => {
  const startTime = nowIso(offsetMs);
  const localId = newId();
  return enqueue({
    scope: requireScope(),
    localId,
    idempotencyKey,
    method: 'post',
    url: '/sessions/start',
    body: { tableId: table.id, ...values, offlineAt: startTime },
    labelKey: 'offline.actStart',
    labelParams: { table: tableLabel(table) },
    meta: {
      kind: 'session.start',
      tableId: table.id,
      startTime,
      pricePerHour: table.pricePerHour,
      customerName: values.customerName ?? null,
      customerPhone: values.customerPhone ?? null,
      notes: values.notes ?? null,
      plannedMinutes: values.plannedMinutes ?? null,
      // Qolgan vaqt kartada shu qiymat va narxdan hisoblanadi — oflayn ham ishlaydi
      limitAmount: values.limitAmount ?? null,
      roundingStep,
      deps: [dep.table(table.id), dep.session(`$local:${localId}`)],
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
    labelParams: { table: tableLabel(table) },
    meta: {
      kind: resume ? 'session.resume' : 'session.pause',
      sessionRef: ref,
      tableId: table.id,
      at,
      deps: sessionDeps(ref, table.id),
    },
  });
};

/**
 * Bar buyurtmasi — ekrandagi bar summasiga darhol qo'shiladi.
 *
 * `offlineAt` SERVERGA YUBORILADI: pozitsiya HAQIQIY vaqti bilan yoziladi.
 * Busiz kechikib kelgan buyurtma yuborilgan paytga yozilib, "bugungi bar
 * savdosi" va kun/smena hisobotida boshqa kunga tushib ketardi.
 */
export const queueOrder = async (
  table: BilliardTable,
  session: Session,
  items: Array<{ productId: number; quantity: number }>,
  amount: number,
  idempotencyKey?: string,
  offsetMs = 0,
): Promise<string> => {
  const ref = sessionRefOf(session);
  const at = nowIso(offsetMs);
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
    body: { sessionId: sessionIdBody, items, offlineAt: at },
    labelKey: 'offline.actOrder',
    labelParams: { table: tableLabel(table) },
    meta: {
      kind: 'order.create',
      sessionRef: ref,
      tableId: table.id,
      at,
      amount,
      deps: sessionDeps(ref, table.id),
    },
  });
};

/**
 * O'yin vaqti / summa limitini oflayn o'zgartirish ("+30 daqiqa", "yana 20
 * mingga", cheklovni olib tashlash). Pulga ta'sir qilmaydi — faqat
 * ogohlantirish chegarasi. Qiymat kassir ekranidagi narx bo'yicha tekshirilgan;
 * server oflayn qiymatni narx sababli qayta rad etmaydi (sessions.service.ts:
 * updatePlan), shuning uchun u shu o'yinning keyingi pulli amallarini to'smaydi.
 */
export const queuePlanChange = async (
  table: BilliardTable,
  session: Session,
  plan: SessionPlanPayload,
  idempotencyKey?: string,
  offsetMs = 0,
): Promise<string> => {
  const ref = sessionRefOf(session);
  const at = nowIso(offsetMs);
  const limitAmount = 'limitAmount' in plan ? plan.limitAmount : null;
  const plannedMinutes = 'plannedMinutes' in plan ? plan.plannedMinutes : null;
  return enqueue({
    scope: requireScope(),
    idempotencyKey,
    method: 'put',
    url: `/sessions/${ref}/plan`,
    body: { ...plan, offlineAt: at },
    labelKey: 'offline.actPlan',
    labelParams: { table: tableLabel(table) },
    meta: {
      kind: 'session.plan',
      sessionRef: ref,
      tableId: table.id,
      at,
      plannedMinutes,
      limitAmount,
      deps: sessionDeps(ref, table.id),
    },
  });
};

/**
 * O'yinni oflayn bekor qilish. O'yin AYNAN bosilgan paytda to'xtagan
 * hisoblanadi (`offlineAt`): server o'chirilgan summani, audit yozuvini va
 * kassir chegarasini (barsiz va 10 daqiqagacha) o'sha payt bo'yicha qayta
 * hisoblaydi. Chegara buzilsa (masalan boshqa kassada bar qo'shilgan) amal
 * "xato" bo'ladi — o'yin serverda ochiq qoladi va stol yana band ko'rinadi.
 */
export const queueCancelSession = async (
  table: BilliardTable,
  session: Session,
  idempotencyKey?: string,
  offsetMs = 0,
): Promise<string> => {
  const ref = sessionRefOf(session);
  const at = nowIso(offsetMs);
  return enqueue({
    scope: requireScope(),
    idempotencyKey,
    method: 'put',
    url: `/sessions/${ref}/cancel`,
    body: { offlineAt: at },
    labelKey: 'offline.actCancel',
    labelParams: { table: tableLabel(table) },
    meta: {
      kind: 'session.cancel',
      sessionRef: ref,
      tableId: table.id,
      at,
      deps: sessionDeps(ref, table.id),
    },
  });
};

/**
 * O'yinni oflayn boshqa stolga ko'chirish. Vaqt va narx AYNAN bosilgan
 * paytda bo'linadi (`offlineAt`) — natija o'sha paytdagi onlayn ko'chirish
 * bilan bir xil. `fromTableId` — o'yin hozir turgan stol: server tekshiradi,
 * oraliqda boshqa kassada ko'chirilgan bo'lsa eskirgan ko'chirish qo'llanmaydi.
 * Ikkala stol ham bog'liqlik kaliti: maqsad stolda yuborilmagan amal (masalan
 * oldingi o'yinning hisob-kitobi) bo'lsa, ko'chirish undan keyin boradi.
 */
export const queueTransferSession = async (
  table: BilliardTable,
  session: Session,
  target: BilliardTable,
  idempotencyKey?: string,
  offsetMs = 0,
): Promise<string> => {
  const ref = sessionRefOf(session);
  const at = nowIso(offsetMs);
  return enqueue({
    scope: requireScope(),
    idempotencyKey,
    method: 'post',
    url: `/sessions/${ref}/transfer`,
    body: { tableId: target.id, fromTableId: table.id, offlineAt: at },
    labelKey: 'offline.actTransfer',
    labelParams: { table: tableLabel(table), target: tableLabel(target) },
    meta: {
      kind: 'session.transfer',
      sessionRef: ref,
      // Chiroq markazi ikkala stolni ham kuzatadi (light-hub.ts: tableId, toTableId)
      tableId: table.id,
      toTableId: target.id,
      at,
      deps: [dep.session(ref), dep.table(table.id), dep.table(target.id)],
    },
  });
};

/** Oflayn hisob-kitob tanasi */
export interface OfflineEndBody {
  /** Kassada HAQIQATDA olingan pul — bo'sh ro'yxat = hech narsa olinmadi */
  payments: Array<{ method: string; amount: number }>;
  discount?: number;
  expectedBarAmount: number;
  /** Yaxlitlash yoqilgan o'yinda kassada olingan YAXLIT stol summasi */
  expectedTableAmount?: number;
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  /** Qarz — faqat ro'yxatdagi mijozga (`customerId` majburiy) */
  isDebt?: boolean;
  isTableDebt?: boolean;
  isBarDebt?: boolean;
  customerId?: number;
}

/**
 * Hisob-kitobni oflayn yakunlash.
 *
 * `payments` HAR DOIM aniq yuboriladi (bitta usul bo'lsa ham, BO'SH bo'lsa
 * ham): server kassada haqiqatda olingan summani bilishi shart — u o'z
 * hisobini shu bilan solishtiradi. `endedAtMs` — "Yakunlash" bosilgan payt
 * (server soatiga moslangan). Summa AYNAN shu payt bo'yicha hisoblangan
 * bo'lishi kerak — server ham o'sha paytga hisoblaydi, ya'ni soniya
 * chegarasidan o'tib ketgan "1 soniyalik" farq ham chiqmaydi.
 *
 * QARZ: faqat ro'yxatdagi mijozga (`customerId`). Mijoz va qarz kalitlari
 * bog'liqlikka qo'shiladi — shu mijozning keyingi qarz amallari bu yozuv
 * serverda qabul qilinmaguncha kutadi.
 *
 * @param debtAmount kassa hisoblagan qarz ulushi (faqat ko'rsatish uchun)
 */
export const queueEndSession = async (
  table: BilliardTable,
  session: Session,
  body: OfflineEndBody,
  total: number,
  idempotencyKey: string | undefined,
  endedAtMs: number,
  debtAmount = 0,
): Promise<string> => {
  // Himoya: interfeys buni o'tkazmaydi, server ham rad etadi — lekin rad
  // etilishini navbatda kutgandan ko'ra yozishdan oldin to'xtatgan ma'qul
  if (body.isDebt && !body.customerId) throw new Error('OFFLINE_DEBT_NEEDS_CUSTOMER');
  const ref = sessionRefOf(session);
  const at = new Date(endedAtMs).toISOString();
  const deps = sessionDeps(ref, table.id);
  if (body.isDebt && body.customerId) {
    deps.push(dep.customer(body.customerId), dep.debt(body.customerId));
  }
  return enqueue({
    scope: requireScope(),
    idempotencyKey,
    method: 'put',
    url: `/sessions/${ref}/end`,
    body: { ...body, offlineAt: at },
    labelKey: body.isDebt ? 'offline.actEndDebt' : 'offline.actEnd',
    labelParams: {
      table: tableLabel(table),
      ...(body.isDebt ? { customer: body.customerName ?? `#${body.customerId}` } : {}),
    },
    meta: {
      kind: 'session.end',
      sessionRef: ref,
      tableId: table.id,
      at,
      amount: total,
      ...(body.isDebt ? { debt: debtAmount, customerId: body.customerId } : {}),
      deps,
    },
  });
};

/**
 * STOLSIZ BAR SAVDOSI — internetsiz (o'yinsiz mijozga bardan sotish).
 *
 * Pul kassada ALLAQACHON olingan, shuning uchun server bu amalni rad etmaydi:
 * savdo kassada "To'lash" bosilgan vaqt va kassirga ko'rsatilgan narx bilan
 * yoziladi, ombor yetmasa noldan pastga tushmaydi, farq jurnalga yoziladi
 * (server/src/modules/orders/bar-sale.service.ts). Qarz — faqat ro'yxatdagi
 * mijozga (`customerId`). Stol yoki o'yinga bog'liq emas: har savdoning o'z
 * kaliti bor — smena yopilishi uni kutadi, boshqa amallar esa to'xtamaydi.
 */
export const queueBarSale = async (
  body: BarSalePayload,
  total: number,
  idempotencyKey: string | undefined,
  soldAtMs: number,
  debtAmount = 0,
): Promise<string> => {
  if (body.isDebt && !body.customerId) throw new Error('OFFLINE_DEBT_NEEDS_CUSTOMER');
  const at = new Date(soldAtMs).toISOString();
  const localId = newId();
  const deps = [dep.barSale(localId)];
  if (body.isDebt && body.customerId) deps.push(dep.customer(body.customerId), dep.debt(body.customerId));
  return enqueue({
    scope: requireScope(),
    localId,
    idempotencyKey,
    method: 'post',
    url: '/orders/sale',
    body: { ...body, offlineAt: at },
    labelKey: body.isDebt ? 'offline.actBarSaleDebt' : 'offline.actBarSale',
    labelParams: {
      amount: formatNumber(total),
      ...(body.isDebt ? { customer: body.customerName ?? `#${body.customerId}` } : {}),
    },
    meta: {
      kind: 'bar.sale',
      at,
      amount: total,
      ...(body.isDebt ? { debt: debtAmount, customerId: body.customerId } : {}),
      deps,
    },
  });
};
