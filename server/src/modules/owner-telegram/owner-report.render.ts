/**
 * Klub egasi botining xabarlari — SOF render funksiyalari (ma'lumot -> Telegram HTML).
 * Raqamlar `OwnerReportService` da yig'iladi (Hisobotlar sahifasi bilan bir xil manba),
 * bu yerda faqat ko'rinish. Har dinamik matn `esc()` dan o'tadi.
 */
import {
  addDays,
  BotLang,
  DayParts,
  esc,
  formatChange,
  formatClockDuration,
  formatDayLabel,
  formatDuration,
  formatMoney,
  formatNumber,
  formatRangeLabel,
  formatSigned,
  monthName,
  weekday,
} from './owner-telegram.format';

export interface PeriodSummary {
  /** Haqiqatda olingan pul: hisob-kitob + qarz to'lovlari */
  collected: number;
  byMethod: { cash: number; card: number; transfer: number };
  billed: number;
  tableRevenue: number;
  barRevenue: number;
  sessions: number;
  avgMinutes: number;
  playSeconds: number;
  discounts: number;
  debtsCreated: number;
  debtsCollected: number;
  expenses: number;
  profit: number;
}

export interface ReportFeatures {
  bar: boolean;
  debts: boolean;
  expenses: boolean;
  shifts: boolean;
  lights: boolean;
  /** «Hisobotlar» imkoniyati — taqqoslash, TOP va xodimlar kesimi */
  reports: boolean;
}

export interface ClubReportInfo {
  name: string;
  currency: string;
  features: ReportFeatures;
  /** Obuna tugashiga qolgan kun (7 kundan ko'p bo'lsa null) */
  subscriptionDaysLeft: number | null;
  /** Ilova manzili (havolalar uchun) — ommaviy https bo'lmasa null */
  appUrl: string | null;
}

export interface ShiftLine {
  openedByName: string | null;
  closedByName: string | null;
  openedAt: string;
  closedAt: string;
  difference: number | null;
}

export interface DailyReportData {
  club: ClubReportInfo;
  day: DayParts;
  current: PeriodSummary;
  /** O'tgan haftaning shu kuni (taqqoslash uchun) */
  sameWeekdayLastWeek: PeriodSummary | null;
  topTables: Array<{ name: string; seconds: number; sessions: number }>;
  topProducts: Array<{ name: string; quantity: number }>;
  staff: Array<{ name: string; count: number; amount: number }>;
  cancelled: { count: number; amount: number; byStaff: Array<{ name: string; count: number }> };
  shifts: ShiftLine[];
  debtsOutstanding: { amount: number; count: number; overdueCount: number };
  lights: { configured: number; failing: number } | null;
  week: { from: DayParts; to: DayParts; current: PeriodSummary; previous: PeriodSummary } | null;
  month: { year: number; month: number; current: PeriodSummary; previous: PeriodSummary } | null;
}

/* ------------------------------------------------------------------ matnlar */

const RU_LAST_WEEKDAY = [
  'прошлому воскресенью',
  'прошлому понедельнику',
  'прошлому вторнику',
  'прошлой среде',
  'прошлому четвергу',
  'прошлой пятнице',
  'прошлой субботе',
];
const UZ_LAST_WEEKDAY = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

