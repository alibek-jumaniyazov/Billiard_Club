/*
 * Runs integration tests in a fresh, disposable PostgreSQL database.
 *
 * Local: node test/run-postgres-tests.cjs (requires PostgreSQL binaries).
 * CI: TEST_POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres
 *     node test/run-postgres-tests.cjs
 *
 * TEST_POSTGRES_URL only identifies a server on which to CREATE a new test
 * database. Application DB_* variables and .env files are never used.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { Client } = require('pg');

const serverDir = path.resolve(__dirname, '..');
const databaseName = `prime_billiard_test_${crypto.randomBytes(10).toString('hex')}`;
let clusterDirectory;
let pgCtl;
let postgresStarted = false;
let admin;
let databaseCreated = false;
let testProcess;
let interrupted = false;

function command(binary, args) {
  const result = spawnSync(binary, args, {
    cwd: serverDir,
    encoding: 'utf8',
    // postgres started by pg_ctl must not inherit a captured Node pipe; on
    // Windows that would keep spawnSync open after pg_ctl itself exits.
    stdio: 'ignore',
    windowsHide: true,
    timeout: 30_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(binary)} failed: ${result.error?.message || `exit status ${result.status}`}`);
  }
}

function findBinary(name) {
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [];
  if (process.env.PG_BIN) candidates.push(path.join(process.env.PG_BIN, executable));
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (dir) candidates.push(path.join(dir, executable));
  }
  const locations = process.platform === 'win32'
    ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL')]
    : ['/usr/lib/postgresql', '/opt/homebrew/opt', '/usr/local/opt'];
  for (const location of locations) {
    if (!fs.existsSync(location)) continue;
    for (const entry of fs.readdirSync(location).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      candidates.push(path.join(location, entry, 'bin', executable));
    }
  }
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`PostgreSQL ${executable} not found. Set PG_BIN or TEST_POSTGRES_URL to a test PostgreSQL server.`);
  }
  return found;
}

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function startPostgres() {
  if (process.env.TEST_POSTGRES_URL) return new URL(process.env.TEST_POSTGRES_URL);
  const initdb = findBinary('initdb');
  pgCtl = findBinary('pg_ctl');
  clusterDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'prime-billiard-tests-'));
  const dataDirectory = path.join(clusterDirectory, 'data');
  command(initdb, ['-D', dataDirectory, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
  const port = await freePort();
  const logFile = path.join(clusterDirectory, 'postgres.log');
  // Even a failed/timeout start can leave a live server. Cleanup must attempt
  // its shutdown before any directory removal.
  postgresStarted = true;
  try {
    command(pgCtl, [
      '-D', dataDirectory, '-l', logFile,
      '-o', `-h 127.0.0.1 -p ${port} -F`,
      '-w', '-t', '20', 'start',
    ]);
  } catch (error) {
    const output = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    throw new Error(`${error.message}\n${output}`);
  }
  return new URL(`postgres://postgres@127.0.0.1:${port}/postgres`);
}

async function cleanup() {
  const errors = [];
  if (admin) {
    try {
      if (databaseCreated) {
        assert.match(databaseName, /^prime_billiard_test_[a-f0-9]{20}$/);
        await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [databaseName]);
        await admin.query(`DROP DATABASE "${databaseName}"`);
      }
    } catch (error) {
      errors.push(error);
    } finally {
      try { await admin.end(); } catch (error) { errors.push(error); }
    }
  }
  if (postgresStarted) {
    try {
      command(pgCtl, ['-D', path.join(clusterDirectory, 'data'), '-m', 'immediate', '-w', '-t', '20', 'stop']);
      postgresStarted = false;
    } catch (error) {
      errors.push(error);
    }
  }
  if (clusterDirectory && !postgresStarted) {
    // Resolve and verify the exact disposable target before recursive removal.
    try {
      const resolved = fs.realpathSync(clusterDirectory);
      const temporaryRoot = fs.realpathSync(os.tmpdir());
      assert.equal(path.dirname(resolved), temporaryRoot);
      assert.match(path.basename(resolved), /^prime-billiard-tests-[A-Za-z0-9]+$/);
      fs.rmSync(resolved, { recursive: true, force: true });
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new Error(errors.map((error) => error.message).join('; '));
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true;
    testProcess?.kill(signal);
  });
}

(async () => {
  try {
    const connection = await startPostgres();
    admin = new Client({ connectionString: connection.toString(), connectionTimeoutMillis: 5000 });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    connection.pathname = `/${databaseName}`;
    const files = process.argv.slice(2);
    if (!files.length) {
      files.push(...fs.readdirSync(__dirname)
        .filter((filename) => filename.endsWith('.postgres.test.cjs'))
        .sort().map((filename) => path.join(__dirname, filename)));
    }
    assert.ok(files.length, 'No PostgreSQL integration tests found');
    if (interrupted) throw new Error('Tests interrupted before execution');
    console.log(`Running ${files.length} PostgreSQL integration test file(s) in a disposable database.`);
    const exitCode = await new Promise((resolve, reject) => {
      testProcess = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], {
        cwd: serverDir,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TS_NODE_PROJECT: path.join(serverDir, 'tsconfig.json'),
          TEST_DATABASE_URL: connection.toString(),
        },
        stdio: 'inherit',
        windowsHide: true,
      });
      testProcess.once('error', reject);
      testProcess.once('exit', (code) => resolve(code ?? 1));
    });
    process.exitCode = interrupted ? 1 : exitCode;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.error(`Test cleanup failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
})();
