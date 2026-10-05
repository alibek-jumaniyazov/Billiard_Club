const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({
  project: path.join(__dirname, '..', 'tsconfig.json'),
  transpileOnly: true,
});
require('reflect-metadata');
const { DataSource } = require('typeorm');
const { ALL_ENTITIES } = require('../src/entities');

function createDataSource() {
  assert.ok(process.env.TEST_DATABASE_URL, 'Use node test/run-postgres-tests.cjs to create an isolated test database');
  const connection = new URL(process.env.TEST_DATABASE_URL);
  assert.match(connection.pathname, /^\/prime_billiard_test_[a-f0-9]{20}$/, 'Refusing to test against a non-test database');
  return new DataSource({
    type: 'postgres',
    url: connection.toString(),
    entities: ALL_ENTITIES,
    migrations: [path.join(__dirname, '..', 'src', 'database', 'migrations', '*.ts')],
    synchronize: false,
    logging: false,
    extra: {
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      idle_in_transaction_session_timeout: 15000,
      max: 10,
    },
  });
}

module.exports = { createDataSource };
