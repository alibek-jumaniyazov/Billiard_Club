const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const {
  CLUB_PURGE_ORDER,
  ClubPurgeService,
  RETAINED_BILLING_TABLES,
} = require('../src/modules/clubs/club-purge.service');

/**
 * Superadmin: klubni BARCHA ma'lumotlari bilan butunlay o'chirish.
 *
 * Ikki klub har bir jadvalda kamida bitta yozuv bilan to'ldiriladi (shu bilan FK
 * tartibi to'liq sinaladi), so'ng A o'chiriladi: A dan hech narsa qolmasligi,
 * B ga tegilmasligi, platforma to'lov tarixi (shartnoma, to'langan faktura) esa
 * klub nomi bilan saqlanishi tekshiriladi. Fikr-mulohaza fayllari vaqtinchalik
 * katalogda — haqiqiy server/uploads ga tegilmaydi.
 */

let database;
let superId;
let seq = 0;
const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-purge-uploads-'));

before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
  const [row] = await database.query(
    `INSERT INTO users (name, username, password, role) VALUES ('Platforma egasi', 'purge_super', 'x', 'superadmin') RETURNING id`,
  );
  superId = row.id;
});

after(async () => {
  if (database?.isInitialized) await database.destroy();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

function service() {
  const logged = [];
  const svc = new ClubPurgeService(database, { log: (entry) => logged.push(entry) });
  svc.feedbackDir = (id) => path.join(uploadsDir, String(id));
  return { svc, logged };
}

const superadmin = () => ({ id: superId, role: 'superadmin', clubId: null });
const one = async (sql, params) => (await database.query(sql, params))[0];
const count = async (sql, params) => Number((await one(sql, params)).n);

/** Klub va uning HAR BIR jadvaldagi yozuvi (ichki CASCADE jadvallar bilan) */
async function seedClub(name) {
  const s = ++seq;
  const c = (await one(`INSERT INTO clubs (name, status) VALUES ($1, 'active') RETURNING id`, [name])).id;
  const u = (
    await one(
      `INSERT INTO users (name, username, password, role, "clubId") VALUES ('Admin', $1, 'x', 'admin', $2) RETURNING id`,
      [`purge_${s}_admin`, c],
    )
  ).id;
  await database.query(
    `INSERT INTO refresh_sessions ("userId", jti, "familyId", "tokenHash", "expiresAt")
     VALUES ($1, gen_random_uuid(), gen_random_uuid(), $2, now() + interval '1 day')`,
    [u, `refresh_${s}`],
  );
  await database.query(`INSERT INTO settings ("clubId") VALUES ($1)`, [c]);
  const category = (await one(`INSERT INTO categories ("clubId", name) VALUES ($1, 'Ichimliklar') RETURNING id`, [c])).id;
  const product = (
    await one(`INSERT INTO products ("clubId", "categoryId", name, price) VALUES ($1, $2, 'Cola', 8000) RETURNING id`, [
      c,
      category,
    ])
  ).id;
  const table = (
    await one(`INSERT INTO tables ("clubId", name, number, "pricePerHour") VALUES ($1, 'Stol 1', 1, 30000) RETURNING id`, [c])
  ).id;
  const customer = (await one(`INSERT INTO customers ("clubId", name) VALUES ($1, 'Sardor') RETURNING id`, [c])).id;
  const session = (
    await one(
      `INSERT INTO sessions ("clubId", "tableId", "userId", "customerId", status, "startTime", "endTime")
       VALUES ($1, $2, $3, $4, 'completed', now() - interval '2 hours', now()) RETURNING id`,
      [c, table, u, customer],
    )
  ).id;
  await database.query(
    `INSERT INTO session_segments ("sessionId", "tableId", "pricePerHour", "startedAt") VALUES ($1, $2, 30000, now() - interval '2 hours')`,
    [session, table],
  );
  const order = (
    await one(
      `INSERT INTO orders ("clubId", "sessionId", "tableId", "userId", status, "totalAmount") VALUES ($1, $2, $3, $4, 'closed', 16000) RETURNING id`,
      [c, session, table, u],
    )
  ).id;
  await database.query(
    `INSERT INTO order_items ("orderId", "productId", quantity, price, subtotal) VALUES ($1, $2, 2, 8000, 16000)`,
    [order, product],
  );
  const sale = (
    await one(
      `INSERT INTO sales ("clubId", "sessionId", "userId", "tableAmount", "barAmount", "totalAmount") VALUES ($1, $2, $3, 60000, 16000, 76000) RETURNING id`,
      [c, session, u],
    )
  ).id;
  await database.query(
    `INSERT INTO session_payments ("clubId", "sessionId", "saleId", method, amount) VALUES ($1, $2, $3, 'cash', 76000)`,
    [c, session, sale],
  );
  const debt = (
    await one(
      `INSERT INTO debts ("clubId", "customerName", "customerId", "sessionId", "userId") VALUES ($1, 'Sardor', $2, $3, $4) RETURNING id`,
      [c, customer, session, u],
    )
  ).id;
  await database.query(`INSERT INTO debt_payments ("debtId", "clubId", "userId", amount) VALUES ($1, $2, $3, 5000)`, [debt, c, u]);
  await database.query(`INSERT INTO expenses ("clubId", "userId", category, amount) VALUES ($1, $2, 'Ijara', 100000)`, [c, u]);
  await database.query(
    `INSERT INTO reservations ("clubId", "tableId", "customerId", "startsAt") VALUES ($1, $2, $3, now() + interval '1 day')`,
    [c, table, customer],
  );
  await database.query(`INSERT INTO cash_shifts ("clubId", "openedById") VALUES ($1, $2)`, [c, u]);
  await database.query(`INSERT INTO club_bridges ("clubId", "tokenHash") VALUES ($1, $2)`, [c, `bridge_${s}`]);
  await database.query(`INSERT INTO table_light_events ("clubId", "tableId", "userId", source) VALUES ($1, $2, $3, 'test')`, [
    c,
    table,
    u,
  ]);
  // Javobni superadmin yozgan (repliedById RESTRICT) — superadmin o'chib ketmasligi kerak
  const feedback = (
    await one(
      `INSERT INTO feedbacks ("clubId", "userId", "repliedById", type, subject, message) VALUES ($1, $2, $3, 'bug', 'Sinov', 'Xabar') RETURNING id`,
      [c, u, superId],
    )
  ).id;
  await database.query(`INSERT INTO club_notifications ("clubId", title, body, "createdById") VALUES ($1, 'Salom', 'Matn', $2)`, [
    c,
    superId,
  ]);
  await database.query(`INSERT INTO owner_telegram_chats ("clubId", "chatId", "linkedById") VALUES ($1, $2, $3)`, [
    c,
    `chat_${s}`,
    u,
  ]);
  await database.query(
    `INSERT INTO owner_telegram_link_tokens ("tokenHash", "clubId", "userId", "expiresAt") VALUES ($1, $2, $3, now() + interval '1 hour')`,
    [`link_${s}`, c, u],
  );
  await database.query(
    `INSERT INTO idempotency_keys (key, "userId", "clubId", method, path) VALUES ($1, $2, $3, 'POST', '/api/sessions/1/end')`,
    [`idem_${s}`, u, c],
  );
  await database.query(`INSERT INTO audit_logs (action, "clubId", "userId") VALUES ('session.end', $1, $2)`, [c, u]);
  const contract = (
    await one(
      `INSERT INTO contracts ("clubId", amount, "startDate", "endDate") VALUES ($1, 500000, now(), now() + interval '30 days') RETURNING id`,
      [c],
    )
  ).id;
  await database.query(`INSERT INTO invoices ("clubId", number, amount, status, "contractId") VALUES ($1, $2, 500000, 'paid', $3)`, [
    c,
    `INV-PURGE-${s}-1`,
    contract,
  ]);
  await database.query(
    `INSERT INTO invoices ("clubId", number, amount, status) VALUES ($1, $2, 300000, 'pending'), ($1, $3, 300000, 'expired')`,
    [c, `INV-PURGE-${s}-2`, `INV-PURGE-${s}-3`],
  );
  // Fikr-mulohaza rasmi (vaqtinchalik katalogda)
  fs.mkdirSync(path.join(uploadsDir, String(feedback)), { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, String(feedback), '0.png'), 'png');
  return { clubId: c, name, userId: u, sessionId: session, orderId: order, feedbackId: feedback, contractId: contract, invoicePrefix: `INV-PURGE-${s}-` };
}

/** Har bir "clubId" jadvalidagi shu klub yozuvlari soni */
async function clubCounts(clubId) {
  const counts = {};
  for (const table of [...CLUB_PURGE_ORDER, ...RETAINED_BILLING_TABLES]) {
    counts[table] = await count(`SELECT count(*)::int AS n FROM "${table}" WHERE "clubId" = $1`, [clubId]);
  }
  counts.order_items = await count(
    `SELECT count(*)::int AS n FROM order_items i JOIN orders o ON o.id = i."orderId" WHERE o."clubId" = $1`,
    [clubId],
  );
  counts.session_segments = await count(
    `SELECT count(*)::int AS n FROM session_segments g JOIN sessions s ON s.id = g."sessionId" WHERE s."clubId" = $1`,
    [clubId],
  );
  counts.refresh_sessions = await count(
    `SELECT count(*)::int AS n FROM refresh_sessions r JOIN users u ON u.id = r."userId" WHERE u."clubId" = $1`,
    [clubId],
  );
  return counts;
}

const rejectsWithKey = (key) => (err) => {
  assert.equal(err?.getResponse?.()?.key, key, `kutilgan xato: ${key}, kelgan: ${err?.message}`);
  return true;
};

test("har bir clubId jadvali o'chirish ro'yxatida yoki saqlanadigan to'lov tarixida", async () => {
  const rows = await database.query(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'clubId' ORDER BY table_name`,
  );
  const withClubId = rows.map((r) => r.table_name);
  const handled = new Set([...CLUB_PURGE_ORDER, ...RETAINED_BILLING_TABLES]);
  const missing = withClubId.filter((t) => !handled.has(t));
  assert.deepEqual(missing, [], `Yangi klub jadvali o'chirish ro'yxatiga kiritilmagan: ${missing.join(', ')}`);
  for (const table of handled) assert.ok(withClubId.includes(table), `${table} da clubId ustuni yo'q`);
  assert.equal(new Set(CLUB_PURGE_ORDER).size, CLUB_PURGE_ORDER.length, 'takroriy jadval');
});

test("ma'lumotli klub butunlay o'chadi; boshqa klubga tegilmaydi; to'lov tarixi saqlanadi", { timeout: 60000 }, async () => {
  const a = await seedClub('Purge A klubi');
  const b = await seedClub('Purge B klubi');
  const beforeA = await clubCounts(a.clubId);
  const beforeB = await clubCounts(b.clubId);
  // Sinov to'liq bo'lsin: HAR BIR jadvalda A uchun yozuv bor
  for (const [table, n] of Object.entries(beforeA)) assert.ok(n > 0, `${table}: A uchun sinov yozuvi yo'q`);

  const { svc, logged } = service();

  // Oldindan ko'rish: nima o'chadi va nima qoladi
  const preview = await svc.preview(a.clubId);
  assert.deepEqual(preview.club, { id: a.clubId, name: a.name });
  for (const table of CLUB_PURGE_ORDER) assert.equal(preview.counts[table], beforeA[table], `preview ${table}`);
  assert.deepEqual(preview.billing, {
    contracts: 1,
    contractsAmount: 500000,
    paidInvoices: 1,
    paidInvoicesAmount: 500000,
    unpaidInvoices: 2,
  });

  // Nom mos kelmasa — hech narsa o'chmaydi
  await assert.rejects(svc.purge(a.clubId, superadmin(), 'Purge A'), rejectsWithKey('clubs.purgeNameMismatch'));
  assert.deepEqual(await clubCounts(a.clubId), beforeA);

  // To'g'ri nom (bo'shliqlar bilan ham) — o'chiriladi
  const result = await svc.purge(a.clubId, superadmin(), `  ${a.name} `, { ip: '127.0.0.1', userAgent: 'test' });
  assert.deepEqual(result.club, { id: a.clubId, name: a.name });
  for (const table of CLUB_PURGE_ORDER) assert.equal(result.deleted[table], beforeA[table], `deleted ${table}`);
  assert.deepEqual(result.kept, { contracts: 1, invoices: 1 });
  assert.equal(result.deletedInvoices, 2);

  // A dan hech narsa qolmadi (ichki CASCADE jadvallar ham)
  assert.equal(await count(`SELECT count(*)::int AS n FROM clubs WHERE id = $1`, [a.clubId]), 0);
  for (const [table, n] of Object.entries(await clubCounts(a.clubId))) assert.equal(n, 0, `${table}: A yozuvi qoldi`);
  assert.equal(await count(`SELECT count(*)::int AS n FROM order_items WHERE "orderId" = $1`, [a.orderId]), 0);
  assert.equal(await count(`SELECT count(*)::int AS n FROM session_segments WHERE "sessionId" = $1`, [a.sessionId]), 0);
  assert.equal(await count(`SELECT count(*)::int AS n FROM refresh_sessions WHERE "userId" = $1`, [a.userId]), 0);
  assert.equal(await count(`SELECT count(*)::int AS n FROM users WHERE id = $1`, [a.userId]), 0);

  // B ga tegilmadi; superadmin joyida
  assert.deepEqual(await clubCounts(b.clubId), beforeB);
  assert.equal(await count(`SELECT count(*)::int AS n FROM users WHERE id = $1`, [superId]), 1);

  // Platforma to'lov tarixi: shartnoma va to'langan faktura klub nomi bilan qoldi
  const contract = await one(`SELECT "clubId", "clubName", amount FROM contracts WHERE id = $1`, [a.contractId]);
  assert.equal(contract.clubId, null);
  assert.equal(contract.clubName, a.name);
  const invoices = await database.query(
    `SELECT number, status, "clubId", "clubName", "contractId" FROM invoices WHERE number LIKE $1 ORDER BY number`,
    [`${a.invoicePrefix}%`],
  );
  assert.deepEqual(
    invoices.map((i) => [i.number, i.status, i.clubId, i.clubName, i.contractId]),
    [[`${a.invoicePrefix}1`, 'paid', null, a.name, a.contractId]],
  );

  // Fikr-mulohaza rasmi o'chdi, B niki joyida
  assert.equal(fs.existsSync(path.join(uploadsDir, String(a.feedbackId))), false);
  assert.equal(fs.existsSync(path.join(uploadsDir, String(b.feedbackId), '0.png')), true);

  // Jurnal: platforma darajasida (clubId null), ma'lumot meta da
  assert.equal(logged.length, 1);
  assert.equal(logged[0].action, 'club.purged');
  assert.equal(logged[0].clubId, null);
  assert.equal(logged[0].userId, superId);
  assert.equal(logged[0].entityId, a.clubId);
  assert.equal(logged[0].meta.clubName, a.name);
  assert.equal(logged[0].meta.deleted.sessions, 1);
});

test("bo'sh klub ham o'chadi; yo'q klub va o'z klubi rad etiladi", async () => {
  const { svc } = service();
  const empty = (await one(`INSERT INTO clubs (name) VALUES ('Bo''sh klub') RETURNING id`)).id;
  const preview = await svc.preview(empty);
  assert.ok(Object.values(preview.counts).every((n) => n === 0));
  assert.deepEqual(preview.billing, { contracts: 0, contractsAmount: 0, paidInvoices: 0, paidInvoicesAmount: 0, unpaidInvoices: 0 });

  // Superadmin o'zi biriktirilgan klubni o'chira olmaydi
  await assert.rejects(
    svc.purge(empty, { id: superId, role: 'superadmin', clubId: empty }, "Bo'sh klub"),
    rejectsWithKey('clubs.purgeOwnClub'),
  );
  const result = await svc.purge(empty, superadmin(), "Bo'sh klub");
  assert.equal(Object.values(result.deleted).reduce((s, n) => s + n, 0), 0);
  assert.equal(await count(`SELECT count(*)::int AS n FROM clubs WHERE id = $1`, [empty]), 0);

  await assert.rejects(svc.preview(empty), rejectsWithKey('clubs.notFound'));
  await assert.rejects(svc.purge(empty, superadmin(), "Bo'sh klub"), rejectsWithKey('clubs.notFound'));
});
