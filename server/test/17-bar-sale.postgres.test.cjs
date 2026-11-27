const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { before, after, test } = require('node:test');
const ExcelJS = require('exceljs');
const { createDataSource } = require('./postgres-helper.cjs');
const { BarSaleService } = require('../src/modules/orders/bar-sale.service');
const { ReportsService } = require('../src/modules/reports/reports.service');
const { ShiftsService } = require('../src/modules/shifts/shifts.service');
const { CashShift } = require('../src/entities/cash-shift.entity');
const { Session } = require('../src/entities/session.entity');

/**
 * STOLSIZ BAR SAVDOSI — billiard o'ynamaydigan mijozga bardan sotish.
 *
 * Sotuv o'yin hisob-kitobi bilan bir xil pul jadvallariga (sales + session_payments)
 * yoziladi, shuning uchun hisobot (tushum, to'lov usullari, bar tushumi) va smena
 * (Z-hisobot: olingan pul, kutilgan naqd) uni o'zi ko'rishi tekshiriladi. Onlayn
 * xatolar (narx o'zgargan, ombor yetmaydi, to'lov mos emas) hech narsa yozmaydi;
 * oflayn savdo esa rad etilmaydi — kassada olingan pul va narx yoziladi.
 */

let database;
let clubId;
let cashier;
let products;
let customerId;
let seq = 0;

