const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { ConfigService } = require('@nestjs/config');
const { createDataSource } = require('./postgres-helper.cjs');
const { AuditService } = require('../src/common/audit/audit.service');
const { PlanTiersService } = require('../src/common/plan-tiers/plan-tiers.service');
const { localDateParts, zonedMidnight } = require('../src/common/time/club-day');
const { AuditLog } = require('../src/entities/audit-log.entity');
const { Club } = require('../src/entities/club.entity');
const { PlatformSetting } = require('../src/entities/platform-setting.entity');
const { Session } = require('../src/entities/session.entity');
const { SessionSegment } = require('../src/entities/session-segment.entity');
const { Settings } = require('../src/entities/settings.entity');
const { Table } = require('../src/entities/table.entity');
const { User } = require('../src/entities/user.entity');
const { UserRole } = require('../src/entities/enums');
const { ReportsService } = require('../src/modules/reports/reports.service');
const { SessionsService } = require('../src/modules/sessions/sessions.service');
const { OwnerAlertsService } = require('../src/modules/owner-telegram/owner-alerts.service');
const { OwnerReportService } = require('../src/modules/owner-telegram/owner-report.service');
const { OwnerTelegramService } = require('../src/modules/owner-telegram/owner-telegram.service');

/**
 * KLUB EGASI TELEGRAM BOTI — haqiqiy Postgres bilan to'liq oqim:
 * ulash havolasi -> /start -> kunlik hisobot (raqamlar Hisobotlar bilan bir xil) ->
 * bir marta yuborish -> bekor qilingan o'yin haqida darhol xabar (audit orqali) ->
 * /hozir, /stop, bloklash va guruh ko'chishi. Telegram soxta: tarmoqqa chiqilmaydi.
 */

const NBSP = ' ';
const TZ = 'Asia/Tashkent';
const SECRET = 'w'.repeat(48);
const CONFIG = {
  OWNER_TELEGRAM_BOT_TOKEN: `777000:${'c'.repeat(35)}`,
  OWNER_TELEGRAM_BOT_USERNAME: 'billiard_owner_bot',
  OWNER_TELEGRAM_WEBHOOK_SECRET: SECRET,
  FRONTEND_URL: 'https://app.billiard.example.uz',
};

let database;
before(async () => {
  database = await createDataSource().initialize();
  await database.runMigrations();
});
after(async () => { if (database?.isInitialized) await database.destroy(); });

/** Soxta Telegram: yuborilgan xabarlarni yig'adi; `blockChat` uchun 403 qaytaradi */
function fakeTelegram() {
  const sent = [];
  const blocked = new Set();
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(String(init.body));
    if (blocked.has(String(body.chat_id))) {
      return { status: 403, json: async () => ({ ok: false, description: 'Forbidden: bot was blocked by the user' }) };
    }
    sent.push({ method: url.split('/').at(-1), chatId: String(body.chat_id), text: body.text });
    return { status: 200, json: async () => ({ ok: true, result: {} }) };
  };
  return { sent, blocked, fetchImpl };
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

let nextClub = 0;
async function fixture() {
  const n = ++nextClub;
  const club = await database.getRepository(Club).save({ name: `Telegram klubi ${n}`, tier: 'vip' });
  await database.getRepository(Settings).save({ clubId: club.id, timezone: TZ, clubName: `Telegram klubi ${n}`, currencySymbol: "so'm" });
  const tables = [];
  for (let i = 1; i <= 2; i += 1) {
    tables.push(await database.getRepository(Table).save({ clubId: club.id, name: `Stol ${i}`, number: i, pricePerHour: 15000 }));
  }
  const stamp = `${n}_${Date.now()}`;
  const admin = await database.getRepository(User).save({ clubId: club.id, name: 'Egasi', username: `tg_admin_${stamp}`, password: 'x', role: UserRole.ADMIN });
  const kassir = await database.getRepository(User).save({ clubId: club.id, name: 'Aziz', username: `tg_kassir_${stamp}`, password: 'x', role: UserRole.KASSIR });

  const config = new ConfigService(CONFIG);
  const audit = new AuditService(database.getRepository(AuditLog));
  const sessions = new SessionsService(database, database.getRepository(Session), database.getRepository(SessionSegment), audit);
  const reports = new OwnerReportService(
    database,
    new ReportsService(database, database.getRepository(Session)),
    sessions,
    new PlanTiersService(database.getRepository(PlatformSetting)),
    config,
  );
  const telegram = new OwnerTelegramService(database, config, reports);
  telegram.chatGapMs = 0;
  const fake = fakeTelegram();
  telegram.fetchImpl = fake.fetchImpl;
  const alerts = new OwnerAlertsService(audit, telegram, reports, database);
  alerts.onModuleInit();
  return { club, tables, admin, kassir, audit, sessions, reports, telegram, alerts, fake };
}

