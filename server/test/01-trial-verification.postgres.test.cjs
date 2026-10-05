const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createDataSource } = require('./postgres-helper.cjs');
const { TrialVerificationService } = require('../src/modules/public/trial-verification.service');
const { canonicalTrialPhone } = require('../src/modules/public/trial-phone');
const { PublicService } = require('../src/modules/public/public.service');
const { User } = require('../src/entities/user.entity');
const { Plan } = require('../src/entities/plan.entity');

const secret = 'test_webhook_secret_that_has_at_least_32_characters';
const configuration = {
  TRIAL_TELEGRAM_BOT_TOKEN: '123456:test-token-never-sent-to-telegram',
  TRIAL_TELEGRAM_BOT_USERNAME: 'BilliardTestBot',
  TRIAL_TELEGRAM_WEBHOOK_SECRET: secret,
};
let database;
let service;
let nextUser = 90000000;

before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
  service = new TrialVerificationService(database, { get: (key) => configuration[key] });
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

const hasKey = (key) => (error) => error.getResponse?.().key === key;
const phoneFor = (userId) => `998${String(userId).padStart(9, '0')}`;
function message(userId, messageId, fields = {}) {
  return {
    message_id: messageId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: userId, type: 'private' },
    from: { id: userId, is_bot: false },
    ...fields,
  };
}
async function bind(challenge, userId, messageId = 1) {
  return service.webhook(secret, {
    message: message(userId, messageId, { text: `/start trial_${challenge.id}` }),
  });
}
async function contact(userId, phone, messageId = 2, fields = {}) {
  return service.webhook(secret, {
    message: message(userId, messageId, { contact: { user_id: userId, phone_number: phone }, ...fields }),
  });
}
async function verified({ userId = ++nextUser, phone = phoneFor(userId), messageId = 1 } = {}) {
  const challenge = await service.start();
  await bind(challenge, userId, messageId);
  await contact(userId, phone, messageId + 1);
  assert.deepEqual(await service.status(challenge.id, challenge.token), { status: 'verified', phone: canonicalTrialPhone(phone) });
  return { ...challenge, userId, phone };
}
const claim = (challenge, phone = challenge.phone) => database.transaction((manager) =>
  service.claim(manager, challenge.id, challenge.token, phone));
function publicService(platformConfig = { get: async () => ({ trialDays: 3 }) }) {
  return new PublicService(database,
    { notifyNewTrial: async () => undefined },
    { issueTokens: async () => ({ accessToken: 'test-access-token', refreshToken: 'test-refresh-token' }) },
    platformConfig, database.getRepository(User), database.getRepository(Plan), service);
}
function registration(challenge, username = `trial_test_${challenge.userId}`) {
  return {
    clubName: `Test club ${username}`,
    ownerName: 'Test owner',
    phone: `+${challenge.phone}`,
    address: 'Test address',
    username,
    password: 'Test-only-password!1',
    trialVerificationId: challenge.id,
    trialVerificationToken: challenge.token,
  };
}
const context = { ip: '127.0.0.1', userAgent: 'integration-test' };

test('registration verification fails closed without bot configuration', async () => {
  const disabled = new TrialVerificationService(database, { get: () => undefined });
  assert.equal(disabled.availability().available, false);
  await assert.rejects(disabled.start(), hasKey('public.verificationUnavailable'));
  await assert.rejects(disabled.webhook(secret, {}), hasKey('auth.notAuthenticated'));
  await assert.rejects(service.start('bot-filled-honeypot'), hasKey('common.validationError'));
});

test('browser proof is secret, expires, and cannot be used before Telegram confirmation', async () => {
  const challenge = await service.start();
  assert.equal(challenge.token.length, 43);
  const [{ browserTokenHash }] = await database.query('SELECT "browserTokenHash" FROM trial_telegram_challenges WHERE id=$1', [challenge.id]);
  assert.notEqual(browserTokenHash, challenge.token);
  assert.equal(browserTokenHash.length, 64);
  assert.deepEqual(await service.status(challenge.id, challenge.token), { status: 'pending' });
  await assert.rejects(service.status(challenge.id, 'wrong-browser-token'), hasKey('public.verificationInvalid'));
  await assert.rejects(claim(challenge, '998901111111'), hasKey('public.verificationRequired'));
  await database.query('UPDATE trial_telegram_challenges SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1', [challenge.id]);
  assert.deepEqual(await service.status(challenge.id, challenge.token), { status: 'expired' });
});

