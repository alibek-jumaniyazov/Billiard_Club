import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { Language } from '../../common/decorators/lang.decorator';
import { t } from '../../common/i18n/messages';
import {
  clubTimezone,
  localDateParts,
  parseDateParts,
  zonedMidnight,
} from '../../common/time/club-day';
import { PaymentMethod, SessionStatus } from '../../entities/enums';
import { Session } from '../../entities/session.entity';
import { DEFAULT_TIMEZONE } from '../settings/timezones';
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
      const day = query.date ? parseDateParts(query.date) : localDateParts(tz, now);
      from = zonedMidnight(tz, day.year, day.month, day.day);
      to = zonedMidnight(tz, day.year, day.month, day.day + 1);
    } else if (type === 'weekly') {
      to = new Date(now);
      const today = localDateParts(tz, now);
      from = zonedMidnight(tz, today.year, today.month, today.day - 6);
    } else if (type === 'monthly') {
      const today = localDateParts(tz, now);
      const month = query.month ?? today.month;
      const year = query.year ?? today.year;
      from = zonedMidnight(tz, year, month, 1);
      to = zonedMidnight(tz, year, month + 1, 1);
    } else {
      if (!query.from || !query.to) {
        throw new BadRequestException({ key: 'reports.invalidRange' });
      }
      const fromParts = parseDateParts(query.from);
      const toParts = parseDateParts(query.to);
      from = zonedMidnight(tz, fromParts.year, fromParts.month, fromParts.day);
      const toStart = zonedMidnight(tz, toParts.year, toParts.month, toParts.day);
      if (from > toStart) {
        throw new BadRequestException({ key: 'reports.invalidRange' });
      }
      to = zonedMidnight(tz, toParts.year, toParts.month, toParts.day + 1);
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
    const tz = await clubTimezone(this.dataSource, clubId);
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
      // To'lov usullari taqsimoti — session_payments (bo'lib to'lash satrlari)
      // USTUVOR: Sale.paymentMethod faqat DOMINANT usulni saqlaydi, shuning uchun
      // aралаш (cash+card) to'lov bitta usulga yozilib qolardi. session_payments
      // har usul bo'yicha aniq summani saqlaydi (dashboard bilan bir xil manba).
      // session_payments yozuvi bo'lmagan sotuvlar (masalan 100% qarz — paidNow=0)
      // NOT EXISTS orqali qo'shiladi, qarz to'lovlari alohida.
      this.dataSource.query(
        `SELECT m.method, COALESCE(SUM(m.total), 0)::float AS total FROM (
           SELECT sp.method::text AS method, sp.amount AS total FROM session_payments sp
           WHERE sp."clubId" = $1 AND sp."createdAt" >= $2 AND sp."createdAt" < $3
           UNION ALL
           SELECT sa."paymentMethod"::text, sa."totalAmount" FROM sales sa
           WHERE sa."clubId" = $1 AND sa."createdAt" >= $2 AND sa."createdAt" < $3
             AND NOT EXISTS (SELECT 1 FROM session_payments sp2 WHERE sp2."saleId" = sa.id)
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
   *
   * KUN BIRIKTIRISH: buyurtma o'yin BOSHIDA bir marta ochiladi va butun sessiya
   * davomida qayta ishlatiladi — shuning uchun o."createdAt" sessiya BOSHLANISH
   * vaqti bo'lib qoladi. Hisobotning qolgan qismi (barRevenue) esa pulni
   * session."endTime" bo'yicha sanaydi. Ikkalasi bir xil tayanch nuqtadan
   * hisoblanishi uchun bu yerda ham COALESCE(s."endTime", o."createdAt") olinadi
   * (yarim tundan keyingi ichimliklar oldingi kunga tushib qolmaydi).
   * Faqat 'closed' buyurtmalar — hali hisob-kitob qilinmagan OCHIQ buyurtmalar
   * (davom etayotgan o'yin) hisobotga kirmaydi, xuddi barRevenue kabi.
   */
  async productsReport(clubId: number, type: ReportType, query: ReportQueryDto) {
    const tz = await clubTimezone(this.dataSource, clubId);
    const { from, to } = this.getDateRange(type, query, tz);

    const products = (await this.dataSource.query(
      `SELECT p.id AS "productId", p.name AS "productName", c.name AS "categoryName",
              COALESCE(SUM(oi.quantity), 0)::int AS quantity,
              COALESCE(SUM(oi.subtotal), 0)::float AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi."orderId"
       LEFT JOIN sessions s ON s.id = o."sessionId"
       JOIN products p ON p.id = oi."productId"
       LEFT JOIN categories c ON c.id = p."categoryId"
       WHERE o."clubId" = $1 AND o.status = 'closed'
         AND (s.id IS NULL OR s.status = 'completed')
         AND COALESCE(s."endTime", o."createdAt") >= $2
         AND COALESCE(s."endTime", o."createdAt") < $3
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
   *
   * - KEYSET sahifalash: OFFSET o'rniga (endTime, id) juftligi bo'yicha oldinga
   *   siljiymiz. OFFSET bilan eksport davomida yangi sessiya yakunlansa oyna
   *   surilib, bir sessiya ikki marta yozilishi yoki umuman tushib qolishi mumkin edi.
   * - JAMI qator alohida agregat so'rovdan emas, yozilgan qatorlardan yig'iladi —
   *   shu sababli u har doim ro'yxatga TENG (avval ikki so'rov orasida sessiya
   *   yakunlansa jami satr ro'yxat bilan mos kelmasdi).
   * - Vaqtlar KLUB vaqt mintaqasida formatlanadi (server UTC da ishlasa ham).
   */
  async exportExcel(
    clubId: number,
    type: ReportType,
    query: ReportQueryDto,
    lang: Language,
    res: Response,
  ) {
    const tz = await clubTimezone(this.dataSource, clubId);
    const { from, to } = this.getDateRange(type, query, tz);

    const fileName = `${t(lang, 'reports.fileName')}_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
    const sheet = workbook.addWorksheet(t(lang, 'reports.sheet'));

    const money = { style: { numFmt: '#,##0' } };
    // Ustunlar ta'rifi: sarlavhalar QO'LDA yoziladi (yuqorida davr satri turadi),
    // shuning uchun sheet.columns ga 'header' berilmaydi
    const columns: Array<{
      header: string;
      key: string;
      width: number;
      style?: Partial<ExcelJS.Style>;
    }> = [
      { header: t(lang, 'reports.colNo'), key: 'idx', width: 6 },
      { header: t(lang, 'reports.colTable'), key: 'table', width: 18 },
      { header: t(lang, 'reports.colCustomer'), key: 'customer', width: 22 },
      { header: t(lang, 'reports.colStart'), key: 'start', width: 20 },
      { header: t(lang, 'reports.colEnd'), key: 'end', width: 20 },
      { header: t(lang, 'reports.colDuration'), key: 'duration', width: 16 },
      { header: t(lang, 'reports.colTableAmount'), key: 'tableAmount', width: 16, ...money },
      { header: t(lang, 'reports.colBarAmount'), key: 'barAmount', width: 16, ...money },
      { header: t(lang, 'reports.colDiscount'), key: 'discount', width: 16, ...money },
      { header: t(lang, 'reports.colAdjustment'), key: 'adjustment', width: 16, ...money },
      { header: t(lang, 'reports.colTotal'), key: 'total', width: 16, ...money },
      { header: t(lang, 'reports.colMethod'), key: 'method', width: 14 },
      { header: t(lang, 'reports.colPaid'), key: 'paid', width: 14 },
    ];
    sheet.columns = columns.map((column) => ({
      key: column.key,
      width: column.width,
      style: column.style,
    }));

    // Vaqt formatlagichi — KLUB mintaqasida (toLocaleString server mintaqasini olardi)
    const dateLocale = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
    const fmt = new Intl.DateTimeFormat(dateLocale, {
      timeZone: tz,
      dateStyle: 'short',
      timeStyle: 'short',
    });

    // 1-satr: hisobot davri (klub mintaqasida). 'to' yarim ochiq — 1 ms ayirib ko'rsatamiz
    const periodRow = sheet.addRow([
      `${t(lang, 'reports.periodLabel')}: ${fmt.format(from)} — ${fmt.format(new Date(to.getTime() - 1))} (${tz})`,
    ]);
    periodRow.font = { bold: true };
    periodRow.commit();

    // 2-satr: ustun sarlavhalari
    const headerRow = sheet.addRow(columns.map((column) => column.header));
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.commit();

    let idx = 0;
    let totalTableAmount = 0;
    let totalBarAmount = 0;
    let totalDiscount = 0;
    let totalAdjustment = 0;
    let totalAmount = 0;
    // Keyset kursori — oxirgi yozilgan satrning (endTime, id) juftligi
    let lastEndTime: Date | null = null;
    let lastId = 0;

    // Bo'laklab o'qish — katta davr hisobotlari ham xotirani to'ldirmaydi
    for (;;) {
      const qb = this.completedSessionsQb(clubId, from, to)
        .leftJoinAndSelect('session.table', 'table')
        .orderBy('session.endTime', 'DESC')
        .addOrderBy('session.id', 'DESC')
        .take(EXPORT_CHUNK);
      if (lastEndTime) {
        qb.andWhere('(session.endTime, session.id) < (:lastEndTime, :lastId)', {
          lastEndTime,
          lastId,
        });
      }
      const rows = await qb.getMany();

      for (const session of rows) {
        idx += 1;
        // Chegirma sessiyada saqlanmaydi (u sales satrida) — qatorlar yig'indisi
        // jami bilan mos tushishi uchun chetlashuvdan hisoblab chiqariladi.
        // DIQQAT: totalAmount = max(0, oraliq - chegirma + tuzatish) — ya'ni katta
        // MANFIY tuzatishda nolga qisiladi. Shu holatda chetlashuv chegirmadan
        // katta chiqib, ustunga MANFIY qiymat yozilardi; [0, oraliq] ga qisamiz.
        const grossAmount = round2(session.tableAmount + session.barAmount);
        const derived = round2(grossAmount + session.adjustmentAmount - session.totalAmount);
        const discount = Math.max(0, Math.min(derived, grossAmount));
        totalTableAmount = round2(totalTableAmount + session.tableAmount);
        totalBarAmount = round2(totalBarAmount + session.barAmount);
        totalDiscount = round2(totalDiscount + discount);
        totalAdjustment = round2(totalAdjustment + session.adjustmentAmount);
        totalAmount = round2(totalAmount + session.totalAmount);

        sheet
          .addRow({
            idx,
            table: session.table ? `${session.table.name} (#${session.table.number})` : '-',
            customer: session.customerName ?? '-',
            start: session.startTime ? fmt.format(new Date(session.startTime)) : '-',
            end: session.endTime ? fmt.format(new Date(session.endTime)) : '-',
            duration: session.durationMinutes ?? 0,
            tableAmount: session.tableAmount,
            barAmount: session.barAmount,
            discount,
            adjustment: session.adjustmentAmount,
            total: session.totalAmount,
            // Xom enum ('cash'/'card'/'transfer') o'rniga tarjima qilingan nom
            method: session.paymentMethod ? t(lang, `payment.${session.paymentMethod}`) : '-',
            paid: session.isPaid ? t(lang, 'reports.paidYes') : t(lang, 'reports.paidNo'),
          })
          .commit();

        // Kursorni oxirgi satrga suramiz (endTime completed sessiyada NOT NULL)
        lastEndTime = session.endTime;
        lastId = session.id;
      }
      if (rows.length < EXPORT_CHUNK) break;
    }

    const totalRow = sheet.addRow({
      customer: t(lang, 'reports.totalRow'),
      tableAmount: totalTableAmount,
      barAmount: totalBarAmount,
      discount: totalDiscount,
      adjustment: totalAdjustment,
      total: totalAmount,
    });
    totalRow.font = { bold: true };
    totalRow.commit();

    // commit oqimni yakunlaydi va javobni yopadi
    await workbook.commit();
  }
}
