const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { mkdtempSync, unlinkSync, rmdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');

test('running agent retries a lost report and applies a new channel even if desired stays ON', { timeout: 10000 }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'billiard-bridge-test-'));
  const stateFile = join(directory, 'state.json');
  const reports = [];
  const writes = [];
  const outputs = [false, false];
  let complete;
  const done = new Promise((resolve) => { complete = resolve; });
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/bridge/state')) {
      const changed = reports.length >= 2;
      const revision = (changed ? 'b' : 'a').repeat(64);
      const target = {
        tableId: 1, tableNumber: 1, driver: 'shelly_gen2', host: `127.0.0.1:${server.address().port}`,
        channel: changed ? 1 : 0, inverted: false, desired: true, commandRevision: revision,
      };
      // Short local long-poll so the test exercises several real loop cycles.
      setTimeout(() => res.end(JSON.stringify({ success: true, data: {
        version: revision, forceSyncMs: 60000, verify: true, devices: [target], tasks: [],
      } })), 30);
    } else if (req.url === '/api/bridge/report') {
      let body = '';
      for await (const chunk of req) body += chunk;
      reports.push(JSON.parse(body).results[0]);
      if (reports.length === 1) {
        res.writeHead(503);
        res.end('{}');
      } else {
        res.end(JSON.stringify({ success: true, data: { accepted: 1 } }));
      }
      if (reports.length === 3) complete();
    } else {
      const url = new URL(req.url, 'http://relay.test');
      const channel = Number(url.searchParams.get('id'));
      if (url.pathname === '/rpc/Switch.Set') {
        writes.push(channel);
        outputs[channel] = url.searchParams.get('on') === 'true';
        res.end(JSON.stringify({ was_on: false }));
      } else res.end(JSON.stringify({ output: outputs[channel] }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(process.execPath, [resolve(__dirname, '../agent.js')], {
    env: { ...process.env, SERVER_URL: `http://127.0.0.1:${server.address().port}`,
      BRIDGE_TOKEN: 'local-test-only', STATE_FILE: stateFile, CACHE_SECRETS: '0' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-5000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-5000); });
  t.after(async () => {
    child.kill();
    await new Promise((resolve) => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    server.closeAllConnections();
    server.close();
    for (const file of [stateFile, `${stateFile}.tmp`]) { try { unlinkSync(file); } catch {} }
    rmdirSync(directory);
  });
  let deadline;
  try {
    await Promise.race([done, new Promise((_resolve, reject) => {
      deadline = setTimeout(() => reject(new Error(`Agent never completed three reports: ${output}`)), 7000);
    })]);
  } finally { clearTimeout(deadline); }
  assert.deepEqual(writes.slice(0, 3), [0, 0, 1]);
  assert.deepEqual(reports.slice(0, 3).map((item) => item.commandRevision), ['a'.repeat(64), 'a'.repeat(64), 'b'.repeat(64)]);
  assert.ok(reports.slice(0, 3).every((item) => item.ok === true && item.actual === true));
});
