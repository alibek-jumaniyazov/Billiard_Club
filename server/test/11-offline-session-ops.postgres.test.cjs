const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { SessionsService } = require('../src/modules/sessions/sessions.service');
const { OrdersService } = require('../src/modules/orders/orders.service');
const { Category } = require('../src/entities/category.entity');
const { Club } = require('../src/entities/club.entity');
const { Customer } = require('../src/entities/customer.entity');
const { Debt } = require('../src/entities/debt.entity');
const { Order } = require('../src/entities/order.entity');
const { OrderItem } = require('../src/entities/order-item.entity');
const { Product } = require('../src/entities/product.entity');
const { Sale } = require('../src/entities/sale.entity');
const { Session } = require('../src/entities/session.entity');
const { SessionPayment } = require('../src/entities/session-payment.entity');
const { SessionSegment } = require('../src/entities/session-segment.entity');
const { Settings } = require('../src/entities/settings.entity');
const { Table } = require('../src/entities/table.entity');
const { User } = require('../src/entities/user.entity');
const { OrderStatus, PaymentMethod, UserRole } = require('../src/entities/enums');

/**
 * OFLAYN NAVBATDAN KELGAN AMALLAR — ko'chirish, bekor qilish, o'yin vaqti/limit,
 * bar buyurtmasi vaqti va qarzli / nol to'lovli hisob-kitob.
 *
 * Har bir amal `offlineAt` (kassada bosilgan payt) bilan keladi va server
 * natijani AYNAN o'sha paytga qo'llashi, rad etganda esa 400 bilan aniq sabab
 * qaytarishi shart (navbat 401/403/409/5xx ni vaqtinchalik deb qayta uradi).
 */

let database;
let nextClub = 0;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const iso = (ms) => new Date(ms).toISOString();
const ms = (value) => new Date(value).getTime();
const key = (error) => error?.getResponse?.().key;
const rejectsWith = (status, expectedKey) => (error) => {
  assert.equal(error.getStatus?.(), status, `kutilgan status ${status}, keldi ${error.getStatus?.()} (${key(error)})`);
  assert.equal(key(error), expectedKey);
  return true;
};

async function fixture(prices = [24000]) {
  const n = ++nextClub;
  const club = await database.getRepository(Club).save({ name: `Offline ops ${n}` });
  await database.getRepository(Settings).save({ clubId: club.id, timezone: 'Asia/Tashkent' });
  const tables = [];
  for (let i = 0; i < prices.length; i += 1) {
    tables.push(await database.getRepository(Table).save({
      clubId: club.id, name: `Stol ${i + 1}`, number: i + 1, pricePerHour: prices[i],
    }));
  }
  const stamp = `${n}_${Date.now()}`;
  const user = await database.getRepository(User).save({
    clubId: club.id, name: 'Kassir', username: `offops_kassir_${stamp}`, password: 'x', role: UserRole.KASSIR,
  });
  const admin = await database.getRepository(User).save({
    clubId: club.id, name: 'Admin', username: `offops_admin_${stamp}`, password: 'x', role: UserRole.ADMIN,
  });
  const audit = [];
  const auditService = { log: (entry) => audit.push(entry) };
  const service = new SessionsService(
    database, database.getRepository(Session), database.getRepository(SessionSegment), auditService,
  );
  const orders = new OrdersService(database, database.getRepository(Order), auditService);
  return { club, tables, table: tables[0], user, admin, service, orders, audit };
}

const sessionRow = (id) => database.getRepository(Session).findOneByOrFail({ id });
const tableRow = (id) => database.getRepository(Table).findOneByOrFail({ id });
const segmentsOf = (sessionId) => database.getRepository(SessionSegment).find({
  where: { sessionId }, order: { startedAt: 'ASC', id: 'ASC' },
});
const saleOf = (sessionId) => database.getRepository(Sale).findOneByOrFail({ sessionId });
const paymentsOf = (sessionId) => database.getRepository(SessionPayment).findBy({ sessionId });
/** Boshqa kassada qo'shilgan bar (ochiq buyurtma) — end() faqat ochiq buyurtmalarni yig'adi */
const barOrder = (club, sessionId, tableId, user, totalAmount) => database.getRepository(Order).save({
  clubId: club.id, sessionId, tableId, userId: user.id, totalAmount, status: OrderStatus.OPEN,
});

