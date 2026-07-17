import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { Language } from '../../common/decorators/lang.decorator';
import { t } from '../../common/i18n/messages';
import { PaymentMethod, SessionStatus } from '../../entities/enums';
import { Session } from '../../entities/session.entity';
import { DEFAULT_TIMEZONE, safeTimezone } from '../settings/timezones';
import { ReportQueryDto } from './dto/reports.dto';

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Excel eksportda bir sahifada o'qiladigan sessiyalar soni (xotira chegarasi) */
const EXPORT_CHUNK = 500;

@Injectable()
export class ReportsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
  ) {}

  /**
   * 'YYYY-MM-DD' ni sana komponentlariga (yil/oy/kun) o'qiydi.
   * new Date('YYYY-MM-DD') UTC yarim tun deb o'qiydi — kun surilib ketardi;
   * komponentlab o'qib, chegara KLUB vaqt mintaqasida hisoblanadi.
   */
  private parseDateParts(value: string): { year: number; month: number; day: number } {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) throw new BadRequestException({ key: 'reports.invalidRange' });
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }

  /** Klub vaqt mintaqasi (settings.timezone) — kun chegaralari shu mintaqada hisoblanadi */
  private async clubTimezone(clubId: number): Promise<string> {
    const rows = await this.dataSource.query(
      `SELECT s.timezone FROM settings s WHERE s."clubId" = $1`,
      [clubId],
    );
    return safeTimezone(rows[0]?.timezone);
  }

  /** tz mintaqasining berilgan ondagi UTC ofseti (ms) — Intl orqali, DST ham hisobga olinadi */
  private tzOffsetMs(tz: string, at: Date): number {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(at)) parts[p.type] = p.value;
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    );
    return asUtc - at.getTime();
  }

  /**
   * Klub mintaqasidagi (year, month 1-12, day) YARIM TUNining UTC onini qaytaradi.
   * Date.UTC oy/kun oshib ketishini o'zi normallaydi (13-oy -> keyingi yil yanvari);
   * ikkinchi iteratsiya DST o'tish kunlarida ham to'g'ri ofset beradi.
   */
  private zonedMidnight(tz: string, year: number, month: number, day: number): Date {
    const wallClock = Date.UTC(year, month - 1, day);
    let ts = wallClock;
    for (let i = 0; i < 2; i++) {
      ts = wallClock - this.tzOffsetMs(tz, new Date(ts));
    }
    return new Date(ts);
  }

  /** Hozirgi onning klub mintaqasidagi sana komponentlari */
  private localDateParts(tz: string, at: Date): { year: number; month: number; day: number } {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [year, month, day] = fmt.format(at).split('-').map(Number);
    return { year, month, day };
  }

  /**
   * Sana oralig'i — YARIM OCHIQ [from, to): 'to' keyingi davr boshlanishi.
   * Chegaradagi yozuv ikki qo'shni hisobotga ikki marta tushmaydi.
   * - monthly: `query.month - 1 || now.getMonth()` xatosi tuzatildi —
   *   endi yanvar (month=1) ham to'g'ri ishlaydi
   * - weekly: so'nggi 7 kun (tushunarli va halol ta'rif)
   * - custom: noto'g'ri sanalar 400 qaytaradi (avval 500 edi)
   * - Barcha chegaralar KLUB vaqt mintaqasida (settings.timezone) — "bugun"
   *   dashboard bilan bir xil, server qaysi mintaqada ishlashidan qat'i nazar
   */
  getDateRange(
    type: ReportType,
    query: ReportQueryDto,
    tz: string = DEFAULT_TIMEZONE,
  ): { from: Date; to: Date } {
    const now = new Date();
    let from: Date;
    let to: Date;

    if (type === 'daily') {
      const day = query.date ? this.parseDateParts(query.date) : this.localDateParts(tz, now);
      from = this.zonedMidnight(tz, day.year, day.month, day.day);
      to = this.zonedMidnight(tz, day.year, day.month, day.day + 1);
    } else if (type === 'weekly') {
      to = new Date(now);
      const today = this.localDateParts(tz, now);
      from = this.zonedMidnight(tz, today.year, today.month, today.day - 6);
    } else if (type === 'monthly') {
      const today = this.localDateParts(tz, now);
      const month = query.month ?? today.month;
      const year = query.year ?? today.year;
      from = this.zonedMidnight(tz, year, month, 1);
      to = this.zonedMidnight(tz, year, month + 1, 1);
    } else {
      if (!query.from || !query.to) {
        throw new BadRequestException({ key: 'reports.invalidRange' });
      }
      const fromParts = this.parseDateParts(query.from);
      const toParts = this.parseDateParts(query.to);
      from = this.zonedMidnight(tz, fromParts.year, fromParts.month, fromParts.day);
      const toStart = this.zonedMidnight(tz, toParts.year, toParts.month, toParts.day);
      if (from > toStart) {
        throw new BadRequestException({ key: 'reports.invalidRange' });
      }
      to = this.zonedMidnight(tz, toParts.year, toParts.month, toParts.day + 1);
    }

    return { from, to };
  }

  /** Davr ichida YAKUNLANGAN sessiyalar uchun bazaviy filtr (yarim ochiq oraliq) */
  private completedSessionsQb(clubId: number, from: Date, to: Date): SelectQueryBuilder<Session> {
    return this.sessionRepo
      .createQueryBuilder('session')
      .where('session.clubId = :clubId', { clubId })
      .andWhere('session.status = :status', { status: SessionStatus.COMPLETED })
      .andWhere('session.endTime >= :from AND session.endTime < :to', { from, to });
  }

  /**
   * Hisobot:
   *  - summary raqamlari SQL agregatlari bilan (butun ro'yxatni xotiraga
   *    yuklamasdan — avval minglab sessiya JS reduce bilan sanardi)
   *  - sessions: sahifalangan ro'yxat (page/limit, eng ko'pi 100)
   *  - collectedRevenue: haqiqatda olingan pul (sales + qarz to'lovlari)
   *  - billedRevenue: hisoblangan summalar (chegirmadan keyin)
   *  - expensesTotal/profit: davr xarajatlari va foyda (tushum - xarajat)
   */
  async getReport(clubId: number, type: ReportType, query: ReportQueryDto) {
    const tz = await this.clubTimezone(clubId);
    const { from, to } = this.getDateRange(type, query, tz);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);

    const [pageResult, agg, sums, methodRows] = await Promise.all([
      this.completedSessionsQb(clubId, from, to)
        .leftJoinAndSelect('session.table', 'table')
        .leftJoin('session.user', 'user')
        // Xodimning faqat kerakli maydonlari (tokenVersion va h.k. sizmasin)
        .addSelect(['user.id', 'user.name'])
        .orderBy('session.endTime', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount(),
      this.completedSessionsQb(clubId, from, to)
        .select('COUNT(*)::int', 'totalSessions')
        .addSelect('COALESCE(SUM(session.totalAmount), 0)::float', 'billedRevenue')
        .addSelect('COALESCE(SUM(session.tableAmount), 0)::float', 'tableRevenue')
        .addSelect('COALESCE(SUM(session.barAmount), 0)::float', 'barRevenue')
        .addSelect('COALESCE(AVG(session.durationMinutes), 0)::float', 'avgSessionDuration')
        .getRawOne<{
          totalSessions: number;
          billedRevenue: number;
          tableRevenue: number;
          barRevenue: number;
          avgSessionDuration: number;
        }>(),
      // To'rtta yig'indi bitta borish-kelishda (yarim ochiq oraliq)
      this.dataSource.query(
        `SELECT
           (SELECT COALESCE(SUM(sa."totalAmount"), 0)::float FROM sales sa
             WHERE sa."clubId" = $1 AND sa."createdAt" >= $2 AND sa."createdAt" < $3) AS "salesSum",
           (SELECT COALESCE(SUM(dp."amount"), 0)::float FROM debt_payments dp
             WHERE dp."clubId" = $1 AND dp."createdAt" >= $2 AND dp."createdAt" < $3) AS "debtPaymentsSum",
           (SELECT COALESCE(SUM(d."totalDebt"), 0)::float FROM debts d
             WHERE d."clubId" = $1 AND d."createdAt" >= $2 AND d."createdAt" < $3) AS "debtsCreated",
           (SELECT COALESCE(SUM(e."amount"), 0)::float FROM expenses e
             WHERE e."clubId" = $1 AND e."spentAt" >= $2 AND e."spentAt" < $3) AS "expensesTotal"`,
        [clubId, from, to],
      ),
      // To'lov usullari taqsimoti (sales + qarz to'lovlari birga)
      this.dataSource.query(
        `SELECT m.method, COALESCE(SUM(m.total), 0)::float AS total FROM (
           SELECT sa."paymentMethod"::text AS method, sa."totalAmount" AS total FROM sales sa
           WHERE sa."clubId" = $1 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
           UNION ALL
           SELECT dp."paymentMethod"::text, dp."amount" FROM debt_payments dp
           WHERE dp."clubId" = $1 AND dp."createdAt" >= $2 AND dp."createdAt" < $3
         ) m GROUP BY m.method`,
        [clubId, from, to],
      ) as Promise<Array<{ method: PaymentMethod; total: number }>>,
    ]);

    const [sessions, totalCount] = pageResult;
    const paymentBreakdown: Record<string, number> = { cash: 0, card: 0, transfer: 0 };
    for (const row of methodRows) {
      paymentBreakdown[row.method] = round2((paymentBreakdown[row.method] ?? 0) + Number(row.total));
    }

    const salesSum = Number(sums[0]?.salesSum ?? 0);
    const debtPaymentsSum = Number(sums[0]?.debtPaymentsSum ?? 0);
    const debtsCreated = Number(sums[0]?.debtsCreated ?? 0);
    const expensesTotal = Number(sums[0]?.expensesTotal ?? 0);
    const collectedRevenue = round2(salesSum + debtPaymentsSum);

    return {
      period: { from, to, type },
      sessions,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit),
      },
      summary: {
        collectedRevenue,
        billedRevenue: round2(agg?.billedRevenue ?? 0),
        tableRevenue: round2(agg?.tableRevenue ?? 0),
        barRevenue: round2(agg?.barRevenue ?? 0),
        totalSessions: agg?.totalSessions ?? 0,
        avgSessionDuration: agg?.avgSessionDuration ?? 0,
        debtsCreated,
        debtsCollected: round2(debtPaymentsSum),
        expensesTotal: round2(expensesTotal),
        profit: round2(collectedRevenue - expensesTotal),
        paymentBreakdown,
      },
    };
  }

  /**
   * Bar/mahsulot savdosi hisoboti — order_items ni mahsulot bo'yicha agregatlaydi
   * (soni + tushumi). Bekor qilingan buyurtmalar chiqarilmaydi (ombor qaytarilgan).
   */
  async productsReport(clubId: number, type: ReportType, query: ReportQueryDto) {
    const tz = await this.clubTimezone(clubId);
    const { from, to } = this.getDateRange(type, query, tz);

    const products = (await this.dataSource.query(
      `SELECT p.id AS "productId", p.name AS "productName", c.name AS "categoryName",
              COALESCE(SUM(oi.quantity), 0)::int AS quantity,
              COALESCE(SUM(oi.subtotal), 0)::float AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi."orderId"
       JOIN products p ON p.id = oi."productId"
       LEFT JOIN categories c ON c.id = p."categoryId"
       WHERE o."clubId" = $1 AND o."createdAt" >= $2 AND o."createdAt" < $3
         AND o.status <> 'cancelled'
       GROUP BY p.id, p.name, c.name
       ORDER BY revenue DESC`,
      [clubId, from, to],
    )) as Array<{
      productId: number;
      productName: string;
      categoryName: string | null;
      quantity: number;
      revenue: number;
    }>;

    const totals = products.reduce(
      (acc, row) => ({
        quantity: acc.quantity + row.quantity,
        revenue: round2(acc.revenue + row.revenue),
      }),
      { quantity: 0, revenue: 0 },
    );

    return { period: { from, to, type }, products, totals };
  }

  /**
   * Excel eksport — OQIMLI WorkbookWriter (butun kitob xotirada yig'ilmaydi),
   * sessiyalar 500 talik bo'laklar bilan o'qiladi; sarlavhalar uz/ru lokalizatsiyalangan.
   */
  async exportExcel(
    clubId: number,
    type: ReportType,
    query: ReportQueryDto,
    lang: Language,
    res: Response,
  ) {
    const tz = await this.clubTimezone(clubId);
    const { from, to } = this.getDateRange(type, query, tz);

    // Jami qator uchun agregatlar (ro'yxatni yuklamasdan)
    const agg = await this.completedSessionsQb(clubId, from, to)
      .select('COALESCE(SUM(session.totalAmount), 0)::float', 'billedRevenue')
      .addSelect('COALESCE(SUM(session.tableAmount), 0)::float', 'tableRevenue')
      .addSelect('COALESCE(SUM(session.barAmount), 0)::float', 'barRevenue')
      .getRawOne<{ billedRevenue: number; tableRevenue: number; barRevenue: number }>();

    const fileName = `${t(lang, 'reports.fileName')}_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
    const sheet = workbook.addWorksheet(t(lang, 'reports.sheet'));

    const money = { style: { numFmt: '#,##0' } };
    sheet.columns = [
      { header: t(lang, 'reports.colNo'), key: 'idx', width: 6 },
      { header: t(lang, 'reports.colTable'), key: 'table', width: 18 },
      { header: t(lang, 'reports.colCustomer'), key: 'customer', width: 22 },
      { header: t(lang, 'reports.colStart'), key: 'start', width: 20 },
      { header: t(lang, 'reports.colEnd'), key: 'end', width: 20 },
      { header: t(lang, 'reports.colDuration'), key: 'duration', width: 16 },
      { header: t(lang, 'reports.colTableAmount'), key: 'tableAmount', width: 16, ...money },
      { header: t(lang, 'reports.colBarAmount'), key: 'barAmount', width: 16, ...money },
      { header: t(lang, 'reports.colTotal'), key: 'total', width: 16, ...money },
      { header: t(lang, 'reports.colMethod'), key: 'method', width: 14 },
      { header: t(lang, 'reports.colPaid'), key: 'paid', width: 14 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };

    const dateLocale = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
    let idx = 0;
    // Bo'laklab o'qish — katta davr hisobotlari ham xotirani to'ldirmaydi
    for (let chunkPage = 0; ; chunkPage++) {
      const rows = await this.completedSessionsQb(clubId, from, to)
        .leftJoinAndSelect('session.table', 'table')
        .orderBy('session.endTime', 'DESC')
        .skip(chunkPage * EXPORT_CHUNK)
        .take(EXPORT_CHUNK)
        .getMany();

      for (const session of rows) {
        idx += 1;
        sheet
          .addRow({
            idx,
            table: session.table ? `${session.table.name} (#${session.table.number})` : '-',
            customer: session.customerName ?? '-',
            start: session.startTime
              ? new Date(session.startTime).toLocaleString(dateLocale)
              : '-',
            end: session.endTime ? new Date(session.endTime).toLocaleString(dateLocale) : '-',
            duration: session.durationMinutes ?? 0,
            tableAmount: session.tableAmount,
            barAmount: session.barAmount,
            total: session.totalAmount,
            method: session.paymentMethod ?? '-',
            paid: session.isPaid ? t(lang, 'reports.paidYes') : t(lang, 'reports.paidNo'),
          })
          .commit();
      }
      if (rows.length < EXPORT_CHUNK) break;
    }

    const totalRow = sheet.addRow({
      customer: t(lang, 'reports.totalRow'),
      tableAmount: agg?.tableRevenue ?? 0,
      barAmount: agg?.barRevenue ?? 0,
      total: agg?.billedRevenue ?? 0,
    });
    totalRow.font = { bold: true };
    totalRow.commit();

    // commit oqimni yakunlaydi va javobni yopadi
    await workbook.commit();
  }
}
