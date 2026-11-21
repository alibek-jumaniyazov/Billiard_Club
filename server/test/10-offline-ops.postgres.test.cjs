const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { Reflector } = require('@nestjs/core');
const { defer, firstValueFrom } = require('rxjs');
const { createDataSource } = require('./postgres-helper.cjs');
const { DebtsService } = require('../src/modules/debts/debts.service');
const { ReservationsService } = require('../src/modules/reservations/reservations.service');
const { CustomersService } = require('../src/modules/customers/customers.service');
const { ShiftsService } = require('../src/modules/shifts/shifts.service');
const { SessionsService } = require('../src/modules/sessions/sessions.service');
const { IdempotencyInterceptor } = require('../src/common/idempotency/idempotency.interceptor');
const { Club } = require('../src/entities/club.entity');
const { Table } = require('../src/entities/table.entity');
const { User } = require('../src/entities/user.entity');
const { Debt } = require('../src/entities/debt.entity');
const { DebtPayment } = require('../src/entities/debt-payment.entity');
const { Reservation } = require('../src/entities/reservation.entity');
const { Customer } = require('../src/entities/customer.entity');
const { CashShift } = require('../src/entities/cash-shift.entity');
const { Session } = require('../src/entities/session.entity');
const { SessionSegment } = require('../src/entities/session-segment.entity');
const { Settings } = require('../src/entities/settings.entity');
const { IdempotencyKey } = require('../src/entities/idempotency-key.entity');
const { PaymentMethod, ReservationStatus, UserRole } = require('../src/entities/enums');

/**
 * OFLAYN AMALLAR (qarz to'lovi, bron, mijoz, smena) — navbat aloqa
 * tiklangach yuborganda server biznes vaqtini `offlineAt` dan oladi,
 * to'qnashuvlarni JIMGINA emas, aniq 4xx bilan rad etadi va idempotentlik
 * kaliti takroriy yuborishni ikki marta bajarmaydi.
 */

let database;
let nextClub = 0;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const PRICE = 24000; // soatiga — 30 daqiqa = 12 000
const iso = (ms) => new Date(ms).toISOString();
const audit = { log: () => undefined };

async function fixture() {
  const n = ++nextClub;
  const club = await database.getRepository(Club).save({ name: `Offline ops ${n}` });
  await database.getRepository(Settings).save({ clubId: club.id, timezone: 'Asia/Tashkent' });
  const table = await database.getRepository(Table).save({ clubId: club.id, name: 'Stol 1', number: 1, pricePerHour: PRICE });
  const user = await database.getRepository(User).save({
    clubId: club.id, name: 'Kassir', username: `offline_ops_${n}_${Date.now()}`, password: 'x', role: UserRole.KASSIR,
  });
  return {
    club, table, user,
    debts: new DebtsService(database, database.getRepository(Debt)),
    reservations: new ReservationsService(database, database.getRepository(Reservation)),
    customers: new CustomersService(database, database.getRepository(Customer), database.getRepository(Session)),
    shifts: new ShiftsService(database.getRepository(CashShift), database, audit),
    sessions: new SessionsService(database, database.getRepository(Session), database.getRepository(SessionSegment)),
  };
}

const makeDebt = (club, user, totalDebt, createdAtMs, extra = {}) => database.getRepository(Debt).save({
  clubId: club.id, userId: user.id, customerName: 'Qarzdor', customerPhone: '998901112233',
  tableAmount: totalDebt, barAmount: 0, totalDebt, paidAmount: 0, remainingDebt: totalDebt, isPaid: false,
  createdAt: new Date(createdAtMs), ...extra,
});

/** HttpException: holat kodi va i18n kaliti bo'yicha tekshirish */
const rejectsWith = (status, key) => (err) => {
  assert.equal(err.getStatus?.(), status, `kutilgan ${status}, keldi ${err.getStatus?.()} (${err.message})`);
  if (key) assert.equal(err.getResponse().key, key);
  return true;
};

/* ------------------------------------------------------------------ Qarzlar */