/* ------------------------------------------------------------- Ko'chirish */

test('oflayn ko‘chirish vaqt va narxni BOSILGAN paytda bo‘ladi — o‘sha paytdagi onlayn ko‘chirish bilan bir xil', { timeout: 15000 }, async () => {
  const { club, tables: [a, b], user, service, audit } = await fixture([24000, 48000]);
  const t0 = Date.now() - 3 * HOUR;
  const started = await service.start(club.id, user, { tableId: a.id, offlineAt: iso(t0) });

  const moved = await service.transfer(club.id, started.id, {
    tableId: b.id, fromTableId: a.id, offlineAt: iso(t0 + HOUR),
  }, user);

  assert.equal(moved.tableId, b.id);
  assert.equal(moved.pricePerHour, 48000);
  const [first, second] = moved.segments;
  assert.equal(ms(first.endedAt), t0 + HOUR, 'eski segment kassada bosilgan paytda yopiladi');
  assert.equal(ms(second.startedAt), t0 + HOUR);
  assert.equal(second.pricePerHour, 48000);
  assert.equal((await tableRow(a.id)).status, 'free');
  assert.equal((await tableRow(b.id)).status, 'busy');
  const log = audit.find((entry) => entry.action === 'session.offline_transfer');
  assert.deepEqual(log.meta, {
    requested: iso(t0 + HOUR), applied: iso(t0 + HOUR), clamped: false, fromTableId: a.id, toTableId: b.id,
  });

  // 1 soat × 24 000 + 1 soat × 48 000 — navbat 1 soat kechikib kelgan bo'lsa ham
  const result = await service.end(club.id, user, started.id, {
    offlineAt: iso(t0 + 2 * HOUR), expectedBarAmount: 0,
    payments: [{ method: PaymentMethod.CASH, amount: 72000 }],
  });
  assert.equal(result.tableAmount, 72000);
  assert.equal(result.offlineMismatch, null);
  assert.deepEqual(
    result.segments.map((s) => [s.tableId, s.billedSeconds, s.amount]),
    [[a.id, 3600, 24000], [b.id, 3600, 48000]],
  );
});

test('oflayn ko‘chirish rad etiladi (400): o‘yin oraliqda boshqa kassada ko‘chirilgan yoki maqsad stol band', { timeout: 15000 }, async () => {
  const { club, tables: [a, b, c], user, service } = await fixture([24000, 24000, 24000]);
  const started = await service.start(club.id, user, { tableId: a.id, offlineAt: iso(Date.now() - 2 * HOUR) });
  // Boshqa kassa (onlayn) o'yinni C ga ko'chirdi
  await service.transfer(club.id, started.id, { tableId: c.id }, user);

  await assert.rejects(
    () => service.transfer(club.id, started.id, {
      tableId: b.id, fromTableId: a.id, offlineAt: iso(Date.now() - HOUR),
    }, user),
    rejectsWith(400, 'sessions.transferConflict'),
  );
  assert.equal((await sessionRow(started.id)).tableId, c.id, 'eskirgan ko‘chirish qo‘llanmadi');
  assert.equal((await tableRow(b.id)).status, 'free');
  assert.equal((await segmentsOf(started.id)).length, 2);

  // Maqsad stolda boshqa o'yin bor
  const other = await service.start(club.id, user, { tableId: b.id });
  await assert.rejects(
    () => service.transfer(club.id, started.id, {
      tableId: b.id, fromTableId: c.id, offlineAt: iso(Date.now() - MINUTE),
    }, user),
    rejectsWith(400, 'sessions.tableBusy'),
  );
  assert.equal((await sessionRow(other.id)).tableId, b.id);
});

