const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');

test('all migrations apply on an empty PostgreSQL database and remain idempotent', async () => {
  const database = await createDataSource().initialize();
  try {
    const allMigrations = database.migrations;
    database.migrations = allMigrations.filter((migration) => !/Trial(?:Claims|TelegramVerification)/.test(migration.name || migration.constructor.name));
    const applied = await database.runMigrations();
    assert.ok(applied.length > 0, 'Expected a fresh test database');
    await database.query(`INSERT INTO clubs (name, phone, status, "trialEndsAt", "createdAt") VALUES
      ('legacy formatted', '+998 90 123-45-67', 'expired', '2024-01-04', '2024-01-01T00:00:00Z'),
      ('legacy local', '90 123 45 67', 'blocked', '2025-01-04', '2025-01-01T00:00:00Z'),
      ('legacy international', '00998901234567', 'active', '2026-01-04', '2026-01-01T00:00:00Z'),
      ('legacy without phone', NULL, 'expired', '2025-01-04', '2025-01-01T00:00:00Z')`);
    database.migrations = allMigrations;
    await database.runMigrations();
    assert.equal(await database.showMigrations(), false);
    assert.deepEqual(await database.runMigrations(), []);
    const [{ clubs, users }] = await database.query(
      `SELECT to_regclass('public.clubs') AS clubs, to_regclass('public.users') AS users`,
    );
    assert.equal(clubs, 'clubs');
    assert.equal(users, 'users');
    const legacyClaims = await database.query('SELECT phone, "claimedAt" FROM trial_claims WHERE phone=$1', ['998901234567']);
    assert.equal(legacyClaims.length, 1);
    assert.equal(legacyClaims[0].claimedAt.toISOString(), '2024-01-01T00:00:00.000Z');
    const variants = [
      ['+677123456', '677123456'],
      ['00677123456', '677123456'],
      ['677123456', '998677123456'],
      ['+998 90 123-45-67', '998901234567'],
      ['90 123 45 67', '998901234567'],
      ['-------', null],
      ['123abc456', null],
      ['+1234567890123456', null],
    ];
    for (const [input, expected] of variants) {
      const [{ phone }] = await database.query('SELECT canonical_trial_phone($1) AS phone', [input]);
      assert.equal(phone, expected, `SQL phone normalization: ${input}`);
    }
  } finally {
    await database.destroy();
  }
});