test('offline debt payment is recorded at the moment the cash was taken, not at replay', { timeout: 15000 }, async () => {
  const { club, user, debts } = await fixture();
  const debt = await makeDebt(club, user, 30000, Date.now() - 5 * HOUR);
  const paidAt = Date.now() - 2 * HOUR;

  const partial = await debts.pay(club.id, user, debt.id, { amount: 10000, paymentMethod: PaymentMethod.CASH, offlineAt: iso(paidAt) });
  assert.equal(partial.remainingDebt, 20000);
  assert.equal(partial.isPaid, false);
  const [row] = await database.getRepository(DebtPayment).findBy({ debtId: debt.id });
  assert.equal(row.createdAt.getTime(), paidAt, "to'lov haqiqiy olingan vaqtga yozildi");

  const closedAt = Date.now() - HOUR;
  const full = await debts.pay(club.id, user, debt.id, { amount: 20000, paymentMethod: PaymentMethod.CARD, offlineAt: iso(closedAt) });
  assert.equal(full.isPaid, true);
  assert.equal(new Date(full.paidAt).getTime(), closedAt, "qarz yopilgan vaqt — oxirgi oflayn to'lov payti");

  // Boshqa kassa qarzni allaqachon yopgan — ikkinchi oflayn to'lov jimgina yozilmaydi
  await assert.rejects(
    () => debts.pay(club.id, user, debt.id, { amount: 5000, offlineAt: iso(Date.now() - 30 * MIN) }),
    rejectsWith(400, 'debts.alreadyPaid'),
  );
  assert.equal((await database.getRepository(DebtPayment).findBy({ debtId: debt.id })).length, 2);
});

test('offline debt payment that exceeds a remaining balance changed elsewhere fails visibly', { timeout: 15000 }, async () => {
  const { club, user, debts } = await fixture();
  const debt = await makeDebt(club, user, 30000, Date.now() - 5 * HOUR);
  await debts.pay(club.id, user, debt.id, { amount: 25000 }); // boshqa kassa, onlayn
  await assert.rejects(
    () => debts.pay(club.id, user, debt.id, { amount: 10000, offlineAt: iso(Date.now() - HOUR) }),
    rejectsWith(400, 'debts.amountExceedsRemaining'),
  );
  const fresh = await database.getRepository(Debt).findOneByOrFail({ id: debt.id });
  assert.equal(fresh.remainingDebt, 5000, "rad etilgan to'lov qoldiqqa tegmaydi");
});

test('offlineAt range is enforced: far future and older than 24 h + margin are rejected, small skew is clamped', { timeout: 15000 }, async () => {
  const { club, user, debts } = await fixture();
  const debt = await makeDebt(club, user, 30000, Date.now() - 3 * HOUR);
  await assert.rejects(
    () => debts.pay(club.id, user, debt.id, { amount: 1000, offlineAt: iso(Date.now() + HOUR) }),
    rejectsWith(400, 'offline.timeInFuture'),
  );
  await assert.rejects(
    () => debts.pay(club.id, user, debt.id, { amount: 1000, offlineAt: iso(Date.now() - 27 * HOUR) }),
    rejectsWith(400, 'offline.timeTooOld'),
  );
  assert.equal((await database.getRepository(DebtPayment).findBy({ debtId: debt.id })).length, 0);

  // Soat 2 daqiqa oldinda — kelajakka yozilmaydi, hozirgi vaqtga kesiladi
  const before = Date.now();
  await debts.pay(club.id, user, debt.id, { amount: 1000, offlineAt: iso(Date.now() + 2 * MIN) });
  // Qarz yozilishidan oldingi muhr — qarz yozilgan vaqtga kesiladi
  await debts.pay(club.id, user, debt.id, { amount: 1000, offlineAt: iso(Date.now() - 4 * HOUR) });
  const rows = await database.getRepository(DebtPayment).find({ where: { debtId: debt.id }, order: { id: 'ASC' } });
  assert.ok(rows[0].createdAt.getTime() >= before && rows[0].createdAt.getTime() <= Date.now());
  assert.equal(rows[1].createdAt.getTime(), debt.createdAt.getTime());
});

