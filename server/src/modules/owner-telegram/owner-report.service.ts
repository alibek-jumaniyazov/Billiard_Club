import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { PlanTiersService } from '../../common/plan-tiers/plan-tiers.service';
import type { TierCode } from '../../common/plan-tiers/tiers';
import { localDateParts, zonedMidnight } from '../../common/time/club-day';
import { ClubStatus } from '../../entities/enums';
import { ReportsService, ReportType } from '../reports/reports.service';
import { ReportQueryDto } from '../reports/dto/reports.dto';
import { SessionsService } from '../sessions/sessions.service';
import { safeTimezone } from '../settings/timezones';
import {
  addDays,
  BotLang,
  DayParts,
  dayKey,
  formatLocalTime,
  parseDayKey,
  weekday,
} from './owner-telegram.format';
import {
  ClubReportInfo,
  DailyReportData,
  LiveTable,
  PeriodSummary,
  renderDailyReport,
  renderLiveStatus,
  renderPeriodSummary,
  ShiftLine,
} from './owner-report.render';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClubContext {
  clubId: number;
  status: ClubStatus;
  tz: string;
  lightMode: string;
  info: ClubReportInfo;
}

interface ClubRow {
  name: string;
  status: ClubStatus;
  tier: string;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
  clubName: string | null;
  currencySymbol: string | null;
  timezone: string | null;
  lightMode: string | null;
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Klub egasi hisobotlari uchun raqamlar. Asosiy yig'indilar `ReportsService.getReport`
 * dan olinadi — Telegramdagi raqamlar ilovadagi «Hisobotlar» sahifasi bilan BIR XIL.
 * Qo'shimcha kesimlar (TOP stollar, kassirlar, bekor qilinganlar, smenalar) shu yerda.
 */
@Injectable()
export class OwnerReportService {
  private readonly logger = new Logger(OwnerReportService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly reports: ReportsService,
    private readonly sessions: SessionsService,
    private readonly tiers: PlanTiersService,
    private readonly config: ConfigService,
  ) {}

  /* ------------------------------------------------------------- klub */

  async clubContext(clubId: number, now = new Date()): Promise<ClubContext | null> {
    const rows = (await this.dataSource.query(
      `SELECT c.name, c.status, c.tier, c."trialEndsAt", c."subscriptionEndsAt",
              s."clubName", s."currencySymbol", s.timezone, s."lightMode"
       FROM clubs c LEFT JOIN settings s ON s."clubId" = c.id
       WHERE c.id = $1`,
      [clubId],
    )) as ClubRow[];
    const row = rows[0];
    if (!row) return null;
    const entitlements = await this.tiers.entitlements({ tier: row.tier as TierCode });
    const f = entitlements.features;
    const endsAt = row.subscriptionEndsAt ?? row.trialEndsAt;
    let daysLeft: number | null = null;
    if (endsAt && (row.status === ClubStatus.ACTIVE || row.status === ClubStatus.TRIAL)) {
      const left = Math.ceil((new Date(endsAt).getTime() - now.getTime()) / DAY_MS);
      if (left <= 7) daysLeft = Math.max(0, left);
    }
    return {
      clubId,
      status: row.status,
      tz: safeTimezone(row.timezone),
      lightMode: row.lightMode ?? 'off',
      info: {
        name: (row.clubName || row.name || '').trim() || `#${clubId}`,
        currency: (row.currencySymbol || "so'm").trim(),
        features: {
          bar: f.bar,
          debts: f.debts,
          expenses: f.expenses,
          shifts: f.shifts,
          lights: f.lights,
          reports: f.reports,
        },
        subscriptionDaysLeft: daysLeft,
        appUrl: this.publicAppUrl(),
      },
    };
  }