const update = (chatId, text, extra = {}) => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: {
    message_id: Math.floor(Math.random() * 1e6),
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'private', first_name: 'Ega' },
    from: { id: chatId, is_bot: false, first_name: 'Ega', language_code: 'uz' },
    text,
    ...extra,
  },
});

async function linkPrivateChat(ctx, chatId) {
  const link = await ctx.telegram.createLink(ctx.club.id, ctx.admin.id, 'uz');
  const token = /start=(own_[A-Za-z0-9_-]+)$/.exec(link.url)[1];
  await ctx.telegram.handleWebhook(SECRET, update(chatId, `/start ${token}`));
  const status = await ctx.telegram.status(ctx.club.id);
  return { link, token, chat: status.chats[0] };
}

test('ulash: bir martalik havola, noto‘g‘ri sir rad etiladi, qayta ishlatib bo‘lmaydi', { timeout: 30000 }, async () => {
  const ctx = await fixture();
  const before = await ctx.telegram.status(ctx.club.id);
  assert.equal(before.available, true);
  assert.equal(before.botUsername, 'billiard_owner_bot');
  assert.equal(before.chats.length, 0);

  await assert.rejects(ctx.telegram.handleWebhook('wrong-secret', update(5001, '/start')), /Unauthorized|Autentifikatsiya/);

  const { token, chat } = await linkPrivateChat(ctx, 5001);
  assert.equal(chat.chatType, 'private');
  assert.equal(chat.isActive, true);
  assert.equal(chat.reportTime, '09:00');
  assert.equal(chat.alerts.cancel, true);
  const welcome = await waitFor(() => ctx.fake.sent.find((m) => m.chatId === '5001'));
  assert.match(welcome.text, /Ulandi: Telegram klubi/);

  // Bazada havolaning o'zi emas, faqat hash saqlanadi
  const raw = await database.query(`SELECT "tokenHash" FROM owner_telegram_link_tokens WHERE "clubId" = $1`, [ctx.club.id]);
  assert.ok(raw.every((row) => !row.tokenHash.includes(token.slice(4))));

  ctx.fake.sent.length = 0;
  await ctx.telegram.handleWebhook(SECRET, update(5002, `/start ${token}`));
  const expired = await waitFor(() => ctx.fake.sent.find((m) => m.chatId === '5002'));
  assert.match(expired.text, /eskirgan yoki ishlatilgan/);
  assert.equal((await ctx.telegram.status(ctx.club.id)).chats.length, 1);
});