test('oflayn ko‘chirish: pauza ko‘chirishdan KEYIN boshlangan bo‘lsa qabul qilinadi va yangi stolga tegishli', { timeout: 15000 }, async () => {
  const { club, tables: [a, b], user, service } = await fixture([24000, 48000]);
  const t0 = Date.now() - 3 * HOUR;
  const started = await service.start(club.id, user, { tableId: a.id, offlineAt: iso(t0) });
  // Boshqa kassa 50-daqiqada pauza qo'ydi; bu kassa esa 40-daqiqada (internetsiz) ko'chirgan edi
  await service.pause(club.id, started.id, { offlineAt: iso(t0 + 50 * MINUTE) });
  await service.transfer(club.id, started.id, {
    tableId: b.id, fromTableId: a.id, offlineAt: iso(t0 + 40 * MINUTE),
  }, user);
  await service.resume(club.id, started.id, { offlineAt: iso(t0 + 70 * MINUTE) });

  const result = await service.end(club.id, user, started.id, {
    offlineAt: iso(t0 + 100 * MINUTE), expectedBarAmount: 0,
    // A: 40 daqiqa × 24 000 = 16 000; B: 60 daqiqa - 20 daqiqa pauza = 40 daqiqa × 48 000 = 32 000
    payments: [{ method: PaymentMethod.CASH, amount: 48000 }],
  });
  assert.equal(result.durationSeconds, 80 * 60);
  assert.deepEqual(result.segments.map((s) => [s.tableId, s.billedSeconds, s.amount]),
    [[a.id, 40 * 60, 16000], [b.id, 40 * 60, 32000]]);
  assert.equal(result.offlineMismatch, null);

  // Pauza ko'chirishdan OLDIN boshlangan bo'lsa — chegaradan oshardi: rad etiladi
  const second = await service.start(club.id, user, { tableId: a.id, offlineAt: iso(t0) });
  await service.pause(club.id, second.id, { offlineAt: iso(t0 + 30 * MINUTE) });
  await assert.rejects(
    () => service.transfer(club.id, second.id, {
      tableId: b.id, fromTableId: a.id, offlineAt: iso(t0 + 40 * MINUTE),
    }, user),
    rejectsWith(400, 'sessions.transferWhilePaused'),
  );
  // Onlayn ko'chirish pauzada avvalgidek taqiqlangan
  await assert.rejects(
    () => service.transfer(club.id, second.id, { tableId: b.id }, user),
    rejectsWith(400, 'sessions.transferWhilePaused'),
  );
});

test('oflayn ko‘chirish vaqti chegaralanadi: o‘yin boshlanishidan oldin bo‘la olmaydi', { timeout: 15000 }, async () => {
  const { club, tables: [a, b], user, service, audit } = await fixture([24000, 48000]);
  const t0 = Date.now() - HOUR;
  const started = await service.start(club.id, user, { tableId: a.id, offlineAt: iso(t0) });
  await service.transfer(club.id, started.id, {
    tableId: b.id, fromTableId: a.id, offlineAt: iso(t0 - 30 * MINUTE),
  }, user);
  const segments = await segmentsOf(started.id);
  assert.equal(ms(segments[1].startedAt), t0);
  assert.equal(audit.find((entry) => entry.action === 'session.offline_transfer').meta.clamped, true);
});

/* --------------------------------------------------------- Bekor qilish */

