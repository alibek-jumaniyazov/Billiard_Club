const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { SessionsService } = require('../src/modules/sessions/sessions.service');
const { SettingsService } = require('../src/modules/settings/settings.service');
const { TablesService } = require('../src/modules/tables/tables.service');
const { Club } = require('../src/entities/club.entity');
const { Debt } = require('../src/entities/debt.entity');
const { Sale } = require('../src/entities/sale.entity');
const { Session } = require('../src/entities/session.entity');
const { SessionPayment } = require('../src/entities/session-payment.entity');
const { SessionSegment } = require('../src/entities/session-segment.entity');
const { Settings } = require('../src/entities/settings.entity');
const { Table } = require('../src/entities/table.entity');
const { User } = require('../src/entities/user.entity');
const { PaymentMethod, SessionStatus, UserRole } = require('../src/entities/enums');

/**
 * "STOLDA YIG'ILGAN PULNI YAXLITLASH" — sozlama, o'yinga muhrlash, yakuniy
 * hisob-kitob (kassa, qarz, bo'lib to'lash), jonli chek va sozlama o'zgarganda
 * davom etayotgan o'yinlar. Vaqt oflayn muhr (offlineAt) bilan aniq beriladi —
 * summa soniyagacha oldindan ma'lum.
 */

let database;
let nextClub = 0;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

const PRICE = 15000; // soatiga: 46 800 so'm = 11 232 soniya
const SECOND = 1000;
const iso = (ms) => new Date(ms).toISOString();
/** Shu summaga yetadigan soniyalar (15 000 so'm/soat) */
const secondsFor = (amount) => Math.round((amount * 3600) / PRICE);

async function fixture({ step = 1000, tables = 1 } = {}) {
  const n = ++nextClub;
  const club = await database.getRepository(Club).save({ name: `Yaxlitlash klubi ${n}` });
  await database.getRepository(Settings).save({ clubId: club.id, timezone: 'Asia/Tashkent', tableRoundingStep: step });
  const list = [];
  for (let i = 0; i < tables; i += 1) {
    list.push(await database.getRepository(Table).save({
      clubId: club.id, name: `Stol ${i + 1}`, number: i + 1, pricePerHour: PRICE,
    }));
  }
  const user = await database.getRepository(User).save({
    clubId: club.id, name: 'Kassir', username: `round_kassir_${n}_${Date.now()}`, password: 'x', role: UserRole.KASSIR,
  });
  const service = new SessionsService(database, database.getRepository(Session), database.getRepository(SessionSegment));
  const settings = new SettingsService(database.getRepository(Settings), database);
  return { club, table: list[0], tables: list, user, service, settings };
}

/** O'yin `seconds` soniya davom etib, oflayn muhr bilan yakunlanadi (aniq summa) */
async function playOffline(ctx, table, seconds, endBody = {}) {
  const startedAt = Date.now() - 20 * 60 * 60 * SECOND; // 20 soat oldin (24 soatlik oyna ichida)
  const started = await ctx.service.start(ctx.club.id, ctx.user, { tableId: table.id, offlineAt: iso(startedAt) });
  const result = await ctx.service.end(ctx.club.id, ctx.user, started.id, {
    offlineAt: iso(startedAt + seconds * SECOND),
    ...endBody,
  });
  return { started, result };
}

const stored = (id) => database.getRepository(Session).findOneByOrFail({ id });

test('yaxlitlash o‘chiq — summa avvalgidek sekundlik aniq', { timeout: 20000 }, async () => {
  const ctx = await fixture({ step: 0 });
  const seconds = secondsFor(46812.5);
  const { started, result } = await playOffline(ctx, ctx.table, seconds, {
    payments: [{ method: PaymentMethod.CASH, amount: 46812.5 }],
  });
  assert.equal(started.roundingStep, 0);
  assert.equal(result.tableAmount, 46812.5);
  assert.equal(result.tableRounding, 0);
  const row = await stored(started.id);
  assert.equal(row.tableAmount, 46812.5);
  assert.equal(row.tableRounding, 0);
});

