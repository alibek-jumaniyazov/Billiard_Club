import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lightFreshUntil } from '../src/modules/tables/light-freshness';

const now = Date.parse('2026-10-12T12:00:00Z');
const input = { syncedAt: new Date(now - 10_000), state: true, error: null,
  mode: 'bridge', forceSyncSec: 60, bridgeSeenAt: new Date(now - 5_000), bridgeActive: true, now };

test('an online bridge cannot make an old relay report current', () => {
  assert.equal(lightFreshUntil({ ...input, syncedAt: new Date(now - 151_000) }), null);
});
test('relay confirmation expires when the bridge heartbeat expires', () => {
  assert.equal(lightFreshUntil(input), new Date(now + 55_000).toISOString());
  assert.equal(lightFreshUntil({ ...input, bridgeSeenAt: new Date(now - 60_000) }), null);
  assert.equal(lightFreshUntil({ ...input, bridgeActive: false }), null);
});
test('command delivery without feedback and error reports never appear confirmed', () => {
  assert.equal(lightFreshUntil({ ...input, state: null }), null);
  assert.equal(lightFreshUntil({ ...input, error: 'timeout' }), null);
  assert.equal(lightFreshUntil({ ...input, mode: 'off' }), null);
});
test('direct installations respect their configured verification interval', () => {
  assert.equal(lightFreshUntil({ ...input, mode: 'direct', forceSyncSec: 600, bridgeSeenAt: null }),
    new Date(now - 10_000 + 1_230_000).toISOString());
});
test('invalid and implausibly future timestamps are not fresh', () => {
  assert.equal(lightFreshUntil({ ...input, syncedAt: 'invalid' }), null);
  assert.equal(lightFreshUntil({ ...input, bridgeSeenAt: new Date(now + 120_000) }), null);
});