const T = {
  uz: {
    dailyTitle: (club: string) => `📊 <b>${club}</b> — kunlik hisobot`,
    todayTitle: (club: string, time: string) => `📊 <b>${club}</b> — bugun, soat ${time} gacha`,
    noGames: "🎱 O'yinlar bo'lmadi.",
    revenue: (money: string) => `💰 <b>Tushum: ${money}</b>`,
    vsLastWeekday: (change: string, d: DayParts) => `${change} o'tgan ${UZ_LAST_WEEKDAY[weekday(d)]}ga nisbatan`,
    cash: 'Naqd',
    card: 'Karta',
    transfer: "O'tkazma",
    games: (n: number, avg: string, total: string) => `🎱 O'yinlar: <b>${n}</b> · o'rtacha ${avg} · jami ${total}`,
    tables: 'Stollar',
    bar: 'Bar',
    discounts: (money: string) => `🏷 Chegirmalar: ${money}`,
    topTables: '🏆 Eng band stollar:',
    topProducts: '🍺 Bar TOP:',
    staff: '👥 Kassada:',
    staffItem: (name: string, money: string, count: number) => `${name} — ${money} (${count})`,
    expenses: (exp: string, profit: string) => `💸 Xarajat: ${exp} · <b>Foyda: ${profit}</b>`,
    debtsMoves: (created: string, collected: string) => `📒 Qarz: +${created} yozildi · ${collected} undirildi`,
    debtsOutstanding: (money: string, count: number, overdue: number) =>
      `📒 Jami qarzdorlik: ${money} (${count} ta${overdue > 0 ? `, ${overdue} tasi muddati o'tgan` : ''})`,
    shift: (who: string, period: string, diff: string) => `🧾 Smena ${period} (${who}): ${diff}`,
    shiftOk: "kassa to'g'ri ✅",
    shiftDiff: (money: string) => `kassa farqi <b>${money}</b>`,
    shiftNoCount: 'kassa sanalmagan',
    cancelled: (n: number, money: string) => `⚠️ Bekor qilingan o'yinlar: <b>${n}</b> · ${money}`,
    lightsOk: (ok: number, all: number) => `💡 Chiroqlar: ${ok}/${all} ishlayapti`,
    lightsBad: (bad: number, all: number) => `💡 Chiroqlar: <b>${bad} ta rele javob bermayapti</b> (${all} tadan) — tekshiring`,
    subscription: (days: number) =>
      days <= 0
        ? '⏳ <b>Obunangiz bugun tugaydi</b> — ilovada «Obuna» bo\'limidan uzaytiring.'
        : `⏳ Obunangiz <b>${days} kundan keyin</b> tugaydi — ilovada «Obuna» bo'limidan uzaytiring.`,
    week: (range: string) => `📈 <b>O'tgan hafta</b> (${range}):`,
    month: (name: string) => `📆 <b>${name} yakuni:</b>`,
    periodLine: (money: string, change: string | null, sessions: number) =>
      `   ${money}${change ? ` · ${change}` : ''} · ${sessions} ta o'yin`,
    periodProfit: (money: string) => `   Foyda: ${money}`,
    details: 'Batafsil hisobot',
    footer: 'Buyruqlar: /bugun · /hozir · /hafta',
  },
  ru: {
    dailyTitle: (club: string) => `📊 <b>${club}</b> — отчёт за день`,
    todayTitle: (club: string, time: string) => `📊 <b>${club}</b> — сегодня, до ${time}`,
    noGames: '🎱 Игр не было.',
    revenue: (money: string) => `💰 <b>Выручка: ${money}</b>`,
    vsLastWeekday: (change: string, d: DayParts) => `${change} к ${RU_LAST_WEEKDAY[weekday(d)]}`,
    cash: 'Наличные',
    card: 'Карта',
    transfer: 'Перевод',
    games: (n: number, avg: string, total: string) => `🎱 Игры: <b>${n}</b> · в среднем ${avg} · всего ${total}`,
    tables: 'Столы',
    bar: 'Бар',
    discounts: (money: string) => `🏷 Скидки: ${money}`,
    topTables: '🏆 Самые загруженные столы:',
    topProducts: '🍺 Бар ТОП:',
    staff: '👥 На кассе:',
    staffItem: (name: string, money: string, count: number) => `${name} — ${money} (${count})`,
    expenses: (exp: string, profit: string) => `💸 Расходы: ${exp} · <b>Прибыль: ${profit}</b>`,
    debtsMoves: (created: string, collected: string) => `📒 Долги: +${created} записано · ${collected} погашено`,
    debtsOutstanding: (money: string, count: number, overdue: number) =>
      `📒 Всего долгов: ${money} (${count}${overdue > 0 ? `, из них просрочено: ${overdue}` : ''})`,
    shift: (who: string, period: string, diff: string) => `🧾 Смена ${period} (${who}): ${diff}`,
    shiftOk: 'касса сошлась ✅',
    shiftDiff: (money: string) => `расхождение кассы <b>${money}</b>`,
    shiftNoCount: 'касса не пересчитана',
    cancelled: (n: number, money: string) => `⚠️ Отменённые игры: <b>${n}</b> · ${money}`,
    lightsOk: (ok: number, all: number) => `💡 Свет: работает ${ok}/${all}`,
    lightsBad: (bad: number, all: number) => `💡 Свет: <b>не отвечают реле: ${bad}</b> (из ${all}) — проверьте`,
    subscription: (days: number) =>
      days <= 0
        ? '⏳ <b>Подписка заканчивается сегодня</b> — продлите в разделе «Подписка».'
        : `⏳ Подписка заканчивается <b>через ${days} дн.</b> — продлите в разделе «Подписка».`,
    week: (range: string) => `📈 <b>Прошлая неделя</b> (${range}):`,
    month: (name: string) => `📆 <b>Итоги: ${name.toLowerCase()}</b>`,
    periodLine: (money: string, change: string | null, sessions: number) =>
      `   ${money}${change ? ` · ${change}` : ''} · игр: ${sessions}`,
    periodProfit: (money: string) => `   Прибыль: ${money}`,
    details: 'Подробный отчёт',
    footer: 'Команды: /bugun · /hozir · /hafta',
  },
};

