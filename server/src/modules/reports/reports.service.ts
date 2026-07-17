import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { DebtPayment } from '../../entities/debt-payment.entity';
import { Debt } from '../../entities/debt.entity';
import { PaymentMethod, SessionStatus } from '../../entities/enums';
import { Sale } from '../../entities/sale.entity';
import { Session } from '../../entities/session.entity';
import { ReportQueryDto } from './dto/reports.dto';

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Sale) private readonly saleRepo: Repository<Sale>,
    @InjectRepository(Debt) private readonly debtRepo: Repository<Debt>,
    @InjectRepository(DebtPayment) private readonly debtPaymentRepo: Repository<DebtPayment>,
  ) {}

  /**
   * 'YYYY-MM-DD' ni SERVER-LOKAL kun sifatida o'qiydi.
   * new Date('YYYY-MM-DD') UTC yarim tun deb o'qiydi — manfiy UTC-ofsetli
   * serverda kun bittaga surilib ketardi; komponentlab o'qish buni yo'qotadi.
   */
  private parseLocalDate(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) throw new BadRequestException({ key: 'reports.invalidRange' });
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({ key: 'reports.invalidRange' });
    }
    return date;
  }

  /**
   * Sana oralig'i.
   * - monthly: `query.month - 1 || now.getMonth()` xatosi tuzatildi —
   *   endi yanvar (month=1) ham to'g'ri ishlaydi
   * - weekly: so'nggi 7 kun (tushunarli va halol ta'rif)
   * - custom: noto'g'ri sanalar 400 qaytaradi (avval 500 edi)
   * - Barcha chegaralar server-lokal vaqtda (serverni klub vaqt zonasida ishga tushiring)
   */
  getDateRange(type: ReportType, query: ReportQueryDto): { from: Date; to: Date } {
    const now = new Date();
    let from: Date;
    let to: Date;

    if (type === 'daily') {
      if (query.date) {
        from = this.parseLocalDate(query.date);
      } else {
        from = new Date(now);
        from.setHours(0, 0, 0, 0);
      }
      to = new Date(from);
      to.setDate(to.getDate() + 1);
    } else if (type === 'weekly') {
      to = new Date(now);
      from = new Date(now);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
    } else if (type === 'monthly') {
      const month = query.month !== undefined ? query.month - 1 : now.getMonth();
      const year = query.year ?? now.getFullYear();
      from = new Date(year, month, 1);
      to = new Date(year, month + 1, 1);
    } else {
      if (!query.from || !query.to) {
        throw new BadRequestException({ key: 'reports.invalidRange' });
      }
      from = this.parseLocalDate(query.from);
      to = this.parseLocalDate(query.to);
      if (from > to) {
        throw new BadRequestException({ key: 'reports.invalidRange' });
      }
      to.setDate(to.getDate() + 1);
    }

    return { from, to };
  }

  /**
   * Hisobot:
   *  - sessions: davr ichida YAKUNLANGAN (endTime bo'yicha — avval createdAt
   *    bo'yicha edi va tungi sessiyalar noto'g'ri kunga tushardi)
   *  - collectedRevenue: haqiqatda olingan pul (sales + qarz to'lovlari)
   *  - billedRevenue: hisoblangan summalar (chegirmadan keyin)
   *  - qarz ko'rsatkichlari va to'lov usullari taqsimoti
   */
  async getReport(clubId: number, type: ReportType, query: ReportQueryDto) {
    const { from, to } = this.getDateRange(type, query);

    const sessions = await this.sessionRepo.find({
      where: {
        clubId,
        status: SessionStatus.COMPLETED,
        endTime: Between(from, to) as never,
      },
      relations: { table: true, user: true },
      order: { endTime: 'DESC' },
    });

    const [salesSum, debtPaymentsSum, debtsCreated, salesByMethod, debtPaymentsByMethod] =
      await Promise.all([
        this.saleRepo.sum('totalAmount', { clubId, createdAt: Between(from, to) }),
        this.debtPaymentRepo.sum('amount', { clubId, createdAt: Between(from, to) }),
        this.debtRepo.sum('totalDebt', { clubId, createdAt: Between(from, to) }),
        this.saleRepo
          .createQueryBuilder('sale')
          .select('sale.paymentMethod', 'method')
          .addSelect('COALESCE(SUM(sale.totalAmount), 0)', 'total')
          .where('sale.clubId = :clubId', { clubId })
          .andWhere('sale.createdAt BETWEEN :from AND :to', { from, to })
          .groupBy('sale.paymentMethod')
          .getRawMany<{ method: PaymentMethod; total: string }>(),
        this.debtPaymentRepo
          .createQueryBuilder('payment')
          .select('payment.paymentMethod', 'method')
          .addSelect('COALESCE(SUM(payment.amount), 0)', 'total')
          .where('payment.clubId = :clubId', { clubId })
          .andWhere('payment.createdAt BETWEEN :from AND :to', { from, to })
          .groupBy('payment.paymentMethod')
          .getRawMany<{ method: PaymentMethod; total: string }>(),
      ]);

    const paymentBreakdown: Record<string, number> = { cash: 0, card: 0, transfer: 0 };
    for (const row of [...salesByMethod, ...debtPaymentsByMethod]) {
      paymentBreakdown[row.method] = (paymentBreakdown[row.method] ?? 0) + parseFloat(row.total);
    }

    const billedRevenue = sessions.reduce((sum, s) => sum + s.totalAmount, 0);
    const tableRevenue = sessions.reduce((sum, s) => sum + s.tableAmount, 0);
    const barRevenue = sessions.reduce((sum, s) => sum + s.barAmount, 0);
    const avgSessionDuration = sessions.length
      ? sessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0) / sessions.length
      : 0;

    return {
      period: { from, to, type },
      sessions,
      summary: {
        collectedRevenue: (salesSum ?? 0) + (debtPaymentsSum ?? 0),
        billedRevenue,
        tableRevenue,
        barRevenue,
        totalSessions: sessions.length,
        avgSessionDuration,
        debtsCreated: debtsCreated ?? 0,
        debtsCollected: debtPaymentsSum ?? 0,
        paymentBreakdown,
      },
    };
  }

  /** Excel eksport — sessiyalar ro'yxati + jami qator */
  async exportExcel(clubId: number, type: ReportType, query: ReportQueryDto, res: Response) {
    const report = await this.getReport(clubId, type, query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Hisobot');

    sheet.columns = [
      { header: '№', key: 'idx', width: 6 },
      { header: 'Stol', key: 'table', width: 18 },
      { header: 'Mijoz', key: 'customer', width: 22 },
      { header: 'Boshlangan', key: 'start', width: 20 },
      { header: 'Tugagan', key: 'end', width: 20 },
      { header: 'Davomiylik (daq)', key: 'duration', width: 16 },
      { header: 'Stol summasi', key: 'tableAmount', width: 16 },
      { header: 'Bar summasi', key: 'barAmount', width: 16 },
      { header: 'Jami', key: 'total', width: 16 },
      { header: "To'lov usuli", key: 'method', width: 14 },
      { header: "To'langan", key: 'paid', width: 12 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };

    report.sessions.forEach((session, idx) => {
      sheet.addRow({
        idx: idx + 1,
        table: session.table ? `${session.table.name} (#${session.table.number})` : '-',
        customer: session.customerName ?? '-',
        start: session.startTime ? new Date(session.startTime).toLocaleString('uz-UZ') : '-',
        end: session.endTime ? new Date(session.endTime).toLocaleString('uz-UZ') : '-',
        duration: session.durationMinutes ?? 0,
        tableAmount: session.tableAmount,
        barAmount: session.barAmount,
        total: session.totalAmount,
        method: session.paymentMethod ?? '-',
        paid: session.isPaid ? 'Ha' : "Yo'q (qarz)",
      });
    });

    const totalRow = sheet.addRow({
      customer: 'JAMI:',
      tableAmount: report.summary.tableRevenue,
      barAmount: report.summary.barRevenue,
      total: report.summary.billedRevenue,
    });
    totalRow.font = { bold: true };

    for (const key of ['tableAmount', 'barAmount', 'total'] as const) {
      sheet.getColumn(key).numFmt = '#,##0';
    }

    const fileName = `hisobot_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  }
}