test('oflayn bekor qilish o‘yinni bosilgan paytda to‘xtatadi — kassir chegarasi o‘sha payt bo‘yicha', { timeout: 15000 }, async () => {
  const { club, table, user, service, audit } = await fixture();
  const t0 = Date.now() - 2 * HOUR;
  const started = await service.start(club.id, user, { tableId: table.id, offlineAt: iso(t0) });

  // Kassir 5-daqiqada bekor qilgan; navbat 2 soat kechikib keldi — baribir ruxsat
  const cancelled = await service.cancel(club.id, user, started.id, { offlineAt: iso(t0 + 5 * MINUTE) });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(ms(cancelled.endTime), t0 + 5 * MINUTE);
  assert.equal(cancelled.voided.durationSeconds, 300);
  assert.equal(cancelled.voided.tableAmount, 2000);
  assert.equal((await tableRow(table.id)).status, 'free');
  const [segment] = await segmentsOf(started.id);
  assert.equal(ms(segment.endedAt), t0 + 5 * MINUTE);
  const log = audit.find((entry) => entry.action === 'session.cancel');
  assert.deepEqual(log.meta.offline, { requested: iso(t0 + 5 * MINUTE), applied: iso(t0 + 5 * MINUTE), clamped: false });
});

test('kassirning oflayn bekor qilishini server rad etsa — 400 (navbatda darhol "xato"), onlayn esa 403', { timeout: 15000 }, async () => {
  const { club, tables: [a, b], user, service } = await fixture([24000, 24000]);
  const t0 = Date.now() - HOUR;
  const started = await service.start(club.id, user, { tableId: a.id, offlineAt: iso(t0) });
  // Kassa internetsiz turganda boshqa kassada bar qo'shilgan
  await barOrder(club, started.id, a.id, user, 10000);

  await assert.rejects(
    () => service.cancel(club.id, user, started.id, { offlineAt: iso(t0 + 2 * MINUTE) }),
    rejectsWith(400, 'sessions.cancelNeedsAdmin'),
  );
  assert.equal((await sessionRow(started.id)).status, 'active', 'rad etilgan bekor qilish o‘yinni yopmaydi');

  const long = await service.start(club.id, user, { tableId: b.id, offlineAt: iso(t0) });
  await assert.rejects(
    () => service.cancel(club.id, user, long.id),
    rejectsWith(403, 'sessions.cancelNeedsAdmin'),
  );
});

test('admin oflayn bekor qilishi: o‘chirilgan summa o‘sha paytgacha; kelajakdagi vaqt hozirga kesiladi', { timeout: 15000 }, async () => {
  const { club, tables: [a, b], admin, service, audit } = await fixture([24000, 24000]);
  const t0 = Date.now() - 2 * HOUR;
  const started = await service.start(club.id, admin, { tableId: a.id, offlineAt: iso(t0) });
  const cancelled = await service.cancel(club.id, admin, started.id, { offlineAt: iso(t0 + HOUR) });
  assert.equal(cancelled.voided.durationSeconds, 3600);
  assert.equal(cancelled.voided.tableAmount, 24000);

  const second = await service.start(club.id, admin, { tableId: b.id, offlineAt: iso(Date.now() - 30 * MINUTE) });
  const future = await service.cancel(club.id, admin, second.id, { offlineAt: iso(Date.now() + 5 * HOUR) });
  assert.ok(ms(future.endTime) <= Date.now());
  const logs = audit.filter((entry) => entry.action === 'session.cancel');
  assert.equal(logs[logs.length - 1].meta.offline.clamped, true);
});

/* ------------------------------------------------- O'yin vaqti / summa limiti */

test('oflayn limit o‘zgarishi kassir kiritganicha yoziladi (narx tekshiruvi ekranda bo‘lgan) — navbatni to‘smaydi', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture([40000]);
  const started = await service.start(club.id, user, { tableId: table.id, plannedMinutes: 60 });

  // Onlayn: 5 daqiqalik summadan kam limit avvalgidek rad etiladi
  await assert.rejects(
    () => service.updatePlan(club.id, started.id, { limitAmount: 10 }),
    rejectsWith(400, 'sessions.limitTooSmall'),
  );
  // Oflayn: rad etilmaydi, aynan yoziladi; belgilangan vaqt tozalanadi
  const offline = await service.updatePlan(club.id, started.id, { limitAmount: 10, offlineAt: iso(Date.now() - MINUTE) });
  assert.equal(offline.limitAmount, 10);
  assert.equal(offline.plannedMinutes, null);
  const removed = await service.updatePlan(club.id, started.id, { plannedMinutes: null, offlineAt: iso(Date.now()) });
  assert.equal(removed.limitAmount, null);

  // Shakl qoidalari oflaynda ham: vaqt + limit birga — rad
  await assert.rejects(
    () => service.updatePlan(club.id, started.id, { plannedMinutes: 60, limitAmount: 50000, offlineAt: iso(Date.now()) }),
    rejectsWith(400, 'sessions.planOrLimit'),
  );
  // Yakunlangan o'yin — aniq xato
  await service.end(club.id, user, started.id, { paymentMethod: PaymentMethod.CASH });
  await assert.rejects(
    () => service.updatePlan(club.id, started.id, { limitAmount: 50000, offlineAt: iso(Date.now()) }),
    rejectsWith(400, 'sessions.alreadyEnded'),
  );
});

