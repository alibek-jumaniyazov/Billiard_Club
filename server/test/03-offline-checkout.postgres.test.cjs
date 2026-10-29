const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { SessionsService } = require('../src/modules/sessions/sessions.service');
const { Club } = require('../src/entities/club.entity');
const { Table } = require('../src/entities/table.entity');
const { User } = require('../src/entities/user.entity');
const { Order } = require('../src/entities/order.entity');
const { Sale } = require('../src/entities/sale.entity');
const { Session } = require('../src/entities/session.entity');
const { SessionSegment } = require('../src/entities/session-segment.entity');
const { SessionPayment } = require('../src/entities/session-payment.entity');
const { Settings } = require('../src/entities/settings.entity');
const { OrderStatus, PaymentMethod, UserRole } = require('../src/entities/enums');

let database;
let nextClub = 0;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

const HOUR = 60 * 60 * 1000;
const PRICE = 24000; // soatiga — 1 soniya = 6.67 so'm, yaxlitlash aniq ko'rinadi

async function fixture() {
  const n = ++nextClub;
  const club = await database.getRepository(Club).save({ name: `Offline checkout ${n}` });
  await database.getRepository(Settings).save({ clubId: club.id, timezone: 'Asia/Tashkent' });
  const table = await database.getRepository(Table).save({ clubId: club.id, name: 'Stol 1', number: 1, pricePerHour: PRICE });
  const user = await database.getRepository(User).save({
    clubId: club.id, name: 'Kassir', username: `offline_kassir_${n}_${Date.now()}`, password: 'x', role: UserRole.KASSIR,
  });
  const service = new SessionsService(database, database.getRepository(Session), database.getRepository(SessionSegment));
  return { club, table, user, service };
}

const iso = (ms) => new Date(ms).toISOString();
const saleOf = (sessionId) => database.getRepository(Sale).findOneByOrFail({ sessionId });
const paymentsOf = (sessionId) => database.getRepository(SessionPayment).findBy({ sessionId });

test('offline checkout bills up to the moment the cashier pressed «End», not the replay time', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const startedAt = Date.now() - 3 * HOUR;
  const started = await service.start(club.id, user, { tableId: table.id, offlineAt: iso(startedAt) });
  const endedAt = startedAt + HOUR; // kassa 2 soat oldin yakunlagan, navbat hozir yetib keldi

  const result = await service.end(club.id, user, started.id, {
    offlineAt: iso(endedAt),
    expectedBarAmount: 0,
    payments: [{ method: PaymentMethod.CASH, amount: PRICE }],
  });

  assert.equal(result.durationSeconds, 3600);
  assert.equal(result.tableAmount, PRICE);
  assert.equal(result.offlineMismatch, null);
  assert.equal(result.endClamped, false);
  assert.equal(Date.parse(result.endTime), endedAt);
  const sale = await saleOf(started.id);
  assert.equal(sale.totalAmount, PRICE);
  const paid = await paymentsOf(started.id);
  assert.equal(paid.reduce((sum, p) => sum + p.amount, 0), sale.totalAmount);
});

test('offline: a bar order added on another terminal never blocks the queue — collected money is recorded and the gap flagged', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const startedAt = Date.now() - 2 * HOUR;
  const started = await service.start(club.id, user, { tableId: table.id, offlineAt: iso(startedAt) });
  // Kassa oflayn turgan paytda ofitsiant boshqa terminaldan ichimlik qo'shdi
  await database.getRepository(Order).save({
    clubId: club.id, sessionId: started.id, tableId: table.id, userId: user.id, totalAmount: 10000, status: OrderStatus.OPEN,
  });

  const result = await service.end(club.id, user, started.id, {
    offlineAt: iso(startedAt + HOUR),
    expectedBarAmount: 0, // kassir ichimlikni ko'rmagan
    payments: [{ method: PaymentMethod.CASH, amount: PRICE }],
  });

  assert.deepEqual(result.offlineMismatch, { expected: PRICE + 10000, collected: PRICE, difference: -10000 });
  assert.equal(result.barAmount, 10000);
  assert.equal(result.adjustmentAmount, -10000);
  assert.match(result.adjustmentReason, /Oflayn/);
  const sale = await saleOf(started.id);
  assert.equal(sale.totalAmount, PRICE, 'sotuv = haqiqatda olingan pul');
  const paid = await paymentsOf(started.id);
  assert.equal(paid.reduce((sum, p) => sum + p.amount, 0), sale.totalAmount, "to'lovlar yig'indisi sotuvga teng");
  const session = await database.getRepository(Session).findOneByOrFail({ id: started.id });
  assert.equal(session.status, 'completed');
  assert.equal(session.totalAmount, PRICE);
});

test('online checkout keeps the 409 protection when the bar changed', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const started = await service.start(club.id, user, { tableId: table.id });
  await database.getRepository(Order).save({
    clubId: club.id, sessionId: started.id, tableId: table.id, userId: user.id, totalAmount: 5000, status: OrderStatus.OPEN,
  });
  await assert.rejects(
    () => service.end(club.id, user, started.id, { expectedBarAmount: 0, paymentMethod: PaymentMethod.CASH }),
    (err) => err.getStatus?.() === 409,
  );
  const session = await database.getRepository(Session).findOneByOrFail({ id: started.id });
  assert.equal(session.status, 'active', "rad etilgan hisob-kitob sessiyani yopmaydi");
});

test('offline end time is clamped: it can never precede the start or lie in the future', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const startedAt = Date.now() - HOUR;
  const started = await service.start(club.id, user, { tableId: table.id, offlineAt: iso(startedAt) });
  const result = await service.end(club.id, user, started.id, {
    offlineAt: iso(startedAt - 30 * 60 * 1000), // boshlanishdan OLDIN — soat noto'g'ri
    payments: [{ method: PaymentMethod.CASH, amount: 0 }].filter((p) => p.amount > 0),
    paymentMethod: PaymentMethod.CASH,
  });
  assert.equal(result.endClamped, true);
  assert.equal(result.durationSeconds, 0);
  assert.equal(Date.parse(result.endTime), startedAt);

  const second = await service.start(club.id, user, { tableId: table.id });
  const future = await service.end(club.id, user, second.id, {
    offlineAt: iso(Date.now() + 5 * HOUR),
    paymentMethod: PaymentMethod.CASH,
  });
  assert.equal(future.endClamped, true);
  assert.ok(Date.parse(future.endTime) <= Date.now());
});
