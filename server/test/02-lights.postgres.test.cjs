const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { LightsService } = require('../src/modules/lights/lights.service');
const { TablesService } = require('../src/modules/tables/tables.service');
const { ReservationsService } = require('../src/modules/reservations/reservations.service');
const { Club } = require('../src/entities/club.entity');
const { Table } = require('../src/entities/table.entity');
const { Session } = require('../src/entities/session.entity');
const { Settings } = require('../src/entities/settings.entity');
const { ClubBridge } = require('../src/entities/club-bridge.entity');
const { TableLightEvent } = require('../src/entities/table-light-event.entity');
const { Reservation } = require('../src/entities/reservation.entity');
const { LightDriver, LightMode } = require('../src/entities/enums');

let database;
let nextClub = 0;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

async function fixture(count = 1, timezone = 'Asia/Tashkent') {
  const club = await database.getRepository(Club).save({ name: `Light integration ${++nextClub}` });
  await database.getRepository(Settings).save({ clubId: club.id, timezone, lightMode: LightMode.BRIDGE, lightVerify: true });
  const tables = await database.getRepository(Table).save(Array.from({ length: count }, (_, index) => ({
    clubId: club.id, name: `Table ${index + 1}`, number: index + 1, pricePerHour: 25000,
  })));
  const service = new LightsService(database, database.getRepository(Table), database.getRepository(Settings),
    database.getRepository(ClubBridge), database.getRepository(TableLightEvent));
  return { club, tables, service };
}

const deviceSettings = (channel = 0) => ({ driver: LightDriver.SHELLY_GEN2, host: '192.168.30.20', channel });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('concurrent same-club assignments cannot allocate one output twice; another club stays independent', { timeout: 10000 }, async () => {
  const first = await fixture(2);
  const other = await fixture();
  const lock = database.createQueryRunner();
  await lock.connect();
  await lock.startTransaction();
  let pending;
  try {
    await lock.query('SELECT pg_advisory_xact_lock($1, $2)', [23918, first.club.id]);
    pending = Promise.allSettled(first.tables.map((table) => first.service.updateTableDevice(first.club.id, table.id, deviceSettings())));
    // Wait for both actual SQL transactions to reach the held advisory lock.
    const deadline = Date.now() + 3000;
    let waiting = 0;
    do {
      [{ count: waiting }] = await database.query(
        'SELECT count(*)::int AS count FROM pg_locks WHERE locktype=\'advisory\' AND classid=$1 AND objid=$2 AND NOT granted',
        [23918, first.club.id]);
      if (waiting < 2) await pause(10);
    } while (waiting < 2 && Date.now() < deadline);
    assert.equal(waiting, 2, 'Both setup transactions must really contend');
    // Identical LAN addresses are valid in different clubs and must not wait.
    await other.service.updateTableDevice(other.club.id, other.tables[0].id, deviceSettings());
    await lock.commitTransaction();
    const results = await pending;
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.getStatus(), 400);
    assert.match(rejected.reason.message, /rele chiqishi/);
    const rows = await database.query('SELECT "lightDriver" FROM tables WHERE "clubId"=$1', [first.club.id]);
    assert.equal(rows.filter((row) => row.lightDriver === LightDriver.SHELLY_GEN2).length, 1);
    const loser = results.findIndex((result) => result.status === 'rejected');
    await first.service.updateTableDevice(first.club.id, first.tables[loser].id, deviceSettings(1));
  } finally {
    if (lock.isTransactionActive) await lock.rollbackTransaction();
    await pending;
    await lock.release();
  }
});

test('a device update invalidates an older bridge revision and current readback persists precisely', async () => {
  const { club, tables: [table], service } = await fixture();
  await service.updateTableDevice(club.id, table.id, deviceSettings());
  const old = (await service.bridgeState(club.id)).devices[0];
  await service.updateTableDevice(club.id, table.id, { host: '192.168.30.21' });
  const report = { tableId: table.id, ok: true, on: false, actual: false };
  assert.equal(await service.applyReport(club.id, [{ ...report, commandRevision: old.commandRevision }]), 0);
  const current = (await service.bridgeState(club.id)).devices[0];
  assert.notEqual(current.commandRevision, old.commandRevision);
  assert.equal(await service.applyReport(club.id, [{ ...report, commandRevision: current.commandRevision }]), 1);
  const saved = await database.getRepository(Table).findOneByOrFail({ id: table.id });
  assert.equal(saved.lightState, false);
  assert.equal(saved.lightError, null);
  assert.ok(saved.lightSyncedAt instanceof Date);
  assert.equal(await service.applyReport(club.id + 100000, [{ ...report, commandRevision: current.commandRevision }]), 0);
});