/* ---------------------------------------------------------- Bar buyurtmasi */

test('oflayn bar buyurtmasi HAQIQIY vaqti bilan yoziladi (buyurtma va pozitsiya)', { timeout: 15000 }, async () => {
  const { club, table, user, service, orders, audit } = await fixture();
  const category = await database.getRepository(Category).save({ clubId: club.id, name: 'Ichimliklar' });
  const cola = await database.getRepository(Product).save({
    clubId: club.id, categoryId: category.id, name: 'Cola', price: 10000, stock: 10,
  });
  const t0 = Date.now() - 2 * HOUR;
  const started = await service.start(club.id, user, { tableId: table.id, offlineAt: iso(t0) });

  const first = await orders.create(club.id, user, {
    sessionId: started.id, items: [{ productId: cola.id, quantity: 1 }], offlineAt: iso(t0 + 30 * MINUTE),
  });
  assert.equal(ms(first.createdAt), t0 + 30 * MINUTE);
  assert.equal(ms(first.items[0].createdAt), t0 + 30 * MINUTE);

  // Undan OLDINGI pozitsiya keyin yetib keldi — buyurtma ochilish vaqti ham orqaga suriladi
  const second = await orders.create(club.id, user, {
    sessionId: started.id, items: [{ productId: cola.id, quantity: 1 }], offlineAt: iso(t0 + 10 * MINUTE),
  });
  assert.equal(second.id, first.id, 'bitta ochiq buyurtma');
  assert.equal(ms(second.createdAt), t0 + 10 * MINUTE);

  // O'yin boshlanishidan oldingi vaqt — chegaraga kesiladi va jurnalga yoziladi
  await orders.create(club.id, user, {
    sessionId: started.id, items: [{ productId: cola.id, quantity: 1 }], offlineAt: iso(t0 - HOUR),
  });
  const items = await database.getRepository(OrderItem).find({ where: { orderId: first.id }, order: { id: 'ASC' } });
  assert.deepEqual(items.map((item) => ms(item.createdAt)), [t0 + 30 * MINUTE, t0 + 10 * MINUTE, t0]);
  assert.ok(audit.some((entry) => entry.action === 'order.offline_time_clamped'));

  // Onlayn buyurtma — avvalgidek hozirgi vaqt
  const before = Date.now();
  await orders.create(club.id, user, { sessionId: started.id, items: [{ productId: cola.id, quantity: 1 }] });
  const latest = await database.getRepository(OrderItem).findOne({ where: { orderId: first.id }, order: { id: 'DESC' } });
  assert.ok(ms(latest.createdAt) >= before - 1000);
  assert.equal((await sessionRow(started.id)).barAmount, 40000);
});

/* ---------------------------------------------------- Qarzli hisob-kitob */

