import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { Debt } from '../../entities/debt.entity';
import { Order } from '../../entities/order.entity';
import { Session } from '../../entities/session.entity';
import { SessionStatus } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import { ClubDataQueryDto } from './dto/platform.dto';

/** Bitta so'rovda qaytariladigan eng ko'p qator */
const MAX_LIMIT = 200;

/**
 * KLUB MA'LUMOTLARI KONSOLI (faqat superadmin, FAQAT O'QISH).
 *
 * NEGA ALOHIDA SERVIS, "klubni ko'rish" (impersonatsiya) rejimidan farqli:
 *
 *  1. FAQAT O'QISH. Bu yerda birorta ham yozuv amali yo'q. Impersonatsiya
 *     rejimida superadmin klub nomidan YOZA ham oladi — bu boshqa maqsad va
 *     boshqa xavf. Ko'rish uchun yozish huquqini olish shart emas.
 *
 *  2. KONTEKSTNI ALMASHTIRMAYDI. Impersonatsiya `X-Club-Id` bilan butun
 *     sessiyani boshqa klubga o'tkazadi va har bir so'rovga
 *     `admin.impersonate` jurnal yozuvini qo'shadi. Bir necha klubni ketma-ket
 *     ko'rish jurnalni yuzlab keraksiz yozuv bilan to'ldirardi va HAQIQIY
 *     aralashuvlar (yozuv amallari) o'sha shovqin ichida ko'rinmay ketardi.
 *
 *  3. TENANT CHEGARASI HAR SO'ROVDA. Har bir metod `clubId` ni ochiq
 *     shart sifatida qo'yadi — global "hamma klublar" so'rovi umuman yo'q,
 *     shuning uchun tasodifan boshqa klub ma'lumoti aralashib ketmaydi.
 */
@Injectable()
export class ClubDataService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Debt) private readonly debtRepo: Repository<Debt>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  private async requireClub(clubId: number): Promise<Club> {
    const club = await this.clubRepo.findOne({ where: { id: clubId } });
    if (!club) throw new NotFoundException({ key: 'clubs.notFound' });
    return club;
  }

  private paging(query: ClubDataQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, MAX_LIMIT);
    return { page, limit, skip: (page - 1) * limit };
  }

  private meta(total: number, page: number, limit: number) {
    return { total, page, limit, pages: Math.ceil(total / limit) };
  }

  /**
   * Klub bo'yicha qisqacha holat: bugungi tushum, faol o'yinlar, qarzlar,
   * xodimlar va OXIRGI FAOLLIK vaqti.
   *
   * `lastActivityAt` ataylab bor: obunani uzaytirish yoki bloklash kabi
   * qarorlar aynan shunga qarab qabul qilinadi ("klub umuman ishlayaptimi").
   */
  async overview(clubId: number) {
    const club = await this.requireClub(clubId);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Bitta so'rovda bir nechta agregat — har biri uchun alohida
    // borib-kelish (round-trip) qilmaslik uchun
    const [revenueRow] = (await this.dataSource.query(
      `SELECT
         COALESCE(SUM(CASE WHEN s."endTime" >= $2 THEN s."totalAmount" ELSE 0 END), 0) AS today,
         COALESCE(SUM(s."totalAmount"), 0) AS total,
         COUNT(*) FILTER (WHERE s."endTime" >= $2) AS "todaySessions"
       FROM sessions s
       WHERE s."clubId" = $1 AND s.status = 'completed'`,
      [clubId, startOfDay],
    )) as [{ today: string; total: string; todaySessions: string }];

    // `remainingDebt` — entity ning o'zi yuritadigan qoldiq (totalDebt - paidAmount).
    // Uni shu yerda qayta hisoblamaymiz: qarz to'lovlari mantig'i bitta joyda
    // (debts.service.ts) turishi kerak, aks holda ikkita "haqiqat" paydo bo'lardi.
    // Hisobdan chiqarilgan qarzlar (`writtenOffAt`) ochiq qarz emas.
    const [debtRow] = (await this.dataSource.query(
      `SELECT
         COALESCE(SUM(d."remainingDebt"), 0) AS "openAmount",
         COUNT(*) AS "openCount"
       FROM debts d
       WHERE d."clubId" = $1 AND d."isPaid" = false AND d."writtenOffAt" IS NULL`,
      [clubId],
    )) as [{ openAmount: string; openCount: string }];

    const [activeSessions, staffCount, lastSession] = await Promise.all([
      this.sessionRepo.count({
        where: [
          { clubId, status: SessionStatus.ACTIVE },
          { clubId, status: SessionStatus.PAUSED },
        ],
      }),
      this.userRepo.count({ where: { clubId } }),
      this.sessionRepo.findOne({ where: { clubId }, order: { createdAt: 'DESC' } }),
    ]);

    return {
      club: {
        id: club.id,
        name: club.name,
        status: club.status,
        effectiveEndsAt: club.effectiveEndsAt,
        createdAt: club.createdAt,
      },
      revenueToday: Number(revenueRow?.today ?? 0),
      revenueTotal: Number(revenueRow?.total ?? 0),
      sessionsToday: Number(revenueRow?.todaySessions ?? 0),
      activeSessions,
      staffCount,
      openDebtAmount: Number(debtRow?.openAmount ?? 0),
      openDebtCount: Number(debtRow?.openCount ?? 0),
      lastActivityAt: lastSession?.createdAt ?? null,
    };
  }

  async sessions(clubId: number, query: ClubDataQueryDto) {
    await this.requireClub(clubId);
    const { page, limit, skip } = this.paging(query);

    const [data, total] = await this.sessionRepo.findAndCount({
      where: { clubId },
      relations: { table: true, user: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return { data, pagination: this.meta(total, page, limit) };
  }

  async orders(clubId: number, query: ClubDataQueryDto) {
    await this.requireClub(clubId);
    const { page, limit, skip } = this.paging(query);

    const [data, total] = await this.orderRepo.findAndCount({
      where: { clubId },
      relations: { items: true, user: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return { data, pagination: this.meta(total, page, limit) };
  }

  async debts(clubId: number, query: ClubDataQueryDto) {
    await this.requireClub(clubId);
    const { page, limit, skip } = this.paging(query);

    const [data, total] = await this.debtRepo.findAndCount({
      where: { clubId },
      relations: { customer: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return { data, pagination: this.meta(total, page, limit) };
  }

  /**
   * Xodimlar faolligi: kim nechta o'yin ochgan va qancha tushum yig'gan.
   *
   * Bu klub egasi uchun emas, PLATFORMA egasi uchun ko'rinish — klubning
   * qanchalik jonli ishlayotganini bir qarashda ko'rsatadi.
   */
  async staffActivity(clubId: number) {
    await this.requireClub(clubId);
    const rows = (await this.dataSource.query(
      `SELECT
         u.id, u.name, u.username, u.role, u."lastLogin", u."isActive",
         COUNT(s.id) FILTER (WHERE s."createdAt" > now() - interval '30 days') AS "sessions30d",
         COALESCE(SUM(s."totalAmount") FILTER (
           WHERE s.status = 'completed' AND s."createdAt" > now() - interval '30 days'
         ), 0) AS "revenue30d"
       FROM users u
       LEFT JOIN sessions s ON s."userId" = u.id AND s."clubId" = $1
       WHERE u."clubId" = $1
       GROUP BY u.id
       ORDER BY "revenue30d" DESC`,
      [clubId],
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      ...r,
      sessions30d: Number(r.sessions30d ?? 0),
      revenue30d: Number(r.revenue30d ?? 0),
    }));
  }
}
