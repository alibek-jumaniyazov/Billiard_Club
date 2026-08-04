import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { Debt } from '../../entities/debt.entity';
import { DebtPayment } from '../../entities/debt-payment.entity';
import { PaymentMethod } from '../../entities/enums';
import { Session } from '../../entities/session.entity';
import { User } from '../../entities/user.entity';
import { ListDebtsQueryDto, PayDebtDto, WriteOffDebtDto } from './dto/debts.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class DebtsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Debt) private readonly debtRepo: Repository<Debt>,
    // Global AuditModule ro'yxatdan o'tmagan bo'lsa ham servis ishga tushaveradi
    @Optional() private readonly auditService?: AuditService,
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

    // "To'langan" filtri HISOBDAN CHIQARILGAN qarzlarni ATAYLAB istisno qiladi:
    // ular ham `isPaid = true` bo'ladi, lekin PUL OLINMAGAN. Bir ro'yxatga
    // qo'shilsa, "to'langan qarzlar" yig'indisi undirilmagan summani ham
    // ko'rsatib, klub egasini chalg'itardi. Ular alohida 'written_off'
    // filtrida ko'rinadi.
    if (status === 'unpaid') qb.andWhere('debt.isPaid = false');
    else if (status === 'paid') {
      qb.andWhere('debt.isPaid = true').andWhere('debt."writtenOffAt" IS NULL');
    } else if (status === 'written_off') {
      qb.andWhere('debt."writtenOffAt" IS NOT NULL');
    }

    if (query.search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('debt.customerName ILIKE :search', { search: `%${query.search}%` }).orWhere(
            'debt.customerPhone ILIKE :search',
            { search: `%${query.search}%` },
          );
          // Telefon kanonik saqlanadi — kassir yozgan formatdan raqamlarni ajratib
          // ham qidiramiz ('+998 90 123 45 67' -> '998901234567')
          const digits = (query.search ?? '').replace(/\D/g, '');
          if (digits) b.orWhere('debt.customerPhone ILIKE :digits', { digits: `%${digits}%` });
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
    // Yig'indi filtri ro'yxat filtri bilan AYNAN bir xil bo'lishi shart
    if (status === 'unpaid') totalsQb.andWhere('debt.isPaid = false');
    else if (status === 'paid') {
      totalsQb.andWhere('debt.isPaid = true').andWhere('debt."writtenOffAt" IS NULL');
    } else if (status === 'written_off') {
      totalsQb.andWhere('debt."writtenOffAt" IS NOT NULL');
    }
    if (query.search) {
      totalsQb.andWhere(
        new Brackets((b) => {
          b.where('debt.customerName ILIKE :search', { search: `%${query.search}%` }).orWhere(
            'debt.customerPhone ILIKE :search',
            { search: `%${query.search}%` },
          );
          // Telefon kanonik saqlanadi — kassir yozgan formatdan raqamlarni ajratib
          // ham qidiramiz ('+998 90 123 45 67' -> '998901234567')
          const digits = (query.search ?? '').replace(/\D/g, '');
          if (digits) b.orWhere('debt.customerPhone ILIKE :digits', { digits: `%${digits}%` });
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

      // Qarz to'liq undirilgach sessiya ham "to'langan" bo'ladi: aks holda
      // Excel hisobotidagi "To'langan" ustuni undirilgan sessiyani abadiy
      // "yo'q" deb ko'rsatib turardi. Sessiyada boshqa yopilmagan qarz
      // qolmaganda belgilanadi.
      if (isPaid && debt.sessionId) {
        const stillOpen = await manager.count(Debt, {
          where: { sessionId: debt.sessionId, isPaid: false },
        });
        if (stillOpen === 0) {
          await manager.update(Session, { id: debt.sessionId, clubId }, { isPaid: true });
        }
      }

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
   * UNDIRILMAGAN qarzni HISOBDAN CHIQARISH (faqat admin, faqat to'lovsiz
   * qarzlar). To'lov tarixi bor qarz chiqarilmaydi — moliyaviy iz yo'qolmasligi
   * uchun.
   *
   * QATOR O'CHIRILMAYDI (ataylab). Avval bu yerda `DELETE` bor edi va shu
   * sababli o'tgan davr hisoboti keyinchalik o'zgarib ketardi: `debtsCreated`
   * jonli jadvaldan `createdAt` oralig'i bo'yicha hisoblanadi, ya'ni iyulda
   * yozilib avgustda o'chirilgan qarz IYUL hisobotidan ham yo'qolardi.
   * Endi qator saqlanadi, faqat qoldiq nolga tushadi:
   *   - `remainingDebt = 0` -> "joriy qarz" yig'indilari (boshqaruv paneli,
   *     mijoz profili, qarzlar sahifasi) o'zi to'g'ri bo'lib qoladi;
   *   - `isPaid = true`  -> qarz yopilgan hisoblanadi;
   *   - `writtenOff*`    -> qachon, kim, nega.
   *
   * PUL NAZORATI: amal klubning haqiqiy debitor qarzini yo'q qiladi, shuning
   * uchun kim, qaysi mijozning qancha qarzini, nima sababdan chiqargani
   * HAR DOIM audit jurnaliga ham yoziladi.
   */
  async remove(clubId: number, user: User, debtId: number, dto: WriteOffDebtDto = {}) {
    const reason = dto.reason?.trim() || null;

    const removed = await this.dataSource.transaction(async (manager) => {
      const debt = await manager.findOne(Debt, {
        where: { id: debtId, clubId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!debt) throw new NotFoundException({ key: 'debts.notFound' });

      const paymentsCount = await manager.count(DebtPayment, { where: { debtId: debt.id } });
      if (paymentsCount > 0 || debt.paidAmount > 0) {
        throw new BadRequestException({ key: 'debts.hasPayments' });
      }
      // Ikki marta chiqarilmasin (parallel so'rov qulf ostida ushlanadi)
      if (debt.writtenOffAt || debt.isPaid) {
        throw new BadRequestException({ key: 'debts.alreadyPaid' });
      }

      const now = new Date();
      await manager.update(Debt, debt.id, {
        remainingDebt: 0,
        isPaid: true,
        writtenOffAt: now,
        writtenOffReason: reason,
        writtenOffById: user.id,
      });

      // Sessiyada boshqa ochiq qarz qolmagan bo'lsa u ham "to'langan" bo'ladi —
      // `pay()` dagi bilan AYNAN bir xil qoida. Aks holda hisobdan chiqarilgan
      // qarzli sessiya Excel eksportida abadiy "To'langan: Yo'q" bo'lib qolardi.
      if (debt.sessionId) {
        const stillOpen = await manager.count(Debt, {
          where: { sessionId: debt.sessionId, isPaid: false },
        });
        if (stillOpen === 0) {
          await manager.update(Session, { id: debt.sessionId, clubId }, { isPaid: true });
        }
      }

      return {
        totalDebt: debt.totalDebt,
        remainingDebt: debt.remainingDebt,
        customerName: debt.customerName,
        customerPhone: debt.customerPhone,
        sessionId: debt.sessionId,
      };
    });

    // Tranzaksiya muvaffaqiyatli yakunlangach yoziladi (orqaga qaytgan
    // tranzaksiya soxta "hisobdan chiqarildi" yozuvini qoldirmasligi uchun)
    this.auditService?.log({
      action: 'debt.writeoff',
      clubId,
      userId: user.id,
      actorRole: user.role,
      entity: 'debt',
      entityId: debtId,
      meta: { ...removed, reason },
    });

    return true;
  }
}
