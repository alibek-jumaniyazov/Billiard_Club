import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Not, Repository } from 'typeorm';
import { Customer } from '../../entities/customer.entity';
import { Debt } from '../../entities/debt.entity';
import { SessionStatus } from '../../entities/enums';
import { Session } from '../../entities/session.entity';
import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './dto/customers.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Telefonni yagona ko'rinishga keltiradi: faqat raqamlar va boshidagi '+'.
 * '+998 90 123-45-67', '998901234567' kabi variantlar bitta shaklga tushadi —
 * uq_customers_club_phone indeksi va telefon bo'yicha bog'lash shu shaklda ishlaydi.
 */
export const normalizePhone = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const plus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return (plus + digits).slice(0, 20);
};

/** Postgres unique-violation (23505) xatosini aniqlaydi */
const isUniqueViolation = (err: unknown): boolean => {
  const code =
    (err as { driverError?: { code?: string } })?.driverError?.code ??
    (err as { code?: string })?.code;
  return code === '23505';
};

@Injectable()
export class CustomersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
  ) {}

  async findAll(clubId: number, query: ListCustomersQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .where('customer.clubId = :clubId', { clubId });

    if (query.search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('customer.name ILIKE :search', { search: `%${query.search}%` }).orWhere(
            'customer.phone ILIKE :search',
            { search: `%${query.search}%` },
          );
        }),
      );
    }

    const [rows, total] = await qb
      .orderBy('customer.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Mijoz profili: statistika (jami sessiyalar, jami xarajat, ochiq qarz) +
   * so'nggi sessiyalar. customerId bog'lamasidan tashqari telefon mos kelgan
   * eski erkin-matnli yozuvlar ham hisobga olinadi.
   */
  async profile(clubId: number, id: number) {
    const customer = await this.customerRepo.findOne({ where: { id, clubId } });
    if (!customer) throw new NotFoundException({ key: 'customers.notFound' });
    const phone = customer.phone;

    const [statsRows, recentSessions] = await Promise.all([
      this.dataSource.query(
        `SELECT
           (SELECT COUNT(*)::int FROM sessions s
             WHERE s."clubId" = $1 AND s.status = 'completed'
               AND (s."customerId" = $2 OR ($3::text IS NOT NULL AND s."customerPhone" = $3))
           ) AS "totalSessions",
           (SELECT COALESCE(SUM(s."totalAmount"), 0)::float FROM sessions s
             WHERE s."clubId" = $1 AND s.status = 'completed'
               AND (s."customerId" = $2 OR ($3::text IS NOT NULL AND s."customerPhone" = $3))
           ) AS "totalSpent",
           (SELECT COALESCE(SUM(d."remainingDebt"), 0)::float FROM debts d
             WHERE d."clubId" = $1 AND d."isPaid" = false
               AND (d."customerId" = $2 OR ($3::text IS NOT NULL AND d."customerPhone" = $3))
           ) AS "openDebt"`,
        [clubId, id, phone],
      ),
      this.sessionRepo
        .createQueryBuilder('session')
        .leftJoinAndSelect('session.table', 'table')
        .where('session.clubId = :clubId', { clubId })
        .andWhere('session.status != :cancelled', { cancelled: SessionStatus.CANCELLED })
        .andWhere(
          new Brackets((b) => {
            b.where('session.customerId = :id', { id });
            if (phone) b.orWhere('session.customerPhone = :phone', { phone });
          }),
        )
        .orderBy('session.startTime', 'DESC')
        .take(10)
        .getMany(),
    ]);

    const stats = statsRows[0] ?? { totalSessions: 0, totalSpent: 0, openDebt: 0 };
    return {
      customer,
      stats: {
        totalSessions: Number(stats.totalSessions ?? 0),
        totalSpent: round2(Number(stats.totalSpent ?? 0)),
        openDebt: round2(Number(stats.openDebt ?? 0)),
      },
      recentSessions,
    };
  }

  async create(clubId: number, dto: CreateCustomerDto) {
    const phone = normalizePhone(dto.phone);
    if (phone) {
      const duplicate = await this.customerRepo.findOne({ where: { clubId, phone } });
      if (duplicate) throw new ConflictException({ key: 'customers.phoneTaken' });
    }
    try {
      return await this.customerRepo.save({
        clubId,
        name: dto.name.trim(),
        phone,
        notes: dto.notes?.trim() || null,
      });
    } catch (err) {
      // Parallel so'rov bilan poyga — DB indeksi ushlagan bo'lsa do'stona 409
      if (isUniqueViolation(err)) throw new ConflictException({ key: 'customers.phoneTaken' });
      throw err;
    }
  }

  async update(clubId: number, id: number, dto: UpdateCustomerDto) {
    const customer = await this.customerRepo.findOne({ where: { id, clubId } });
    if (!customer) throw new NotFoundException({ key: 'customers.notFound' });

    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (phone && phone !== customer.phone) {
        const duplicate = await this.customerRepo.findOne({
          where: { clubId, phone, id: Not(id) },
        });
        if (duplicate) throw new ConflictException({ key: 'customers.phoneTaken' });
      }
      customer.phone = phone;
    }
    if (dto.name !== undefined) customer.name = dto.name.trim();
    if (dto.notes !== undefined) customer.notes = dto.notes?.trim() || null;

    try {
      return await this.customerRepo.save(customer);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException({ key: 'customers.phoneTaken' });
      throw err;
    }
  }

  /**
   * Mijozni o'chirish — OCHIQ QARZI BOR mijoz o'chirilmaydi (moliyaviy iz).
   * Sessiya/qarz FK lari SET NULL — tarix yozuvlari saqlanib qoladi.
   */
  async remove(clubId: number, id: number) {
    return this.dataSource.transaction(async (manager) => {
      const customer = await manager.findOne(Customer, {
        where: { id, clubId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!customer) throw new NotFoundException({ key: 'customers.notFound' });

      const openDebts = await manager.count(Debt, {
        where: { clubId, customerId: id, isPaid: false },
      });
      if (openDebts > 0) throw new BadRequestException({ key: 'customers.hasDebts' });

      await manager.delete(Customer, id);
      return true;
    });
  }

  /**
   * Telefon bo'yicha mavjud mijozni topadi yoki yangisini yaratadi.
   * Sessiya yakuni / qarz yozuvida customerId bog'lash uchun moljallangan yordamchi:
   * sessions.end() dan tranzaksiya ichida chaqirish uchun ixtiyoriy EntityManager
   * qabul qiladi. Telefon bo'lmasa hech narsa qilmaydi (null qaytaradi) —
   * faqat ism bo'yicha avtomatik bog'lash xatarli (bir xil ismli mijozlar).
   */
  async findOrLinkByPhone(
    clubId: number,
    name: string | null | undefined,
    phone: string | null | undefined,
    manager?: EntityManager,
  ): Promise<Customer | null> {
    const repo = manager ? manager.getRepository(Customer) : this.customerRepo;
    const normalized = normalizePhone(phone);
    if (!normalized) return null;

    const existing = await repo.findOne({ where: { clubId, phone: normalized } });
    if (existing) return existing;

    const trimmedName = name?.trim();
    if (!trimmedName) return null;

    try {
      return await repo.save({
        clubId,
        name: trimmedName.slice(0, 100),
        phone: normalized,
      });
    } catch (err) {
      // Parallel yaratish poygasi — indeks ushladi, mavjudini qaytaramiz
      if (isUniqueViolation(err)) {
        return repo.findOne({ where: { clubId, phone: normalized } });
      }
      throw err;
    }
  }
}
