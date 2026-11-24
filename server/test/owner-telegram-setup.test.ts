import assert from 'node:assert/strict';
import { test } from 'node:test';

const { setupOwnerTelegram, webhookUrl, configuration } = require('../scripts/setup-owner-telegram.cjs');

const env = {
  OWNER_TELEGRAM_BOT_TOKEN: `654321:${'b'.repeat(35)}`,
  OWNER_TELEGRAM_BOT_USERNAME: 'billiard_owner_bot',
  OWNER_TELEGRAM_WEBHOOK_SECRET: 'o'.repeat(48),
};
const origin = 'https://prime.example.com';
const expectedUrl = `${origin}/api/public/owner-telegram/webhook`;

function mockTelegram(results: unknown[], probeOk = true) {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const fetchImpl = async (url: string, options: { body: string; redirect: string; headers: Record<string, string> }) => {
    assert.equal(options.redirect, 'error');
    calls.push({ method: url.split('/').at(-1)!, payload: JSON.parse(options.body) });
    if (url === expectedUrl) {
      assert.equal(options.headers['X-Telegram-Bot-Api-Secret-Token'], env.OWNER_TELEGRAM_WEBHOOK_SECRET);
      return { ok: probeOk, json: async () => ({ ok: probeOk }) };
    }
    assert.ok(results.length, 'Kutilmagan Telegram so‘rovi');
    return { ok: true, json: async () => ({ ok: true, result: results.shift() }) };
  };
  return { calls, fetchImpl };
}

test('webhook faqat ommaviy HTTPS domenga o‘rnatiladi', () => {
  assert.equal(webhookUrl(`${origin}/`), expectedUrl);
  for (const value of ['http://prime.example.com', 'https://localhost', 'https://10.0.0.1', `${origin}/api`, 'https://x.internal']) {
    assert.throws(() => webhookUrl(value), Error, value);
  }
});

test('egasi boti boshqa botlar bilan bir xil token bo‘lmasligi kerak', () => {
  assert.throws(() => configuration({ ...env, TRIAL_TELEGRAM_BOT_TOKEN: env.OWNER_TELEGRAM_BOT_TOKEN }), /ALOHIDA/);
  assert.throws(() => configuration({ ...env, OWNER_TELEGRAM_BOT_USERNAME: '' }), /USERNAME/);
  assert.throws(() => configuration({ ...env, OWNER_TELEGRAM_WEBHOOK_SECRET: 'short' }), /SECRET/);
});

test('boshqa webhook bo‘lsa — hech narsa o‘zgartirilmaydi', async () => {
  const mock = mockTelegram([{ url: 'https://other.example.com/hook' }]);
  await assert.rejects(setupOwnerTelegram(origin, env, mock.fetchImpl), /boshqa webhook/);
  assert.deepEqual(mock.calls.map((c) => c.method), ['getWebhookInfo']);
});

test('server tayyor bo‘lmasa webhook o‘rnatilmaydi', async () => {
  const mock = mockTelegram([{ url: '' }, { is_bot: true, username: 'billiard_owner_bot' }], false);
  await assert.rejects(setupOwnerTelegram(origin, env, mock.fetchImpl), /tayyor emas/);
  assert.ok(!mock.calls.some((c) => c.method === 'setWebhook'));
});

test('to‘liq sozlash: webhook, buyruqlar (uz/ru), tavsif va tekshiruv', async () => {
  const mock = mockTelegram([
    { url: '' },
    { is_bot: true, username: 'Billiard_Owner_Bot' },
    true, // setWebhook
    true, true, // setMyCommands uz/ru
    true, true, // setMyDescription
    true, true, // setMyShortDescription
    { url: expectedUrl },
  ]);
  const result = await setupOwnerTelegram(origin, env, mock.fetchImpl);
  assert.deepEqual(result, { username: 'Billiard_Owner_Bot', url: expectedUrl });
  assert.deepEqual(mock.calls.map((c) => c.method), [
    'getWebhookInfo', 'getMe', 'webhook', 'setWebhook',
    'setMyCommands', 'setMyCommands', 'setMyDescription', 'setMyDescription',
    'setMyShortDescription', 'setMyShortDescription', 'getWebhookInfo',
  ]);
  const hook = mock.calls.find((c) => c.method === 'setWebhook')!.payload;
  assert.equal(hook.url, expectedUrl);
  assert.equal(hook.secret_token, env.OWNER_TELEGRAM_WEBHOOK_SECRET);
  assert.deepEqual(hook.allowed_updates, ['message', 'my_chat_member']);
  const commands = mock.calls.filter((c) => c.method === 'setMyCommands');
  assert.equal(commands[1].payload.language_code, 'ru');
  assert.ok((commands[0].payload.commands as Array<{ command: string }>).some((c) => c.command === 'hisobot'));
});
