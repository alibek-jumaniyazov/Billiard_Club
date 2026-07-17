import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Expense } from '../../entities/expense.entity';
import { User } from '../../entities/user.entity';
import { CreateExpenseDto, ListExpensesQueryDto, UpdateExpenseDto } from './dto/expenses.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 'YYYY-MM-DD' ni server-lokal kun sifatida o'qiydi (reports.parseLocalDate bilan
 * bir xil siyosat); to'liq ISO datetime ham qabul qilinadi.
 * endExclusive=true bo'lsa sana-kun keyingi kun boshiga suriladi ('to' yarim ochiq).
 */
const parseDateParam = (value: string, endExclusive = false): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  let date: Date;
  if (match) {
    date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (endExclusive) date.setDate(date.getDate() + 1);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ key: 'reports.invalidRange' });
  }
  return date;
};

@Injectable()
export class ExpensesService {
  constructor(@InjectRepository(Expense) private readonly expenseRepo: Repository<Expense>) {}

  /** Ro'yxat va yig'indi bitta filtr ta'rifidan quriladi (desinxron bo'lmasin) */
  private buildQb(clubId: number, query: ListExpensesQueryDto): SelectQueryBuilder<Expense> {
    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .where('expense.clubId = :clubId', { clubId });

    if (query.category) {
      qb.andWhere('expense.category = :category', { category: query.category });
    }
    if (query.from) {
      qb.andWhere('expense.spentAt >= :from', { from: parseDateParam(query.from) });
    }
    if (query.to) {
      qb.andWhere('expense.spentAt < :to', { to: parseDateParam(query.to, true) });
    }
    return qb;
  }

  async findAll(clubId: number, query: ListExpensesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const [rows, total] = await this.buildQb(clubId, query)
      .leftJoin('expense.user', 'user')
      // Xodimning faqat kerakli maydonlari
      .addSelect(['user.id', 'user.name'])
      .orderBy('expense.spentAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Sahifadagi emas — BUTUN filtr bo'yicha yig'indi
    const sumRow = await this.buildQb(clubId, query)
      .select('COALESCE(SUM(expense.amount), 0)::float', 'sum')
      .getRawOne<{ sum: number }>();

    return {
      data: rows,
      sum: round2(Number(sumRow?.sum ?? 0)),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async create(clubId: number, user: User, dto: CreateExpenseDto) {
    return this.expenseRepo.save({
      clubId,
      userId: user.id,
      category: dto.category.trim(),
      amount: round2(dto.amount),
      description: dto.description?.trim() || null,
      spentAt: dto.spentAt ? new Date(dto.spentAt) : new Date(),
    });
  }

  async update(clubId: number, id: number, dto: UpdateExpenseDto) {
    const expense = await this.expenseRepo.findOne({ where: { id, clubId } });
    if (!expense) throw new NotFoundException({ key: 'expenses.notFound' });

    if (dto.category !== undefined) expense.category = dto.category.trim();
    if (dto.amount !== undefined) expense.amount = round2(dto.amount);
    if (dto.description !== undefined) expense.description = dto.description?.trim() || null;
    if (dto.spentAt !== undefined) expense.spentAt = new Date(dto.spentAt);

    return this.expenseRepo.save(expense);
  }

  async remove(clubId: number, id: number) {
    const result = await this.expenseRepo.delete({ id, clubId });
    if (!result.affected) throw new NotFoundException({ key: 'expenses.notFound' });
    return true;
  }
}
