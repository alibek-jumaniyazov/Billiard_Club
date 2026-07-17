import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { Debt } from '../../entities/debt.entity';
import { DebtPayment } from '../../entities/debt-payment.entity';
import { PaymentMethod } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { ListDebtsQueryDto, PayDebtDto } from './dto/debts.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class DebtsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Debt) private readonly debtRepo: Repository<Debt>,
  ) {}

  async findAll(clubId: number, query: ListDebtsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const status = query.status ?? 'unpaid';

    const qb = this.debtRepo
      .createQueryBuilder('debt')
      .leftJoinAndSelect('debt.session', 'session')
      .leftJoinAndSelect('debt.user', 'user')
      .where('debt.clubId = :clubId', { clubId });

    if (status === 'unpaid') qb.andWhere('debt.isPaid = false');
    else if (status === 'paid') qb.andWhere('debt.isPaid = true');

    if (query.search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('debt.customerName ILIKE :search', { search: `%${query.search}%` }).orWhere(
            'debt.customerPhone ILIKE :search',
            { search: `%${query.search}%` },
          );
        }),
      );
    }

    const [rows, total] = await qb
      .orderBy('debt.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Sahifadagi emas — BUTUN filtr bo'yicha jami qoldiq (avvalgi noto'g'ri statistika tuzatildi)
    const totalsQb = this.debtRepo
      .createQueryBuilder('debt')
      .select('COALESCE(SUM(debt.remainingDebt), 0)', 'totalRemaining')
      .addSelect('COALESCE(SUM(debt.totalDebt), 0)', 'totalDebt')
      .where('debt.clubId = :clubId', { clubId });
    if (status === 'unpaid') totalsQb.andWhere('debt.isPaid = false');
    else if (status === 'paid') totalsQb.andWhere('debt.isPaid = true');
    if (query.search) {
      totalsQb.andWhere(
        new Brackets((b) => {
          b.where('debt.customerName ILIKE :search', { search: `%${query.search}%` }).orWhere(
            'debt.customerPhone ILIKE :search',
            { search: `%${query.search}%` },
          );
        }),
      );
    }
    const totals = await totalsQb.getRawOne<{ totalRemaining: string; totalDebt: string }>();

    return {
      data: rows,
      totals: {
        totalRemaining: parseFloat(totals?.totalRemaining ?? '0'),
        totalDebt: parseFloat(totals?.totalDebt ?? '0'),
      },
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /** Qarz to'lovlari tarixi (kim, qachon, qancha) */
  async payments(clubId: number, debtId: number) {
    const debt = await this.debtRepo.findOne({ where: { id: debtId, clubId } });
    if (!debt) throw new NotFoundException({ key: 'debts.notFound' });

    return this.dataSource.getRepository(DebtPayment).find({
      where: { debtId, clubId },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Qarz to'lovi:
   *  - Tranzaksiya + qator qulfi (parallel to'lovlar yo'qolmaydi)
   *  - Summa qoldiqdan oshmaydi, manfiy bo'lishi mumkin emas (DTO + shu yerda)
   *  - Har to'lov debt_payments ga alohida yoziladi (kassir bilan) —
   *    tushum hisobotlariga qarz undirilgan pul ham kiradi
   */
  async pay(clubId: number, user: User, debtId: number, dto: PayDebtDto) {
    return this.dataSource.transaction(async (manager) => {
      const debt = await manager.findOne(Debt, {
        where: { id: debtId, clubId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!debt) throw new NotFoundException({ key: 'debts.notFound' });
      if (debt.isPaid) throw new BadRequestException({ key: 'debts.alreadyPaid' });

      const amount = round2(dto.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException({ key: 'debts.invalidAmount' });
      }
      if (amount > debt.remainingDebt + 0.001) {
        throw new BadRequestException({
          key: 'debts.amountExceedsRemaining',
          args: { remaining: debt.remainingDebt },
        });
      }

      const newPaid = round2(debt.paidAmount + amount);
      const newRemaining = round2(Math.max(0, debt.totalDebt - newPaid));
      const isPaid = newRemaining <= 0;

      await manager.update(Debt, debt.id, {
        paidAmount: newPaid,
        remainingDebt: newRemaining,
        isPaid,
        paidAt: isPaid ? new Date() : null,
      });

      await manager.save(DebtPayment, {
        debtId: debt.id,
        clubId,
        userId: user.id,
        amount,
        paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
      });

      return manager.findOne(Debt, { where: { id: debt.id }, relations: { session: true } });
    });
  }

  /**
   * Qarzni o'chirish (faqat admin, faqat to'lovsiz qarzlar).
   * To'lov tarixi bor qarz o'chirilmaydi — moliyaviy iz yo'qolmasligi uchun.
   */
  async remove(clubId: number, debtId: number) {
    return this.dataSource.transaction(async (manager) => {
      const debt = await manager.findOne(Debt, {
        where: { id: debtId, clubId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!debt) throw new NotFoundException({ key: 'debts.notFound' });

      const paymentsCount = await manager.count(DebtPayment, { where: { debtId: debt.id } });
      if (paymentsCount > 0 || debt.paidAmount > 0) {
        throw new BadRequestException({ key: 'debts.hasPayments' });
      }

      await manager.delete(Debt, debt.id);
      return true;
    });
  }
}
