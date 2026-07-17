import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { DebtPayment } from '../../entities/debt-payment.entity';
import { SessionStatus } from '../../entities/enums';
import { Sale } from '../../entities/sale.entity';
import { Session } from '../../entities/session.entity';
import { Table } from '../../entities/table.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Table) private readonly tableRepo: Repository<Table>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Sale) private readonly saleRepo: Repository<Sale>,
    @InjectRepository(DebtPayment) private readonly debtPaymentRepo: Repository<DebtPayment>,
  ) {}

  /**
   * Boshqaruv paneli ko'rsatkichlari.
   * Tushum = sales (sessiya yakunida olingan pul) + debt_payments (undirilgan qarzlar),
   * to'lov SANASI bo'yicha — shuning uchun kassadagi haqiqiy pul bilan mos keladi.
   * "Haftalik tushum" grafigi endi HAQIQIY ma'lumot (avval Math.random edi).
   */
  async stats(clubId: number) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalTables,
      activeSessionsData,
      dailyRevenue,
      monthlyRevenue,
      totalCustomers,
      recentSessions,
      last7Days,
    ] = await Promise.all([
      this.tableRepo.count({ where: { clubId, isActive: true } }),
      this.sessionRepo.find({
        where: {
          clubId,
          status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]),
        },
        relations: { table: true },
        order: { startTime: 'ASC' },
      }),
      this.collectedRevenue(clubId, todayStart, now),
      this.collectedRevenue(clubId, monthStart, now),
      this.sessionRepo
        .createQueryBuilder('session')
        .select('COUNT(DISTINCT session.customerName)', 'cnt')
        .where('session.clubId = :clubId', { clubId })
        .andWhere('session.customerName IS NOT NULL')
        .getRawOne<{ cnt: string }>()
        .then((r) => parseInt(r?.cnt ?? '0', 10)),
      this.sessionRepo.find({
        where: {
          clubId,
          status: SessionStatus.COMPLETED,
          endTime: Between(todayStart, now) as never,
        },
        relations: { table: true },
        order: { endTime: 'DESC' },
        take: 5,
      }),
      this.revenueByDay(clubId, 7),
    ]);

    const busyTables = new Set(activeSessionsData.map((s) => s.tableId)).size;

    return {
      totalTables,
      freeTables: Math.max(0, totalTables - busyTables),
      busyTables,
      dailyRevenue,
      monthlyRevenue,
      totalCustomers,
      activeSessions: activeSessionsData.length,
      activeSessionsData,
      recentSessions,
      last7Days,
    };
  }

  private async collectedRevenue(clubId: number, from: Date, to: Date): Promise<number> {
    const [sales, debtPayments] = await Promise.all([
      this.saleRepo.sum('totalAmount', { clubId, createdAt: Between(from, to) }),
      this.debtPaymentRepo.sum('amount', { clubId, createdAt: Between(from, to) }),
    ]);
    return (sales ?? 0) + (debtPayments ?? 0);
  }

  /** So'nggi N kun bo'yicha haqiqiy kunlik tushum */
  private async revenueByDay(clubId: number, days: number) {
    const result: Array<{ date: string; revenue: number }> = [];
    const now = new Date();

    const dayPromises = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      dayPromises.push(
        this.collectedRevenue(clubId, dayStart, dayEnd).then((revenue) => ({
          date: dayStart.toISOString().slice(0, 10),
          localDate: `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`,
          revenue,
        })),
      );
    }
    const resolved = await Promise.all(dayPromises);
    for (const day of resolved) {
      result.push({ date: day.localDate, revenue: day.revenue });
    }
    return result;
  }
}
