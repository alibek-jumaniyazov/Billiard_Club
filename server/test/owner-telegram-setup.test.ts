import assert from 'node:assert/strict';
import { test } from 'node:test';

const { setupOwnerTelegram, webhookUrl, configuration } = require('../scripts/setup-owner-telegram.cjs');

/** Standart: mavjud (ro'yxatdan o'tish) boti — OWNER_* bo'sh */
const sharedEnv = {
  TRIAL_TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(35)}`,
  TRIAL_TELEGRAM_BOT_USERNAME: 'billiard_club_bot',
  TRIAL_TELEGRAM_WEBHOOK_SECRET: 't'.repeat(48),
};
/** Ixtiyoriy: alohida egalar boti */
const separateEnv = {
  ...sharedEnv,
  OWNER_TELEGRAM_BOT_TOKEN: `654321:${'b'.repeat(35)}`,
  OWNER_TELEGRAM_BOT_USERNAME: 'billiard_owner_bot',
  OWNER_TELEGRAM_WEBHOOK_SECRET: 'o'.repeat(48),
};
const origin = 'https://prime.example.com';
const trialUrl = `${origin}/api/public/trial-verification/telegram/webhook`;
const ownerUrl = `${origin}/api/public/owner-telegram/webhook`;

function mockTelegram(results: unknown[], expectedUrl: string, secret: string, probeOk = true) {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const fetchImpl = async (url: string, options: { body: string; redirect: string; headers: Record<string, string> }) => {
    assert.equal(options.redirect, 'error');
    calls.push({ method: url.split('/').at(-1)!, payload: JSON.parse(options.body) });
    if (url === expectedUrl) {
      assert.equal(options.headers['X-Telegram-Bot-Api-Secret-Token'], secret);
      return { ok: probeOk, json: async () => ({ ok: probeOk }) };
    }
    assert.ok(results.length, 'Kutilmagan Telegram so‘rovi');
    return { ok: true, json: async () => ({ ok: true, result: results.shift() }) };
  };
  return { calls, fetchImpl };
}

const happyResults = (username: string, url: string) => [
  { url: '' },
  { is_bot: true, username },
  true, // setWebhook
  true, true, // setMyCommands uz/ru
  true, true, // setMyDescription
  true, true, // setMyShortDescription
  { url },
];

test('webhook faqat ommaviy HTTPS domenga; rejimga qarab marshrut', () => {
  assert.equal(webhookUrl(`${origin}/`), trialUrl);
  assert.equal(webhookUrl(origin, false), ownerUrl);
  for (const value of ['http://prime.example.com', 'https://localhost', 'https://10.0.0.1', `${origin}/api`, 'https://x.internal']) {
    assert.throws(() => webhookUrl(value), Error, value);
  }
});

test('OWNER_* bo‘sh — mavjud bot ishlatiladi; bir xil token ham umumiy hisoblanadi', () => {
  assert.equal(configuration(sharedEnv).shared, true);
  assert.equal(configuration({ ...sharedEnv, OWNER_TELEGRAM_BOT_TOKEN: sharedEnv.TRIAL_TELEGRAM_BOT_TOKEN }).shared, true);
  assert.equal(configuration(separateEnv).shared, false);
  // Ro'yxatdan o'tish boti tokeni bo'lmasa — platforma boti tokeni
  const viaPlatform = configuration({ ...sharedEnv, TRIAL_TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_TOKEN: sharedEnv.TRIAL_TELEGRAM_BOT_TOKEN });
  assert.equal(viaPlatform.token, sharedEnv.TRIAL_TELEGRAM_BOT_TOKEN);
  assert.throws(() => configuration({ ...sharedEnv, TRIAL_TELEGRAM_WEBHOOK_SECRET: 'short' }), /TRIAL_TELEGRAM_WEBHOOK_SECRET/);
  assert.throws(() => configuration({ ...separateEnv, OWNER_TELEGRAM_BOT_USERNAME: '' }), /OWNER_TELEGRAM_BOT_USERNAME/);
});

test('boshqa webhook bo‘lsa — hech narsa o‘zgartirilmaydi', async () => {
  const mock = mockTelegram([{ url: 'https://other.example.com/hook' }], trialUrl, sharedEnv.TRIAL_TELEGRAM_WEBHOOK_SECRET);
  await assert.rejects(setupOwnerTelegram(origin, sharedEnv, mock.fetchImpl), /boshqa webhook/);
  assert.deepEqual(mock.calls.map((c) => c.method), ['getWebhookInfo']);
});

test('server tayyor bo‘lmasa webhook o‘rnatilmaydi', async () => {
  const mock = mockTelegram([{ url: '' }, { is_bot: true, username: 'billiard_club_bot' }], trialUrl, sharedEnv.TRIAL_TELEGRAM_WEBHOOK_SECRET, false);
  await assert.rejects(setupOwnerTelegram(origin, sharedEnv, mock.fetchImpl), /tayyor emas/);
  assert.ok(!mock.calls.some((c) => c.method === 'setWebhook'));
});

test('mavjud bot: ro‘yxatdan o‘tish marshruti saqlanadi, buyruqlar va umumiy tavsif qo‘shiladi', async () => {
  const mock = mockTelegram(happyResults('Billiard_Club_Bot', trialUrl), trialUrl, sharedEnv.TRIAL_TELEGRAM_WEBHOOK_SECRET);
  const result = await setupOwnerTelegram(origin, sharedEnv, mock.fetchImpl);
  assert.deepEqual(result, { username: 'Billiard_Club_Bot', url: trialUrl, shared: true });
  assert.deepEqual(mock.calls.map((c) => c.method), [
    'getWebhookInfo', 'getMe', 'webhook', 'setWebhook',
    'setMyCommands', 'setMyCommands', 'setMyDescription', 'setMyDescription',
    'setMyShortDescription', 'setMyShortDescription', 'getWebhookInfo',
  ]);
  const hook = mock.calls.find((c) => c.method === 'setWebhook')!.payload;
  assert.equal(hook.url, trialUrl);
  assert.equal(hook.secret_token, sharedEnv.TRIAL_TELEGRAM_WEBHOOK_SECRET);
  assert.deepEqual(hook.allowed_updates, ['message', 'my_chat_member']);
  const description = mock.calls.find((c) => c.method === 'setMyDescription')!.payload.description as string;
  assert.match(description, /ro'yxatdan o'tishda telefonni tasdiqlaydi/);
  const commands = mock.calls.filter((c) => c.method === 'setMyCommands');
  assert.equal(commands[1].payload.language_code, 'ru');
  assert.ok((commands[0].payload.commands as Array<{ command: string }>).some((c) => c.command === 'hisobot'));
});

test('alohida bot: o‘z marshruti va siri bilan', async () => {
  const mock = mockTelegram(happyResults('billiard_owner_bot', ownerUrl), ownerUrl, separateEnv.OWNER_TELEGRAM_WEBHOOK_SECRET);
  const result = await setupOwnerTelegram(origin, separateEnv, mock.fetchImpl);
  assert.equal(result.shared, false);
  const hook = mock.calls.find((c) => c.method === 'setWebhook')!.payload;
  assert.equal(hook.url, ownerUrl);
  assert.equal(hook.secret_token, separateEnv.OWNER_TELEGRAM_WEBHOOK_SECRET);
});
