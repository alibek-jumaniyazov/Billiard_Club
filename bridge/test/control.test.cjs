const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { executeDevice, logicalState } = require('../lib/control');
const httpDevice = require('../lib/http-device');
const { fetchWithTimeout } = require('../lib/common');

async function relay(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const host = `127.0.0.1:${server.address().port}`;
  return { server, host };
}

const device = { tableId: 1, driver: 'shelly_gen2', channel: 0, desired: true };
const fastSleep = async () => {};
const ctx = { timeoutMs: 500, log: () => {} };

test('HTTP 200 with an unchanged relay is a failed command, retried at most three times', async (t) => {
  let writes = 0;
  const { host } = await relay(t, (req, res) => {
    if (req.url.startsWith('/rpc/Switch.Set')) writes += 1;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.startsWith('/rpc/Switch.Set') ? { was_on: false } : { output: false }));
  });
  const target = { ...device, host };
  const result = await executeDevice(target, {
    verify: true, forced: false, sleep: fastSleep,
    write: (physical) => httpDevice.apply(target, physical, 0, ctx),
    read: () => httpDevice.read(target, 0, ctx),
  });
  assert.equal(result.ok, false);
  assert.equal(result.actual, false);
  assert.equal(result.attempts, 3);
  assert.equal(writes, 3);
});

test('a relay which settles after the first read is confirmed without a duplicate write', async () => {
  let reads = 0;
  let writes = 0;
  const result = await executeDevice(device, {
    verify: true, forced: false, sleep: fastSleep,
    write: async () => { writes += 1; }, read: async () => ++reads > 1,
  });
  assert.equal(result.ok, true);
  assert.equal(result.actual, true);
  assert.equal(writes, 1);
});

test('missing readback never confirms a readable relay, while write-only delivery remains unconfirmed', async () => {
  const deps = { verify: true, forced: false, sleep: fastSleep, write: async () => {}, read: async () => null };
  const missing = await executeDevice(device, deps);
  assert.equal(missing.ok, false);
  assert.equal(missing.actual, null);
  const writeOnly = await executeDevice({ ...device, driver: 'tcp' }, deps);
  assert.equal(writeOnly.ok, true);
  assert.equal(writeOnly.actual, null);
  assert.equal(writeOnly.attempts, 1);
});

test('complete readback handles normally closed relays and refuses partial channel success', async () => {
  assert.equal(logicalState([false, false], true, true), true);
  assert.equal(logicalState([true, null], false, true), null);
  assert.equal(logicalState([true, false], false, true), false);
  assert.equal(logicalState([true, false], false, false), true);
  let physical;
  const result = await executeDevice({ ...device, inverted: true }, {
    verify: true, forced: false, sleep: fastSleep,
    write: async (value) => { physical = value; }, read: async () => !physical,
  });
  assert.equal(physical, false);
  assert.equal(result.actual, true);
});

test('HTTP body timeout still aborts after response headers have arrived', async (t) => {
  const { host } = await relay(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"output":'); // Deliberately never finish.
  });
  const started = Date.now();
  await assert.rejects(fetchWithTimeout(`http://${host}/`, {}, 100));
  assert.ok(Date.now() - started < 1500);
});

test('bridge requests do not follow redirects or expose a token to a redirect target', async (t) => {
  let leaked = false;
  const target = await relay(t, (_req, res) => { leaked = true; res.end('leaked'); });
  const origin = await relay(t, (_req, res) => { res.writeHead(302, { Location: `http://${target.host}/` }); res.end(); });
  const response = await fetchWithTimeout(`http://${origin.host}/`, { headers: { 'X-Bridge-Token': 'test-only' } }, 500);
  assert.equal(response.status, 302);
  assert.equal(leaked, false);
});

test('Home Assistant accepts a pasted Bearer prefix exactly once', async (t) => {
  let authorization;
  const { host } = await relay(t, (req, res) => { authorization = req.headers.authorization; res.end('[]'); });
  await httpDevice.apply({ driver: 'home_assistant', host, auth: 'Bearer test-only', config: { entityId: 'switch.table1' } }, true, 0, ctx);
  assert.equal(authorization, 'Bearer test-only');
});

test('a relay that failed last cycle gets a single attempt instead of three', async () => {
  let writes = 0;
  const result = await executeDevice({ ...device, host: '127.0.0.1:9' }, {
    verify: true, forced: false, sleep: fastSleep, delays: [0],
    write: async () => { writes += 1; throw new Error('connect ECONNREFUSED'); },
    read: async () => null,
  });
  assert.equal(result.ok, false);
  assert.equal(writes, 1);
  assert.equal(result.attempts, 1);
  assert.match(result.error, /ECONNREFUSED/);
});