/* ------------------------------------------------------------- yordamchilar */

const paymentLine = (sum: PeriodSummary, lang: BotLang, currency: string): string | null => {
  const t = T[lang];
  const parts = [
    sum.byMethod.cash > 0 ? `${t.cash} ${formatMoney(sum.byMethod.cash, currency)}` : null,
    sum.byMethod.card > 0 ? `${t.card} ${formatMoney(sum.byMethod.card, currency)}` : null,
    sum.byMethod.transfer > 0 ? `${t.transfer} ${formatMoney(sum.byMethod.transfer, currency)}` : null,
  ].filter((x): x is string => x !== null);
  // Bitta usul bo'lsa ham ko'rsatamiz — egasi naqd/karta ulushini bilishi muhim
  return parts.length ? `   ${parts.join(' · ')}` : null;
};

const reportLink = (club: ClubReportInfo, lang: BotLang): string | null =>
  club.appUrl ? `🔗 <a href="${esc(`${club.appUrl}/reports`)}">${T[lang].details}</a>` : null;

const timeOf = (iso: string, tz: string): string => {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
};

/* ------------------------------------------------------------ kunlik hisobot */

export interface RenderDailyOptions {
  /** 'yesterday' — yakunlangan kun (taqqoslash, hafta/oy bloklari bilan); 'today' — bugun hozirgacha */
  mode: 'yesterday' | 'today';
  tz: string;
  /** today rejimi uchun joriy soat ("14:32") */
  nowLabel?: string;
}

export function renderDailyReport(data: DailyReportData, lang: BotLang, options: RenderDailyOptions): string {
  const t = T[lang];
  const { club, current } = data;
  const money = (n: number) => formatMoney(n, club.currency);
  const f = club.features;
  const lines: string[] = [];

  lines.push(
    options.mode === 'today'
      ? t.todayTitle(esc(club.name), options.nowLabel ?? '')
      : t.dailyTitle(esc(club.name)),
  );
  lines.push(`📅 ${formatDayLabel(data.day, lang)}`);
  lines.push('');

  // Tushum — pul olingan bo'lsa (o'yin bo'lmasa ham qarz to'lovi bo'lishi mumkin)
  if (current.collected > 0 || current.sessions > 0) {
    let revenue = t.revenue(money(current.collected));
    const change =
      options.mode === 'yesterday' && f.reports && data.sameWeekdayLastWeek
        ? formatChange(current.collected, data.sameWeekdayLastWeek.collected)
        : null;
    if (change) revenue += ` · ${t.vsLastWeekday(change, data.day)}`;
    lines.push(revenue);
    const payments = paymentLine(current, lang, club.currency);
    if (payments) lines.push(payments);
  }

  if (current.sessions > 0) {
    lines.push(
      t.games(
        current.sessions,
        formatDuration(current.avgMinutes * 60, lang),
        formatDuration(current.playSeconds, lang),
      ),
    );
    const split = [`${t.tables} ${money(current.tableRevenue)}`];
    if (f.bar && current.barRevenue > 0) split.push(`${t.bar} ${money(current.barRevenue)}`);
    lines.push(`   ${split.join(' · ')}`);
  } else {
    lines.push(t.noGames);
  }

  if (current.discounts > 0) lines.push(t.discounts(money(current.discounts)));

  if (f.reports && data.topTables.length > 0) {
    const items = data.topTables.map((row) => `${esc(row.name)} — ${formatDuration(row.seconds, lang)}`);
    lines.push(`${t.topTables} ${items.join(' · ')}`);
  }
  if (f.reports && f.bar && data.topProducts.length > 0) {
    const items = data.topProducts.map((row) => `${esc(row.name)} ×${formatNumber(row.quantity)}`);
    lines.push(`${t.topProducts} ${items.join(' · ')}`);
  }
  if (f.reports && data.staff.length > 0) {
    const items = data.staff.map((row) => t.staffItem(esc(row.name), money(row.amount), row.count));
    lines.push(`${t.staff} ${items.join(' · ')}`);
  }

  if (f.expenses && current.expenses > 0) {
    lines.push(t.expenses(money(current.expenses), money(current.profit)));
  }

  if (f.debts) {
    if (current.debtsCreated > 0 || current.debtsCollected > 0) {
      lines.push(t.debtsMoves(money(current.debtsCreated), money(current.debtsCollected)));
    }
    if (data.debtsOutstanding.amount > 0) {
      lines.push(
        t.debtsOutstanding(
          money(data.debtsOutstanding.amount),
          data.debtsOutstanding.count,
          data.debtsOutstanding.overdueCount,
        ),
      );
    }
  }

  if (f.shifts) {
    for (const shift of data.shifts.slice(0, 3)) {
      const who = esc(shift.closedByName || shift.openedByName || '—');
      const period = `${timeOf(shift.openedAt, options.tz)}–${timeOf(shift.closedAt, options.tz)}`;
      const diff =
        shift.difference === null
          ? t.shiftNoCount
          : Math.abs(shift.difference) < 0.5
            ? t.shiftOk
            : t.shiftDiff(formatSigned(shift.difference, club.currency));
      lines.push(t.shift(who, period, diff));
    }
  }

  if (data.cancelled.count > 0) {
    let line = t.cancelled(data.cancelled.count, money(data.cancelled.amount));
    const who = data.cancelled.byStaff
      .filter((row) => row.name)
      .map((row) => `${esc(row.name)} — ${row.count}`);
    if (who.length) line += ` (${who.join(', ')})`;
    lines.push(line);
  }

  if (f.lights && data.lights && data.lights.configured > 0) {
    lines.push(
      data.lights.failing > 0
        ? t.lightsBad(data.lights.failing, data.lights.configured)
        : t.lightsOk(data.lights.configured, data.lights.configured),
    );
  }

  if (club.subscriptionDaysLeft !== null) lines.push(t.subscription(club.subscriptionDaysLeft));

  if (options.mode === 'yesterday' && f.reports && data.week) {
    const w = data.week;
    lines.push('');
    lines.push(t.week(formatRangeLabel(w.from, w.to, lang)));
    lines.push(t.periodLine(money(w.current.collected), formatChange(w.current.collected, w.previous.collected), w.current.sessions));
    if (f.expenses && w.current.expenses > 0) lines.push(t.periodProfit(money(w.current.profit)));
  }
  if (options.mode === 'yesterday' && f.reports && data.month) {
    const m = data.month;
    lines.push('');
    lines.push(t.month(monthName(m.month, lang)));
    lines.push(t.periodLine(money(m.current.collected), formatChange(m.current.collected, m.previous.collected), m.current.sessions));
    if (f.expenses && m.current.expenses > 0) lines.push(t.periodProfit(money(m.current.profit)));
  }

  const link = reportLink(club, lang);
  lines.push('');
  if (link) lines.push(link);
  lines.push(t.footer);
  return lines.join('\n');
}

