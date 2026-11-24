import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OwnerBotApi } from '../src/modules/owner-telegram/owner-bot.api';
import { ownerBotConfig } from '../src/modules/owner-telegram/owner-bot.config';
import {
  DailyReportData,
  PeriodSummary,
  renderCancelAlert,
  renderDailyReport,
  renderLiveStatus,
  renderShiftClosedAlert,
} from '../src/modules/owner-telegram/owner-report.render';
import {
  addDays,
  esc,
  formatChange,
  formatDayLabel,
  formatDuration,
  formatMoney,
  localMinutes,
  splitMessage,
} from '../src/modules/owner-telegram/owner-telegram.format';

/**
 * Klub egasi boti: matnlar egasiga PUL haqida aytadi — raqam formati, sana va
 * taqqoslash xato bo'lsa ishonch yo'qoladi. Telegram HTML esa buzilsa xabar umuman ketmaydi.
 */

const NBSP = ' ';
const sp = (s: string) => s.replace(/ /g, NBSP);

const summary = (patch: Partial<PeriodSummary> = {}): PeriodSummary => ({
  collected: 0,
  byMethod: { cash: 0, card: 0, transfer: 0 },
  billed: 0,
  tableRevenue: 0,
  barRevenue: 0,
  sessions: 0,
  avgMinutes: 0,
  playSeconds: 0,
  discounts: 0,
  debtsCreated: 0,
  debtsCollected: 0,
  expenses: 0,
  profit: 0,
  ...patch,
});

const allFeatures = { bar: true, debts: true, expenses: true, shifts: true, lights: true, reports: true };

const baseData = (patch: Partial<DailyReportData> = {}): DailyReportData => ({
  club: { name: 'Demo <Club> & Co', currency: "so'm", features: allFeatures, subscriptionDaysLeft: null, appUrl: 'https://billiard.example.uz' },
  day: { year: 2026, month: 11, day: 22 }, // yakshanba
  current: summary({
    collected: 1250000,
    byMethod: { cash: 900000, card: 300000, transfer: 50000 },
    tableRevenue: 980000,
    barRevenue: 270000,
    sessions: 34,
    avgMinutes: 72,
    playSeconds: 40 * 3600,
    expenses: 150000,
    profit: 1100000,
  }),
  sameWeekdayLastWeek: summary({ collected: 1000000 }),
  topTables: [{ name: 'Stol 3', seconds: 9 * 3600, sessions: 6 }],
  topProducts: [{ name: 'Choy', quantity: 18 }],
  staff: [{ name: 'Aziz', count: 18, amount: 640000 }],
  cancelled: { count: 2, amount: 45000, byStaff: [{ name: 'Aziz', count: 2 }] },
  shifts: [
    { openedByName: 'Aziz', closedByName: 'Aziz', openedAt: '2026-11-22T04:00:00.000Z', closedAt: '2026-11-22T18:40:00.000Z', difference: -20000 },
  ],
  debtsOutstanding: { amount: 2340000, count: 7, overdueCount: 3 },
  lights: { configured: 8, failing: 0 },
  week: null,
  month: null,
  ...patch,
});

test('raqam, summa, davomiylik va sana formatlari (uz/ru)', () => {
  assert.equal(formatMoney(1250000, "so'm"), sp("1 250 000 so'm"));
  assert.equal(formatMoney(-20000.4, '₽'), sp('−20 000 ₽'));
  // Son va birlik ajralmaydi, birliklar orasida esa qator bo'linishi mumkin
  assert.equal(formatDuration(72 * 60, 'uz'), `1${NBSP}soat 12${NBSP}daq`);
  assert.equal(formatDuration(45 * 60, 'ru'), sp('45 мин'));
  assert.equal(formatDuration(2 * 3600, 'uz'), sp('2 soat'));
  assert.equal(formatDayLabel({ year: 2026, month: 11, day: 22 }, 'uz'), '22-noyabr, yakshanba');
  assert.equal(formatDayLabel({ year: 2026, month: 11, day: 22 }, 'ru'), '22 ноября, воскресенье');
  assert.deepEqual(addDays({ year: 2026, month: 3, day: 1 }, -1), { year: 2026, month: 2, day: 28 });
  assert.deepEqual(addDays({ year: 2026, month: 12, day: 31 }, 1), { year: 2027, month: 1, day: 1 });
  assert.equal(formatChange(1250000, 1000000), '▲ 25%');
  assert.equal(formatChange(900, 1000), '▼ 10%');
  assert.equal(formatChange(500, 0), null);
  assert.equal(esc('<b>&'), '&lt;b&gt;&amp;');
  // Toshkent UTC+5: 04:00Z -> 09:00
  assert.equal(localMinutes('Asia/Tashkent', new Date('2026-11-22T04:00:00Z')), 9 * 60);
});

