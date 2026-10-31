const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { PlanTiersService } = require('../src/common/plan-tiers/plan-tiers.service');
const { DEFAULT_TIERS } = require('../src/common/plan-tiers/tiers');
const { ClubsService } = require('../src/modules/clubs/clubs.service');
const { StaffService } = require('../src/modules/staff/staff.service');
const { TablesService } = require('../src/modules/tables/tables.service');
const { Club } = require('../src/entities/club.entity');
const { ContractType } = require('../src/entities/contract.entity');
const { PlatformSetting } = require('../src/entities/platform-setting.entity');
const { RefreshSession } = require('../src/entities/refresh-session.entity');
const { Session } = require('../src/entities/session.entity');
const { Table } = require('../src/entities/table.entity');
const { User } = require('../src/entities/user.entity');
const { UserRole } = require('../src/entities/enums');

let database;
let tiers;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
  tiers = new PlanTiersService(database.getRepository(PlatformSetting));
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

const code = (error) => error?.getResponse?.().code;

test('migratsiya: 12 ta tarif (3 daraja × 1/3/6/12 oy), Standart narxlari buyurtmachidan', async () => {
  const plans = await database.query(
    `SELECT code, tier, "durationDays", price::int AS price, "isActive" FROM plans WHERE code LIKE '%\\_%m' ORDER BY "sortOrder"`,
  );
  assert.equal(plans.length, 12);
  const standard = plans.filter((p) => p.tier === 'standard');
  assert.deepEqual(standard.map((p) => p.price), [179000, 499000, 949000, 1790000]);
  assert.deepEqual(standard.map((p) => p.durationDays), [30, 90, 180, 365]);
  assert.ok(plans.every((p) => p.isActive));
  // Mavjud (eski) klublar VIP — hech narsasi yopilmaydi; noto'g'ri daraja bazaga yozilmaydi
  const club = await database.getRepository(Club).save({ name: 'Eski klub' });
  assert.equal((await database.getRepository(Club).findOneBy({ id: club.id })).tier, 'vip');
  await assert.rejects(database.query(`UPDATE clubs SET tier = 'gold' WHERE id = $1`, [club.id]));
});

test("stollar va xodimlar soni tarif cheklovidan oshmaydi (o'chirilgan stol hisobga kirmaydi)", { timeout: 20000 }, async () => {
  const club = await database.getRepository(Club).save({ name: 'Standart klub', tier: 'standard' });
  const tables = new TablesService(database, database.getRepository(Table), database.getRepository(Session), undefined, tiers);
  const max = DEFAULT_TIERS.standard.limits.tables;
  const created = [];
  for (let i = 1; i <= max; i += 1) created.push(await tables.create(club.id, { name: `Stol ${i}`, number: i, pricePerHour: 20000 }));
  await assert.rejects(
    tables.create(club.id, { name: 'Ortiqcha', number: max + 1, pricePerHour: 20000 }),
    (e) => code(e) === 'LIMIT_REACHED',
  );
  // Stolni o'chirsa — o'rni bo'shaydi
  await tables.remove(club.id, created[0].id);
  await tables.create(club.id, { name: 'Yangi', number: max + 1, pricePerHour: 20000 });

  const staff = new StaffService(database.getRepository(User), database.getRepository(RefreshSession), undefined, tiers);
  const staffMax = DEFAULT_TIERS.standard.limits.staff;
  const stamp = Date.now();
  for (let i = 0; i < staffMax; i += 1) {
    await staff.create(club.id, { name: `Xodim ${i}`, username: `tier_staff_${stamp}_${i}`, password: 'parol12345', role: UserRole.KASSIR });
  }
  await assert.rejects(
    staff.create(club.id, { name: 'Ortiqcha', username: `tier_staff_${stamp}_x`, password: 'parol12345', role: UserRole.ADMIN }),
    (e) => code(e) === 'LIMIT_REACHED',
  );

  // Pro ga o'tgach yana qo'shish mumkin
  await database.getRepository(Club).update(club.id, { tier: 'pro' });
  await staff.create(club.id, { name: 'Pro xodim', username: `tier_staff_${stamp}_pro`, password: 'parol12345', role: UserRole.OPERATOR });
});

test("to'lov (shartnoma) klubni sotib olingan darajaga o'tkazadi, sozlama bazada saqlanadi", { timeout: 15000 }, async () => {
  const club = await database.getRepository(Club).save({ name: 'Yangilanadigan klub', tier: 'vip' });
  const clubs = new ClubsService(
    database,
    { notify: () => undefined },
    { get: async () => ({ trialDays: 7, expiryReminderDays: [], trialTier: 'vip' }) },
    database.getRepository(Club),
    database.getRepository(User),
    database.getRepository(RefreshSession),
  );
  await database.transaction((manager) =>
    clubs.applyContractInTransaction(manager, club.id, {
      type: ContractType.QUARTERLY, amount: 499000, durationDays: 90, notes: 'test', tier: 'standard',
    }),
  );
  const after = await database.getRepository(Club).findOneBy({ id: club.id });
  assert.equal(after.tier, 'standard');
  assert.equal(after.status, 'active');

  const config = JSON.parse(JSON.stringify(DEFAULT_TIERS));
  config.standard.limits.tables = 4;
  await tiers.update(config);
  const fresh = new PlanTiersService(database.getRepository(PlatformSetting));
  assert.equal((await fresh.get()).standard.limits.tables, 4);
});
