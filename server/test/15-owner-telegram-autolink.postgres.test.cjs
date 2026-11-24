const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { ConfigService } = require('@nestjs/config');
const { createDataSource } = require('./postgres-helper.cjs');
const { PlanTiersService } = require('../src/common/plan-tiers/plan-tiers.service');
const { Club } = require('../src/entities/club.entity');
const { Plan } = require('../src/entities/plan.entity');
const { PlatformSetting } = require('../src/entities/platform-setting.entity');
const { Session } = require('../src/entities/session.entity');
const { SessionSegment } = require('../src/entities/session-segment.entity');
const { User } = require('../src/entities/user.entity');
const { ReportsService } = require('../src/modules/reports/reports.service');
const { SessionsService } = require('../src/modules/sessions/sessions.service');
const { PublicService } = require('../src/modules/public/public.service');
const { TrialVerificationService } = require('../src/modules/public/trial-verification.service');
const { canonicalTrialPhone } = require('../src/modules/public/trial-phone');
const { OwnerReportService } = require('../src/modules/owner-telegram/owner-report.service');
const { AUTOLINK_SETTING_KEY, OwnerTelegramService } = require('../src/modules/owner-telegram/owner-telegram.service');

/**
 * MAVJUD BOT bilan avtomatik ulash: ega saytda ro'yxatdan o'tayotganda telefonini shu botda
 * tasdiqlaydi (Start + kontakt) — ro'yxatdan o'tishi bilan uning Telegram chati klubga
 * ulanadi va salomlashuv keladi. Avval ro'yxatdan o'tganlar bir martalik ulanadi va
 * birinchi hisobotdan oldin tanishtiruv oladi. Telegram soxta: tarmoqqa chiqilmaydi.
 */

const SECRET = 'test_webhook_secret_that_has_at_least_32_characters';
const SHARED = {
  TRIAL_TELEGRAM_BOT_TOKEN: '123456:test-token-never-sent-to-telegram',
  TRIAL_TELEGRAM_BOT_USERNAME: 'BilliardTestBot',
  TRIAL_TELEGRAM_WEBHOOK_SECRET: SECRET,
  FRONTEND_URL: 'https://app.billiard.example.uz',
};
const SEPARATE = {
  ...SHARED,
  OWNER_TELEGRAM_BOT_TOKEN: `777000:${'c'.repeat(35)}`,
  OWNER_TELEGRAM_BOT_USERNAME: 'billiard_owner_bot',
  OWNER_TELEGRAM_WEBHOOK_SECRET: 'w'.repeat(48),
};

let database;
let nextUser = 91000000;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

function fakeTelegram() {
  const sent = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(String(init.body));
    sent.push({ chatId: String(body.chat_id), text: body.text });
    return { status: 200, json: async () => ({ ok: true, result: {} }) };
  };
  return { sent, fetchImpl };
}

const waitFor = async (check, ms = 3000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
  return check();
};

function services(env) {
  const config = new ConfigService(env);
  const trial = new TrialVerificationService(database, config);
  const sessions = new SessionsService(database, database.getRepository(Session), database.getRepository(SessionSegment));
  const reports = new OwnerReportService(
    database,
    new ReportsService(database, database.getRepository(Session)),
    sessions,
    new PlanTiersService(database.getRepository(PlatformSetting)),
    config,
  );
  const owner = new OwnerTelegramService(database, config, reports);
  owner.chatGapMs = 0;
  const fake = fakeTelegram();
  owner.fetchImpl = fake.fetchImpl;
  const publicService = new PublicService(
    database,
    { notifyNewTrial: async () => undefined },
    { issueTokens: async () => ({ accessToken: 'test-access-token', refreshToken: 'test-refresh-token' }) },
    { get: async () => ({ trialDays: 3 }) },
    database.getRepository(User),
    database.getRepository(Plan),
    trial,
    owner,
  );
  return { trial, owner, fake, publicService };
}

const message = (userId, messageId, fields) => ({
  message_id: messageId,
  date: Math.floor(Date.now() / 1000),
  chat: { id: userId, type: 'private' },
  from: { id: userId, is_bot: false },
  ...fields,
});

/** Saytdagi tasdiqlash: Start (trial_) + o'z kontakti — xuddi haqiqiy foydalanuvchidek */
async function verifiedRegistration(svc, ownerName = 'Abdulla Ega') {
  const userId = ++nextUser;
  const phone = `998${String(userId).padStart(9, '0')}`;
  const challenge = await svc.trial.start();
  await svc.trial.webhook(SECRET, { message: message(userId, 1, { text: `/start trial_${challenge.id}` }) });
  await svc.trial.webhook(SECRET, { message: message(userId, 2, { contact: { user_id: userId, phone_number: phone } }) });
  assert.deepEqual(await svc.trial.status(challenge.id, challenge.token), { status: 'verified', phone: canonicalTrialPhone(phone) });
  const username = `autolink_${userId}`;
  const result = await svc.publicService.register(
    {
      clubName: `Avto klub ${userId}`,
      ownerName,
      phone: `+${phone}`,
      address: 'Toshkent',
      username,
      password: 'Test-only-password!1',
      trialVerificationId: challenge.id,
      trialVerificationToken: challenge.token,
    },
    { ip: '127.0.0.1', userAgent: 'integration-test' },
    'uz',
  );
  return { userId, phone, clubId: result.club.id, adminId: result.user.id };
}

