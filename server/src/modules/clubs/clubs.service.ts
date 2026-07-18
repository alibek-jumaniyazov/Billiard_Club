import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Between, Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { Category } from '../../entities/category.entity';
import { Club } from '../../entities/club.entity';
import { Contract, ContractType } from '../../entities/contract.entity';
import { Debt } from '../../entities/debt.entity';
import { DebtPayment } from '../../entities/debt-payment.entity';
import { ClubStatus, SessionStatus, UserRole } from '../../entities/enums';
import { Product } from '../../entities/product.entity';
import { Sale } from '../../entities/sale.entity';
import { Session } from '../../entities/session.entity';
import { Settings } from '../../entities/settings.entity';
import { Table } from '../../entities/table.entity';
import { User } from '../../entities/user.entity';
import { TelegramService } from '../../telegram/telegram.service';
import {
  CreateClubDto,
  CreateContractDto,
  ExtendSubscriptionDto,
  ListClubsQueryDto,
  UpdateClubDto,
} from './dto/clubs.dto';

/** Shartnoma turi -> oylar soni */
const CONTRACT_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sanaga oylar qo'shadi, MANZIL oyning oxirgi kunidan oshib ketmasin:
 * masalan 31-yanvar + 1 oy = 28/29-fevral. JS ning oddiy setMonth() i
 * bunday holatda keyingi oyga (masalan 3-martga) sakrab, obunaga bir necha
 * ortiqcha kun qo'shib yuborardi. Vaqt komponenti saqlanadi.
 */
const addMonths = (base: Date, months: number): Date => {
  const d = new Date(base);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
};