test('1000 ga yaxlitlash: 46 800 → 47 000 va 46 300 → 46 000 kassaga yoziladi', { timeout: 20000 }, async () => {
  const ctx = await fixture({ step: 1000, tables: 2 });

  const up = await playOffline(ctx, ctx.tables[0], secondsFor(46800), {
    payments: [{ method: PaymentMethod.CASH, amount: 47000 }],
    expectedTableAmount: 47000,
  });
  assert.equal(up.started.roundingStep, 1000, 'qadam o‘yinga muhrlanadi');
  assert.equal(up.result.tableAmountExact, 46800);
  assert.equal(up.result.tableAmount, 47000);
  assert.equal(up.result.tableRounding, 200);
  assert.equal(up.result.totalAmount, 47000);
  assert.equal(up.result.paidNow, 47000);
  assert.equal(up.result.offlineMismatch, null, 'kassa bilan server bir xil hisobladi');

  const row = await stored(up.started.id);
  assert.equal(row.tableAmount, 47000);
  assert.equal(row.tableRounding, 200);
  assert.equal(row.totalAmount, 47000);
  const sale = await database.getRepository(Sale).findOneByOrFail({ sessionId: up.started.id });
  assert.equal(sale.tableAmount, 47000);
  assert.equal(sale.totalAmount, 47000);
  const payments = await database.getRepository(SessionPayment).findBy({ sessionId: up.started.id });
  assert.equal(payments.reduce((sum, p) => sum + p.amount, 0), 47000, 'kassaga aniq yaxlit summa');

  const down = await playOffline(ctx, ctx.tables[1], secondsFor(46300), {
    payments: [{ method: PaymentMethod.CARD, amount: 46000 }],
    expectedTableAmount: 46000,
  });
  assert.equal(down.result.tableAmountExact, 46300);
  assert.equal(down.result.tableAmount, 46000);
  assert.equal(down.result.tableRounding, -300);
  assert.equal(down.result.totalAmount, 46000);
});

test('chegarada: kassir ko‘rgan yaxlit summa qabul qilinadi, eskisi — yo‘q', { timeout: 20000 }, async () => {
  const ctx = await fixture({ step: 1000, tables: 2 });

  // Aniq summa 46 500 dan endigina oshgan (ekranda 46 000 edi) — ONLAYN yakun
  const startedAt = Date.now() - secondsFor(46504) * SECOND;
  const fresh = await ctx.service.start(ctx.club.id, ctx.user, { tableId: ctx.tables[0].id, offlineAt: iso(startedAt) });
  const accepted = await ctx.service.end(ctx.club.id, ctx.user, fresh.id, {
    paymentMethod: PaymentMethod.CASH,
    expectedTableAmount: 46000,
  });
  assert.ok(accepted.tableAmountExact >= 46500, `aniq summa chegaradan o'tgan: ${accepted.tableAmountExact}`);
  assert.equal(accepted.tableAmount, 46000, 'ekrandagi summa kassaga yoziladi');
  assert.equal(accepted.paidNow, 46000);
  assert.equal(accepted.tableRounding, Math.round((46000 - accepted.tableAmountExact) * 100) / 100);

  // 2 daqiqalik oynadan ancha eski ekran (aniq ~47 604) — server o'z hisobini yozadi
  const oldStart = Date.now() - secondsFor(47604) * SECOND;
  const stale = await ctx.service.start(ctx.club.id, ctx.user, { tableId: ctx.tables[1].id, offlineAt: iso(oldStart) });
  const rejected = await ctx.service.end(ctx.club.id, ctx.user, stale.id, {
    paymentMethod: PaymentMethod.CASH,
    expectedTableAmount: 46000,
  });
  assert.equal(rejected.tableAmount, 48000);
  assert.equal(rejected.paidNow, 48000);
});

test('bo‘lib to‘lash: yaxlit summa bir qadam o‘sib ketsa ham qabul qilinadi', { timeout: 20000 }, async () => {
  // Arzon stol (2 000/soat): vaqt oynasi 500 so'm — qadam (1 000) undan katta
  const ctx = await fixture({ step: 1000 });
  await database.getRepository(Table).update(ctx.table.id, { pricePerHour: 2000 });
  const startedAt = Date.now() - 48 * 60 * SECOND; // 48 daqiqa = 1 600 so'm → 2 000
  const started = await ctx.service.start(ctx.club.id, ctx.user, { tableId: ctx.table.id, offlineAt: iso(startedAt) });
  const result = await ctx.service.end(ctx.club.id, ctx.user, started.id, {
    // Kassir bo'lib to'lashni 1 000 ko'rinib turganda boshlagan (eski nishon)
    payments: [
      { method: PaymentMethod.CASH, amount: 500 },
      { method: PaymentMethod.CARD, amount: 500 },
    ],
  });
  assert.equal(result.tableAmount, 2000);
  assert.equal(result.paidNow, 2000);
  const payments = await database.getRepository(SessionPayment).findBy({ sessionId: started.id });
  assert.equal(payments.reduce((sum, p) => sum + p.amount, 0), 2000, 'to‘lovlar yig‘indisi = sotuv summasi');
});

