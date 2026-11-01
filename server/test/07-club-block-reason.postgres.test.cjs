const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { AuthService } = require('../src/modules/auth/auth.service');
const { ClubsService } = require('../src/modules/clubs/clubs.service');
const { AdminBillingService } = require('../src/modules/subscription/admin-billing.service');
const { Club } = require('../src/entities/club.entity');
const { Coupon } = require('../src/entities/coupon.entity');
const { Invoice } = require('../src/entities/invoice.entity');
const { Plan } = require('../src/entities/plan.entity');
const { RefreshSession } = require('../src/entities/refresh-session.entity');
const { User } = require('../src/entities/user.entity');
const { ClubBlockReason, ClubStatus, InvoiceStatus, UserRole } = require('../src/entities/enums');

const DAY_MS = 24 * 60 * 60 * 1000;

let database;
let clubs;
let billing;
let auth;
const audit = [];
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
  clubs = new ClubsService(
    database,
    { notify: () => undefined },
    { get: async () => ({ trialDays: 7, expiryReminderDays: [], trialTier: 'vip' }) },
    database.getRepository(Club),
    database.getRepository(User),
    database.getRepository(RefreshSession),
    { log: (entry) => audit.push(entry) },
  );
  billing = new AdminBillingService(
    database,
    { notifyPayment: () => undefined },
    clubs,
    database.getRepository(Plan),
    database.getRepository(Coupon),
    database.getRepository(Invoice),
  );
  auth = new AuthService(
    {},
    {},
    database,
    { log: () => undefined },
    {},
    { issue: () => null },
    database.getRepository(User),
    database.getRepository(Club),
    database.getRepository(RefreshSession),
  );
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

const actor = { id: 1, role: UserRole.SUPERADMIN };
const reload = (id) => database.getRepository(Club).findOneBy({ id });

test("migratsiya: noma'lum sabab bazaga yozilmaydi, sababsiz eski blok o'z holicha qoladi", async () => {
  const legacy = await database.getRepository(Club).save({ name: 'Eski blok', status: ClubStatus.BLOCKED });
  const row = await reload(legacy.id);
  assert.equal(row.blockReason, null);
  assert.equal(row.blockedAt, null);
  await assert.rejects(database.query(`UPDATE clubs SET "blockReason" = 'spam' WHERE id = $1`, [legacy.id]));
});

test("bloklash: sabab, tozalangan izoh va sana saqlanadi; qayta bloklash sababni yangilaydi, sana qoladi", async () => {
  const club = await database.getRepository(Club).save({
    name: 'Ikki hisobli klub',
    status: ClubStatus.TRIAL,
    trialEndsAt: new Date(Date.now() + 5 * DAY_MS),
  });

  const blocked = await clubs.setBlocked(
    club.id,
    true,
    { reason: ClubBlockReason.FREE_PLAN_ABUSE, note: '  Shu telefon bilan 3 ta hisob ochilgan  ' },
    actor,
  );
  assert.equal(blocked.status, ClubStatus.BLOCKED);
  assert.equal(blocked.blockReason, 'free_plan_abuse');
  assert.equal(blocked.blockNote, 'Shu telefon bilan 3 ta hisob ochilgan');
  assert.ok(blocked.blockedAt instanceof Date);
  const firstBlockedAt = (await reload(club.id)).blockedAt.getTime();
  assert.equal(audit.at(-1).action, 'clubs.block');
  assert.equal(audit.at(-1).meta.reason, 'free_plan_abuse');

  // Sababni almashtirish: izoh bo'sh bo'lsa null, blok sanasi o'zgarmaydi
  await clubs.setBlocked(club.id, true, { reason: ClubBlockReason.RULES_VIOLATION, note: '   ' }, actor);
  const updated = await reload(club.id);
  assert.equal(updated.blockReason, 'rules_violation');
  assert.equal(updated.blockNote, null);
  assert.equal(updated.blockedAt.getTime(), firstBlockedAt);

  // Sababsiz bloklash ham mumkin (ixtiyoriy)
  await clubs.setBlocked(club.id, true, {}, actor);
  assert.equal((await reload(club.id)).blockReason, null);
});

