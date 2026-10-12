import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataSource, Repository } from 'typeorm';
import { Table } from '../src/entities/table.entity';
import { Settings } from '../src/entities/settings.entity';
import { ClubBridge } from '../src/entities/club-bridge.entity';
import { TableLightEvent } from '../src/entities/table-light-event.entity';
import { LightDriver, LightMode } from '../src/entities/enums';
import { LightDeviceState, LightsService } from '../src/modules/lights/lights.service';
import { readLight } from '../src/modules/lights/drivers/light-driver';
import { lightOutputKeys } from '../src/modules/lights/device-outputs';
import { LightsController } from '../src/modules/lights/lights.controller';
import { User } from '../src/entities/user.entity';

const device: LightDeviceState = {
  tableId: 1, tableNumber: 1, tableName: 'Test table', driver: LightDriver.SHELLY_GEN2,
  host: '192.168.20.10', channel: 0, inverted: false, auth: null, onUrl: null, offUrl: null,
  config: null, desired: true, commandRevision: 'a'.repeat(64),
};
const settings = { mode: LightMode.BRIDGE, verify: true, forceSyncSec: 60, offOnPause: false, offDelaySec: 0, preOnMinutes: 0 };

function harness() {
  const row = { id: 1, clubId: 7, lightState: true as boolean | null, lightError: null as string | null, lightSyncedAt: null as Date | null };
  const events: Array<Partial<TableLightEvent>> = [];
  const repository = {
    findOne: async ({ where }: { where: { id: number; clubId: number } }) => where.id === 1 && where.clubId === 7 ? { ...row } : null,
    update: async (_where: unknown, patch: Partial<typeof row>) => { Object.assign(row, patch); return { affected: 1 }; },
  } as unknown as Repository<Table>;
  const service = new LightsService({} as DataSource, repository, {} as Repository<Settings>, {} as Repository<ClubBridge>, {
    insert: async (entries: Array<Partial<TableLightEvent>>) => { events.push(...entries); },
  } as unknown as Repository<TableLightEvent>);
  service.bridgeState = async () => ({ settings, devices: [{ ...device }], version: 'current', timeSensitive: false });
  return { service, row, events };
}

test('bridge HTTP success is rejected when actual relay output contradicts the command', async () => {
  const { service, row } = harness();
  const accepted = await service.applyReport(7, [{ tableId: 1, ok: true, on: true, actual: false, commandRevision: device.commandRevision }]);
  assert.equal(accepted, 1);
  assert.equal(row.lightState, false);
  assert.match(row.lightError!, /holat mos kelmadi/);
  assert.equal(row.lightSyncedAt, null);
});

test('missing readback on a readable relay clears stale state and records verification failure', async () => {
  const { service, row } = harness();
  await service.applyReport(7, [{ tableId: 1, ok: true, on: true, actual: null }]);
  assert.equal(row.lightState, null);
  assert.match(row.lightError!, /tasdiqlab/);
});

test('write-only command delivery remains unknown rather than a fabricated true state', async () => {
  const { service, row } = harness();
  service.bridgeState = async () => ({ settings, devices: [{ ...device, driver: LightDriver.HTTP }], version: 'current', timeSensitive: false });
  await service.applyReport(7, [{ tableId: 1, ok: true, on: true, actual: null }]);
  assert.equal(row.lightState, null);
  assert.equal(row.lightError, null);
  assert.ok(row.lightSyncedAt instanceof Date);
});

test('obsolete revisions, opposite targets and other-club table IDs cannot overwrite current state', async () => {
  const { service, row } = harness();
  const before = { ...row };
  const accepted = await service.applyReport(7, [
    { tableId: 1, ok: true, on: true, actual: false, commandRevision: 'b'.repeat(64) },
    { tableId: 1, ok: true, on: false, actual: false },
    { tableId: 2, ok: true, on: true, actual: true },
  ]);
  assert.equal(accepted, 0);
  assert.deepEqual(row, before);
});

test('a bridge report cannot update state after the club switches to OFF', async () => {
  const { service, row } = harness();
  service.bridgeState = async () => ({ settings: { ...settings, mode: LightMode.OFF }, devices: [], version: 'off', timeSensitive: false });
  assert.equal(await service.applyReport(7, [{ tableId: 1, ok: true, on: true, actual: true }]), 0);
  assert.equal(row.lightSyncedAt, null);
});

test('readback success clears an error and records a recovery even when the boolean did not change', async () => {
  const { service, row, events } = harness();
  row.lightError = 'Old connection failure';
  await service.applyReport(7, [{ tableId: 1, ok: true, on: true, actual: true }]);
  assert.equal(row.lightError, null);
  assert.equal(row.lightState, true);
  assert.ok(row.lightSyncedAt instanceof Date);
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, true);
});

test('all configured channels must be readable and consistent; unknown Tasmota text is not OFF', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/cm?')) return Response.json({ POWER1: 'unavailable' });
    if (url.includes('id=1')) return Response.json({ unexpected: true });
    return Response.json({ output: true });
  });
  assert.equal(await readLight({ ...device, config: { channels: [1] } }, 500, true), null);
  assert.equal(await readLight({ ...device, driver: LightDriver.TASMOTA }, 500, false), null);
});