test('webhook rejects fake secrets and ignores groups, bots, forwarded messages, and stale messages', async () => {
  const challenge = await service.start();
  const userId = ++nextUser;
  const start = { text: `/start trial_${challenge.id}` };
  await assert.rejects(service.webhook('attacker-secret', { message: message(userId, 1, start) }), hasKey('auth.notAuthenticated'));
  await assert.rejects(service.webhook(undefined, {}), hasKey('auth.notAuthenticated'));
  const ignored = [
    { chat: { id: userId, type: 'group' } },
    { chat: { id: userId + 1, type: 'private' } },
    { from: { id: userId, is_bot: true } },
    { forward_origin: { type: 'user' } },
    { forward_date: Math.floor(Date.now() / 1000) },
    { date: Math.floor(Date.now() / 1000) - 601 },
  ];
  for (const fields of ignored) {
    assert.deepEqual(await service.webhook(secret, { message: message(userId, 1, { ...start, ...fields }) }), { ok: true });
  }
  assert.deepEqual(await service.status(challenge.id, challenge.token), { status: 'pending' });
  const [{ telegramUserId }] = await database.query('SELECT "telegramUserId" FROM trial_telegram_challenges WHERE id=$1', [challenge.id]);
  assert.equal(telegramUserId, null);
});

test('only the bound Telegram user can confirm their own contact', async () => {
  const challenge = await service.start();
  const userId = ++nextUser;
  const reply = await bind(challenge, userId);
  assert.equal(reply.reply_markup.keyboard[0][0].request_contact, true);
  await bind(challenge, userId + 1000);
  await contact(userId + 1000, phoneFor(userId + 1000));
  await contact(userId, phoneFor(userId), 2, { contact: { user_id: userId + 1, phone_number: phoneFor(userId) } });
  assert.deepEqual(await service.status(challenge.id, challenge.token), { status: 'pending' });
  await contact(userId, phoneFor(userId), 3, { forward_origin: { type: 'user' } });
  assert.deepEqual(await service.status(challenge.id, challenge.token), { status: 'pending' });
  await contact(userId, phoneFor(userId), 4);
  assert.deepEqual(await service.status(challenge.id, challenge.token), { status: 'verified', phone: phoneFor(userId) });
});

test('old and repeated contacts cannot confirm a new browser challenge', async () => {
  const userId = ++nextUser;
  const first = await verified({ userId });
  const second = await service.start();
  await bind(second, userId, 10);
  await contact(userId, phoneFor(userId), 2);
  await bind(first, userId, 1);
  assert.deepEqual(await service.status(second.id, second.token), { status: 'pending' });
  await contact(userId, phoneFor(userId), 11);
  assert.deepEqual(await service.status(second.id, second.token), { status: 'verified', phone: phoneFor(userId) });
});

test('a verified proof is phone-bound, browser-bound, time-bound and single use', async () => {
  const challenge = await verified();
  await assert.rejects(claim(challenge, phoneFor(challenge.userId + 1)), hasKey('public.verifiedPhoneMismatch'));
  await assert.rejects(claim({ ...challenge, token: 'wrong-token' }), hasKey('public.verificationInvalid'));
  assert.equal(await claim(challenge, `+${challenge.phone}`), challenge.phone);
  assert.deepEqual(await service.status(challenge.id, challenge.token), { status: 'used' });
  await assert.rejects(claim(challenge), hasKey('public.verificationRequired'));

  const expired = await verified();
  await database.query('UPDATE trial_telegram_challenges SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1', [expired.id]);
  await assert.rejects(claim(expired), hasKey('public.verificationRequired'));
});

