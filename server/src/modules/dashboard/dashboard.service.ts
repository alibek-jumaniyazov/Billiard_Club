import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { SessionStatus } from '../../entities/enums';
import { Session } from '../../entities/session.entity';
import { safeTimezone } from '../settings/timezones';

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Boshqaruv paneli servisi.
 *
 * Vaqt mintaqasi yondashuvi: barcha "bugun/hafta/oy" chegaralari KLUB vaqt
 * mintaqasida hisoblanadi (settings.timezone, standart: Asia/Tashkent).
 * SQL tomonda `ts AT TIME ZONE :tz` timestamptz ni klubning lokal vaqtiga
 * o'giradi, so'ng date_trunc/to_char lokal kun chegaralarini beradi — server
 * qaysi mintaqada ishlashidan qat'i nazar natija bir xil (multi-tenant SaaS).
 *
 * Ish unumi: kun-ma-kun sikl o'rniga yagona GROUP BY so'rovlar; jami
 * DB ga borish-kelish har yuklashda 7 ta (<= 8 talabi bajariladi):
 *   1. hisoblagichlar + timezone   2. faol sessiyalar   3. kunlik tushum (GROUP BY)
 *   4. kunlik xarajatlar (GROUP BY) 5. analitika (stollar/mijozlar/soatlar, UNION)
 *   6. bugungi so'nggi sessiyalar  7. so'nggi to'lovlar
 *
 * Kunlik tushum/xarajat satrlaridan JS da: bugun/hafta/oy yig'indilari hamda
 * 7 va 30 kunlik grafik seriyalari (last7Days/last30Days, ikkalasi ham
 * tushum + xarajat bilan) yig'iladi.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
  ) {}

  async stats(clubId: number) {
    // 1-so'rov: hisoblagichlar + klub vaqt mintaqasi (bitta borish-kelish)
    const counters = await this.dataSource.query(
      `SELECT
         (SELECT s.timezone FROM settings s WHERE s."clubId" = $1) AS tz,
         (SELECT COUNT(*)::int FROM tables t
            WHERE t."clubId" = $1 AND t."isActive" = true) AS "totalTables",
         (SELECT COUNT(DISTINCT x.n)::int FROM (
            SELECT lower(trim(se."customerName")) AS n FROM sessions se
            WHERE se."clubId" = $1 AND se."customerName" IS NOT NULL AND se.status <> 'cancelled'
            UNION
            SELECT lower(trim(c.name)) FROM customers c WHERE c."clubId" = $1
         ) x) AS "totalCustomers",
         (SELECT COALESCE(SUM(d."remainingDebt"), 0)::float FROM debts d
            WHERE d."clubId" = $1 AND d."isPaid" = false) AS "openDebtsTotal"`,
      [clubId],
    );
    const tz = safeTimezone(counters[0]?.tz);
    const totalTables: number = counters[0]?.totalTables ?? 0;
    const totalCustomers: number = counters[0]?.totalCustomers ?? 0;
    const openDebtsTotal = round2(Number(counters[0]?.openDebtsTotal ?? 0));

    const [activeSessionsData, revenueDays, expenseDays, analyticsRows, recentSessions, recentPayments] =
      await Promise.all([
        // 2: faol/pauzadagi sessiyalar (jonli panel) — segmentlar bilan:
        //    transfer qilingan sessiyaning jonli summasi segmentlardan hisoblanadi
        this.sessionRepo.find({
          where: { clubId, status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]) },
          relations: { table: true, segments: true },
          order: { startTime: 'ASC', segments: { startedAt: 'ASC' } },
        }),
        // 3: so'nggi 40 kun tushumi klub-lokal kun bo'yicha (sales + debt_payments),
        //    bugun/hafta/oy va 7 kunlik grafik shundan JS da yig'iladi
        this.dataSource.query(
          `WITH money AS (
             SELECT "createdAt" AS ts, "totalAmount" AS amount FROM "sales"
             WHERE "clubId" = $1 AND "createdAt" >= now() - interval '40 days'
             UNION ALL
             SELECT "createdAt", "amount" FROM "debt_payments"
             WHERE "clubId" = $1 AND "createdAt" >= now() - interval '40 days'
           )
           SELECT to_char(ts AT TIME ZONE $2, 'YYYY-MM-DD') AS day,
                  COALESCE(SUM(amount), 0)::float AS revenue
           FROM money
           GROUP BY day
           ORDER BY day`,
          [clubId, tz],
        ) as Promise<Array<{ day: string; revenue: number }>>,
        // 4: xarajatlar klub-lokal kun bo'yicha — bugun/hafta/oy yig'indilari va
        //    tushum-xarajat grafigi shundan JS da yig'iladi
        this.dataSource.query(
          `SELECT to_char("spentAt" AT TIME ZONE $2, 'YYYY-MM-DD') AS day,
                  COALESCE(SUM(amount), 0)::float AS amount
           FROM "expenses"
           WHERE "clubId" = $1 AND "spentAt" >= now() - interval '40 days'
           GROUP BY day
           ORDER BY day`,
          [clubId, tz],
        ) as Promise<Array<{ day: string; amount: number }>>,
        // 5: 30 kunlik analitika bitta so'rovda (UNION ALL, 'kind' bilan ajratiladi):
        //    eng band stollar / eng ko'p xarajat qilgan mijozlar / soatlik yuklama
        this.dataSource.query(
          `(
             SELECT 'table' AS kind, t.id AS id, t.name AS name, t.number::int AS num,
                    COUNT(*)::int AS cnt, COALESCE(SUM(s."totalAmount"), 0)::float AS amount
             FROM sessions s
             JOIN tables t ON t.id = s."tableId"
             WHERE s."clubId" = $1 AND s.status = 'completed'
               AND s."endTime" >= now() - interval '30 days'
             GROUP BY t.id, t.name, t.number
             ORDER BY cnt DESC, amount DESC
             LIMIT 5
           )
           UNION ALL
           (
             SELECT 'customer', MAX(c.id)::int, MAX(COALESCE(c.name, s."customerName")), NULL::int,
                    COUNT(*)::int, COALESCE(SUM(s."totalAmount"), 0)::float
             FROM sessions s
             LEFT JOIN customers c ON c.id = s."customerId"
             WHERE s."clubId" = $1 AND s.status = 'completed'
               AND s."endTime" >= now() - interval '30 days'
               AND (s."customerId" IS NOT NULL OR s."customerName" IS NOT NULL)
             GROUP BY COALESCE(c.id::text, lower(trim(s."customerName")))
             ORDER BY 6 DESC
             LIMIT 5
           )
           UNION ALL
           (
             SELECT 'hour', EXTRACT(HOUR FROM s."startTime" AT TIME ZONE $2)::int, NULL, NULL::int,
                    COUNT(*)::int, NULL::float
             FROM sessions s
             WHERE s."clubId" = $1 AND s.status <> 'cancelled'
               AND s."startTime" >= now() - interval '30 days'
             GROUP BY 2
           )`,
          [clubId, tz],
        ) as Promise<
          Array<{ kind: string; id: number | null; name: string | null; num: number | null; cnt: number; amount: number | null }>
        >,
        // 6: bugun yakunlangan so'nggi 5 sessiya (klub-lokal "bugun")
        this.sessionRepo
          .createQueryBuilder('session')
          .leftJoinAndSelect('session.table', 'table')
          .where('session.clubId = :clubId', { clubId })
          .andWhere('session.status = :completed', { completed: SessionStatus.COMPLETED })
          .andWhere(
            `session."endTime" >= (date_trunc('day', now() AT TIME ZONE :tz) AT TIME ZONE :tz)`,
            { tz },
          )
          .orderBy('session.endTime', 'DESC')
          .take(5)
          .getMany(),
        // 7: so'nggi 10 to'lov — session_payments (split) ustuvor, ularsiz sales;
        //    NOT EXISTS bir sotuvni ikki marta sanashdan saqlaydi
        this.dataSource.query(
          `WITH pays AS (
             SELECT sp.amount::float AS amount, sp.method::text AS method,
                    sp."createdAt", sp."sessionId"
             FROM session_payments sp
             WHERE sp."clubId" = $1 AND sp."createdAt" >= now() - interval '30 days'
             UNION ALL
             SELECT sa."totalAmount"::float, sa."paymentMethod"::text,
                    sa."createdAt", sa."sessionId"
             FROM sales sa
             WHERE sa."clubId" = $1 AND sa."createdAt" >= now() - interval '30 days'
               AND NOT EXISTS (SELECT 1 FROM session_payments sp2 WHERE sp2."saleId" = sa.id)
           )
           SELECT p.amount, p.method, p."createdAt" AS "createdAt", p."sessionId",
                  ses."customerName", t.id AS "tableId", t.name AS "tableName",
                  t.number::int AS "tableNumber"
           FROM pays p
           LEFT JOIN sessions ses ON ses.id = p."sessionId"
           LEFT JOIN tables t ON t.id = ses."tableId"
           ORDER BY p."createdAt" DESC
           LIMIT 10`,
          [clubId],
        ),
      ]);

    // --- Tushum/xarajat: kunlik satrlardan bugun/hafta/oy yig'indilari ---
    const now = new Date();
    const dayKeys30 = this.lastLocalDays(now, tz, 30); // eski -> yangi
    const todayKey = dayKeys30[dayKeys30.length - 1];
    const weekStartKey = dayKeys30[dayKeys30.length - 7];
    const monthStartKey = `${todayKey.slice(0, 8)}01`;
    const revenueByDay = new Map(revenueDays.map((r) => [r.day, Number(r.revenue)]));
    const expenseByDay = new Map(expenseDays.map((r) => [r.day, Number(r.amount)]));

    const dailyRevenue = round2(revenueByDay.get(todayKey) ?? 0);
    let weekRevenue = 0;
    let monthRevenue = 0;
    for (const [day, revenue] of revenueByDay) {
      if (day >= weekStartKey && day <= todayKey) weekRevenue += revenue;
      if (day >= monthStartKey && day <= todayKey) monthRevenue += revenue;
    }
    weekRevenue = round2(weekRevenue);
    monthRevenue = round2(monthRevenue);

    // Xarajat yig'indilari — avvalgi FILTER semantikasi saqlanadi (>= chegara)
    let todayExpense = 0;
    let weekExpense = 0;
    let monthExpense = 0;
    for (const [day, amount] of expenseByDay) {
      if (day >= todayKey) todayExpense += amount;
      if (day >= weekStartKey) weekExpense += amount;
      if (day >= monthStartKey) monthExpense += amount;
    }

    // 30 kunlik grafik (tushum + xarajat) — bo'sh kunlar 0 bilan to'ldiriladi;
    // 7 kunlik seriya shu massivning oxirgi 7 nuqtasi
    const last30Days = dayKeys30.map((day) => ({
      date: day,
      revenue: round2(revenueByDay.get(day) ?? 0),
      expense: round2(expenseByDay.get(day) ?? 0),
    }));
    const last7Days = last30Days.slice(-7);

    // --- Analitika satrlarini kind bo'yicha ajratamiz ---
    const mostUsedTables = analyticsRows
      .filter((r) => r.kind === 'table')
      .map((r) => ({
        tableId: r.id,
        name: r.name,
        number: r.num,
        sessions: r.cnt,
        revenue: round2(r.amount ?? 0),
      }));
    const topCustomers = analyticsRows
      .filter((r) => r.kind === 'customer')
      .map((r) => ({
        customerId: r.id,
        name: r.name,
        sessions: r.cnt,
        totalSpent: round2(r.amount ?? 0),
      }));
    const hourCounts = new Map(
      analyticsRows.filter((r) => r.kind === 'hour').map((r) => [r.id ?? 0, r.cnt]),
    );
    // 24 ta chelak — bo'shlari 0 (grafik to'liq sutkani ko'rsatadi)
    const peakHours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      sessions: hourCounts.get(hour) ?? 0,
    }));

    const busyTables = new Set(activeSessionsData.map((s) => s.tableId)).size;
    const occupancyPercent =
      totalTables > 0 ? Math.round((busyTables / totalTables) * 100) : 0;

    return {
      // Mavjud maydonlar (orqaga moslik saqlanadi)
      totalTables,
      freeTables: Math.max(0, totalTables - busyTables),
      busyTables,
      dailyRevenue,
      monthlyRevenue: monthRevenue,
      totalCustomers,
      activeSessions: activeSessionsData.length,
      activeSessionsData,
      recentSessions,
      last7Days,
      // Yangi ko'rsatkichlar
      weekRevenue,
      monthRevenue,
      occupancyPercent,
      mostUsedTables,
      topCustomers,
      peakHours,
      expenses: {
        today: round2(todayExpense),
        week: round2(weekExpense),
        month: round2(monthExpense),
      },
      // Tushum-xarajat grafigi uchun 30 kunlik seriya (7 kunlik = oxirgi 7 nuqta)
      last30Days,
      // Ochiq qarzlar qoldig'i — bosh sahifa KPI kartasi
      openDebtsTotal,
      recentPayments,
      timezone: tz,
    };
  }

  /**
   * Klub vaqt mintaqasidagi so'nggi N kunning 'YYYY-MM-DD' kalitlari (eski -> yangi).
   * Har bir onni Intl orqali formatlaymiz — DST bo'lgan mintaqalarda ham
   * har bir nuqta o'z lokal sanasiga to'g'ri tushadi.
   */
  private lastLocalDays(now: Date, tz: string, days: number): string[] {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const keys: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      keys.push(fmt.format(new Date(now.getTime() - i * DAY_MS)));
    }
    return keys;
  }
}
