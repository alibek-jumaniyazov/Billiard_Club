import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { isTransientDbConnectError } from '../src/common/db/transient-db-error';
import { addConnectRetry } from '../src/common/db/pool-retry';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TelegramService } from '../src/telegram/telegram.service';

/**
 * Bazaga ulanish bir lahza bo'lmaganda (prod: "Connection terminated due to
 * connection timeout") server o'zi qayta urinadi, foydalanuvchiga 503 qaytadi
 * va Telegramga faqat muammo davom etsa bitta jamlangan xabar ketadi.
 */

const poolTimeout = () => new Error('Connection terminated due to connection timeout', { cause: new Error('Connection terminated unexpectedly') });

test('ulanishdagi vaqtinchalik xatolar aniqlanadi, so‘rov xatolari esa yo‘q', () => {
  assert.equal(isTransientDbConnectError(poolTimeout()), true);
  assert.equal(isTransientDbConnectError(new Error('timeout exceeded when trying to connect')), true);
  assert.equal(isTransientDbConnectError(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })), true);
  const startingUp = new QueryFailedError('SELECT 1', [], Object.assign(new Error('the database system is starting up'), { code: '57P03' }));
  assert.equal(isTransientDbConnectError(startingUp), true);
  const syntax = new QueryFailedError('SELEC 1', [], Object.assign(new Error('syntax error at or near "SELEC"'), { code: '42601' }));
  assert.equal(isTransientDbConnectError(syntax), false);
  assert.equal(isTransientDbConnectError(new Error('Cannot read properties of undefined')), false);
  assert.equal(isTransientDbConnectError(null), false);
});

test('pool: ulanish ochilmasa bir marta qayta urinadi (Promise va TypeORM callback shakli)', async () => {
  const client = { released: [] as unknown[], release(err?: unknown) { this.released.push(err ?? 'ok'); } };
  let calls = 0;
  const pool = {
    connect: async () => {
      calls += 1;
      if (calls === 1) throw poolTimeout();
      return client;
    },
  };
  const retried: number[] = [];
  addConnectRetry(pool, { retries: 1, baseDelayMs: 0, sleep: async () => {}, onRetry: (_err, attempt) => retried.push(attempt) });

  assert.equal(await (pool.connect as () => Promise<unknown>)(), client);
  assert.equal(calls, 2);
  assert.deepEqual(retried, [1]);

  // TypeORM: pool.connect((err, connection, release) => ...)
  calls = 0;
  const result = await new Promise<{ err: unknown; got: unknown; release: (e?: unknown) => void }>((resolve) => {
    (pool.connect as (cb: (err: unknown, got: unknown, release: (e?: unknown) => void) => void) => void)(
      (err, got, release) => resolve({ err, got, release }),
    );
  });
  assert.equal(result.err, undefined);
  assert.equal(result.got, client);
  result.release();
  assert.deepEqual(client.released, ['ok']);
});

test('pool: kod xatosi va tugagan urinishlar qayta urinilmaydi — xato o‘z holicha qaytadi', async () => {
  let calls = 0;
  const pool = { connect: async () => { calls += 1; throw new Error('password authentication failed for user "x"'); } };
  addConnectRetry(pool, { retries: 2, baseDelayMs: 0, sleep: async () => {} });
  await assert.rejects((pool.connect as () => Promise<unknown>)(), /password authentication failed/);
  assert.equal(calls, 1, 'parol xatosi vaqtinchalik emas');

  calls = 0;
  const down = { connect: async () => { calls += 1; throw poolTimeout(); } };
  addConnectRetry(down, { retries: 1, baseDelayMs: 0, sleep: async () => {} });
  const viaCallback = await new Promise<unknown>((resolve) => {
    (down.connect as (cb: (err: unknown) => void) => void)((err) => resolve(err));
  });
  assert.match(String((viaCallback as Error).message), /connection timeout/);
  assert.equal(calls, 2);
});

function harness() {
  const alerts: Array<{ kind: string; args: unknown[] }> = [];
  const telegram = {
    notifyCriticalError: async (...args: unknown[]) => { alerts.push({ kind: 'critical', args }); },
    notifyDbOutage: async (...args: unknown[]) => { alerts.push({ kind: 'db', args }); },
  } as unknown as TelegramService;
  const filter = new AllExceptionsFilter(telegram);
  const run = (exception: unknown) => {
    const sent: { status?: number; body?: Record<string, unknown>; headers: Record<string, string> } = { headers: {} };
    const response = {
      headersSent: false,
      setHeader(name: string, value: string) { sent.headers[name] = value; },
      status(code: number) { sent.status = code; return this; },
      json(body: Record<string, unknown>) { sent.body = body; return this; },
    };
    const request = { method: 'GET', url: '/api/reservations?from=x', headers: {} };
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    } as unknown as ArgumentsHost;
    filter.catch(exception, host);
    return sent;
  };
  return { run, alerts };
}

test('filtr: bazaga ulanish xatosi — 503 + Retry-After, yakka holat Telegramga ketmaydi', () => {
  const { run, alerts } = harness();
  const sent = run(poolTimeout());
  assert.equal(sent.status, 503);
  assert.equal(sent.body?.code, 'SERVICE_BUSY');
  assert.equal(sent.headers['Retry-After'], '5');
  assert.match(String(sent.body?.message), /vaqtincha band/);
  assert.equal(alerts.length, 0, 'bir lahzalik uzilish — "Kritik xatolik" emas');
});

test('filtr: muammo davom etsa bitta jamlangan ogohlantirish, oddiy 500 lar avvalgidek', () => {
  const { run, alerts } = harness();
  run(poolTimeout());
  run(poolTimeout());
  run(poolTimeout());
  run(poolTimeout());
  assert.deepEqual(alerts.map((alert) => alert.kind), ['db'], '3-uzilishda bitta xabar, keyingisi sovutishda');
  assert.equal(alerts[0].args[0], 3);
  assert.match(String(alerts[0].args[2]), /^GET \/api\/reservations$/);

  const crash = run(new Error('Cannot read properties of undefined'));
  assert.equal(crash.status, 500);
  assert.deepEqual(alerts.map((alert) => alert.kind), ['db', 'critical']);
});