const chatsOf = (clubId) => database.query(
  `SELECT "chatId", "chatType", title, "linkedById", "isActive", lang, "introPending",
          to_char("lastReportDate", 'YYYY-MM-DD') AS "lastReportDate"
   FROM owner_telegram_chats WHERE "clubId" = $1 ORDER BY id`,
  [clubId],
);

test('mavjud bot: ro‘yxatdan o‘tish bilan egasining Telegrami avtomatik ulanadi va salomlashuv keladi', { timeout: 30000 }, async () => {
  const svc = services(SHARED);
  assert.equal(svc.owner.botConfig.shared, true);
  const reg = await verifiedRegistration(svc);

  const [chat] = await chatsOf(reg.clubId);
  assert.equal(chat.chatId, String(reg.userId)); // shaxsiy chat ID = Telegram akkaunt ID
  assert.equal(chat.chatType, 'private');
  assert.equal(chat.title, 'Abdulla Ega');
  assert.equal(chat.linkedById, reg.adminId);
  assert.equal(chat.isActive, true);
  assert.equal(chat.introPending, false);
  assert.ok(chat.lastReportDate, 'birinchi hisobot ertaga — bugungi sana yozilgan');

  const welcome = await waitFor(() => svc.fake.sent.find((m) => m.chatId === String(reg.userId)));
  assert.ok(welcome, 'salomlashuv kelmadi');
  assert.match(welcome.text, /klubi ro'yxatdan o'tdi/);
  assert.match(welcome.text, /\/hisobot/);

  // Shu bot orqali buyruq — umumiy webhook (ro'yxatdan o'tish siri bilan) egasi xizmatiga
  const hisobot = { message: { ...message(reg.userId, 3, { text: '/hisobot' }) } };
  assert.equal(svc.owner.isSharedUpdate(hisobot), true);
  assert.equal(svc.owner.isSharedUpdate({ message: message(reg.userId, 4, { text: '/start trial_x' }) }), false);
  svc.fake.sent.length = 0;
  await svc.owner.handleWebhook(SECRET, hisobot);
  const report = await waitFor(() => svc.fake.sent.find((m) => m.chatId === String(reg.userId)));
  assert.match(report.text, /kunlik hisobot/);
});

test('alohida bot sozlangan bo‘lsa — avtomatik ulanmaydi (ega u botga Start bosmagan)', { timeout: 30000 }, async () => {
  const svc = services(SEPARATE);
  assert.equal(svc.owner.botConfig.shared, false);
  const reg = await verifiedRegistration(svc);
  assert.deepEqual(await chatsOf(reg.clubId), []);
});

test('avval ro‘yxatdan o‘tganlar bir martalik ulanadi; birinchi hisobotdan oldin tanishtiruv', { timeout: 30000 }, async () => {
  const svc = services(SHARED);
  const old = await verifiedRegistration(svc, 'Eski Ega');
  // Avvalgi holat: ro'yxatdan o'tgan, lekin ulanish hali bo'lmagan
  await database.query(`DELETE FROM owner_telegram_chats WHERE "clubId" = $1`, [old.clubId]);
  await database.query(`DELETE FROM platform_settings WHERE key = $1`, [AUTOLINK_SETTING_KEY]);
  // Superadmin qo'lda yaratgan klub (telefon tasdig'i yo'q) — ulanmasligi kerak
  const manual = await database.getRepository(Club).save({ name: 'Qo‘lda yaratilgan klub', phone: '+998900000001' });

  const linked = await svc.owner.autoLinkRegisteredOwners();
  assert.ok(linked >= 1);
  const [chat] = await chatsOf(old.clubId);
  assert.equal(chat.chatId, String(old.userId));
  assert.equal(chat.title, 'Eski Ega');
  assert.equal(chat.linkedById, old.adminId);
  assert.equal(chat.introPending, true);
  assert.deepEqual(await chatsOf(manual.id), []);

  // Bir martalik: ega chatni o'chirsa — qayta paydo bo'lmaydi
  await database.query(`DELETE FROM owner_telegram_chats WHERE "clubId" = $1`, [old.clubId]);
  assert.equal(await svc.owner.autoLinkRegisteredOwners(), null);
  assert.deepEqual(await chatsOf(old.clubId), []);

  // Tanishtiruv + hisobot: qayta ulab (bayroq bilan), hisobot vaqtini o'tgan qilamiz
  await database.query(`DELETE FROM platform_settings WHERE key = $1`, [AUTOLINK_SETTING_KEY]);
  await svc.owner.autoLinkRegisteredOwners();
  await database.query(
    `UPDATE owner_telegram_chats SET "lastReportDate" = NULL, "reportTime" = '00:00' WHERE "clubId" = $1`,
    [old.clubId],
  );
  svc.fake.sent.length = 0;
  assert.equal(await svc.owner.runDueReports(new Date()), 1);
  const toOwner = svc.fake.sent.filter((m) => m.chatId === String(old.userId));
  assert.equal(toOwner.length, 2);
  assert.match(toOwner[0].text, /Assalomu alaykum/);
  assert.match(toOwner[0].text, /avtomatik ulandi/);
  assert.match(toOwner[1].text, /kunlik hisobot/);
  const [after] = await chatsOf(old.clubId);
  assert.equal(after.introPending, false);
});