test('kunlik hisobot: Hisobotlar bilan bir xil raqamlar, kuniga BIR marta yuboriladi', { timeout: 30000 }, async () => {
  const ctx = await fixture();
  const { chat } = await linkPrivateChat(ctx, 6001);
  await ctx.telegram.updateChat(ctx.club.id, chat.id, { reportTime: '00:00' });
  // Ulanganda bugungi sana yozilgan bo'lishi mumkin — kechagi hisobotni sinash uchun tozalaymiz
  await database.query(`UPDATE owner_telegram_chats SET "lastReportDate" = NULL WHERE id = $1`, [chat.id]);

  const now = new Date();
  const today = localDateParts(TZ, now);
  const noon = zonedMidnight(TZ, today.year, today.month, today.day - 1).getTime() + 12 * 3600 * 1000;
  const at = (minutes) => new Date(noon + minutes * 60000);
  const insertSession = async (table, start, minutes, tableAmount, barAmount, method) => {
    const [row] = await database.query(
      `INSERT INTO sessions ("clubId", "tableId", "userId", "startTime", "endTime", status, "durationSeconds", "durationMinutes",
                             "tableAmount", "barAmount", "totalAmount", "pricePerHour", "isPaid", "paymentMethod")
       VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $10, 15000, true, $11) RETURNING id`,
      [ctx.club.id, table.id, ctx.kassir.id, at(start), at(start + minutes), minutes * 60, minutes, tableAmount, barAmount, tableAmount + barAmount, method],
    );
    await database.query(
      `INSERT INTO sales ("clubId", "sessionId", "userId", "tableAmount", "barAmount", "totalAmount", "paymentMethod", discount, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $8)`,
      [ctx.club.id, row.id, ctx.kassir.id, tableAmount, barAmount, tableAmount + barAmount, method, at(start + minutes)],
    );
  };
  await insertSession(ctx.tables[0], 0, 60, 15000, 5000, 'cash');
  await insertSession(ctx.tables[1], 30, 30, 7500, 0, 'card');
  await database.query(
    `INSERT INTO audit_logs ("clubId", "userId", "actorRole", action, entity, "entityId", meta, "createdAt")
     VALUES ($1, $2, 'kassir', 'session.cancel', 'session', 0, $3::jsonb, $4)`,
    [ctx.club.id, ctx.kassir.id, JSON.stringify({ tableAmount: 4000, barAmount: 0 }), at(120)],
  );

  const preview = await ctx.telegram.preview(ctx.club.id, 'yesterday', 'uz');
  assert.ok(preview.includes(`Tushum: 27${NBSP}500${NBSP}so'm`), preview);
  assert.ok(preview.includes(`Naqd 20${NBSP}000${NBSP}so'm`));
  assert.ok(preview.includes(`Karta 7${NBSP}500${NBSP}so'm`));
  assert.ok(preview.includes("O'yinlar: <b>2</b>"));
  assert.ok(preview.includes(`Bar 5${NBSP}000${NBSP}so'm`));
  assert.ok(preview.includes("Bekor qilingan o'yinlar: <b>1</b>"));
  assert.ok(preview.includes('Aziz'));
  assert.ok(preview.includes('href="https://app.billiard.example.uz/reports"'));

  ctx.fake.sent.length = 0;
  assert.equal(await ctx.telegram.runDueReports(now), 1);
  const report = ctx.fake.sent.find((m) => m.chatId === '6001');
  assert.ok(report && report.text.includes('kunlik hisobot'));
  // Ikkinchi aylanish — shu kun uchun qayta yuborilmaydi
  assert.equal(await ctx.telegram.runDueReports(new Date(now.getTime() + 60000)), 0);
  assert.equal(ctx.fake.sent.filter((m) => m.chatId === '6001').length, 1);

  // Kunlik hisobot o'chirilgan chatga umuman bormaydi
  await database.query(`UPDATE owner_telegram_chats SET "lastReportDate" = NULL WHERE id = $1`, [chat.id]);
  await ctx.telegram.updateChat(ctx.club.id, chat.id, { dailyReport: false });
  assert.equal(await ctx.telegram.runDueReports(now), 0);
});