/* --------------------------------------------------------------- Idempotentlik */

/** Global interceptor'ni haqiqiy so'rovdagidek handler atrofida ishga tushiradi */
function viaIdempotency(user, key, method, path, run) {
  const interceptor = new IdempotencyInterceptor(new Reflector(), database.getRepository(IdempotencyKey));
  const request = { method, headers: { 'idempotency-key': key }, originalUrl: path, url: path, user };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  };
  return firstValueFrom(interceptor.intercept(context, { handle: () => defer(run) }));
}

test('replaying a queued debt payment / shift close with the same Idempotency-Key never applies it twice', { timeout: 15000 }, async () => {
  const { club, user, debts, shifts } = await fixture();
  const debt = await makeDebt(club, user, 30000, Date.now() - 5 * HOUR);
  const body = { amount: 10000, paymentMethod: PaymentMethod.CASH, offlineAt: iso(Date.now() - HOUR) };
  let executed = 0;
  const pay = async () => { executed += 1; return { success: true, data: await debts.pay(club.id, user, debt.id, body) }; };

  const first = await viaIdempotency(user, 'debt-pay-key-1', 'POST', `/api/debts/${debt.id}/pay`, pay);
  // Javob yo'lda yo'qoldi — navbat AYNAN SHU kalit bilan qayta yuboradi
  const second = await viaIdempotency(user, 'debt-pay-key-1', 'POST', `/api/debts/${debt.id}/pay`, pay);
  assert.equal(executed, 1, 'handler ikkinchi marta ishlamadi');
  assert.deepEqual(second, JSON.parse(JSON.stringify(first)));
  assert.equal((await database.getRepository(DebtPayment).findBy({ debtId: debt.id })).length, 1);

  const shift = await shifts.open(club.id, user, { openingCash: 0, offlineAt: iso(Date.now() - 3 * HOUR) });
  let closes = 0;
  const close = async () => {
    closes += 1;
    return { success: true, data: await shifts.close(club.id, user, shift.id, { countedCash: 0, offlineAt: iso(Date.now() - 30 * MIN) }) };
  };
  await viaIdempotency(user, 'shift-close-key-1', 'POST', `/api/shifts/${shift.id}/close`, close);
  await viaIdempotency(user, 'shift-close-key-1', 'POST', `/api/shifts/${shift.id}/close`, close);
  assert.equal(closes, 1, 'smena ikkinchi marta yopilmadi (422 ham qaytmadi)');
});

/* ------------------------------------------------------------------- Bronlar */

test('offline reservation: created at its real time; a booking conflict on replay is rejected (422), online keeps the warning', { timeout: 15000 }, async () => {
  const { club, table, reservations } = await fixture();
  const startsAt = new Date(Date.now() + 6 * HOUR);
  const createdAt = Date.now() - 2 * HOUR;

  const { reservation, overlaps } = await reservations.create(club.id, {
    tableId: table.id, customerName: 'Aziz', startsAt: startsAt.toISOString(), durationMinutes: 60, offlineAt: iso(createdAt),
  });
  assert.equal(overlaps.length, 0);
  assert.equal(reservation.createdAt.getTime(), createdAt);

  // Boshqa kassa oflayn paytda AYNAN shu vaqtni band qilgan — oflayn bron rad etiladi
  await assert.rejects(
    () => reservations.create(club.id, {
      tableId: table.id, customerName: 'Bobur', startsAt: new Date(startsAt.getTime() + 30 * MIN).toISOString(), offlineAt: iso(Date.now() - HOUR),
    }),
    (err) => {
      rejectsWith(422, 'reservations.offlineConflict')(err);
      assert.equal(err.getResponse().args.name, 'Aziz');
      assert.match(err.getResponse().args.time, /^\d{2}\.\d{2} \d{2}:\d{2}$/);
      return true;
    },
  );
  assert.equal(await database.getRepository(Reservation).countBy({ clubId: club.id }), 1, 'rad etilgan bron yozilmadi');

  // Onlayn oqim o'zgarmagan: to'qnashuv — ogohlantirish, qat'iy blok emas
  const online = await reservations.create(club.id, {
    tableId: table.id, customerName: 'Bobur', startsAt: new Date(startsAt.getTime() + 30 * MIN).toISOString(),
  });
  assert.equal(online.overlaps.length, 1);
});

