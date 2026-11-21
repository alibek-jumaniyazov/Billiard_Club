const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { addConnectRetry } = require('../src/common/db/pool-retry');

/**
 * Prod xatosi: "Connection terminated due to connection timeout" — yangi ulanish
 * vaqtida ochilmadi. Haqiqiy TypeORM + pg pool da: bitta ulanish xatosi so'rovni
 * yiqitmaydi (TypeORM ulanishni callback shaklida so'raydi — shu yo'l tekshiriladi).
 */

let database;
before(async () => {
  database = await createDataSource().initialize();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

test('TypeORM pool: bitta ulanish xatosidan keyin so‘rov baribir bajariladi', { timeout: 15000 }, async () => {
  const pool = database.driver.master;
  const real = pool.connect.bind(pool);
  let failures = 1;
  // Birinchi ulanish xuddi prod dagidek vaqt tugashi bilan uziladi
  pool.connect = (...args) => {
    if (failures > 0) {
      failures -= 1;
      const err = new Error('Connection terminated due to connection timeout');
      if (typeof args[0] === 'function') {
        args[0](err);
        return undefined;
      }
      return Promise.reject(err);
    }
    return real(...args);
  };
  const retried = [];
  addConnectRetry(pool, { retries: 1, baseDelayMs: 0, onRetry: (_err, attempt) => retried.push(attempt) });

  const rows = await database.query('SELECT 1 AS ok');
  assert.equal(Number(rows[0].ok), 1);
  assert.equal(failures, 0);
  assert.deepEqual(retried, [1]);

  // Tranzaksiya ham (QueryRunner orqali) odatdagidek ishlaydi
  const value = await database.transaction(async (manager) => (await manager.query('SELECT 2 AS ok'))[0].ok);
  assert.equal(Number(value), 2);
});