test('oflayn hisob-kitob BUTUNLAY qarzga: ro‘yxatdagi mijoz qayta tekshiriladi, naqd pul yozilmaydi', { timeout: 15000 }, async () => {
  const { club, table, user, service, audit } = await fixture();
  const customer = await database.getRepository(Customer).save({ clubId: club.id, name: 'Aziz Karimov', phone: '+998901112233' });
  const t0 = Date.now() - 2 * HOUR;
  const started = await service.start(club.id, user, { tableId: table.id, customerName: 'Mehmon', offlineAt: iso(t0) });

  const result = await service.end(club.id, user, started.id, {
    offlineAt: iso(t0 + HOUR), expectedBarAmount: 0, discount: 0, payments: [],
    isDebt: true, isTableDebt: true, isBarDebt: true, customerId: customer.id, customerName: 'eski ism',
  });
  assert.equal(result.totalDebt, 24000);
  assert.equal(result.paidNow, 0);
  assert.equal(result.offlineMismatch, null);

  const debt = await database.getRepository(Debt).findOneByOrFail({ sessionId: started.id });
  assert.equal(debt.customerId, customer.id);
  assert.equal(debt.customerName, 'Aziz Karimov', 'ism ro‘yxatdagi yozuvdan olinadi');
  assert.equal(debt.customerPhone, '+998901112233');
  assert.equal(debt.remainingDebt, 24000);
  // Qarz va sotuv yozuvi "Yakunlash" bosilgan vaqtga yoziladi (navbat yetgan vaqtga emas)
  assert.equal(new Date(debt.createdAt).getTime(), t0 + HOUR);
  assert.equal(new Date((await saleOf(started.id)).createdAt).getTime(), t0 + HOUR);
  assert.equal((await saleOf(started.id)).totalAmount, 0);
  assert.equal((await paymentsOf(started.id)).length, 0);
  const row = await sessionRow(started.id);
  assert.equal(row.isPaid, false);
  assert.equal(row.customerId, customer.id);
  const log = audit.find((entry) => entry.action === 'session.offline_end');
  assert.equal(log.meta.debt, 24000);
  assert.equal(log.meta.customerId, customer.id);
});

test('oflayn hisob-kitob QISMAN qarzga: stol — qarz, bar — naqd', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const customer = await database.getRepository(Customer).save({ clubId: club.id, name: 'Bobur', phone: null });
  const t0 = Date.now() - 2 * HOUR;
  const started = await service.start(club.id, user, { tableId: table.id, offlineAt: iso(t0) });
  await barOrder(club, started.id, table.id, user, 10000);

  const result = await service.end(club.id, user, started.id, {
    offlineAt: iso(t0 + HOUR), expectedBarAmount: 10000, payments: [{ method: PaymentMethod.CASH, amount: 10000 }],
    isDebt: true, isTableDebt: true, isBarDebt: false, customerId: customer.id,
  });
  assert.equal(result.totalDebt, 24000);
  assert.equal(result.paidNow, 10000);
  assert.equal(result.offlineMismatch, null);
  assert.equal((await saleOf(started.id)).totalAmount, 10000);
  const paid = await paymentsOf(started.id);
  assert.equal(paid.reduce((sum, p) => sum + p.amount, 0), 10000);
});

test('oflayn qarz rad etiladi (400): mijoz o‘chirilgan yoki ro‘yxatdan tanlanmagan — o‘yin ochiq qoladi', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const gone = await database.getRepository(Customer).save({ clubId: club.id, name: 'O‘chirilgan', phone: null });
  await database.getRepository(Customer).delete(gone.id);
  const t0 = Date.now() - 2 * HOUR;
  const started = await service.start(club.id, user, { tableId: table.id, offlineAt: iso(t0) });

  await assert.rejects(
    () => service.end(club.id, user, started.id, {
      offlineAt: iso(t0 + HOUR), expectedBarAmount: 0, payments: [],
      isDebt: true, isTableDebt: true, customerId: gone.id,
    }),
    rejectsWith(400, 'sessions.debtCustomerNotFound'),
  );
  await assert.rejects(
    () => service.end(club.id, user, started.id, {
      offlineAt: iso(t0 + HOUR), expectedBarAmount: 0, payments: [],
      isDebt: true, isTableDebt: true, customerName: 'Erkin yozilgan ism',
    }),
    rejectsWith(400, 'sessions.offlineDebtNeedsCustomer'),
  );
  assert.equal((await sessionRow(started.id)).status, 'active', 'rad etilgan hisob-kitob o‘yinni yopmaydi');
  assert.equal(await database.getRepository(Debt).countBy({ sessionId: started.id }), 0);
  assert.equal((await tableRow(table.id)).status, 'busy');

  // Qarzsiz hisob-kitobda eskirgan mijoz havolasi pul oqimini to'xtatmaydi
  const ended = await service.end(club.id, user, started.id, {
    offlineAt: iso(t0 + HOUR), expectedBarAmount: 0,
    payments: [{ method: PaymentMethod.CASH, amount: 24000 }], customerId: gone.id,
  });
  assert.equal(ended.paidNow, 24000);
});