test('offline reservation status changes: invalid transitions fail visibly, a repeated cancel is a no-op', { timeout: 15000 }, async () => {
  const { club, table, reservations } = await fixture();
  const { reservation } = await reservations.create(club.id, {
    tableId: table.id, customerName: 'Aziz', startsAt: new Date(Date.now() + 3 * HOUR).toISOString(),
  });
  // Boshqa kassa bronni bekor qildi, bu kassa esa oflayn "o'tirdi" bosgan edi
  await reservations.cancel(club.id, reservation.id);
  await assert.rejects(
    () => reservations.update(club.id, reservation.id, { status: ReservationStatus.SEATED, offlineAt: iso(Date.now() - 20 * MIN) }),
    rejectsWith(400, 'reservations.invalidTransition'),
  );
  // Oflayn bekor qilish allaqachon bekor qilingan bronga — niyat bajarilgan, xato emas
  const again = await reservations.cancel(club.id, reservation.id, { offlineAt: iso(Date.now() - 10 * MIN) });
  assert.equal(again.status, ReservationStatus.CANCELLED);
  // Onlayn takroriy bekor qilish avvalgidek 400
  await assert.rejects(() => reservations.cancel(club.id, reservation.id), rejectsWith(400, 'reservations.invalidTransition'));

  const second = await reservations.create(club.id, {
    tableId: table.id, customerName: 'Bobur', startsAt: new Date(Date.now() + 8 * HOUR).toISOString(),
  });
  const confirmed = await reservations.update(club.id, second.reservation.id, { status: ReservationStatus.CONFIRMED, offlineAt: iso(Date.now() - MIN) });
  assert.equal(confirmed.reservation.status, ReservationStatus.CONFIRMED);
});

/* ------------------------------------------------------------------- Mijozlar */

test('offline customer: stored with its real time; a phone already registered resolves to the existing customer', { timeout: 15000 }, async () => {
  const { club, customers } = await fixture();
  const addedAt = Date.now() - 3 * HOUR;
  const created = await customers.create(club.id, { name: 'Sardor', phone: '+998 90 777 66 55', offlineAt: iso(addedAt) });
  assert.equal(created.createdAt.getTime(), addedAt);

  // Shu telefon bilan boshqa kassa ham oflayn qo'shgan — yangi qator ochilmaydi,
  // keyingi bron mavjud mijozga bog'lanadi
  const merged = await customers.create(club.id, { name: 'Sardor aka', phone: '+998907776655', offlineAt: iso(Date.now() - HOUR) });
  assert.equal(merged.id, created.id);
  assert.equal(merged.name, 'Sardor', "mavjud mijoz ma'lumoti o'zgarmaydi");
  assert.equal(await database.getRepository(Customer).countBy({ clubId: club.id }), 1);

  await assert.rejects(
    () => customers.create(club.id, { name: 'Sardor', phone: '+998 90 777-66-55' }),
    rejectsWith(409, 'customers.phoneTaken'),
  );
});

/* ------------------------------------------------------------------- Smenalar */