test('darhol xabar: kassir o‘yinni bekor qilsa egasiga ketadi; egasining o‘z amali va o‘chirilgan tur — yo‘q', { timeout: 30000 }, async () => {
  const ctx = await fixture();
  await linkPrivateChat(ctx, 7001);
  ctx.fake.sent.length = 0;

  const started = await ctx.sessions.start(ctx.club.id, ctx.kassir, {
    tableId: ctx.tables[0].id,
    offlineAt: new Date(Date.now() - 5 * 60000).toISOString(),
  });
  await ctx.sessions.cancel(ctx.club.id, ctx.kassir, started.id, { reason: 'adashib boshlandi' });
  const alert = await waitFor(() => ctx.fake.sent.find((m) => m.chatId === '7001' && m.text.includes('bekor qilindi')));
  assert.ok(alert, 'bekor qilish xabari kelmadi');
  assert.ok(alert.text.includes('Stol 1'));
  assert.ok(alert.text.includes('Aziz (kassir)'));
  assert.ok(alert.text.includes('adashib boshlandi'));

  // Egasining o'zi bekor qilgan o'yin — o'zining shaxsiy chatiga xabar kelmaydi
  const own = await ctx.sessions.start(ctx.club.id, ctx.admin, { tableId: ctx.tables[1].id });
  ctx.fake.sent.length = 0;
  const ownEntry = { action: 'session.cancel', clubId: ctx.club.id, userId: ctx.admin.id, actorRole: 'admin', entity: 'session', entityId: own.id, meta: { tableAmount: 1000, barAmount: 0 } };
  assert.equal(await ctx.alerts.onAudit(ownEntry), 0);

  // Tur o'chirilsa — kassirning amali ham yuborilmaydi
  const [{ id }] = (await ctx.telegram.status(ctx.club.id)).chats;
  await ctx.telegram.updateChat(ctx.club.id, id, { alerts: { cancel: false } });
  assert.equal(await ctx.alerts.onAudit({ ...ownEntry, userId: ctx.kassir.id, actorRole: 'kassir' }), 0);
  // Boshqa tur (chegirma) yoqiq qoladi
  assert.equal(await ctx.alerts.onAudit({ action: 'session.discount', clubId: ctx.club.id, userId: ctx.kassir.id, actorRole: 'kassir', entity: 'session', entityId: own.id, meta: { discount: 2000, totalAmount: 8000 } }), 1);
});

test('/hozir, /stop, qayta /start, bloklash va guruh ko‘chishi', { timeout: 30000 }, async () => {
  const ctx = await fixture();
  await linkPrivateChat(ctx, 8001);
  await ctx.sessions.start(ctx.club.id, ctx.kassir, {
    tableId: ctx.tables[1].id,
    offlineAt: new Date(Date.now() - 10 * 60000).toISOString(),
  });

  ctx.fake.sent.length = 0;
  await ctx.telegram.handleWebhook(SECRET, update(8001, '/hozir'));
  const live = await waitFor(() => ctx.fake.sent.find((m) => m.chatId === '8001'));
  assert.ok(live.text.includes('Band: <b>1/2</b>'), live.text);
  assert.ok(live.text.includes('Stol 2'));

  await ctx.telegram.handleWebhook(SECRET, update(8001, '/stop'));
  let [chat] = (await ctx.telegram.status(ctx.club.id)).chats;
  assert.equal(chat.isActive, false);
  assert.equal(chat.inactiveReason, 'stopped');

  await ctx.telegram.handleWebhook(SECRET, update(8001, '/start'));
  [chat] = (await ctx.telegram.status(ctx.club.id)).chats;
  assert.equal(chat.isActive, true);

  // Foydalanuvchi botni bloklasa — chat faolsizlanadi (ilovada ko'rinadi)
  ctx.fake.blocked.add('8001');
  const result = await ctx.telegram.testChat(ctx.club.id, chat.id);
  assert.equal(result.blocked, true);
  [chat] = (await ctx.telegram.status(ctx.club.id)).chats;
  assert.equal(chat.isActive, false);
  assert.equal(chat.inactiveReason, 'blocked');

  // Guruh supergroup'ga ko'chsa — yangi ID ga o'tadi
  await database.query(`UPDATE owner_telegram_chats SET "chatId" = '-100', "chatType" = 'group', "isActive" = true WHERE id = $1`, [chat.id]);
  await ctx.telegram.handleWebhook(SECRET, { message: { message_id: 1, chat: { id: -100, type: 'group' }, migrate_to_chat_id: -1001234 } });
  const rows = await database.query(`SELECT "chatId", "chatType" FROM owner_telegram_chats WHERE id = $1`, [chat.id]);
  assert.deepEqual(rows[0], { chatId: '-1001234', chatType: 'supergroup' });
});