test('qarz: stol qarzi yaxlit summada yoziladi', { timeout: 20000 }, async () => {
  const ctx = await fixture({ step: 1000 });
  const { result } = await playOffline(ctx, ctx.table, secondsFor(46800), {
    payments: [],
    isDebt: true,
    isTableDebt: true,
    customerName: 'Qarzdor',
    // Oflayn qarz faqat ro'yxatdagi mijozga — shu test uchun mijoz yaratamiz
    customerId: (await database.query(
      `INSERT INTO customers ("clubId", name, phone) VALUES ($1, 'Qarzdor', '+998900000013') RETURNING id`,
      [ctx.club.id],
    ))[0].id,
  });
  assert.equal(result.tableAmount, 47000);
  assert.equal(result.totalDebt, 47000);
  const debt = await database.getRepository(Debt).findOneByOrFail({ id: result.debtId });
  assert.equal(debt.tableAmount, 47000);
  assert.equal(debt.totalDebt, 47000);
});

test('jonli chek va stollar ro‘yxati yaxlit summani ko‘rsatadi', { timeout: 20000 }, async () => {
  const ctx = await fixture({ step: 1000 });
  const startedAt = Date.now() - secondsFor(46800) * SECOND - 2 * SECOND;
  const started = await ctx.service.start(ctx.club.id, ctx.user, { tableId: ctx.table.id, offlineAt: iso(startedAt) });

  const live = await ctx.service.receipt(ctx.club.id, started.id);
  assert.equal(live.live, true);
  assert.equal(live.roundingStep, 1000);
  assert.equal(live.tableAmount, 47000);
  assert.ok(live.tableAmountExact >= 46800 && live.tableAmountExact < 46900, String(live.tableAmountExact));
  assert.equal(live.tableRounding, Math.round((47000 - live.tableAmountExact) * 100) / 100);
  assert.equal(live.grossAmount, 47000);

  const tablesService = new TablesService(database, database.getRepository(Table), database.getRepository(Session));
  const [listed] = await tablesService.findAll(ctx.club.id);
  assert.equal(listed.sessions[0].roundingStep, 1000, 'karta qadamni stollar ro‘yxatidan oladi');

  await ctx.service.end(ctx.club.id, ctx.user, started.id, { paymentMethod: PaymentMethod.CASH, expectedTableAmount: 47000 });
  const done = await ctx.service.receipt(ctx.club.id, started.id);
  assert.equal(done.live, false);
  assert.equal(done.tableAmount, 47000);
  assert.equal(done.roundingStep, 1000);
  assert.equal(Math.round((done.tableAmountExact + done.tableRounding) * 100) / 100, 47000);
});

test('sozlama o‘zgarsa davom etayotgan o‘yinlar yangilanadi, yakunlanganlar — yo‘q', { timeout: 20000 }, async () => {
  const ctx = await fixture({ step: 0, tables: 3 });
  const finished = await playOffline(ctx, ctx.tables[0], secondsFor(46812.5), {
    payments: [{ method: PaymentMethod.CASH, amount: 46812.5 }],
  });
  const running = await ctx.service.start(ctx.club.id, ctx.user, { tableId: ctx.tables[1].id });
  const paused = await ctx.service.start(ctx.club.id, ctx.user, { tableId: ctx.tables[2].id });
  await ctx.service.pause(ctx.club.id, paused.id);
  assert.equal(running.roundingStep, 0);

  const saved = await ctx.settings.update(ctx.club.id, { tableRoundingStep: 1000 });
  assert.equal(saved.tableRoundingStep, 1000);
  assert.equal((await stored(running.id)).roundingStep, 1000, 'faol o‘yin darhol yaxlitlanadi');
  assert.equal((await stored(paused.id)).roundingStep, 1000, 'pauzadagi o‘yin ham');
  const done = await stored(finished.started.id);
  assert.equal(done.roundingStep, 0, 'yakunlangan o‘yin o‘zgarmaydi');
  assert.equal(done.tableAmount, 46812.5);

  // Boshqa maydon saqlanganda qadam o'zgarmaydi
  await ctx.settings.update(ctx.club.id, { clubName: 'Yangi nom' });
  assert.equal((await stored(running.id)).roundingStep, 1000);

  // O'chirilsa — davom etayotgan o'yinlar yana aniq summaga qaytadi
  await ctx.settings.update(ctx.club.id, { tableRoundingStep: 0 });
  assert.equal((await stored(running.id)).roundingStep, 0);
  assert.equal((await stored(paused.id)).roundingStep, 0);
  assert.equal((await stored(running.id)).status, SessionStatus.ACTIVE);
});

test('baza ruxsat etilmagan qadamni qabul qilmaydi', { timeout: 20000 }, async () => {
  const ctx = await fixture({ step: 0 });
  await assert.rejects(
    () => database.getRepository(Settings).update({ clubId: ctx.club.id }, { tableRoundingStep: 700 }),
    (err) => err?.driverError?.code === '23514' || err?.code === '23514',
  );
  const started = await ctx.service.start(ctx.club.id, ctx.user, { tableId: ctx.table.id });
  await assert.rejects(
    () => database.getRepository(Session).update(started.id, { roundingStep: 250 }),
    (err) => err?.driverError?.code === '23514' || err?.code === '23514',
  );
});