test('offline shift: Z-report is computed from server data at replay over [opened, offlineAt), money attributed by when it was taken', { timeout: 20000 }, async () => {
  const { club, table, user, debts, shifts, sessions } = await fixture();
  const now = Date.now();
  const openedAt = now - 5 * HOUR;
  const shift = await shifts.open(club.id, user, { openingCash: 50000, offlineAt: iso(openedAt) });
  assert.equal(new Date(shift.openedAt).getTime(), openedAt);

  // Smena ichida oflayn yakunlangan o'yin (navbat bilan HOZIR yetib keladi)
  const a = await sessions.start(club.id, user, { tableId: table.id, offlineAt: iso(now - 4 * HOUR) });
  await sessions.end(club.id, user, a.id, {
    offlineAt: iso(now - 4 * HOUR + 30 * MIN), expectedBarAmount: 0, payments: [{ method: PaymentMethod.CASH, amount: 12000 }],
  });
  // O'sha hisob-kitobda yozilgan qarz navbat bilan HOZIR yetib kelgan
  // (createdAt = hozir) — Z-hisobotda o'yin yakunlangan smenaga tushadi
  await makeDebt(club, user, 7000, now, { sessionId: a.id });
  // Smena ichida oflayn qarz to'lovlari: naqd va karta
  const debt = await makeDebt(club, user, 50000, now - 6 * HOUR);
  await debts.pay(club.id, user, debt.id, { amount: 20000, paymentMethod: PaymentMethod.CASH, offlineAt: iso(now - 3 * HOUR) });
  await debts.pay(club.id, user, debt.id, { amount: 5000, paymentMethod: PaymentMethod.CARD, offlineAt: iso(now - 3 * HOUR + MIN) });

  // Kassa sanalgan paytdan KEYIN bo'lgan pul (keyingi smenaniki) — yopishdan
  // OLDIN yetib kelsa ham bu smenaga tushmasligi kerak
  const b = await sessions.start(club.id, user, { tableId: table.id, offlineAt: iso(now - HOUR - 30 * MIN) });
  await sessions.end(club.id, user, b.id, {
    offlineAt: iso(now - HOUR), expectedBarAmount: 0, payments: [{ method: PaymentMethod.CASH, amount: 12000 }],
  });
  await debts.pay(club.id, user, debt.id, { amount: 3000, paymentMethod: PaymentMethod.CASH, offlineAt: iso(now - 30 * MIN) });

  const closedAt = now - 2 * HOUR;
  const counted = 50000 + 12000 + 20000 - 1000; // kassir 1000 kam sanagan
  const closed = await shifts.close(club.id, user, shift.id, { countedCash: counted, cashOut: 0, offlineAt: iso(closedAt) });
  assert.equal(new Date(closed.closedAt).getTime(), closedAt);
  assert.equal(closed.summary.to, iso(closedAt));
  assert.equal(closed.summary.sessionsCount, 1);
  assert.deepEqual(closed.summary.byMethod, { cash: 32000, card: 5000, transfer: 0 });
  assert.equal(closed.summary.collectedSales, 12000);
  assert.equal(closed.summary.debtPayments, 25000);
  assert.equal(closed.summary.debtsCreated, 7000);
  assert.equal(closed.expectedCash, 82000);
  assert.equal(closed.countedCash, counted);
  assert.equal(closed.difference, -1000, 'farq onlayn yopishdagi kabi yozildi');

  // Allaqachon yopilgan smena: oflayn navbatdan — 422 (navbat 409 ni qayta urinadi), onlayn — 409
  await assert.rejects(
    () => shifts.close(club.id, user, shift.id, { countedCash: 0, offlineAt: iso(now - HOUR) }),
    rejectsWith(422, 'shifts.alreadyClosed'),
  );
  await assert.rejects(() => shifts.close(club.id, user, shift.id, { countedCash: 0 }), rejectsWith(409, 'shifts.alreadyClosed'));

  // Keyingi smena oflayn ochilgan — vaqti oldingi yopilishdan oldin bo'la olmaydi
  const next = await shifts.open(club.id, user, { openingCash: 0, offlineAt: iso(closedAt - 10 * MIN) });
  assert.equal(new Date(next.openedAt).getTime(), closedAt, 'oynalar ustma-ust tushmaydi');
  const live = await shifts.current(club.id);
  assert.equal(live.summary.byMethod.cash, 15000, "keyingi smena kassa sanalgandan keyingi pulni oladi");

  await assert.rejects(
    () => shifts.open(club.id, user, { openingCash: 0, offlineAt: iso(now - 20 * MIN) }),
    rejectsWith(422, 'shifts.alreadyOpen'),
  );
  await assert.rejects(() => shifts.open(club.id, user, { openingCash: 0 }), rejectsWith(409, 'shifts.alreadyOpen'));
});
