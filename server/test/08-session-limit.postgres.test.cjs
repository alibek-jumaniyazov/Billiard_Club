const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { SessionsService } = require('../src/modules/sessions/sessions.service');
const { TablesService } = require('../src/modules/tables/tables.service');
const { Club } = require('../src/entities/club.entity');
const { Table } = require('../src/entities/table.entity');
const { User } = require('../src/entities/user.entity');
const { Session } = require('../src/entities/session.entity');
const { SessionSegment } = require('../src/entities/session-segment.entity');
const { Settings } = require('../src/entities/settings.entity');
const { PaymentMethod, UserRole } = require('../src/entities/enums');

/**
 * SUMMA LIMITI ("50 000 so'mga o'ynayman") — o'yinni boshlash, o'zgartirish,
 * ko'chirish va yakunlash oqimlarida. Limit faqat ogohlantirish chegarasi:
 * pul hisobi (soniyalik) shu testlarda ham o'zgarmasligi tekshiriladi.
 */

let database;
let nextClub = 0;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

const HOUR = 60 * 60 * 1000;
const PRICE = 40000; // soatiga: 50 000 so'm = 1 soat 15 daqiqa

async function fixture(prices = [PRICE]) {
  const n = ++nextClub;
  const club = await database.getRepository(Club).save({ name: `Limit klubi ${n}` });
  await database.getRepository(Settings).save({ clubId: club.id, timezone: 'Asia/Tashkent' });
  const tables = [];
  for (let i = 0; i < prices.length; i += 1) {
    tables.push(await database.getRepository(Table).save({
      clubId: club.id, name: `Stol ${i + 1}`, number: i + 1, pricePerHour: prices[i],
    }));
  }
  const user = await database.getRepository(User).save({
    clubId: club.id, name: 'Kassir', username: `limit_kassir_${n}_${Date.now()}`, password: 'x', role: UserRole.KASSIR,
  });
  const service = new SessionsService(database, database.getRepository(Session), database.getRepository(SessionSegment));
  return { club, table: tables[0], tables, user, service };
}

const stored = (id) => database.getRepository(Session).findOneByOrFail({ id });
const key = (error) => error?.getResponse?.().key;
const iso = (ms) => new Date(ms).toISOString();

test("o'yin summa limiti bilan boshlanadi va limit stollar ro'yxatida qaytadi", { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const started = await service.start(club.id, user, { tableId: table.id, limitAmount: 50000 });

  assert.equal(started.limitAmount, 50000);
  assert.equal(started.plannedMinutes, null);
  assert.equal(started.pricePerHour, PRICE);
  const row = await stored(started.id);
  assert.equal(row.limitAmount, 50000, 'numeric ustun son bo‘lib qaytadi (satr emas)');

  // Stol kartasi limitni aynan shu javobdan oladi
  const tablesService = new TablesService(database, database.getRepository(Table), database.getRepository(Session));
  const [listed] = await tablesService.findAll(club.id);
  assert.equal(listed.sessions[0].limitAmount, 50000);
});

test('limitsiz va belgilangan vaqtli o‘yin avvalgidek ishlaydi', { timeout: 15000 }, async () => {
  const { club, tables, user, service } = await fixture([PRICE, PRICE]);
  const plain = await service.start(club.id, user, { tableId: tables[0].id });
  assert.equal(plain.limitAmount, null);
  assert.equal(plain.plannedMinutes, null);
  const timed = await service.start(club.id, user, { tableId: tables[1].id, plannedMinutes: 60 });
  assert.equal(timed.limitAmount, null);
  assert.equal(timed.plannedMinutes, 60);
});

test('yaroqsiz limit rad etiladi va stol bo‘sh qoladi', { timeout: 15000 }, async () => {
  const { club, tables, user, service } = await fixture([PRICE, 0]);
  const [table, freeTable] = tables;

  // "50 000" o'rniga "50" — 5 daqiqalik summadan (3 334) kam
  await assert.rejects(
    () => service.start(club.id, user, { tableId: table.id, limitAmount: 50 }),
    (err) => {
      assert.equal(err.getStatus(), 400);
      assert.equal(key(err), 'sessions.limitTooSmall');
      assert.equal(err.getResponse().args.minutes, 5);
      assert.match(String(err.getResponse().args.min), /^3\s334$/);
      return true;
    },
  );
  // 24 soatlik summadan (960 000) ko'p
  await assert.rejects(
    () => service.start(club.id, user, { tableId: table.id, limitAmount: 960001 }),
    (err) => key(err) === 'sessions.limitTooLarge',
  );
  // Vaqt va summa birga
  await assert.rejects(
    () => service.start(club.id, user, { tableId: table.id, limitAmount: 50000, plannedMinutes: 60 }),
    (err) => key(err) === 'sessions.planOrLimit',
  );
  // Bepul stol — limitga hech qachon yetilmaydi
  await assert.rejects(
    () => service.start(club.id, user, { tableId: freeTable.id, limitAmount: 50000 }),
    (err) => key(err) === 'sessions.limitNeedsPrice',
  );

  assert.equal(await database.getRepository(Session).countBy({ clubId: club.id }), 0);
  const fresh = await database.getRepository(Table).findOneByOrFail({ id: table.id });
  assert.equal(fresh.status, 'free', 'rad etilgan boshlash stolni band qilmaydi');
});