test('optimistic report write cannot overwrite configuration changed after revision validation', async () => {
  const { club, tables: [table], service } = await fixture();
  await service.updateTableDevice(club.id, table.id, deviceSettings());
  const target = (await service.bridgeState(club.id)).devices[0];
  const original = service.recordResult.bind(service);
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  let entered;
  const validated = new Promise((resolve) => { entered = resolve; });
  service.recordResult = async (...args) => { entered(); await hold; return original(...args); };
  const report = service.applyReport(club.id, [{ tableId: table.id, ok: true, on: false, actual: false, commandRevision: target.commandRevision }]);
  await validated;
  try {
    await service.updateTableDevice(club.id, table.id, { channel: 1 });
  } finally { release(); }
  assert.equal(await report, 0);
  const saved = await database.getRepository(Table).findOneByOrFail({ id: table.id });
  assert.equal(saved.lightChannel, 1);
  assert.equal(saved.lightState, null);
  assert.equal(saved.lightSyncedAt, null);
});

test('actual tables SQL joins report freshness with the correct club bridge heartbeat', async () => {
  const { club, tables: [table] } = await fixture();
  const now = new Date();
  await database.getRepository(Table).update(table.id, { lightDriver: LightDriver.SHELLY_GEN2, lightState: true, lightSyncedAt: now });
  await database.getRepository(ClubBridge).save({ clubId: club.id, tokenHash: `integration-${club.id}`.padEnd(64, '0'), lastSeenAt: now });
  const service = new TablesService(database, database.getRepository(Table), database.getRepository(Session));
  let [view] = await service.findAll(club.id);
  assert.equal(view.id, table.id);
  assert.equal(view.lightControl, true);
  assert.ok(new Date(view.lightFreshUntil).getTime() > Date.now());
  assert.ok(new Date(view.lightFreshUntil).getTime() <= now.getTime() + 60000);
  const publicView = JSON.parse(JSON.stringify(view));
  assert.equal('lightHost' in publicView, false);
  assert.equal('lightAuth' in publicView, false);
  await database.getRepository(ClubBridge).update({ clubId: club.id }, { lastSeenAt: new Date(Date.now() - 61000) });
  [view] = await service.findAll(club.id);
  assert.equal(view.lightFreshUntil, null);
  await database.getRepository(Settings).update({ clubId: club.id }, { lightMode: LightMode.DIRECT, lightForceSyncSec: 300 });
  [view] = await service.findAll(club.id);
  assert.ok(new Date(view.lightFreshUntil).getTime() > Date.now() + 500000);
  await database.getRepository(Table).update(table.id, { lightState: null });
  [view] = await service.findAll(club.id);
  assert.equal(view.lightFreshUntil, null);
});

test('reservations return club timezone and include only that local calendar day', async () => {
  const { club, tables: [table] } = await fixture(1, 'Asia/Tashkent');
  const timestamps = ['2026-10-11T18:59:59.000Z', '2026-10-11T19:00:00.000Z',
    '2026-10-12T18:59:59.999Z', '2026-10-12T19:00:00.000Z'];
  const records = await database.getRepository(Reservation).save(timestamps.map((timestamp, index) => ({
    clubId: club.id, tableId: table.id, startsAt: new Date(timestamp), customerName: `Guest ${index}`,
  })));
  const service = new ReservationsService(database, database.getRepository(Reservation));
  const response = await service.findAll(club.id, { from: '2026-10-12', to: '2026-10-12' });
  assert.equal(response.timezone, 'Asia/Tashkent');
  assert.deepEqual(response.data.map((row) => row.id), [records[1].id, records[2].id]);
  assert.equal(response.pagination.total, 2);
});