test('multi-channel drift is returned for both desired ON and desired OFF', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => Response.json({ output: String(input).includes('id=0') }));
  const target = { ...device, config: { channels: [1] } };
  assert.equal(await readLight(target, 500, true), false);
  assert.equal(await readLight(target, 500, false), true);
});

test('queued DIRECT commands reread the latest session target and never run concurrently for one table', async () => {
  const { service } = harness();
  service.clubLightSettings = async () => ({ ...settings, mode: LightMode.DIRECT });
  let desired = true;
  service.desiredState = async () => [{ ...device, desired }];
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const blocker = new Promise<void>((resolve) => { release = resolve; });
  const writes: boolean[] = [];
  let active = 0;
  let maxActive = 0;
  const internal = service as unknown as { applyDeviceNow: (clubId: number, target: LightDeviceState) => Promise<null> };
  internal.applyDeviceNow = async (_clubId, target) => {
    maxActive = Math.max(maxActive, ++active);
    writes.push(target.desired);
    if (writes.length === 1) { started(); await blocker; }
    active -= 1;
    return null;
  };
  const first = service.syncTable(7, 1);
  await entered;
  const queued = service.syncTable(7, 1); // Begins with the previous true snapshot.
  desired = false;
  release();
  await Promise.all([first, queued]);
  assert.equal(maxActive, 1);
  assert.deepEqual(writes, [true, false]);
});

test('renewing a same-state manual test changes the revision and wakes a bridge', async () => {
  let until = new Date('2026-01-01T00:05:00Z');
  const source = { query: async () => [{ ...device, overrideOn: true, overrideActive: true, overrideUntil: until,
    sessionStatus: null, offOnPause: false, graceActive: false, preOnActive: false, offDelaySec: 0, preOnMinutes: 0 }] } as unknown as DataSource;
  const service = new LightsService(source, {} as Repository<Table>, {} as Repository<Settings>, {} as Repository<ClubBridge>, {} as Repository<TableLightEvent>);
  service.clubLightSettings = async () => settings;
  const first = await service.bridgeState(7);
  until = new Date('2026-01-01T00:06:00Z');
  const second = await service.bridgeState(7);
  assert.equal(first.devices[0].desired, second.devices[0].desired);
  assert.notEqual(first.devices[0].commandRevision, second.devices[0].commandRevision);
  assert.notEqual(first.version, second.version);
});

test('shared output detection includes extra channels, default ports and Modbus unit IDs', () => {
  const first = lightOutputKeys({ ...device, config: { channels: [2] } });
  const same = lightOutputKeys({ ...device, driver: LightDriver.SHELLY_GEN1, channel: 2, host: `${device.host}:80` });
  assert.ok(same.some((key) => first.includes(key)));
  assert.ok(!lightOutputKeys({ ...device, channel: 3 }).some((key) => first.includes(key)));
  const modbus = { ...device, driver: LightDriver.MODBUS_TCP };
  assert.notDeepEqual(lightOutputKeys({ ...modbus, config: { unitId: 1 } }), lightOutputKeys({ ...modbus, config: { unitId: 2 } }));
  assert.deepEqual(lightOutputKeys({ ...modbus, host: `${device.host}:502` }), lightOutputKeys(modbus));
});

test('DIRECT execution does not save commanded state when readback is missing or disabled', async (t) => {
  const previous = process.env.LIGHTS_DIRECT_ALLOWED_CIDRS;
  process.env.LIGHTS_DIRECT_ALLOWED_CIDRS = '192.168.20.0/24';
  t.after(() => {
    if (previous === undefined) delete process.env.LIGHTS_DIRECT_ALLOWED_CIDRS;
    else process.env.LIGHTS_DIRECT_ALLOWED_CIDRS = previous;
  });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ was_on: false }));
  for (const verify of [true, false]) {
    const { service, row } = harness();
    service.clubLightSettings = async () => ({ ...settings, mode: LightMode.DIRECT, verify });
    service.desiredState = async () => [{ ...device }];
    await service.syncTable(7, 1);
    assert.equal(row.lightState, null);
    if (verify) assert.match(row.lightError!, /tasdiqlab/);
    else { assert.equal(row.lightError, null); assert.ok(row.lightSyncedAt instanceof Date); }
  }
});

test('public test response distinguishes a queued bridge command from unconfirmed direct delivery', async () => {
  const { service } = harness();
  const controller = new LightsController(service);
  service.bridgeStatus = async () => ({ exists: true, name: 'Test', lastSeenAt: new Date(), online: true, agentVersion: '2.1.0' });
  service.testDevice = async () => ({ ok: false, error: null, reason: 'queued' });
  const queued = await controller.test(7, 1, { on: true }, { id: 3 } as User, 'uz');
  assert.equal(queued.data.queued, true);
  assert.equal(queued.data.ok, false);
  assert.equal(queued.data.reason, 'queued');
  service.testDevice = async () => ({ ok: true, error: null, reason: 'unconfirmed' });
  const delivered = await controller.test(7, 1, { on: true }, { id: 3 } as User, 'uz');
  assert.equal(delivered.data.queued, false);
  assert.equal(delivered.data.reason, 'unconfirmed');
  assert.match(delivered.message, /tasdiqlanmadi/);
});
