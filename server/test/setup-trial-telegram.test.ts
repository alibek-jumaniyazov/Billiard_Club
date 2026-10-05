import assert from 'node:assert/strict';
import { test } from 'node:test';

const { setupTelegramWebhook, webhookUrl } = require('../scripts/setup-trial-telegram.cjs');

const env = {
  TRIAL_TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(35)}`,
  TRIAL_TELEGRAM_BOT_USERNAME: 'prime_trial_bot',
  TRIAL_TELEGRAM_WEBHOOK_SECRET: 's'.repeat(64),
};
const origin = 'https://prime.example.com';
const expectedUrl = `${origin}/api/public/trial-verification/telegram/webhook`;

function mockTelegram(results: unknown[]) {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const fetchImpl = async (url: string, options: { body: string; redirect: string; headers: Record<string, string> }) => {
    assert.equal(options.redirect, 'error');
    calls.push({ method: url.split('/').at(-1)!, payload: JSON.parse(options.body) });
    if (url === expectedUrl) {
      assert.equal(options.headers['X-Telegram-Bot-Api-Secret-Token'], env.TRIAL_TELEGRAM_WEBHOOK_SECRET);
      assert.deepEqual(JSON.parse(options.body), {});
      return { ok: true, json: async () => ({ ok: true }) };
    }
    assert.ok(results.length, 'Unexpected extra Telegram request');
    return { ok: true, json: async () => ({ ok: true, result: results.shift() }) };
  };
  return { calls, fetchImpl };
}

test('webhook setup only accepts an HTTPS public-domain origin', () => {
  assert.equal(webhookUrl(`${origin}/`), expectedUrl);
  for (const value of [
    'http://prime.example.com', 'https://u:p@prime.example.com',
    `${origin}/api`, `${origin}?token=hidden`, `${origin}#hidden`,
    'https://localhost', 'https://127.0.0.1', 'https://10.0.0.1',
    'https://[::1]', 'https://app.internal', 'https://prime.example.com:9000',
  ]) {
    assert.throws(() => webhookUrl(value), Error, value);
  }
});

test('setup refuses a foreign webhook without overwriting it', async () => {
  const mock = mockTelegram([{ url: 'https://other.example.com/existing' }]);
  await assert.rejects(setupTelegramWebhook(origin, env, mock.fetchImpl), /boshqa webhook/);
  assert.deepEqual(mock.calls.map((call) => call.method), ['getWebhookInfo']);
});

test('missing or mismatched bot username is suggested before any webhook mutation', async () => {
  for (const username of ['', 'different_bot']) {
    const mock = mockTelegram([{ url: '' }, { is_bot: true, username: 'prime_trial_bot' }]);
    await assert.rejects(
      setupTelegramWebhook(origin, { ...env, TRIAL_TELEGRAM_BOT_USERNAME: username }, mock.fetchImpl),
      /TRIAL_TELEGRAM_BOT_USERNAME=prime_trial_bot/,
    );
    assert.deepEqual(mock.calls.map((call) => call.method), ['getWebhookInfo', 'getMe']);
  }
});

test('setup preserves pending updates, sends the secret, then verifies the webhook', async () => {
  const mock = mockTelegram([
    { url: expectedUrl }, { is_bot: true, username: 'prime_trial_bot' }, true, { url: expectedUrl },
  ]);
  assert.deepEqual(await setupTelegramWebhook(origin, env, mock.fetchImpl), {
    username: 'prime_trial_bot', url: expectedUrl,
  });
  assert.deepEqual(mock.calls.map((call) => call.method), ['getWebhookInfo', 'getMe', 'webhook', 'setWebhook', 'getWebhookInfo']);
  assert.deepEqual(mock.calls[3].payload, {
    url: expectedUrl,
    secret_token: env.TRIAL_TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'],
    max_connections: 10,
  });
  assert.ok(!('drop_pending_updates' in mock.calls[3].payload));
});

test('an unreachable or unauthenticated deployed webhook prevents changing the bot', async () => {
  for (const response of [
    { ok: false, json: async () => ({ statusCode: 401 }) },
    { ok: true, json: async () => ({ success: true }) },
  ]) {
    const mock = mockTelegram([{ url: '' }, { is_bot: true, username: 'prime_trial_bot' }]);
    await assert.rejects(setupTelegramWebhook(origin, env, (url: string, options: any) =>
      url === expectedUrl ? Promise.resolve(response) : mock.fetchImpl(url, options)), /Server webhooki tayyor emas/);
    assert.deepEqual(mock.calls.map((call) => call.method), ['getWebhookInfo', 'getMe']);
  }
});

test('invalid secret is rejected before contacting Telegram', async () => {
  await assert.rejects(
    setupTelegramWebhook(origin, { ...env, TRIAL_TELEGRAM_WEBHOOK_SECRET: 'short' }, () => {
      assert.fail('Telegram must not be called');
    }),
    /TRIAL_TELEGRAM_WEBHOOK_SECRET/,
  );
});

test('bot username and secret are validated exactly like backend env values', async () => {
  for (const invalidEnv of [
    { ...env, TRIAL_TELEGRAM_BOT_USERNAME: '@prime_trial_bot' },
    { ...env, TRIAL_TELEGRAM_BOT_USERNAME: ' prime_trial_bot ' },
    { ...env, TRIAL_TELEGRAM_WEBHOOK_SECRET: ` ${env.TRIAL_TELEGRAM_WEBHOOK_SECRET} ` },
  ]) {
    await assert.rejects(
      setupTelegramWebhook(origin, invalidEnv, () => {
        assert.fail('Telegram must not be called');
      }),
      /TRIAL_TELEGRAM_(BOT_USERNAME|WEBHOOK_SECRET)/,
    );
  }
});

test('network and provider errors never disclose the bot token or webhook secret', async () => {
  for (const fetchImpl of [
    async () => { throw new Error(`https://api.telegram.org/bot${env.TRIAL_TELEGRAM_BOT_TOKEN}/getWebhookInfo`); },
    async () => ({
      ok: false,
      json: async () => ({ ok: false, description: `${env.TRIAL_TELEGRAM_BOT_TOKEN} ${env.TRIAL_TELEGRAM_WEBHOOK_SECRET}` }),
    }),
  ]) {
    await assert.rejects(setupTelegramWebhook(origin, env, fetchImpl), (error: Error) => {
      assert.ok(!error.message.includes(env.TRIAL_TELEGRAM_BOT_TOKEN));
      assert.ok(!error.message.includes(env.TRIAL_TELEGRAM_WEBHOOK_SECRET));
      return true;
    });
  }
});

test('setup reports a post-install URL mismatch as failure', async () => {
  const mock = mockTelegram([
    { url: '' }, { is_bot: true, username: 'prime_trial_bot' }, true, { url: '' },
  ]);
  await assert.rejects(setupTelegramWebhook(origin, env, mock.fetchImpl), /tekshiruv mos kelmadi/);
});