before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
  const one = async (sql, params) => (await database.query(sql, params))[0];
  clubId = (await one(`INSERT INTO clubs (name, status) VALUES ('Bar klubi', 'active') RETURNING id`)).id;
  await database.query(`INSERT INTO settings ("clubId", timezone) VALUES ($1, 'Asia/Tashkent')`, [clubId]);
  const userId = (
    await one(`INSERT INTO users (name, username, password, role, "clubId") VALUES ('Kassir Aziz', 'bar_kassir', 'x', 'kassir', $1) RETURNING id`, [clubId])
  ).id;
  cashier = { id: userId, role: 'kassir', clubId };
  const category = (await one(`INSERT INTO categories ("clubId", name) VALUES ($1, 'Ichimliklar') RETURNING id`, [clubId])).id;
  const add = async (name, price, stock) =>
    (await one(`INSERT INTO products ("clubId", "categoryId", name, price, stock) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [clubId, category, name, price, stock])).id;
  products = { cola: await add('Coca-Cola', 8000, 20), chips: await add('Chipsi', 12000, 5), tea: await add('Choy', 5000, 1) };
  customerId = (await one(`INSERT INTO customers ("clubId", name, phone) VALUES ($1, 'Sardor', '+998901112233') RETURNING id`, [clubId])).id;
});

after(async () => {
  if (database?.isInitialized) await database.destroy();
});

function service() {
  const logged = [];
  return { svc: new BarSaleService(database, { log: (entry) => logged.push(entry) }), logged };
}

const stock = async (id) => Number((await database.query(`SELECT stock FROM products WHERE id = $1`, [id]))[0].stock);
const counts = async () =>
  (
    await database.query(
      `SELECT (SELECT count(*) FROM orders WHERE "clubId" = $1)::int AS orders,
              (SELECT count(*) FROM sales WHERE "clubId" = $1)::int AS sales,
              (SELECT count(*) FROM session_payments WHERE "clubId" = $1)::int AS payments,
              (SELECT count(*) FROM debts WHERE "clubId" = $1)::int AS debts`,
      [clubId],
    )
  )[0];
const rejectsWithKey = (key) => (err) => {
  assert.equal(err?.getResponse?.()?.key, key, `kutilgan: ${key}, kelgan: ${err?.message}`);
  return true;
};

test("onlayn savdo: yopiq buyurtma, sotuv va to'lov satri yoziladi, ombor kamayadi", async () => {
  const { svc } = service();
  // Savat tartibi id tartibiga teskari: chek va buyurtma kassir kiritgan tartibda qolishi kerak
  const result = await svc.sell(clubId, cashier, {
    items: [
      { productId: products.chips, quantity: 1, price: 12000 },
      { productId: products.cola, quantity: 2, price: 8000 },
    ],
    paymentMethod: 'card',
  });
  assert.equal(result.barAmount, 28000);
  assert.equal(result.totalAmount, 28000);
  assert.equal(result.paidNow, 28000);
  assert.deepEqual(result.payments, [{ method: 'card', amount: 28000 }]);
  assert.equal(result.totalDebt, 0);
  assert.deepEqual(
    result.items.map((i) => [i.name, i.quantity, i.price, i.subtotal]),
    [['Chipsi', 1, 12000, 12000], ['Coca-Cola', 2, 8000, 16000]],
  );
  const itemRows = await database.query(`SELECT "productId" FROM order_items WHERE "orderId" = $1 ORDER BY id`, [result.orderId]);
  assert.deepEqual(itemRows.map((r) => r.productId), [products.chips, products.cola]);

  const [order] = await database.query(`SELECT * FROM orders WHERE id = $1`, [result.orderId]);
  assert.equal(order.status, 'closed');
  assert.equal(order.sessionId, null);
  assert.equal(order.tableId, null);
  assert.equal(Number(order.totalAmount), 28000);
  const [sale] = await database.query(`SELECT * FROM sales WHERE id = $1`, [result.saleId]);
  assert.equal(sale.sessionId, null);
  assert.equal(sale.orderId, result.orderId);
  assert.equal(Number(sale.barAmount), 28000);
  assert.equal(Number(sale.totalAmount), 28000);
  assert.equal(sale.paymentMethod, 'card');
  assert.equal(sale.userId, cashier.id);
  const payments = await database.query(`SELECT "sessionId", "saleId", method, amount FROM session_payments WHERE "saleId" = $1`, [result.saleId]);
  assert.deepEqual(payments.map((p) => [p.sessionId, p.method, Number(p.amount)]), [[null, 'card', 28000]]);
  assert.equal(await stock(products.cola), 18);
  assert.equal(await stock(products.chips), 4);
});

test("bo'lib to'lash va chegirma; mijoz ro'yxatdan; chegirma egaga ogohlantirish uchun jurnalga", async () => {
  const { svc, logged } = service();
  const result = await svc.sell(clubId, cashier, {
    items: [{ productId: products.cola, quantity: 3 }],
    discount: 4000,
    payments: [
      { method: 'cash', amount: 10000 },
      { method: 'card', amount: 10000 },
    ],
    customerId,
  });
  assert.equal(result.barAmount, 24000);
  assert.equal(result.discount, 4000);
  assert.equal(result.totalAmount, 20000);
  assert.equal(result.paidNow, 20000);
  assert.equal(result.customerId, customerId);
  assert.equal(result.customerName, 'Sardor');
  const [order] = await database.query(`SELECT "customerId", "customerName" FROM orders WHERE id = $1`, [result.orderId]);
  assert.deepEqual([order.customerId, order.customerName], [customerId, 'Sardor']);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].action, 'order.discount');
  assert.equal(logged[0].entityId, result.orderId);
  assert.equal(logged[0].meta.discount, 4000);
});

test("onlayn xatolar hech narsa yozmaydi: narx o'zgargan, ombor yetmaydi, to'lov mos emas, noto'g'ri chegirma", async () => {
  const { svc } = service();
  const before = await counts();
  const colaBefore = await stock(products.cola);

  await assert.rejects(
    svc.sell(clubId, cashier, { items: [{ productId: products.cola, quantity: 1, price: 7000 }] }),
    rejectsWithKey('orders.priceChanged'),
  );
  await assert.rejects(
    svc.sell(clubId, cashier, { items: [{ productId: products.tea, quantity: 2 }] }),
    rejectsWithKey('orders.insufficientStock'),
  );
  await assert.rejects(
    svc.sell(clubId, cashier, {
      items: [{ productId: products.cola, quantity: 1 }],
      payments: [{ method: 'cash', amount: 5000 }],
    }),
    rejectsWithKey('sessions.paymentsMismatch'),
  );
  await assert.rejects(
    svc.sell(clubId, cashier, { items: [{ productId: products.cola, quantity: 1 }], discount: 9000 }),
    rejectsWithKey('sessions.invalidDiscount'),
  );
  await assert.rejects(
    svc.sell(clubId, cashier, { items: [{ productId: 999999, quantity: 1 }] }),
    rejectsWithKey('orders.productNotFound'),
  );

  assert.deepEqual(await counts(), before);
  assert.equal(await stock(products.cola), colaBefore);
});

test("qarzga savdo: butun summa qarz, sotuvda olingan pul 0, to'lov satri yo'q; ismsiz qarz rad etiladi", async () => {
  const { svc } = service();
  await assert.rejects(
    svc.sell(clubId, cashier, { items: [{ productId: products.cola, quantity: 1 }], isDebt: true }),
    rejectsWithKey('sessions.debtNeedsCustomer'),
  );
  const result = await svc.sell(clubId, cashier, {
    items: [{ productId: products.cola, quantity: 1 }],
    isDebt: true,
    customerName: 'Jasur',
    customerPhone: '+998 90 111-22-33',
  });
  assert.equal(result.totalDebt, 8000);
  assert.equal(result.paidNow, 0);
  assert.deepEqual(result.payments, []);
  // Telefon kanonik ko'rinishda ro'yxatdagi mijozga bog'landi (ism ham shu yozuvdan emas — erkin yozilgan)
  assert.equal(result.customerId, customerId);
  const [debt] = await database.query(`SELECT * FROM debts WHERE id = $1`, [result.debtId]);
  assert.equal(debt.sessionId, null);
  assert.equal(Number(debt.totalDebt), 8000);
  assert.equal(Number(debt.barAmount), 8000);
  assert.equal(Number(debt.tableAmount), 0);
  assert.equal(debt.customerId, customerId);
  const [sale] = await database.query(`SELECT "totalAmount" FROM sales WHERE id = $1`, [result.saleId]);
  assert.equal(Number(sale.totalAmount), 0);
  const payments = await database.query(`SELECT 1 FROM session_payments WHERE "saleId" = $1`, [result.saleId]);
  assert.equal(payments.length, 0);
});

test("oflayn savdo rad etilmaydi: kassadagi vaqt va narx yoziladi, ombor noldan pastga tushmaydi, farq jurnalda", async () => {
  const { svc, logged } = service();
  const at = new Date(Date.now() - 2 * 3600 * 1000);
  const teaStock = await stock(products.tea);
  const result = await svc.sell(clubId, cashier, {
    offlineAt: at.toISOString(),
    items: [
      { productId: products.tea, quantity: teaStock + 2, price: 5000 },
      { productId: products.cola, quantity: 1, price: 7500 },
    ],
    payments: [{ method: 'cash', amount: (teaStock + 2) * 5000 + 7500 }],
  });
  assert.equal(await stock(products.tea), 0);
  assert.equal(result.barAmount, (teaStock + 2) * 5000 + 7500);
  assert.equal(Math.abs(new Date(result.soldAt).getTime() - at.getTime()) < 1000, true);
  const [sale] = await database.query(`SELECT "createdAt" FROM sales WHERE id = $1`, [result.saleId]);
  assert.equal(Math.abs(new Date(sale.createdAt).getTime() - at.getTime()) < 1000, true);
  const [item] = await database.query(`SELECT price FROM order_items WHERE "orderId" = $1 AND "productId" = $2`, [
    result.orderId,
    products.cola,
  ]);
  assert.equal(Number(item.price), 7500);

  const adjusted = logged.find((e) => e.action === 'order.sale_offline_adjusted');
  assert.ok(adjusted, 'oflayn farq jurnalga yozilmadi');
  assert.equal(adjusted.meta.oversold[0].productId, products.tea);
  assert.equal(adjusted.meta.repriced[0].productId, products.cola);

  // Internetsiz qarz faqat ro'yxatdagi mijozga
  await assert.rejects(
    svc.sell(clubId, cashier, {
      offlineAt: at.toISOString(),
      items: [{ productId: products.cola, quantity: 1, price: 8000 }],
      isDebt: true,
      customerName: 'Erkin ism',
    }),
    rejectsWithKey('sessions.offlineDebtNeedsCustomer'),
  );
  const listed = await svc.sell(clubId, cashier, {
    offlineAt: at.toISOString(),
    items: [{ productId: products.cola, quantity: 1, price: 8000 }],
    isDebt: true,
    customerId,
  });
  assert.equal(listed.totalDebt, 8000);
});

test('hisobot va smena stolsiz savdoni ko‘radi: tushum, bar tushumi, usullar, kutilgan naqd', async () => {
  // Alohida klub — boshqa testlardagi yozuvlar aralashmasin
  const one = async (sql, params) => (await database.query(sql, params))[0];
  const club = (await one(`INSERT INTO clubs (name, status) VALUES ('Smena klubi', 'active') RETURNING id`)).id;
  await database.query(`INSERT INTO settings ("clubId", timezone) VALUES ($1, 'Asia/Tashkent')`, [club]);
  const user = { id: (await one(`INSERT INTO users (name, username, password, role, "clubId") VALUES ('Admin', $1, 'x', 'admin', $2) RETURNING id`, [`shift_admin_${++seq}`, club])).id, role: 'admin', clubId: club };
  const category = (await one(`INSERT INTO categories ("clubId", name) VALUES ($1, 'Bar') RETURNING id`, [club])).id;
  const cola = (await one(`INSERT INTO products ("clubId", "categoryId", name, price, stock) VALUES ($1, $2, 'Cola', 10000, 50) RETURNING id`, [club, category])).id;

  const audit = { log: () => undefined, subscribe: () => () => undefined };
  const shifts = new ShiftsService(database.getRepository(CashShift), database, audit);
  await shifts.open(club, user, { openingCash: 50000 });

  const svc = new BarSaleService(database, audit);
  await svc.sell(club, user, { items: [{ productId: cola, quantity: 3 }], paymentMethod: 'cash' }); // 30 000 naqd
  await svc.sell(club, user, {
    items: [{ productId: cola, quantity: 2 }],
    discount: 5000,
    payments: [
      { method: 'cash', amount: 5000 },
      { method: 'card', amount: 10000 },
    ],
  }); // 20 000 − 5 000 = 15 000
  await svc.sell(club, user, { items: [{ productId: cola, quantity: 1 }], isDebt: true, customerName: 'Qarzdor' }); // 10 000 qarz

  const { summary, expectedCash } = await shifts.current(club);
  assert.equal(summary.barSalesCount, 3);
  assert.equal(summary.barRevenue, 60000);
  assert.equal(summary.billedRevenue, 55000);
  assert.equal(summary.discounts, 5000);
  assert.equal(summary.collectedSales, 45000);
  assert.deepEqual(summary.byMethod, { cash: 35000, card: 10000, transfer: 0 });
  assert.equal(summary.debtsCreated, 10000);
  assert.equal(expectedCash, 85000);

  const reports = new ReportsService(database, database.getRepository(Session));
  const report = await reports.getReport(club, 'daily', { page: 1, limit: 10 });
  assert.equal(report.summary.collectedRevenue, 45000);
  assert.equal(report.summary.barRevenue, 60000);
  assert.equal(report.summary.billedRevenue, 55000);
  assert.deepEqual(report.summary.barSales, { count: 3, amount: 60000 });
  assert.equal(report.summary.paymentBreakdown.cash, 35000);
  assert.equal(report.summary.paymentBreakdown.card, 10000);
  assert.equal(report.summary.totalSessions, 0);

  const productsReport = await reports.productsReport(club, 'daily', {});
  assert.equal(productsReport.totals.quantity, 6);
  assert.equal(productsReport.totals.revenue, 60000);
});

test("Excel eksport stolsiz savdolarni bo'lak chegarasida ham yo'qotmaydi (mikrosekundli vaqt)", async () => {
  // 502 ta savdo: kamayish tartibida 500- va 501-satr BIR millisekundda, faqat mikrosekundda farq
  // qiladi. Kursor JS Date (ms) bo'lsa, 501-satr ikkinchi bo'lakda tushib qolardi.
  const one = async (sql, params) => (await database.query(sql, params))[0];
  const club = (await one(`INSERT INTO clubs (name, status) VALUES ('Eksport klubi', 'active') RETURNING id`)).id;
  await database.query(`INSERT INTO settings ("clubId", timezone) VALUES ($1, 'Asia/Tashkent')`, [club]);
  const orderIds = (
    await database.query(
      `INSERT INTO orders ("clubId", status, "totalAmount") SELECT $1, 'closed', 1000 FROM generate_series(1, 502) RETURNING id`,
      [club],
    )
  )
    .map((row) => row.id)
    .sort((a, b) => a - b);
  await database.query(
    `INSERT INTO sales ("clubId", "orderId", "barAmount", "totalAmount", "paymentMethod", "createdAt")
     SELECT $1, o.id, 1000, 1000, 'cash',
            CASE WHEN o.r = 500 THEN timestamptz '2026-01-15 07:00:00.0007+00'
                 WHEN o.r = 501 THEN timestamptz '2026-01-15 07:00:00.0003+00'
                 WHEN o.r = 502 THEN timestamptz '2026-01-15 06:59:59+00'
                 ELSE timestamptz '2026-01-15 07:00:00+00' + make_interval(secs => 1000 - o.r) END
       FROM unnest($2::int[]) WITH ORDINALITY AS o(id, r)`,
    [club, orderIds],
  );

  const res = new PassThrough();
  res.setHeader = () => undefined;
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  const ended = new Promise((resolve) => res.on('end', resolve));
  const reports = new ReportsService(database, database.getRepository(Session));
  await reports.exportExcel(club, 'daily', { date: '2026-01-15' }, 'uz', res);
  await ended;

  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.concat(chunks));
  const sheet = book.worksheets[0];
  // davr satri + sarlavha + 502 savdo + jami satri
  assert.equal(sheet.rowCount, 505);
  const indexes = [];
  for (let n = 3; n <= 504; n += 1) indexes.push(sheet.getRow(n).getCell(1).value);
  assert.deepEqual(indexes, Array.from({ length: 502 }, (_, i) => i + 1));
  const total = sheet.getRow(505);
  assert.equal(total.getCell(8).value, 502000); // bar ustuni
  assert.equal(total.getCell(11).value, 502000); // jami
});