/* ------------------------------------------------------- davr (hafta) xulosasi */

export function renderPeriodSummary(
  input: {
    club: ClubReportInfo;
    from: DayParts;
    to: DayParts;
    current: PeriodSummary;
    previous: PeriodSummary | null;
    days: Array<{ day: DayParts; collected: number }>;
  },
  lang: BotLang,
): string {
  const { club, current } = input;
  const money = (n: number) => formatMoney(n, club.currency);
  const lines: string[] = [];
  lines.push(
    lang === 'ru'
      ? `📈 <b>${esc(club.name)}</b> — последние 7 дней`
      : `📈 <b>${esc(club.name)}</b> — so'nggi 7 kun`,
  );
  lines.push(`📅 ${formatRangeLabel(input.from, input.to, lang)}`);
  lines.push('');
  const change = input.previous ? formatChange(current.collected, input.previous.collected) : null;
  lines.push(
    (lang === 'ru' ? `💰 <b>Выручка: ${money(current.collected)}</b>` : `💰 <b>Tushum: ${money(current.collected)}</b>`) +
      (change ? (lang === 'ru' ? ` · ${change} к прошлой неделе` : ` · ${change} oldingi haftaga nisbatan`) : ''),
  );
  const payments = paymentLine(current, lang, club.currency);
  if (payments) lines.push(payments);
  lines.push(
    lang === 'ru'
      ? `🎱 Игры: <b>${current.sessions}</b> · всего ${formatDuration(current.playSeconds, lang)}`
      : `🎱 O'yinlar: <b>${current.sessions}</b> · jami ${formatDuration(current.playSeconds, lang)}`,
  );
  if (club.features.expenses && current.expenses > 0) {
    lines.push(
      lang === 'ru'
        ? `💸 Расходы: ${money(current.expenses)} · <b>Прибыль: ${money(current.profit)}</b>`
        : `💸 Xarajat: ${money(current.expenses)} · <b>Foyda: ${money(current.profit)}</b>`,
    );
  }
  if (input.days.length > 0) {
    lines.push('');
    const best = Math.max(...input.days.map((d) => d.collected), 0);
    for (const d of input.days) {
      // Kunlik ustun — eng yaxshi kunga nisbatan (8 bo'lak)
      const bars = best > 0 ? Math.round((d.collected / best) * 8) : 0;
      const label = formatDayLabel(d.day, lang).split(',')[0];
      lines.push(`<code>${'█'.repeat(bars).padEnd(8, '·')}</code> ${label} — ${money(d.collected)}`);
    }
  }
  const link = reportLink(club, lang);
  if (link) {
    lines.push('');
    lines.push(link);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------ hozir klubda */

export interface LiveTable {
  name: string;
  paused: boolean;
  seconds: number;
  amount: number;
  customer: string | null;
}

export function renderLiveStatus(
  input: { club: ClubReportInfo; time: string; totalTables: number; tables: LiveTable[] },
  lang: BotLang,
): string {
  const { club } = input;
  const money = (n: number) => formatMoney(n, club.currency);
  const lines: string[] = [];
  lines.push(
    lang === 'ru'
      ? `🟢 <b>${esc(club.name)}</b> — сейчас (${input.time})`
      : `🟢 <b>${esc(club.name)}</b> — hozir (${input.time})`,
  );
  if (input.tables.length === 0) {
    lines.push(lang === 'ru' ? 'Все столы свободны.' : "Hamma stollar bo'sh.");
    return lines.join('\n');
  }
  const paused = input.tables.filter((row) => row.paused).length;
  lines.push(
    lang === 'ru'
      ? `Занято: <b>${input.tables.length}/${input.totalTables}</b>${paused ? ` · на паузе: ${paused}` : ''}`
      : `Band: <b>${input.tables.length}/${input.totalTables}</b> stol${paused ? ` · pauzada: ${paused}` : ''}`,
  );
  lines.push('');
  for (const row of input.tables) {
    const state = row.paused ? (lang === 'ru' ? ' ⏸' : ' ⏸') : '';
    const who = row.customer ? ` · ${esc(row.customer)}` : '';
    lines.push(`• ${esc(row.name)}${state} — ${formatClockDuration(row.seconds)} · ≈ ${money(row.amount)}${who}`);
  }
  const total = input.tables.reduce((sum, row) => sum + row.amount, 0);
  lines.push('');
  lines.push(
    lang === 'ru'
      ? `Открыто на столах: <b>≈ ${money(total)}</b>`
      : `Ochiq stollarda: <b>≈ ${money(total)}</b>`,
  );
  return lines.join('\n');
}

/* ----------------------------------------------------- darhol xabarlar (alert) */

export interface AlertContext {
  club: string;
  currency: string;
  actor: string | null;
  actorRole: string | null;
  table: string | null;
  time: string;
}

const roleName = (role: string | null, lang: BotLang): string | null => {
  if (!role) return null;
  const uz: Record<string, string> = { admin: 'admin', kassir: 'kassir', operator: 'operator', superadmin: 'platforma' };
  const ru: Record<string, string> = { admin: 'админ', kassir: 'кассир', operator: 'оператор', superadmin: 'платформа' };
  return (lang === 'ru' ? ru : uz)[role] ?? role;
};

const actorLine = (ctx: AlertContext, lang: BotLang): string => {
  const role = roleName(ctx.actorRole, lang);
  const who = ctx.actor ? `${esc(ctx.actor)}${role ? ` (${role})` : ''}` : '—';
  return lang === 'ru' ? `👤 Сотрудник: ${who}` : `👤 Xodim: ${who}`;
};

const header = (icon: string, title: string, ctx: AlertContext) => `${icon} <b>${title}</b> · ${esc(ctx.club)} · ${ctx.time}`;

export function renderCancelAlert(
  ctx: AlertContext,
  input: { tableAmount: number; barAmount: number; durationSeconds: number; reason: string | null; offline: boolean },
  lang: BotLang,
): string {
  const money = (n: number) => formatMoney(n, ctx.currency);
  const total = input.tableAmount + input.barAmount;
  const lines = [
    header('❌', lang === 'ru' ? 'Игра отменена' : "O'yin bekor qilindi", ctx),
    `🎱 ${esc(ctx.table ?? '—')} · ${formatDuration(input.durationSeconds, lang)}`,
    lang === 'ru'
      ? `💸 Списано: <b>${money(total)}</b>${input.barAmount > 0 ? ` (стол ${money(input.tableAmount)} + бар ${money(input.barAmount)})` : ''}`
      : `💸 O'chirilgan summa: <b>${money(total)}</b>${input.barAmount > 0 ? ` (stol ${money(input.tableAmount)} + bar ${money(input.barAmount)})` : ''}`,
    actorLine(ctx, lang),
  ];
  if (input.reason) lines.push(`${lang === 'ru' ? '📝 Причина' : '📝 Sabab'}: ${esc(input.reason)}`);
  if (input.offline) lines.push(lang === 'ru' ? '📶 Отменено без интернета' : '📶 Internetsiz bekor qilingan');
  return lines.join('\n');
}

export function renderOrderCancelAlert(
  ctx: AlertContext,
  input: { totalAmount: number; itemCount: number; reason: string | null },
  lang: BotLang,
): string {
  const lines = [
    header('↩️', lang === 'ru' ? 'Заказ бара отменён' : 'Bar buyurtmasi bekor qilindi', ctx),
    `🎱 ${esc(ctx.table ?? '—')} · ${lang === 'ru' ? 'позиций' : 'mahsulot'}: ${input.itemCount} · <b>${formatMoney(input.totalAmount, ctx.currency)}</b>`,
    actorLine(ctx, lang),
  ];
  if (input.reason) lines.push(`${lang === 'ru' ? '📝 Причина' : '📝 Sabab'}: ${esc(input.reason)}`);
  return lines.join('\n');
}

export function renderDiscountAlert(
  ctx: AlertContext,
  input: { amount: number; totalAmount: number | null; reason: string | null; kind: 'discount' | 'adjust' },
  lang: BotLang,
): string {
  const money = (n: number) => formatMoney(n, ctx.currency);
  const surcharge = input.kind === 'adjust' && input.amount > 0;
  const title = surcharge
    ? lang === 'ru' ? 'Надбавка к счёту' : "Hisobga ustama qo'shildi"
    : lang === 'ru' ? 'Скидка' : 'Chegirma berildi';
  const lines = [
    header('🏷', title, ctx),
    `🎱 ${esc(ctx.table ?? '—')} · <b>${surcharge ? '+' : '−'}${money(Math.abs(input.amount))}</b>${
      input.totalAmount !== null ? ` · ${lang === 'ru' ? 'итого' : 'jami'} ${money(input.totalAmount)}` : ''
    }`,
    actorLine(ctx, lang),
  ];
  if (input.reason) lines.push(`${lang === 'ru' ? '📝 Причина' : '📝 Sabab'}: ${esc(input.reason)}`);
  return lines.join('\n');
}

export function renderShiftOpenAlert(ctx: AlertContext, input: { openingCash: number }, lang: BotLang): string {
  return [
    header('🟢', lang === 'ru' ? 'Смена открыта' : 'Smena ochildi', ctx),
    lang === 'ru'
      ? `💵 В кассе на начало: ${formatMoney(input.openingCash, ctx.currency)}`
      : `💵 Kassada boshida: ${formatMoney(input.openingCash, ctx.currency)}`,
    actorLine(ctx, lang),
  ].join('\n');
}

export interface ShiftClosedInput {
  openedAt: string | null;
  closedAt: string | null;
  openingCash: number;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  cashOut: number | null;
  sessionsCount: number;
  collected: number;
  byMethod: { cash: number; card: number; transfer: number };
  debtsCreated: number;
  expenses: number;
  discounts: number;
  note: string | null;
}

export function renderShiftClosedAlert(ctx: AlertContext, input: ShiftClosedInput, lang: BotLang, tz: string): string {
  const money = (n: number) => formatMoney(n, ctx.currency);
  const ru = lang === 'ru';
  const lines = [
    header('🧾', ru ? 'Смена закрыта' : 'Smena yopildi', ctx),
  ];
  if (input.openedAt && input.closedAt) {
    lines.push(`🕘 ${timeOf(input.openedAt, tz)}–${timeOf(input.closedAt, tz)}`);
  }
  lines.push(
    ru
      ? `💰 Собрано: <b>${money(input.collected)}</b> · игр: ${input.sessionsCount}`
      : `💰 Yig'ilgan pul: <b>${money(input.collected)}</b> · ${input.sessionsCount} ta o'yin`,
  );
  const methods = [
    input.byMethod.cash > 0 ? `${ru ? 'Наличные' : 'Naqd'} ${money(input.byMethod.cash)}` : null,
    input.byMethod.card > 0 ? `${ru ? 'Карта' : 'Karta'} ${money(input.byMethod.card)}` : null,
    input.byMethod.transfer > 0 ? `${ru ? 'Перевод' : "O'tkazma"} ${money(input.byMethod.transfer)}` : null,
  ].filter((x): x is string => x !== null);
  if (methods.length) lines.push(`   ${methods.join(' · ')}`);
  if (input.discounts > 0) lines.push(ru ? `🏷 Скидки: ${money(input.discounts)}` : `🏷 Chegirmalar: ${money(input.discounts)}`);
  if (input.debtsCreated > 0) lines.push(ru ? `📒 В долг: ${money(input.debtsCreated)}` : `📒 Qarzga yozildi: ${money(input.debtsCreated)}`);
  if (input.expenses > 0) lines.push(ru ? `💸 Расходы: ${money(input.expenses)}` : `💸 Xarajatlar: ${money(input.expenses)}`);
  lines.push('');
  lines.push(ru ? `💵 Касса на начало: ${money(input.openingCash)}` : `💵 Kassa boshida: ${money(input.openingCash)}`);
  if (input.cashOut && input.cashOut > 0) {
    lines.push(ru ? `📤 Изъято из кассы: ${money(input.cashOut)}` : `📤 Kassadan olindi: ${money(input.cashOut)}`);
  }
  if (input.expectedCash !== null) lines.push(ru ? `🧮 Ожидалось: ${money(input.expectedCash)}` : `🧮 Kutilgan naqd: ${money(input.expectedCash)}`);
  if (input.countedCash !== null) lines.push(ru ? `✋ Пересчитано: ${money(input.countedCash)}` : `✋ Sanalgan naqd: ${money(input.countedCash)}`);
  if (input.difference !== null) {
    if (Math.abs(input.difference) < 0.5) {
      lines.push(ru ? '✅ Касса сошлась' : "✅ Kassa to'g'ri chiqdi");
    } else if (input.difference < 0) {
      lines.push(ru ? `🔴 <b>Недостача: ${money(Math.abs(input.difference))}</b>` : `🔴 <b>Kamomad: ${money(Math.abs(input.difference))}</b>`);
    } else {
      lines.push(ru ? `🟡 <b>Излишек: ${money(input.difference)}</b>` : `🟡 <b>Ortiqcha: ${money(input.difference)}</b>`);
    }
  }
  lines.push(actorLine(ctx, lang));
  if (input.note) lines.push(`${ru ? '📝 Заметка' : '📝 Izoh'}: ${esc(input.note)}`);
  return lines.join('\n');
}

export function renderDebtWriteoffAlert(
  ctx: AlertContext,
  input: { amount: number; customer: string | null; reason: string | null },
  lang: BotLang,
): string {
  const lines = [
    header('📒', lang === 'ru' ? 'Долг списан' : 'Qarz hisobdan chiqarildi', ctx),
    `${lang === 'ru' ? '🙍 Клиент' : '🙍 Mijoz'}: ${esc(input.customer ?? '—')} · <b>${formatMoney(input.amount, ctx.currency)}</b>`,
    actorLine(ctx, lang),
  ];
  if (input.reason) lines.push(`${lang === 'ru' ? '📝 Причина' : '📝 Sabab'}: ${esc(input.reason)}`);
  return lines.join('\n');
}

export function renderPriceAlert(
  ctx: AlertContext,
  input: { subject: string; oldPrice: number; newPrice: number; perHour: boolean },
  lang: BotLang,
): string {
  const money = (n: number) => formatMoney(n, ctx.currency);
  const unit = input.perHour ? (lang === 'ru' ? '/час' : '/soat') : '';
  return [
    header('🏷', lang === 'ru' ? 'Изменена цена' : "Narx o'zgartirildi", ctx),
    `${esc(input.subject)}: ${money(input.oldPrice)}${unit} → <b>${money(input.newPrice)}${unit}</b>`,
    actorLine(ctx, lang),
  ].join('\n');
}

export function renderStockAlert(
  ctx: AlertContext,
  input: { product: string; delta: number; after: number | null; reason: string | null },
  lang: BotLang,
): string {
  const lines = [
    header('📦', lang === 'ru' ? 'Остаток изменён вручную' : "Ombor qoldig'i qo'lda o'zgartirildi", ctx),
    `${esc(input.product)}: <b>${input.delta > 0 ? '+' : '−'}${formatNumber(Math.abs(input.delta))}</b>${
      input.after !== null ? ` → ${formatNumber(input.after)}` : ''
    }`,
    actorLine(ctx, lang),
  ];
  if (input.reason) lines.push(`${lang === 'ru' ? '📝 Причина' : '📝 Sabab'}: ${esc(input.reason)}`);
  return lines.join('\n');
}

/* --------------------------------------------------------- xizmat xabarlari */

export function renderWelcome(
  input: { club: string; reportTime: string; chatType: string },
  lang: BotLang,
): string {
  if (lang === 'ru') {
    return [
      `✅ <b>Подключено: ${esc(input.club)}</b>`,
      '',
      `Каждый день в <b>${input.reportTime}</b> пришлю отчёт за вчерашний день: выручка, игры, касса, долги, расходы.`,
      'Сразу сообщу о важном: отмена игры, скидка, закрытие смены с расхождением кассы, изменение цен.',
      '',
      'Команды:',
      '/hisobot — отчёт за вчера',
      '/bugun — сегодня до текущего момента',
      '/hozir — какие столы заняты сейчас',
      '/hafta — последние 7 дней',
      '/stop — остановить уведомления',
      '',
      'Время отчёта и типы уведомлений настраиваются в приложении: раздел «Telegram бот».',
    ].join('\n');
  }
  return [
    `✅ <b>Ulandi: ${esc(input.club)}</b>`,
    '',
    `Har kuni soat <b>${input.reportTime}</b> da kechagi kun hisobotini yuboraman: tushum, o'yinlar, kassa, qarzlar, xarajatlar.`,
    "Muhim hodisalarni darhol aytaman: o'yin bekor qilinsa, chegirma berilsa, smena kassa farqi bilan yopilsa, narx o'zgarsa.",
    '',
    'Buyruqlar:',
    '/hisobot — kechagi hisobot',
    '/bugun — bugun hozirgacha',
    '/hozir — hozir qaysi stollar band',
    '/hafta — so\'nggi 7 kun',
    '/stop — xabarlarni to\'xtatish',
    '',
    "Hisobot vaqti va xabar turlarini ilovadagi «Telegram bot» bo'limida sozlaysiz.",
  ].join('\n');
}

export function renderHelp(lang: BotLang, linked: boolean): string {
  if (!linked) {
    return lang === 'ru'
      ? [
          '👋 Это бот отчётов <b>Billiard Club</b> для владельцев клубов.',
          '',
          'Чтобы подключить клуб: в приложении откройте раздел «Telegram бот» и нажмите «Подключить Telegram». Ссылка действует 15 минут.',
        ].join('\n')
      : [
          "👋 Bu — klub egalari uchun <b>Billiard Club</b> hisobot boti.",
          '',
          "Klubni ulash uchun: ilovada «Telegram bot» bo'limini ochib «Telegram'ni ulash» tugmasini bosing. Havola 15 daqiqa amal qiladi.",
        ].join('\n');
  }
  return lang === 'ru'
    ? [
        'Команды:',
        '/hisobot — отчёт за вчера',
        '/bugun — сегодня до текущего момента',
        '/hozir — какие столы заняты сейчас',
        '/hafta — последние 7 дней',
        '/stop — остановить уведомления',
      ].join('\n')
    : [
        'Buyruqlar:',
        '/hisobot — kechagi hisobot',
        '/bugun — bugun hozirgacha',
        '/hozir — hozir qaysi stollar band',
        "/hafta — so'nggi 7 kun",
        "/stop — xabarlarni to'xtatish",
      ].join('\n');
}

export const TEXTS = {
  linkExpired: {
    uz: "⌛ Havola eskirgan yoki ishlatilgan. Ilovadagi «Telegram bot» bo'limidan qayta «Telegram'ni ulash»ni bosing.",
    ru: '⌛ Ссылка устарела или уже использована. Нажмите «Подключить Telegram» в приложении ещё раз.',
  },
  tooManyChats: {
    uz: "Bu klubga juda ko'p chat ulangan. Keraksizlarini ilovada o'chirib, qayta urinib ko'ring.",
    ru: 'К клубу подключено слишком много чатов. Удалите лишние в приложении и попробуйте снова.',
  },
  stopped: {
    uz: "🔕 Xabarlar to'xtatildi. Qayta yoqish uchun /start ni bosing yoki ilovadan qayta ulang.",
    ru: '🔕 Уведомления остановлены. Чтобы включить снова — нажмите /start или подключите заново в приложении.',
  },
  resumed: {
    uz: '🔔 Xabarlar qayta yoqildi.',
    ru: '🔔 Уведомления снова включены.',
  },
  unlinked: {
    uz: "Bu chat klub hisobotlaridan uzildi (ilovada o'chirildi).",
    ru: 'Этот чат отключён от отчётов клуба (удалён в приложении).',
  },
  test: {
    uz: (club: string) => `✅ <b>${esc(club)}</b>: sinov xabari. Telegram ulanishi ishlayapti.`,
    ru: (club: string) => `✅ <b>${esc(club)}</b>: тестовое сообщение. Подключение работает.`,
  },
  slowDown: {
    uz: "Biroz kuting — buyruqlar orasida bir necha soniya bo'lsin.",
    ru: 'Подождите несколько секунд между командами.',
  },
  inactiveClub: {
    uz: (club: string) => `${esc(club)}: obuna faol emas — hisobotlar to'xtatilgan.`,
    ru: (club: string) => `${esc(club)}: подписка не активна — отчёты приостановлены.`,
  },
} as const;

/** Hafta: dushanbadan yakshanbagacha (oxirgi kun — `day`) */
export const lastWeekRange = (day: DayParts): { from: DayParts; to: DayParts } => ({
  from: addDays(day, -6),
  to: day,
});
