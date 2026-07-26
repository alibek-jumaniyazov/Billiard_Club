import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { clubTimezone, parseDateParts, zonedMidnight } from '../../common/time/club-day';
import { Expense } from '../../entities/expense.entity';
import { User } from '../../entities/user.entity';
import { CreateExpenseDto, ListExpensesQueryDto, UpdateExpenseDto } from './dto/expenses.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 'YYYY-MM-DD' ni KLUB vaqt mintaqasidagi yarim tun sifatida o'qiydi — hisobotlar
 * ayni shu chegaralardan foydalanadi, shuning uchun Xarajatlar sahifasidagi
 * yig'indi va hisobotdagi expensesTotal endi bir xil kunni qamrab oladi
 * (avval server-lokal yarim tun olinardi: Docker'da UTC — 5 soatlik siljish).
 * To'liq ISO datetime ham qabul qilinadi (aniq on beriladi — o'zgarishsiz o'tadi).
 * endExclusive=true bo'lsa sana-kun keyingi kun boshiga suriladi ('to' yarim ochiq).
 */
const parseDateParam = (value: string, tz: string, endExclusive = false): Date => {
  const raw = value.trim();
  if (DATE_ONLY.test(raw)) {
    const { year, month, day } = parseDateParts(raw);
    return zonedMidnight(tz, year, month, endExclusive ? day + 1 : day);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ key: 'reports.invalidRange' });
  }
  return date;
};

@Injectable()
export class ExpensesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Expense) private readonly expenseRepo: Repository<Expense>,
  ) {}

  /** Ro'yxat va yig'indi bitta filtr ta'rifidan quriladi (desinxron bo'lmasin) */
  private buildQb(
    clubId: number,
    query: ListExpensesQueryDto,
    tz: string,
  ): SelectQueryBuilder<Expense> {
    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .where('expense.clubId = :clubId', { clubId });

    if (query.category) {
      qb.andWhere('expense.category = :category', { category: query.category });
    }
    if (query.from) {
      qb.andWhere('expense.spentAt >= :from', { from: parseDateParam(query.from, tz) });
    }
    if (query.to) {
      qb.andWhere('expense.spentAt < :to', { to: parseDateParam(query.to, tz, true) });
    }
    return qb;
  }

  async findAll(clubId: number, query: ListExpensesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    // Kun chegaralari klub mintaqasida — hisobot bilan bir xil ta'rif
    const tz = await clubTimezone(this.dataSource, clubId);

    const [rows, total] = await this.buildQb(clubId, query, tz)
      .leftJoin('expense.user', 'user')
      // Xodimning faqat kerakli maydonlari
      .addSelect(['user.id', 'user.name'])
      .orderBy('expense.spentAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Sahifadagi emas — BUTUN filtr bo'yicha yig'indi
    const sumRow = await this.buildQb(clubId, query, tz)
      .select('COALESCE(SUM(expense.amount), 0)::float', 'sum')
      .getRawOne<{ sum: number }>();

    return {
      data: rows,
      sum: round2(Number(sumRow?.sum ?? 0)),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * category/amount majburiy (@IsOptional yo'q — null validatsiyada tushadi),
   * description NULL bo'lishi mumkin, spentAt berilmasa/null bo'lsa — hozirgi vaqt.
   */
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

  /**
   * NOT NULL ustunlar uchun `!= null` (undefined VA null ni birdek o'tkazib yuboradi):
   * @IsOptional null ni ham "berilmagan" deb sanaydi, shuning uchun
   * {"amount": null} summani jimgina 0 ga, {"spentAt": null} sanani 1970-yilga
   * o'tkazib yuborardi, {"category": null} esa 500 qaytarardi.
   * description NULL bo'la oladigan ustun — u yerda `!== undefined` qoladi
   * (null yuborish = izohni tozalash).
   */
  async update(clubId: number, id: number, dto: UpdateExpenseDto) {
    const expense = await this.expenseRepo.findOne({ where: { id, clubId } });
    if (!expense) throw new NotFoundException({ key: 'expenses.notFound' });

    if (dto.category != null) expense.category = dto.category.trim();
    if (dto.amount != null) expense.amount = round2(dto.amount);
    if (dto.description !== undefined) expense.description = dto.description?.trim() || null;
    if (dto.spentAt != null) expense.spentAt = new Date(dto.spentAt);

    return this.expenseRepo.save(expense);
  }

  async remove(clubId: number, id: number) {
    const result = await this.expenseRepo.delete({ id, clubId });
    if (!result.affected) throw new NotFoundException({ key: 'expenses.notFound' });
    return true;
  }
}