test('phone and Telegram account each allow a single trial, including number changes', async () => {
  const first = await verified();
  await claim(first);
  const samePhone = await verified({ phone: `+${first.phone}` });
  await assert.rejects(claim(samePhone), hasKey('public.trialAlreadyUsed'));
  const changedPhone = phoneFor(++nextUser);
  const sameAccount = await verified({ userId: first.userId, phone: changedPhone, messageId: 10 });
  await assert.rejects(claim(sameAccount), hasKey('public.trialAlreadyUsed'));
  // The failed account claim must roll back the earlier phone insertion.
  const rows = await database.query('SELECT phone FROM trial_claims WHERE phone=$1', [changedPhone]);
  assert.equal(rows.length, 0);
});

test('concurrent redemptions of one proof produce exactly one successful claim', async () => {
  const challenge = await verified();
  const results = await Promise.allSettled([claim(challenge), claim(challenge)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const [{ count }] = await database.query('SELECT COUNT(*) FROM trial_claims WHERE phone=$1', [challenge.phone]);
  assert.equal(Number(count), 1);
});

test('concurrent distinct proofs for the same phone or Telegram account cannot duplicate a trial', async () => {
  const first = await verified();
  const samePhone = await verified({ phone: first.phone });
  let results = await Promise.allSettled([claim(first), claim(samePhone)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);

  const account = await verified();
  const sameAccount = await verified({ userId: account.userId, phone: phoneFor(++nextUser), messageId: 10 });
  results = await Promise.allSettled([claim(account), claim(sameAccount)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});

test('registration transaction rollback restores both entitlement and verification proof', async () => {
  const challenge = await verified();
  await assert.rejects(database.transaction(async (manager) => {
    await service.claim(manager, challenge.id, challenge.token, challenge.phone);
    await manager.query(`INSERT INTO clubs (name, phone, "trialEndsAt") VALUES ('rollback fixture', $1, now()+interval '3 days')`, [challenge.phone]);
    throw new Error('simulated account creation failure');
  }), /simulated account creation failure/);
  assert.equal((await database.query('SELECT phone FROM trial_claims WHERE phone=$1', [challenge.phone])).length, 0);
  assert.equal((await database.query('SELECT "telegramUserId" FROM telegram_trial_claims WHERE "telegramUserId"=$1', [String(challenge.userId)])).length, 0);
  assert.equal((await service.status(challenge.id, challenge.token)).status, 'verified');
  assert.equal(await claim(challenge), challenge.phone);
});

test('administrator phone changes and club deletion retain all trial claims', async () => {
  const oldPhone = phoneFor(++nextUser);
  const newPhone = phoneFor(++nextUser);
  const [club] = await database.query(`INSERT INTO clubs (name, phone, "trialEndsAt") VALUES ('history fixture', $1, now()-interval '3 days') RETURNING id`, [`+${oldPhone}`]);
  await database.query('UPDATE clubs SET phone=$2 WHERE id=$1', [club.id, newPhone]);
  await database.query('DELETE FROM clubs WHERE id=$1', [club.id]);
  const claims = await database.query('SELECT phone FROM trial_claims WHERE phone=ANY($1::text[]) ORDER BY phone', [[oldPhone, newPhone]]);
  assert.deepEqual(claims.map((row) => row.phone), [oldPhone, newPhone].sort());
  const reused = await verified({ phone: oldPhone });
  await assert.rejects(claim(reused), hasKey('public.trialAlreadyUsed'));
});

test('cleanup removes expired proofs while retaining permanent entitlements', async () => {
  const challenge = await verified();
  await claim(challenge);
  await database.query('UPDATE trial_telegram_challenges SET "expiresAt"=now()-interval \'2 days\' WHERE id=$1', [challenge.id]);
  await service.cleanup();
  await assert.rejects(service.status(challenge.id, challenge.token), hasKey('public.verificationInvalid'));
  assert.equal((await database.query('SELECT phone FROM trial_claims WHERE phone=$1', [challenge.phone])).length, 1);
  assert.equal((await database.query('SELECT "telegramUserId" FROM telegram_trial_claims WHERE "telegramUserId"=$1', [String(challenge.userId)])).length, 1);
});

test('public registration atomically creates one club, administrator and settings with verified phone', async () => {
  const challenge = await verified();
  const result = await publicService().register(registration(challenge), context);
  assert.equal(result.club.status, 'trial');
  assert.equal(result.club.isExpired, false);
  assert.equal(result.user.password, undefined);
  assert.equal(result.user.clubId, result.club.id);
  const [rows] = await database.query(`SELECT c.phone, s.phone AS "settingsPhone", u.role
    FROM clubs c JOIN settings s ON s."clubId"=c.id JOIN users u ON u."clubId"=c.id WHERE c.id=$1`, [result.club.id]);
  assert.equal(rows.phone, `+${challenge.phone}`);
  assert.equal(rows.settingsPhone, `+${challenge.phone}`);
  assert.equal(rows.role, 'admin');
  assert.equal((await service.status(challenge.id, challenge.token)).status, 'used');
});

test('concurrent public registrations with the same verified phone create only one club', async () => {
  const first = await verified();
  const second = await verified({ phone: first.phone });
  const registrar = publicService();
  const results = await Promise.allSettled([
    registrar.register(registration(first), context),
    registrar.register(registration(second), context),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(hasKey('public.trialAlreadyUsed')(rejected.reason));
  const [{ count }] = await database.query('SELECT COUNT(*) FROM clubs WHERE phone=$1', [`+${first.phone}`]);
  assert.equal(Number(count), 1);
});

test('username uniqueness races roll back club, phone claim, account claim and consumed proof', async () => {
  const first = await verified();
  const second = await verified();
  const username = `trial_race_${first.userId}`;
  let arrivals = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const registrar = publicService({
    get: async () => {
      if (++arrivals === 2) release();
      await barrier;
      return { trialDays: 3 };
    },
  });
  const results = await Promise.allSettled([
    registrar.register(registration(first, username), context),
    registrar.register(registration(second, username), context),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const failedIndex = results.findIndex((result) => result.status === 'rejected');
  assert.equal(results[failedIndex].reason.code, '23505');
  const failed = [first, second][failedIndex];
  assert.equal((await database.query('SELECT phone FROM trial_claims WHERE phone=$1', [failed.phone])).length, 0);
  assert.equal((await database.query('SELECT "telegramUserId" FROM telegram_trial_claims WHERE "telegramUserId"=$1', [String(failed.userId)])).length, 0);
  assert.equal((await database.query('SELECT id FROM clubs WHERE phone=$1', [`+${failed.phone}`])).length, 0);
  assert.equal((await service.status(failed.id, failed.token)).status, 'verified');
  const retry = await publicService().register(registration(failed, `${username}_retry`), context);
  assert.equal(retry.club.isExpired, false);
});

test('public registration with zero trial days returns an expired account', async () => {
  const challenge = await verified();
  const result = await publicService({ get: async () => ({ trialDays: 0 }) }).register(registration(challenge), context);
  assert.equal(result.club.status, 'expired');
  assert.equal(result.club.isExpired, true);
  assert.ok(result.club.trialEndsAt);
});

test('international nine-digit Telegram contacts retain their international identity', async () => {
  const userId = ++nextUser;
  const challenge = await service.start();
  await bind(challenge, userId);
  await contact(userId, '354123456');
  assert.deepEqual(await service.status(challenge.id, challenge.token), { status: 'verified', phone: '354123456' });
  const result = await publicService().register(registration({ ...challenge, phone: '354123456', userId }), context);
  const [club] = await database.query('SELECT phone FROM clubs WHERE id=$1', [result.club.id]);
  assert.equal(club.phone, '+354123456');
  assert.equal((await database.query('SELECT phone FROM trial_claims WHERE phone=$1', ['354123456'])).length, 1);
  assert.equal((await database.query('SELECT phone FROM trial_claims WHERE phone=$1', ['998354123456'])).length, 0);
});