/* ------------------------------------------------- Nol to'lovli hisob-kitob */

test('oflayn nol to‘lov (payments: []) olinmagan pulni NAQD deb yozmaydi — boshqa kassadagi bar farq bo‘lib belgilanadi', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const t0 = Date.now() - 2 * HOUR;
  const started = await service.start(club.id, user, { tableId: table.id, offlineAt: iso(t0) });
  // Kassir to'liq chegirma berdi (u ko'rgan summa 24 000), boshqa kassada esa 5 000 lik bar qo'shilgan
  await barOrder(club, started.id, table.id, user, 5000);

  const result = await service.end(club.id, user, started.id, {
    offlineAt: iso(t0 + HOUR), expectedBarAmount: 0, discount: 24000, payments: [],
  });
  assert.deepEqual(result.offlineMismatch, { expected: 5000, collected: 0, difference: -5000 });
  assert.equal(result.paidNow, 0);
  assert.equal(result.adjustmentAmount, -5000);
  assert.equal((await saleOf(started.id)).totalAmount, 0, 'sotuv = haqiqatda olingan pul (0)');
  assert.equal((await paymentsOf(started.id)).length, 0, 'olinmagan pul uchun to‘lov yozuvi yo‘q');
  const row = await sessionRow(started.id);
  assert.equal(row.status, 'completed');
  assert.equal(row.totalAmount, 0);
});

test('oflayn nol to‘lov — haqiqatda to‘lanadigan narsa yo‘q bo‘lsa toza nol sotuv (farqsiz)', { timeout: 15000 }, async () => {
  const { club, tables: [free, paid], user, service } = await fixture([0, 24000]);
  const t0 = Date.now() - 2 * HOUR;
  const gratis = await service.start(club.id, user, { tableId: free.id, offlineAt: iso(t0) });
  const zero = await service.end(club.id, user, gratis.id, {
    offlineAt: iso(t0 + HOUR), expectedBarAmount: 0, payments: [],
  });
  assert.equal(zero.offlineMismatch, null);
  assert.equal(zero.totalAmount, 0);
  assert.equal((await saleOf(gratis.id)).totalAmount, 0);

  const discounted = await service.start(club.id, user, { tableId: paid.id, offlineAt: iso(t0) });
  const full = await service.end(club.id, user, discounted.id, {
    offlineAt: iso(t0 + HOUR), expectedBarAmount: 0, discount: 24000, payments: [],
  });
  assert.equal(full.offlineMismatch, null);
  assert.equal(full.discount, 24000);
  assert.equal((await paymentsOf(discounted.id)).length, 0);
});

test('onlayn bo‘sh payments avvalgidek: 100% qarz (erkin ism bilan) — rad etilmaydi', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const started = await service.start(club.id, user, { tableId: table.id, offlineAt: iso(Date.now() - HOUR) });
  const result = await service.end(club.id, user, started.id, {
    expectedBarAmount: 0, payments: [], isDebt: true, isTableDebt: true, customerName: 'Doimiy mijoz',
  });
  assert.ok(result.totalDebt >= 24000);
  assert.equal(result.paidNow, 0);
  assert.equal(result.offlineMismatch, null);
});