  /** Havolalar uchun ilova manzili — faqat ommaviy http(s) (localhost havolasi foydasiz) */
  private publicAppUrl(): string | null {
    const raw = (this.config.get<string>('FRONTEND_URL') ?? '').split(',')[0].trim();
    try {
      const url = new URL(raw);
      if (!/^https?:$/.test(url.protocol)) return null;
      if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url.hostname)) return null;
      return url.origin;
    } catch {
      return null;
    }
  }

  /* ---------------------------------------------------------- yig'indilar */

  async summary(clubId: number, type: ReportType, query: Partial<ReportQueryDto>): Promise<PeriodSummary> {
    const report = await this.reports.getReport(clubId, type, { page: 1, limit: 1, ...query } as ReportQueryDto);
    const { from, to } = report.period;
    const [extra] = (await this.dataSource.query(
      `SELECT
         (SELECT COALESCE(SUM(s."durationSeconds"), 0)::float FROM sessions s
           WHERE s."clubId" = $1 AND s.status = 'completed' AND s."endTime" >= $2 AND s."endTime" < $3) AS "playSeconds",
         (SELECT COALESCE(SUM(sa.discount), 0)::float FROM sales sa
           JOIN sessions s ON s.id = sa."sessionId"
           WHERE sa."clubId" = $1 AND s."clubId" = $1 AND s."endTime" >= $2 AND s."endTime" < $3) AS discounts`,
      [clubId, from, to],
    )) as Array<{ playSeconds: number; discounts: number }>;
    const s = report.summary;
    return {
      collected: num(s.collectedRevenue),
      byMethod: {
        cash: num(s.paymentBreakdown.cash),
        card: num(s.paymentBreakdown.card),
        transfer: num(s.paymentBreakdown.transfer),
      },
      billed: num(s.billedRevenue),
      tableRevenue: num(s.tableRevenue),
      barRevenue: num(s.barRevenue),
      sessions: num(s.totalSessions),
      avgMinutes: num(s.avgSessionDuration),
      playSeconds: num(extra?.playSeconds),
      discounts: num(extra?.discounts),
      debtsCreated: num(s.debtsCreated),
      debtsCollected: num(s.debtsCollected),
      expenses: num(s.expensesTotal),
      profit: num(s.profit),
    };
  }

  /* ------------------------------------------------------- kunlik hisobot */

  async dailyData(
    ctx: ClubContext,
    day: DayParts,
    options: { comparisons: boolean; periodBlocks: boolean },
  ): Promise<DailyReportData> {
    const { clubId, tz } = ctx;
    const f = ctx.info.features;
    const from = zonedMidnight(tz, day.year, day.month, day.day);
    const to = zonedMidnight(tz, day.year, day.month, day.day + 1);

    const [current, lastWeek, extras, products] = await Promise.all([
      this.summary(clubId, 'daily', { date: dayKey(day) }),
      options.comparisons && f.reports ? this.summary(clubId, 'daily', { date: dayKey(addDays(day, -7)) }) : null,
      this.dayExtras(ctx, from, to),
      f.reports && f.bar ? this.reports.productsReport(clubId, 'daily', { date: dayKey(day) } as ReportQueryDto) : null,
    ]);

    let week: DailyReportData['week'] = null;
    let month: DailyReportData['month'] = null;
    if (options.periodBlocks && f.reports) {
      // Dushanba ertalabgi hisobot (kun — yakshanba): o'tgan hafta yakuni
      if (weekday(day) === 0) {
        const weekFrom = addDays(day, -6);
        const [wCurrent, wPrevious] = await Promise.all([
          this.summary(clubId, 'custom', { from: dayKey(weekFrom), to: dayKey(day) }),
          this.summary(clubId, 'custom', { from: dayKey(addDays(day, -13)), to: dayKey(addDays(day, -7)) }),
        ]);
        week = { from: weekFrom, to: day, current: wCurrent, previous: wPrevious };
      }
      // Oyning 1-kunidagi hisobot (kun — oyning oxirgi kuni): oy yakuni
      if (addDays(day, 1).day === 1) {
        const prev = day.month === 1 ? { year: day.year - 1, month: 12 } : { year: day.year, month: day.month - 1 };
        const [mCurrent, mPrevious] = await Promise.all([
          this.summary(clubId, 'monthly', { year: day.year, month: day.month }),
          this.summary(clubId, 'monthly', { year: prev.year, month: prev.month }),
        ]);
        month = { year: day.year, month: day.month, current: mCurrent, previous: mPrevious };
      }
    }

    return {
      club: ctx.info,
      day,
      current,
      sameWeekdayLastWeek: lastWeek,
      topTables: extras.topTables,
      topProducts: (products?.products ?? []).slice(0, 3).map((p) => ({ name: p.productName, quantity: p.quantity })),
      staff: extras.staff,
      cancelled: extras.cancelled,
      shifts: extras.shifts,
      debtsOutstanding: extras.debtsOutstanding,
      lights: extras.lights,
      week,
      month,
    };
  }

  private async dayExtras(ctx: ClubContext, from: Date, to: Date) {
    const { clubId } = ctx;
    const f = ctx.info.features;
    const [topTables, staff, cancelledRows, shifts, debts, lights] = await Promise.all([
      this.dataSource.query(
        `SELECT t.name, COALESCE(SUM(s."durationSeconds"), 0)::float AS seconds, COUNT(*)::int AS sessions
         FROM sessions s JOIN tables t ON t.id = s."tableId"
         WHERE s."clubId" = $1 AND s.status = 'completed' AND s."endTime" >= $2 AND s."endTime" < $3
         GROUP BY t.id, t.name
         ORDER BY seconds DESC
         LIMIT 3`,
        [clubId, from, to],
      ) as Promise<Array<{ name: string; seconds: number; sessions: number }>>,
      // Kassada kim qancha pul oldi (hisob-kitobni bajargan xodim)
      this.dataSource.query(
        `SELECT COALESCE(u.name, '') AS name, COUNT(*)::int AS count, COALESCE(SUM(sa."totalAmount"), 0)::float AS amount
         FROM sales sa LEFT JOIN users u ON u.id = sa."userId"
         WHERE sa."clubId" = $1 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
         GROUP BY u.id, u.name
         ORDER BY amount DESC
         LIMIT 4`,
        [clubId, from, to],
      ) as Promise<Array<{ name: string; count: number; amount: number }>>,
      // Bekor qilingan o'yinlar — o'chirilgan summa audit jurnalida saqlanadi
      this.dataSource.query(
        `SELECT COALESCE(u.name, '') AS name, COUNT(*)::int AS count,
                COALESCE(SUM(COALESCE((a.meta->>'tableAmount')::numeric, 0) + COALESCE((a.meta->>'barAmount')::numeric, 0)), 0)::float AS amount
         FROM audit_logs a LEFT JOIN users u ON u.id = a."userId"
         WHERE a."clubId" = $1 AND a.action = 'session.cancel' AND a."createdAt" >= $2 AND a."createdAt" < $3
         GROUP BY u.id, u.name
         ORDER BY count DESC`,
        [clubId, from, to],
      ) as Promise<Array<{ name: string; count: number; amount: number }>>,
      f.shifts
        ? (this.dataSource.query(
            `SELECT "openedByName", "closedByName", "openedAt", "closedAt", difference
             FROM cash_shifts
             WHERE "clubId" = $1 AND "closedAt" >= $2 AND "closedAt" < $3
             ORDER BY "closedAt"`,
            [clubId, from, to],
          ) as Promise<Array<{ openedByName: string | null; closedByName: string | null; openedAt: Date; closedAt: Date; difference: string | null }>>)
        : Promise.resolve([]),
      f.debts
        ? (this.dataSource.query(
            `SELECT COALESCE(SUM("remainingDebt"), 0)::float AS amount, COUNT(*)::int AS count,
                    COUNT(*) FILTER (WHERE "dueDate" IS NOT NULL AND "dueDate" < now())::int AS overdue
             FROM debts WHERE "clubId" = $1 AND "isPaid" = false AND "remainingDebt" > 0`,
            [clubId],
          ) as Promise<Array<{ amount: number; count: number; overdue: number }>>)
        : Promise.resolve([]),
      f.lights && ctx.lightMode !== 'off'
        ? (this.dataSource.query(
            `SELECT COUNT(*) FILTER (WHERE "lightDriver" <> 'none')::int AS configured,
                    COUNT(*) FILTER (WHERE "lightDriver" <> 'none' AND "lightError" IS NOT NULL)::int AS failing
             FROM tables WHERE "clubId" = $1 AND "isActive" = true`,
            [clubId],
          ) as Promise<Array<{ configured: number; failing: number }>>)
        : Promise.resolve([]),
    ]);

    const cancelled = {
      count: cancelledRows.reduce((sum, row) => sum + num(row.count), 0),
      amount: cancelledRows.reduce((sum, row) => sum + num(row.amount), 0),
      byStaff: cancelledRows.map((row) => ({ name: row.name, count: num(row.count) })),
    };
    const shiftLines: ShiftLine[] = shifts.map((row) => ({
      openedByName: row.openedByName,
      closedByName: row.closedByName,
      openedAt: new Date(row.openedAt).toISOString(),
      closedAt: new Date(row.closedAt).toISOString(),
      difference: row.difference === null ? null : num(row.difference),
    }));
    return {
      topTables: topTables
        .filter((row) => num(row.seconds) > 0)
        .map((row) => ({ name: row.name, seconds: num(row.seconds), sessions: num(row.sessions) })),
      staff: staff
        .filter((row) => row.name && num(row.amount) > 0)
        .map((row) => ({ name: row.name, count: num(row.count), amount: num(row.amount) })),
      cancelled,
      shifts: shiftLines,
      debtsOutstanding: {
        amount: num(debts[0]?.amount),
        count: num(debts[0]?.count),
        overdueCount: num(debts[0]?.overdue),
      },
      lights: lights[0] ? { configured: num(lights[0].configured), failing: num(lights[0].failing) } : null,
    };
  }

  /** Klub vaqti bo'yicha bugungi sana */
  today(ctx: ClubContext, now = new Date()): DayParts {
    return localDateParts(ctx.tz, now);
  }

  /** Kechagi (yakunlangan) kun hisoboti — kunlik jo'natma va /hisobot */
  async renderYesterday(ctx: ClubContext, lang: BotLang, options: { periodBlocks: boolean }, now = new Date()): Promise<string> {
    const day = addDays(this.today(ctx, now), -1);
    const data = await this.dailyData(ctx, day, { comparisons: true, periodBlocks: options.periodBlocks });
    return renderDailyReport(data, lang, { mode: 'yesterday', tz: ctx.tz });
  }

  /** Bugun hozirgacha — /bugun */
  async renderToday(ctx: ClubContext, lang: BotLang, now = new Date()): Promise<string> {
    const day = this.today(ctx, now);
    const data = await this.dailyData(ctx, day, { comparisons: false, periodBlocks: false });
    return renderDailyReport(data, lang, { mode: 'today', tz: ctx.tz, nowLabel: formatLocalTime(ctx.tz, now) });
  }

  /** So'nggi 7 kun (bugun bilan) — /hafta */
  async renderWeek(ctx: ClubContext, lang: BotLang, now = new Date()): Promise<string> {
    const today = this.today(ctx, now);
    const from = addDays(today, -6);
    const [current, previous, days] = await Promise.all([
      this.summary(ctx.clubId, 'custom', { from: dayKey(from), to: dayKey(today) }),
      ctx.info.features.reports
        ? this.summary(ctx.clubId, 'custom', { from: dayKey(addDays(today, -13)), to: dayKey(addDays(today, -7)) })
        : null,
      this.collectedByDay(ctx, from, today),
    ]);
    return renderPeriodSummary({ club: ctx.info, from, to: today, current, previous, days }, lang);
  }

  /** Kun bo'yicha olingan pul (hisob-kitob + qarz to'lovlari) — klub vaqtida */
  private async collectedByDay(ctx: ClubContext, from: DayParts, to: DayParts) {
    const start = zonedMidnight(ctx.tz, from.year, from.month, from.day);
    const end = zonedMidnight(ctx.tz, to.year, to.month, to.day + 1);
    const rows = (await this.dataSource.query(
      `SELECT to_char(x.d, 'YYYY-MM-DD') AS day, COALESCE(SUM(x.amount), 0)::float AS collected FROM (
         SELECT (sa."createdAt" AT TIME ZONE $4)::date AS d, sa."totalAmount" AS amount FROM sales sa
           WHERE sa."clubId" = $1 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
         UNION ALL
         SELECT (dp."createdAt" AT TIME ZONE $4)::date, dp.amount FROM debt_payments dp
           WHERE dp."clubId" = $1 AND dp."createdAt" >= $2 AND dp."createdAt" < $3
       ) x GROUP BY x.d`,
      [ctx.clubId, start, end, ctx.tz],
    )) as Array<{ day: string; collected: number }>;
    const byDay = new Map(rows.map((row) => [row.day, num(row.collected)]));
    const days: Array<{ day: DayParts; collected: number }> = [];
    for (let d = from; dayKey(d) <= dayKey(to); d = addDays(d, 1)) {
      days.push({ day: d, collected: byDay.get(dayKey(d)) ?? 0 });
    }
    return days;
  }

  /** Hozir klubda: band stollar, vaqt va jonli summa — /hozir */
  async renderLive(ctx: ClubContext, lang: BotLang, now = new Date()): Promise<string> {
    const [active, totals] = await Promise.all([
      this.dataSource.query(
        `SELECT s.id, s.status, s."customerName", t.name AS "tableName", t.number
         FROM sessions s JOIN tables t ON t.id = s."tableId"
         WHERE s."clubId" = $1 AND s.status IN ('active', 'paused')
         ORDER BY t.number, t.id`,
        [ctx.clubId],
      ) as Promise<Array<{ id: number; status: string; customerName: string | null; tableName: string }>>,
      this.dataSource.query(`SELECT COUNT(*)::int AS n FROM tables WHERE "clubId" = $1 AND "isActive" = true`, [ctx.clubId]) as Promise<
        Array<{ n: number }>
      >,
    ]);
    const tables: LiveTable[] = [];
    for (const row of active) {
      try {
        // Kassadagi chek oldindan ko'rish bilan BIR XIL hisob (segmentlar, pauza, yaxlitlash)
        const receipt = (await this.sessions.receipt(ctx.clubId, row.id)) as {
          durationSeconds?: number;
          grossAmount?: number;
        };
        tables.push({
          name: row.tableName,
          paused: row.status === 'paused',
          seconds: num(receipt.durationSeconds),
          amount: num(receipt.grossAmount),
          customer: row.customerName,
        });
      } catch (err) {
        // Shu orada yakunlangan o'yin — ro'yxatdan tushib qoladi
        this.logger.debug(`Jonli summa olinmadi (#${row.id}): ${(err as Error).message}`);
      }
    }
    return renderLiveStatus(
      { club: ctx.info, time: formatLocalTime(ctx.tz, now), totalTables: num(totals[0]?.n), tables },
      lang,
    );
  }

  /**
   * Kun kaliti ('YYYY-MM-DD'). `date` ustuni pg drayverida MAHALLIY yarim tun Date bo'lib
   * keladi — toISOString() UTC dan oldingi mintaqada kunni bittaga surardi, shuning uchun
   * mahalliy komponentlar olinadi (so'rovlarda esa ustun matn sifatida o'qiladi).
   */
  static dayKeyOf(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) {
      return dayKey({ year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() });
    }
    const text = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? dayKey(parseDayKey(text)) : null;
  }
}
