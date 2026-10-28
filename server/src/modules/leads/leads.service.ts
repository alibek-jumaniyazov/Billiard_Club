import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadStatus } from '../../entities/enums';
import { Lead } from '../../entities/lead.entity';
import { TelegramService } from '../../telegram/telegram.service';
import { CreateLeadDto, ListLeadsQueryDto, UpdateLeadDto } from './dto/leads.dto';

/** Bir xil raqamdan qayta yuborilgan arizani shu oyna ichida yangi deb hisoblamaymiz */
const DUPLICATE_WINDOW_MINUTES = 10;

/** ILIKE uchun foydalanuvchi matnidagi % _ \ belgilarini zararsizlantirish */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    private readonly telegram: TelegramService,
  ) {}

  /**
   * Yangi ariza. Telegram xabari ataylab KUTILMAYDI: Telegram sekin yoki
   * ishlamayotgan bo'lsa ham tashrif buyuruvchi darhol javob oladi, ariza
   * esa bazada saqlanib qoladi.
   *
   * Honeypot to'ldirilgan bo'lsa `null` qaytadi — bot "muvaffaqiyat" ko'radi,
   * lekin hech narsa yozilmaydi (bot formani o'zgartirib qayta urinmasin).
   */
  async create(
    dto: CreateLeadDto,
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<{ id: number } | null> {
    if (dto.website?.trim()) return null;

    const digits = dto.phone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) {
      throw new BadRequestException({ key: 'leads.invalidPhone' });
    }

    // Ikki marta bosish yoki qayta yuborish — bitta ariza bo'lib qolsin
    const recent = await this.leadRepo
      .createQueryBuilder('lead')
      .where(`regexp_replace(lead.phone, '[^0-9]', '', 'g') = :digits`, { digits })
      .andWhere(`lead.createdAt > now() - interval '${DUPLICATE_WINDOW_MINUTES} minutes'`)
      .getOne();
    if (recent) return { id: recent.id };

    const lead = await this.leadRepo.save(
      this.leadRepo.create({
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        clubName: dto.clubName?.trim() || null,
        tablesCount: dto.tablesCount ?? null,
        message: dto.message?.trim() || null,
        lang: dto.lang ?? null,
        source: 'landing',
        ip: meta.ip ? meta.ip.slice(0, 64) : null,
        userAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
      }),
    );

    void this.telegram
      .notifyLead(lead)
      .catch((err: Error) => this.logger.warn(`Ariza #${lead.id} Telegram'ga yuborilmadi: ${err.message}`));

    return { id: lead.id };
  }

  /** Superadmin ro'yxati — holat bo'yicha filtr, qidiruv va holatlar soni */
  async findAll(query: ListLeadsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.leadRepo.createQueryBuilder('lead');
    if (query.status) qb.andWhere('lead.status = :status', { status: query.status });
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(lead.name ILIKE :q ESCAPE '\\' OR lead.phone ILIKE :q ESCAPE '\\' OR lead.clubName ILIKE :q ESCAPE '\\')`,
        { q: `%${escapeLike(search)}%` },
      );
    }

    const [rows, total] = await qb
      .orderBy('lead.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const counts = await this.leadRepo
      .createQueryBuilder('lead')
      .select('lead.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('lead.status')
      .getRawMany<{ status: LeadStatus; count: number }>();

    const totals: Record<string, number> = { all: 0 };
    for (const status of Object.values(LeadStatus)) totals[status] = 0;
    for (const row of counts) {
      totals[row.status] = Number(row.count);
      totals.all += Number(row.count);
    }

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      totals,
    };
  }

  async update(id: number, dto: UpdateLeadDto): Promise<Lead> {
    const lead = await this.leadRepo.findOne({ where: { id } });
    if (!lead) throw new NotFoundException({ key: 'leads.notFound' });
    if (dto.status !== undefined) lead.status = dto.status;
    if (dto.note !== undefined) lead.note = dto.note.trim() || null;
    return this.leadRepo.save(lead);
  }
}