test("oflayn navbatdan kelgan o'yin yaroqsiz limit tufayli yo'qolmaydi — limitsiz boshlanadi", { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const startedAt = Date.now() - HOUR;
  const started = await service.start(club.id, user, {
    tableId: table.id, limitAmount: 50, offlineAt: iso(startedAt),
  });
  assert.equal(started.status, 'active');
  assert.equal(started.limitAmount, null);
  // Date.parse(Date) millisekundni tashlab yuboradi — getTime() bilan solishtiramiz
  assert.equal(new Date(started.startTime).getTime(), startedAt, "o'yin haqiqiy vaqtidan boshlab hisoblanadi");

  // Yaroqli limit esa oflayn o'yinda ham saqlanadi
  const { club: club2, table: table2, user: user2, service: service2 } = await fixture();
  const kept = await service2.start(club2.id, user2, {
    tableId: table2.id, limitAmount: 50000, offlineAt: iso(Date.now() - HOUR),
  });
  assert.equal(kept.limitAmount, 50000);
});

test("limitni o'zgartirish, vaqtga almashtirish va olib tashlash", { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const started = await service.start(club.id, user, { tableId: table.id, plannedMinutes: 60 });

  // Vaqt -> summa limiti: belgilangan vaqt tozalanadi
  const limited = await service.updatePlan(club.id, started.id, { limitAmount: 50000 });
  assert.equal(limited.limitAmount, 50000);
  assert.equal(limited.plannedMinutes, null);

  // Limitni oshirish ("yana 20 mingga")
  const raised = await service.updatePlan(club.id, started.id, { limitAmount: 70000 });
  assert.equal(raised.limitAmount, 70000);

  // Summa limiti -> vaqt: limit tozalanadi
  const timed = await service.updatePlan(club.id, started.id, { plannedMinutes: 90 });
  assert.equal(timed.plannedMinutes, 90);
  assert.equal(timed.limitAmount, null);

  // Cheklovni olib tashlash (eski klient yuboradigan shakl) — ikkalasi ham
  await service.updatePlan(club.id, started.id, { limitAmount: 50000 });
  const cleared = await service.updatePlan(club.id, started.id, { plannedMinutes: null });
  assert.equal(cleared.plannedMinutes, null);
  assert.equal(cleared.limitAmount, null);

  // Yaroqsiz qiymatlar sessiyani o'zgartirmaydi
  await service.updatePlan(club.id, started.id, { limitAmount: 50000 });
  await assert.rejects(
    () => service.updatePlan(club.id, started.id, { limitAmount: 10 }),
    (err) => key(err) === 'sessions.limitTooSmall',
  );
  await assert.rejects(
    () => service.updatePlan(club.id, started.id, { limitAmount: 60000, plannedMinutes: 60 }),
    (err) => key(err) === 'sessions.planOrLimit',
  );
  assert.equal((await stored(started.id)).limitAmount, 50000);
});

test('limit JORIY stol narxi bo‘yicha tekshiriladi (ko‘chirilgandan keyin — yangi stol)', { timeout: 15000 }, async () => {
  const { club, tables, user, service } = await fixture([PRICE, 120000]);
  const started = await service.start(club.id, user, { tableId: tables[0].id, limitAmount: 50000 });
  const moved = await service.transfer(club.id, started.id, { tableId: tables[1].id });

  assert.equal(moved.limitAmount, 50000, 'pul limiti ko‘chirishda o‘zgarmaydi');
  assert.equal(moved.pricePerHour, 120000);
  // 120 000/soat stolda 5 daqiqa = 10 000: 4 000 endi juda kichik (40 000 lik stolda o'tardi)
  await assert.rejects(
    () => service.updatePlan(club.id, started.id, { limitAmount: 4000 }),
    (err) => key(err) === 'sessions.limitTooSmall',
  );
  const ok = await service.updatePlan(club.id, started.id, { limitAmount: 10000 });
  assert.equal(ok.limitAmount, 10000);
});

test('limit pul hisobiga ta’sir qilmaydi: limitdan oshgan o‘yin haqiqiy vaqt bo‘yicha hisoblanadi', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const startedAt = Date.now() - 3 * HOUR;
  const started = await service.start(club.id, user, {
    tableId: table.id, limitAmount: 50000, offlineAt: iso(startedAt),
  });
  // 2 soat o'ynaldi: limit 50 000, hisob esa 2 × 40 000 = 80 000
  const result = await service.end(club.id, user, started.id, {
    offlineAt: iso(startedAt + 2 * HOUR),
    expectedBarAmount: 0,
    payments: [{ method: PaymentMethod.CASH, amount: 2 * PRICE }],
  });
  assert.equal(result.durationSeconds, 7200);
  assert.equal(result.tableAmount, 2 * PRICE);
  assert.equal(result.offlineMismatch, null);
  const row = await stored(started.id);
  assert.equal(row.status, 'completed');
  assert.equal(row.limitAmount, 50000, 'limit tarixda saqlanib qoladi');

  // Yakunlangan o'yinga limit qo'yib bo'lmaydi
  await assert.rejects(
    () => service.updatePlan(club.id, started.id, { limitAmount: 90000 }),
    (err) => key(err) === 'sessions.alreadyEnded',
  );
});

test('baza darajasi: manfiy limit va «vaqt + limit» birga yozilmaydi', { timeout: 15000 }, async () => {
  const { club, table, user, service } = await fixture();
  const started = await service.start(club.id, user, { tableId: table.id, limitAmount: 50000 });
  await assert.rejects(database.query('UPDATE sessions SET "limitAmount" = -1 WHERE id = $1', [started.id]));
  await assert.rejects(database.query('UPDATE sessions SET "limitAmount" = 0 WHERE id = $1', [started.id]));
  await assert.rejects(database.query('UPDATE sessions SET "plannedMinutes" = 60 WHERE id = $1', [started.id]));
  assert.equal((await stored(started.id)).limitAmount, 50000);
});