test('kunlik hisobot: tushum, taqqoslash, kassa farqi, bekor qilinganlar; HTML xavfsiz', () => {
  const html = renderDailyReport(baseData(), 'uz', { mode: 'yesterday', tz: 'Asia/Tashkent' });
  assert.match(html, /Demo &lt;Club&gt; &amp; Co/); // klub nomi ekranlangan
  assert.ok(html.includes(`Tushum: ${sp("1 250 000 so'm")}`));
  assert.ok(html.includes("▲ 25% o'tgan yakshanbaga nisbatan"));
  assert.ok(html.includes(`Naqd ${sp("900 000 so'm")}`));
  assert.ok(html.includes(`Karta ${sp("300 000 so'm")}`));
  assert.ok(html.includes('<b>34</b>'));
  assert.ok(html.includes(`kassa farqi <b>${sp("−20 000 so'm")}</b>`));
  assert.ok(html.includes('09:00–23:40')); // smena vaqti klub mintaqasida
  assert.ok(html.includes("Bekor qilingan o'yinlar: <b>2</b>"));
  assert.ok(html.includes("3 tasi muddati o'tgan"));
  assert.ok(html.includes('8/8 ishlayapti'));
  assert.ok(html.includes('href="https://billiard.example.uz/reports"'));
  // Faqat ruxsat etilgan teglar va har biri yopilgan
  const tags = html.match(/<\/?[a-z]+[^>]*>/g) ?? [];
  for (const tag of tags) assert.match(tag, /^<\/?(b|a|code)( href="[^"]+")?>$/);
  const opened = tags.filter((tag) => !tag.startsWith('</')).length;
  assert.equal(opened * 2, tags.length);

  const ru = renderDailyReport(baseData(), 'ru', { mode: 'yesterday', tz: 'Asia/Tashkent' });
  assert.ok(ru.includes('▲ 25% к прошлому воскресенью'));
  assert.ok(ru.includes('Выручка'));
});

test('tarifda yo‘q bo‘limlar hisobotga chiqmaydi; bo‘sh kun ham tushunarli', () => {
  const basic = baseData();
  basic.club = { ...basic.club, features: { bar: false, debts: false, expenses: false, shifts: false, lights: false, reports: false } };
  const html = renderDailyReport(basic, 'uz', { mode: 'yesterday', tz: 'Asia/Tashkent' });
  for (const absent of ['nisbatan', 'Bar TOP', 'Kassada', 'Xarajat', 'Qarz', 'Smena', 'Chiroqlar', 'Eng band']) {
    assert.ok(!html.includes(absent), absent);
  }
  assert.ok(html.includes('Tushum')); // asosiy raqamlar hammaga

  const empty = renderDailyReport(
    baseData({ current: summary(), cancelled: { count: 0, amount: 0, byStaff: [] }, shifts: [], topTables: [], staff: [], topProducts: [] }),
    'uz',
    { mode: 'yesterday', tz: 'Asia/Tashkent' },
  );
  assert.ok(empty.includes("O'yinlar bo'lmadi"));
  assert.ok(!empty.includes('Tushum'));
});

test('hafta va oy yakuni bloklari; obuna eslatmasi', () => {
  const html = renderDailyReport(
    baseData({
      week: { from: { year: 2026, month: 11, day: 16 }, to: { year: 2026, month: 11, day: 22 }, current: summary({ collected: 8400000, sessions: 230 }), previous: summary({ collected: 8000000 }) },
      month: { year: 2026, month: 11, current: summary({ collected: 35000000, sessions: 980 }), previous: summary({ collected: 35000000 }) },
      club: { ...baseData().club, subscriptionDaysLeft: 3 },
    }),
    'uz',
    { mode: 'yesterday', tz: 'Asia/Tashkent' },
  );
  assert.ok(html.includes("O'tgan hafta</b> (16–22-noyabr)"));
  assert.ok(html.includes('▲ 5%'));
  assert.ok(html.includes('Noyabr yakuni'));
  assert.ok(html.includes('= 0%'));
  assert.ok(html.includes('3 kundan keyin'));
});

test('darhol xabarlar: bekor qilish va smena yopilishi', () => {
  const ctx = { club: 'Demo', currency: "so'm", actor: 'Aziz <kassa>', actorRole: 'kassir', table: 'Stol 2', time: '21:14' };
  const cancel = renderCancelAlert(ctx, { tableAmount: 25000, barAmount: 3000, durationSeconds: 42 * 60, reason: 'mijoz ketdi', offline: true }, 'uz');
  assert.ok(cancel.includes(`O'chirilgan summa: <b>${sp("28 000 so'm")}</b>`));
  assert.ok(cancel.includes('Aziz &lt;kassa&gt; (kassir)'));
  assert.ok(cancel.includes('Internetsiz'));
  const shift = renderShiftClosedAlert(
    ctx,
    {
      openedAt: '2026-11-22T04:00:00.000Z', closedAt: '2026-11-22T18:40:00.000Z', openingCash: 200000, expectedCash: 1100000,
      countedCash: 1080000, difference: -20000, cashOut: 0, sessionsCount: 30, collected: 1200000,
      byMethod: { cash: 900000, card: 300000, transfer: 0 }, debtsCreated: 0, expenses: 0, discounts: 10000, note: null,
    },
    'uz',
    'Asia/Tashkent',
  );
  assert.ok(shift.includes(`Kamomad: ${sp("20 000 so'm")}`));
  assert.ok(shift.includes('09:00–23:40'));
  const live = renderLiveStatus(
    { club: baseData().club, time: '14:32', totalTables: 8, tables: [{ name: 'Stol 1', paused: false, seconds: 3900, amount: 16250, customer: 'Ali' }] },
    'uz',
  );
  assert.ok(live.includes('Band: <b>1/8</b>'));
  assert.ok(live.includes('1:05'));
});

test('uzun xabar qator chegarasida bo‘linadi', () => {
  const html = Array.from({ length: 300 }, (_, i) => `<b>qator ${i}</b> ${'x'.repeat(20)}`).join('\n');
  const parts = splitMessage(html, 1000);
  assert.ok(parts.length > 1);
  for (const part of parts) {
    assert.ok(part.length <= 1000);
    assert.equal((part.match(/<b>/g) ?? []).length, (part.match(/<\/b>/g) ?? []).length);
  }
  assert.equal(parts.join('\n'), html);
});

test('bot sozlamasi: uchala qiymat to‘g‘ri bo‘lmasa — «sozlanmagan»', () => {
  const env: Record<string, string> = {
    OWNER_TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(35)}`,
    OWNER_TELEGRAM_BOT_USERNAME: '@billiard_owner_bot',
    OWNER_TELEGRAM_WEBHOOK_SECRET: 's'.repeat(40),
  };
  assert.deepEqual(ownerBotConfig((k) => env[k]), { token: env.OWNER_TELEGRAM_BOT_TOKEN, username: 'billiard_owner_bot', secret: 's'.repeat(40) });
  assert.equal(ownerBotConfig((k) => ({ ...env, OWNER_TELEGRAM_WEBHOOK_SECRET: 'short' })[k]), null);
  assert.equal(ownerBotConfig((k) => ({ ...env, OWNER_TELEGRAM_BOT_TOKEN: '' })[k]), null);
});

test('Telegram API: ko‘chish, bloklash, 429 va tarmoq xatosi to‘g‘ri ajratiladi', async () => {
  const replies: Array<{ status: number; body: unknown } | 'throw'> = [];
  const calls: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push(String((JSON.parse(String(init?.body)) as { chat_id: string }).chat_id));
    assert.ok(url.endsWith('/sendMessage'));
    const next = replies.shift();
    if (!next || next === 'throw') throw new Error(`fetch failed ${url}`); // URL ichida token — tashqariga chiqmasligi kerak
    return { status: next.status, json: async () => next.body } as Response;
  };
  const api = new OwnerBotApi('1:token', fetchImpl, async () => undefined);

  replies.push({ status: 200, body: { ok: true } });
  assert.deepEqual(await api.sendMessage('1', 'hi'), { ok: true });

  replies.push({ status: 400, body: { ok: false, description: 'group upgraded', parameters: { migrate_to_chat_id: -1009 } } });
  assert.equal((await api.sendMessage('-5', 'hi')).migratedTo, '-1009');

  replies.push({ status: 403, body: { ok: false, description: 'Forbidden: bot was blocked by the user' } });
  const blocked = await api.sendMessage('2', 'hi');
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.permanent, true);

  replies.push({ status: 429, body: { ok: false, description: 'Too Many Requests', parameters: { retry_after: 1 } } }, { status: 200, body: { ok: true } });
  assert.equal((await api.sendMessage('3', 'hi')).ok, true);

  replies.push('throw', 'throw', 'throw');
  const network = await api.sendMessage('4', 'hi');
  assert.equal(network.ok, false);
  assert.equal(network.error, 'network error');
  assert.ok(!String(network.error).includes('token'));
});