test("blokdan chiqarish: sabab tozalanadi, holat muddatiga qarab tiklanadi", async () => {
  const repo = database.getRepository(Club);
  const trial = await repo.save({ name: 'Sinovdagi', status: ClubStatus.TRIAL, trialEndsAt: new Date(Date.now() + DAY_MS) });
  const paid = await repo.save({ name: "To'lagan", status: ClubStatus.ACTIVE, subscriptionEndsAt: new Date(Date.now() + 30 * DAY_MS) });
  const ended = await repo.save({ name: 'Muddati tugagan', status: ClubStatus.ACTIVE, subscriptionEndsAt: new Date(Date.now() - DAY_MS) });

  for (const [club, expected] of [[trial, ClubStatus.TRIAL], [paid, ClubStatus.ACTIVE], [ended, ClubStatus.EXPIRED]]) {
    await clubs.setBlocked(club.id, true, { reason: ClubBlockReason.UNPAID, note: 'izoh' }, actor);
    await clubs.setBlocked(club.id, false, {}, actor);
    const row = await reload(club.id);
    assert.equal(row.status, expected, club.name);
    assert.equal(row.blockReason, null);
    assert.equal(row.blockNote, null);
    assert.equal(row.blockedAt, null);
  }
  assert.equal(audit.at(-1).action, 'clubs.unblock');
});

test("kirishda: sabab faqat bloklangan klub ma'lumotida qaytadi", async () => {
  const club = await database.getRepository(Club).save({ name: 'Kiruvchi klub', status: ClubStatus.TRIAL, trialEndsAt: new Date(Date.now() + DAY_MS) });
  const user = { id: 0, clubId: club.id, role: UserRole.ADMIN };

  await clubs.setBlocked(club.id, true, { reason: ClubBlockReason.FREE_PLAN_ABUSE, note: 'Obuna sotib oling' }, actor);
  const blocked = (await auth.me(user)).club;
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.blockReason, 'free_plan_abuse');
  assert.equal(blocked.blockNote, 'Obuna sotib oling');
  assert.ok(blocked.blockedAt);

  await clubs.setBlocked(club.id, false, {}, actor);
  const open = (await auth.me(user)).club;
  assert.equal(open.blockReason, null);
  assert.equal(open.blockNote, null);
});

test("to'lovni tasdiqlash: blok faqat superadmin tanlasa ochiladi", { timeout: 20000 }, async () => {
  const plan = await database.getRepository(Plan).findOne({ where: { isActive: true }, order: { id: 'ASC' } });
  assert.ok(plan, 'migratsiyadan tariflar kelishi kerak');
  const invoiceFor = (club, number) =>
    database.getRepository(Invoice).save({
      clubId: club.id,
      planId: plan.id,
      number,
      amount: plan.price,
      discountAmount: 0,
      durationDays: plan.durationDays,
      status: InvoiceStatus.PENDING,
    });
  const stamp = Date.now();

  // Tanlanmasa — obuna uzayadi, blok qoladi (avvalgi qoida)
  const kept = await database.getRepository(Club).save({ name: 'Blok qoladi', status: ClubStatus.TRIAL, trialEndsAt: new Date(Date.now() + DAY_MS) });
  await clubs.setBlocked(kept.id, true, { reason: ClubBlockReason.FREE_PLAN_ABUSE }, actor);
  await billing.confirmInvoice((await invoiceFor(kept, `T-${stamp}-1`)).id, {});
  const keptRow = await reload(kept.id);
  assert.equal(keptRow.status, ClubStatus.BLOCKED);
  assert.equal(keptRow.blockReason, 'free_plan_abuse');
  assert.ok(keptRow.subscriptionEndsAt.getTime() > Date.now());

  // Tanlansa — o'sha tranzaksiyada faol bo'ladi, sabab tozalanadi
  const freed = await database.getRepository(Club).save({ name: 'Blokdan chiqadi', status: ClubStatus.TRIAL, trialEndsAt: new Date(Date.now() + DAY_MS) });
  await clubs.setBlocked(freed.id, true, { reason: ClubBlockReason.FREE_PLAN_ABUSE, note: 'Obuna oling' }, actor);
  await billing.confirmInvoice((await invoiceFor(freed, `T-${stamp}-2`)).id, { unblock: true });
  const freedRow = await reload(freed.id);
  assert.equal(freedRow.status, ClubStatus.ACTIVE);
  assert.equal(freedRow.blockReason, null);
  assert.equal(freedRow.blockNote, null);
  assert.equal(freedRow.blockedAt, null);
});
