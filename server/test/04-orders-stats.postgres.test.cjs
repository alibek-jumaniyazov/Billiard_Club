const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { OrdersService } = require('../src/modules/orders/orders.service');
const { SessionsService } = require('../src/modules/sessions/sessions.service');
const { Category } = require('../src/entities/category.entity');
const { Club } = require('../src/entities/club.entity');
const { Order } = require('../src/entities/order.entity');
const { Product } = require('../src/entities/product.entity');
const { Session } = require('../src/entities/session.entity');
const { SessionSegment } = require('../src/entities/session-segment.entity');
const { Settings } = require('../src/entities/settings.entity');
const { Table } = require('../src/entities/table.entity');
const { User } = require('../src/entities/user.entity');
const { OrderStatus, UserRole } = require('../src/entities/enums');

let database;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

test('today stats report open tabs and today cancellations next to the sales figures', { timeout: 15000 }, async () => {
  const club = await database.getRepository(Club).save({ name: 'Orders stats' });
  await database.getRepository(Settings).save({ clubId: club.id, timezone: 'Asia/Tashkent' });
  const [first, second] = await database.getRepository(Table).save([
    { clubId: club.id, name: 'Stol 1', number: 1, pricePerHour: 15000 },
    { clubId: club.id, name: 'Stol 2', number: 2, pricePerHour: 15000 },
  ]);
  const user = await database.getRepository(User).save({
    clubId: club.id, name: 'Kassir', username: `orders_stats_${Date.now()}`, password: 'x', role: UserRole.KASSIR,
  });
  const category = await database.getRepository(Category).save({ clubId: club.id, name: 'Ichimliklar' });
  const cola = await database.getRepository(Product).save({
    clubId: club.id, categoryId: category.id, name: 'Cola', price: 10000, stock: 50,
  });

  const sessions = new SessionsService(database, database.getRepository(Session), database.getRepository(SessionSegment));
  const orders = new OrdersService(database, database.getRepository(Order));

  const running = await sessions.start(club.id, user, { tableId: first.id });
  await orders.create(club.id, user, { sessionId: running.id, items: [{ productId: cola.id, quantity: 2 }] });

  const voided = await sessions.start(club.id, user, { tableId: second.id });
  const wrong = await orders.create(club.id, user, { sessionId: voided.id, items: [{ productId: cola.id, quantity: 1 }] });
  await orders.cancel(club.id, user, wrong.id, { reason: 'xato kiritildi' });

  // Kecha bekor qilingan buyurtma bugungi nazorat ko'rsatkichiga kirmasligi kerak
  const old = await database.getRepository(Order).save({
    clubId: club.id, tableId: second.id, userId: user.id, totalAmount: 7000, status: OrderStatus.CANCELLED,
  });
  await database.query(`UPDATE orders SET "updatedAt" = now() - interval '2 days' WHERE id = $1`, [old.id]);

  const stats = await orders.todayStats(club.id);
  assert.deepEqual(stats, {
    todayAmount: 20000,
    todayCount: 1,
    openCount: 1,
    openAmount: 20000,
    cancelledCount: 1,
    cancelledAmount: 10000,
  });
});