@Injectable()
export class ClubsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly telegram: TelegramService,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Klublar ro'yxati: qidiruv (nom/egasi/telefon), holat filtri va
   * sahifalash bilan. Parametrsiz chaqiruv (eski klient) — birinchi
   * 50 ta klub, createdAt bo'yicha kamayish tartibida.
   */
  async findAll(query: ListClubsQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);

    const qb = this.clubRepo.createQueryBuilder('club');

    if (query.status) {
      qb.andWhere('club.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('club.name ILIKE :search', { search: `%${query.search}%` })
            .orWhere('club.ownerName ILIKE :search', { search: `%${query.search}%` })
            .orWhere('club.phone ILIKE :search', { search: `%${query.search}%` });
        }),
      );
    }

    const [clubs, total] = await qb
      .orderBy('club.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: await Promise.all(clubs.map((club) => this.withMeta(club))),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const club = await this.clubRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException({ key: 'clubs.notFound' });
    return this.withMeta(club);
  }

  /**
   * Yangi klub: klub + admin foydalanuvchi + sozlamalar bitta tranzaksiyada,
   * 7 kunlik (yoki ko'rsatilgan) sinov muddati bilan. Sizga Telegram xabar ketadi.
   */
  async create(dto: CreateClubDto) {
    const existing = await this.userRepo.findOne({ where: { username: dto.adminUsername } });
    if (existing) throw new ConflictException({ key: 'clubs.usernameTaken' });

    const trialDays = dto.trialDays ?? 7;
    const trialEndsAt = new Date(Date.now() + trialDays * DAY_MS);

    const club = await this.dataSource.transaction(async (manager) => {
      const newClub = await manager.save(Club, {
        name: dto.name,
        ownerName: dto.ownerName,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        status: ClubStatus.TRIAL,
        trialEndsAt,
        notes: dto.notes ?? null,
      });

      const passwordHash = await bcrypt.hash(dto.adminPassword, 12);
      await manager.save(User, {
        name: dto.ownerName,
        username: dto.adminUsername,
        password: passwordHash,
        role: UserRole.ADMIN,
        clubId: newClub.id,
        isActive: true,
      });

      await manager.save(Settings, {
        clubId: newClub.id,
        clubName: dto.name,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
      });

      return newClub;
    });

    // Telegram xabarnoma (asosiy oqimni to'xtatmaydi)
    void this.telegram.notify(
      [
        '🎱 <b>Yangi klub qo\'shildi — 7 kunlik bepul sinov!</b>',
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `👤 Egasi: ${this.escapeHtml(club.ownerName ?? '-')}`,
        `📞 Telefon: ${this.escapeHtml(club.phone ?? '-')}`,
        `🔑 Login: <code>${this.escapeHtml(dto.adminUsername)}</code>`,
        `⏳ Sinov tugaydi: ${trialEndsAt.toLocaleDateString('uz-UZ')}`,
      ].join('\n'),
    );

    return this.withMeta(club);
  }

  async update(id: number, dto: UpdateClubDto) {
    const club = await this.clubRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException({ key: 'clubs.notFound' });
    Object.assign(club, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    });
    await this.clubRepo.save(club);
    return this.withMeta(club);
  }

  /**
   * Obunani uzaytirish: joriy muddat tugamagan bo'lsa uning ustiga,
   * tugagan bo'lsa bugundan boshlab qo'shiladi. Status -> active.
   */
  async extend(id: number, dto: ExtendSubscriptionDto) {
    const club = await this.clubRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException({ key: 'clubs.notFound' });

    let newEnd: Date;
    if (dto.until) {
      newEnd = new Date(dto.until);
      if (newEnd.getTime() <= Date.now()) {
        throw new BadRequestException({ key: 'reports.invalidRange' });
      }
    } else {
      const currentEnd = club.effectiveEndsAt;
      const base =
        currentEnd && new Date(currentEnd).getTime() > Date.now()
          ? new Date(currentEnd)
          : new Date();
      newEnd = addMonths(base, dto.months ?? 1);
    }

    club.subscriptionEndsAt = newEnd;
    club.status = ClubStatus.ACTIVE;
    await this.clubRepo.save(club);

    void this.telegram.notify(
      [
        '✅ <b>Obuna uzaytirildi</b>',
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `📅 Yangi muddat: ${newEnd.toLocaleDateString('uz-UZ')}`,
      ].join('\n'),
    );

    return this.withMeta(club);
  }

  async setBlocked(id: number, blocked: boolean) {
    const club = await this.clubRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException({ key: 'clubs.notFound' });

    if (blocked) {
      club.status = ClubStatus.BLOCKED;
    } else {
      // Blokdan chiqarilganda muddatiga qarab holat tiklanadi
      club.status = club.isExpired
        ? ClubStatus.EXPIRED
        : club.subscriptionEndsAt
          ? ClubStatus.ACTIVE
          : ClubStatus.TRIAL;
    }
    await this.clubRepo.save(club);
    return this.withMeta(club);
  }

  /** Klub admin foydalanuvchisining parolini yangilash (unutilgan parol uchun) */
  async resetAdminPassword(id: number, password: string) {
    const club = await this.clubRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException({ key: 'clubs.notFound' });

    const admin = await this.userRepo.findOne({
      where: { clubId: id, role: UserRole.ADMIN },
      order: { id: 'ASC' },
    });
    if (!admin) throw new NotFoundException({ key: 'clubs.adminNotFound' });

    const hash = await bcrypt.hash(password, 12);
    // tokenVersion +1 — eski access/refresh tokenlar darhol bekor bo'ladi
    await this.userRepo.update(admin.id, {
      password: hash,
      tokenVersion: admin.tokenVersion + 1,
    });
    return { username: admin.username };
  }

  /** Klub bo'yicha biznes ko'rsatkichlar (superadmin ko'rish paneli) */
  async stats(id: number) {
    const club = await this.clubRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException({ key: 'clubs.notFound' });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const now = new Date();

    const [users, tables, activeSessions, totalSessions, monthlySales, monthlyDebtPayments, unpaidDebts, lastSession] =
      await Promise.all([
        this.dataSource.getRepository(User).count({ where: { clubId: id } }),
        this.dataSource.getRepository(Table).count({ where: { clubId: id, isActive: true } }),
        this.dataSource.getRepository(Session).count({
          where: [
            { clubId: id, status: SessionStatus.ACTIVE },
            { clubId: id, status: SessionStatus.PAUSED },
          ],
        }),
        this.dataSource.getRepository(Session).count({ where: { clubId: id } }),
        this.dataSource
          .getRepository(Sale)
          .sum('totalAmount', { clubId: id, createdAt: Between(monthStart, now) }),
        this.dataSource
          .getRepository(DebtPayment)
          .sum('amount', { clubId: id, createdAt: Between(monthStart, now) }),
        this.dataSource.getRepository(Debt).sum('remainingDebt', { clubId: id, isPaid: false }),
        this.dataSource.getRepository(Session).findOne({
          where: { clubId: id },
          order: { createdAt: 'DESC' },
        }),
      ]);

    const adminUser = await this.userRepo.findOne({
      where: { clubId: id, role: UserRole.ADMIN },
      order: { id: 'ASC' },
    });

    return {
      club: await this.withMeta(club),
      adminUsername: adminUser?.username ?? null,
      users,
      tables,
      activeSessions,
      totalSessions,
      monthlyRevenue: (monthlySales ?? 0) + (monthlyDebtPayments ?? 0),
      unpaidDebts: unpaidDebts ?? 0,
      lastActivityAt: lastSession?.createdAt ?? null,
    };
  }

  // ==================== Shartnomalar ====================

  async contracts(clubId: number) {
    const club = await this.clubRepo.findOne({ where: { id: clubId } });
    if (!club) throw new NotFoundException({ key: 'clubs.notFound' });
    return this.dataSource.getRepository(Contract).find({
      where: { clubId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Shartnoma tuzish: to'lov yozuvi + obunani shartnoma muddatiga uzaytirish.
   * Boshlanish — joriy obuna tugashi (kelajakda bo'lsa) yoki bugun;
   * shu tufayli muddati tugamagan klub uzaytirilganda kunlar yo'qolmaydi.
   */
  async addContract(clubId: number, dto: CreateContractDto) {
    const club = await this.clubRepo.findOne({ where: { id: clubId } });
    if (!club) throw new NotFoundException({ key: 'clubs.notFound' });

    const currentEnd = club.subscriptionEndsAt ?? club.trialEndsAt;
    const startDate =
      currentEnd && new Date(currentEnd).getTime() > Date.now()
        ? new Date(currentEnd)
        : new Date();

    let endDate: Date;
    if (dto.type === 'custom') {
      endDate = new Date(dto.endDate!);
      if (Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        throw new BadRequestException({ key: 'reports.invalidRange' });
      }
    } else {
      endDate = addMonths(startDate, CONTRACT_MONTHS[dto.type]);
    }

    const contract = await this.dataSource.transaction(async (manager) =>
      this.applyContractInTransaction(manager, clubId, {
        type: dto.type as ContractType,
        amount: dto.amount,
        startDate,
        endDate,
        notes: dto.notes ?? null,
      }),
    );

    void this.telegram.notify(
      [
        '💰 <b>Yangi shartnoma tuzildi</b>',
        '',
        `🏢 Klub: <b>${this.escapeHtml(club.name)}</b>`,
        `📄 Turi: ${dto.type}`,
        `💵 Summa: ${dto.amount.toLocaleString('ru-RU')} so'm`,
        `📅 Muddat: ${startDate.toLocaleDateString('uz-UZ')} — ${endDate.toLocaleDateString('uz-UZ')}`,
      ].join('\n'),
    );

    return contract;
  }

  /**
   * Shartnoma yozuvi + klub obunasini uzaytirish — chaqiruvchining
   * tranzaksiyasi ichida. addContract() va obuna to'lovini tasdiqlash
   * (SubscriptionModule confirm) ikkalasi ham shu yagona yo'ldan o'tadi.
   */
  async applyContractInTransaction(
    manager: EntityManager,
    clubId: number,
    data: {
      type: ContractType;
      amount: number;
      startDate: Date;
      endDate: Date;
      notes: string | null;
    },
  ): Promise<Contract> {
    const contract = await manager.save(Contract, {
      clubId,
      type: data.type,
      amount: data.amount,
      startDate: data.startDate,
      endDate: data.endDate,
      notes: data.notes,
    });
    await manager.update(Club, clubId, {
      subscriptionEndsAt: data.endDate,
      status: ClubStatus.ACTIVE,
    });
    return contract;
  }

  /** Xato kiritilgan shartnomani o'chirish (obuna muddati avtomatik qisqarMAYDI) */
  async removeContract(clubId: number, contractId: number) {
    const contract = await this.dataSource
      .getRepository(Contract)
      .findOne({ where: { id: contractId, clubId } });
    if (!contract) throw new NotFoundException({ key: 'clubs.notFound' });
    await this.dataSource.getRepository(Contract).delete(contractId);
    return true;
  }

  // ==================== Platforma analitikasi ====================

  /**
   * Superadmin bosh paneli: klublar holati, platforma daromadi
   * (shartnomalardan), oylik daromad grafigi, muddati tugayotgan klublar.
   */
  async overview() {
    const contractRepo = this.dataSource.getRepository(Contract);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [clubs, totalIncome, monthIncome, yearIncome, recentContracts] = await Promise.all([
      this.clubRepo.find(),
      contractRepo.sum('amount'),
      contractRepo.sum('amount', { createdAt: Between(monthStart, now) }),
      contractRepo.sum('amount', { createdAt: Between(yearStart, now) }),
      contractRepo.find({
        relations: { club: true },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    // So'nggi 12 oy bo'yicha platforma daromadi
    const incomeByMonth: Array<{ month: string; amount: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const amount = await contractRepo.sum('amount', { createdAt: Between(mStart, mEnd) });
      incomeByMonth.push({
        month: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`,
        amount: amount ?? 0,
      });
    }

    const withMeta = await Promise.all(clubs.map((c) => this.withMeta(c)));
    const byStatus = {
      total: clubs.length,
      trial: clubs.filter((c) => c.status === ClubStatus.TRIAL).length,
      active: clubs.filter((c) => c.status === ClubStatus.ACTIVE).length,
      expired: clubs.filter((c) => c.status === ClubStatus.EXPIRED).length,
      blocked: clubs.filter((c) => c.status === ClubStatus.BLOCKED).length,
    };

    const expiringSoon = withMeta
      .filter(
        (c) =>
          c.status !== ClubStatus.BLOCKED &&
          c.daysLeft !== null &&
          c.daysLeft <= 7 &&
          !c.isExpired,
      )
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

    return {
      clubs: byStatus,
      income: {
        total: totalIncome ?? 0,
        thisMonth: monthIncome ?? 0,
        thisYear: yearIncome ?? 0,
      },
      incomeByMonth,
      expiringSoon,
      recentContracts,
    };
  }

  /**
   * Faqat bo'sh klubni o'chirish mumkin — aks holda bloklanadi.
   * "Bo'sh" = sessiyalar HAM, shartnomalar HAM yo'q (shartnomalar platforma
   * daromadi yozuvlari — cascade bilan jimgina o'chib ketmasligi kerak).
   */
  async remove(id: number) {
    const club = await this.clubRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException({ key: 'clubs.notFound' });

    // "Bo'sh" tekshiruvi TO'LIQ bo'lishi shart: aks holda o'chirishga urinish
    // xom FK xatosiga (RESTRICT) uchrab, chalkash umumiy xato qaytarardi.
    // sessions > 0 — buyurtma/sotuv/qarz/to'lov yozuvlarining hammasini qamraydi
    // (ular sessiyasiz bo'lmaydi). customers/expenses/reservations esa sessiyasiz
    // ham mavjud bo'la oladi — ular ham RESTRICT, shuning uchun alohida sanaladi.
    // contracts CASCADE bo'lsa-da, platforma daromadi yozuvi jimgina o'chmasin
    // deb ataylab bloklanadi.
    const [row] = (await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*) FROM sessions WHERE "clubId" = $1)
       + (SELECT COUNT(*) FROM contracts WHERE "clubId" = $1)
       + (SELECT COUNT(*) FROM customers WHERE "clubId" = $1)
       + (SELECT COUNT(*) FROM expenses WHERE "clubId" = $1)
       + (SELECT COUNT(*) FROM reservations WHERE "clubId" = $1) AS cnt`,
      [id],
    )) as Array<{ cnt: string }>;
    if (Number(row?.cnt ?? 0) > 0) {
      throw new BadRequestException({ key: 'clubs.hasData' });
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Settings, { clubId: id });
      await manager.delete(Table, { clubId: id });
      await manager.delete(Product, { clubId: id });
      await manager.delete(Category, { clubId: id });
      await manager.delete(User, { clubId: id });
      await manager.delete(Club, { id });
    });
    return true;
  }

  /**
   * Klubga qolgan kunlar va amaldagi tugash sanasini qo'shib qaytaradi.
   * Getterlarga tayanmaydi — manager.save() plain obyekt qaytarishi mumkin.
   */
  private async withMeta(club: Club) {
    const effectiveEndsAt = club.subscriptionEndsAt ?? club.trialEndsAt ?? null;
    const isExpired =
      !!effectiveEndsAt && new Date(effectiveEndsAt).getTime() < Date.now();
    const daysLeft = effectiveEndsAt
      ? Math.max(0, Math.ceil((new Date(effectiveEndsAt).getTime() - Date.now()) / DAY_MS))
      : null;
    return {
      ...club,
      effectiveEndsAt,
      isExpired,
      daysLeft,
    };
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
