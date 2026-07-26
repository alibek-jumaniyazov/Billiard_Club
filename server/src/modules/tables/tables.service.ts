import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { LightDriver, LightMode, SessionStatus } from '../../entities/enums';
import { Session } from '../../entities/session.entity';
import { Table } from '../../entities/table.entity';
import { User } from '../../entities/user.entity';
import { safeTimezone } from '../settings/timezones';
import { CreateTableDto, UpdateTableDto } from './dto/tables.dto';

@Injectable()
export class TablesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Table) private readonly tableRepo: Repository<Table>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    // Global AuditModule ro'yxatdan o'tmagan bo'lsa ham servis ishga tushaveradi
    @Optional() private readonly auditService?: AuditService,
  ) {}

  /**
   * Klub sozlamalari (bitta so'rovda):
   *  - timezone — "bugun" chegarasi shu mintaqada (dashboard bilan bir xil);
   *  - lightMode — chiroq boshqaruvi rejimi; UI stol kartasida lampochka
   *    tugmasini KO'RSATISH/YASHIRISH uchun ishlatadi (rejim 'off' bo'lsa
   *    tugma bosilganda hech narsa o'zgarmasdi — shuning uchun ko'rsatilmaydi).
   */
  private async clubSettings(clubId: number): Promise<{ timezone: string; lightMode: string }> {
    const rows: Array<{ timezone: string | null; lightMode: string | null }> =
      await this.dataSource.query(
        `SELECT s.timezone, s."lightMode" FROM settings s WHERE s."clubId" = $1`,
        [clubId],
      );
    return {
      timezone: safeTimezone(rows[0]?.timezone),
      lightMode: rows[0]?.lightMode ?? LightMode.OFF,
    };
  }

  /** Stollar + joriy faol sessiyalar + bugungi yakunlangan o'yinlar soni (bitta so'rovda, N+1 siz) */
  async findAll(clubId: number) {
    const tables = await this.tableRepo.find({
      where: { clubId, isActive: true },
      order: { number: 'ASC' },
    });
    if (tables.length === 0) return [];

    const tableIds = tables.map((t) => t.id);

    const activeSessions = await this.sessionRepo.find({
      where: {
        tableId: In(tableIds),
        status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]),
      },
    });
    const activeByTable = new Map(activeSessions.map((s) => [s.tableId, s]));

    // "Bugun" — klub vaqt mintaqasida (server-lokal yarim tun EMAS)
    const { timezone: tz, lightMode } = await this.clubSettings(clubId);
    const lightsEnabled = lightMode !== LightMode.OFF;
    const counts: Array<{ tableId: number; cnt: string }> = await this.sessionRepo
      .createQueryBuilder('session')
      .select('session.tableId', 'tableId')
      .addSelect('COUNT(*)', 'cnt')
      .where('session.tableId IN (:...tableIds)', { tableIds })
      .andWhere('session.status = :status', { status: SessionStatus.COMPLETED })
      .andWhere(
        `session."endTime" >= (date_trunc('day', now() AT TIME ZONE :tz) AT TIME ZONE :tz)`,
        { tz },
      )
      .groupBy('session.tableId')
      .getRawMany();
    const countByTable = new Map(counts.map((c) => [Number(c.tableId), parseInt(c.cnt, 10)]));

    return tables.map((table) => ({
      ...table,
      sessions: activeByTable.has(table.id) ? [activeByTable.get(table.id)] : [],
      todayCompletedSessions: countByTable.get(table.id) ?? 0,
      // Chiroq boshqaruvi shu stolda haqiqatan ishlaydimi (rejim + rele sozlangan)
      lightControl: lightsEnabled && table.lightDriver !== LightDriver.NONE,
    }));
  }

  async findOne(clubId: number, id: number) {
    const table = await this.tableRepo.findOne({ where: { id, clubId } });
    if (!table) throw new NotFoundException({ key: 'tables.notFound' });
    const session = await this.sessionRepo.findOne({
      where: { tableId: id, status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]) },
    });
    return { ...table, sessions: session ? [session] : [] };
  }

  async create(clubId: number, dto: CreateTableDto) {
    await this.ensureNumberFree(clubId, dto.number);
    return this.tableRepo.save({
      clubId,
      name: dto.name,
      number: dto.number,
      pricePerHour: dto.pricePerHour,
      description: dto.description ?? null,
    });
  }

  /**
   * Stolni yangilash. NARX alohida muomalada:
   *  - stolda ochiq (active/paused) sessiya turgan bo'lsa narx O'ZGARTIRILMAYDI —
   *    sessiya narxni boshlanishida MUHRLAB oladi, shuning uchun "narxni tushir →
   *    sessiya boshla → narxni tikla" ketma-ketligi izsiz pul o'g'irlash yo'li edi;
   *  - har qanday narx o'zgarishi audit jurnaliga (eski/yangi qiymat bilan) tushadi.
   *
   * Tekshiruv va yozuv remove() dagi kabi BITTA tranzaksiyada, QULFLASH TARTIBI
   * ham o'sha: avval stol, keyin sessiya (sessions.start()/transfer() bilan mos).
   */
  async update(clubId: number, id: number, dto: UpdateTableDto, user?: User) {
    const { saved, oldPrice, priceChanged } = await this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(Table, {
        where: { id, clubId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!table) throw new NotFoundException({ key: 'tables.notFound' });
      if (dto.number != null && dto.number !== table.number) {
        await this.ensureNumberFree(clubId, dto.number, id);
      }

      const previousPrice = table.pricePerHour;
      const changed = dto.pricePerHour != null && dto.pricePerHour !== previousPrice;
      if (changed) {
        const busySession = await manager.findOne(Session, {
          where: { tableId: id, status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]) },
        });
        if (busySession) throw new BadRequestException({ key: 'tables.priceChangeWhileBusy' });
      }

      // NOT NULL ustunlar `!= null` bilan: @IsOptional() literal `null` ni ham
      // o'tkazadi, description esa nullable — u ataylab tozalanishi mumkin
      Object.assign(table, {
        ...(dto.name != null ? { name: dto.name } : {}),
        ...(dto.number != null ? { number: dto.number } : {}),
        ...(dto.pricePerHour != null ? { pricePerHour: dto.pricePerHour } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      });
      return {
        saved: await manager.save(Table, table),
        oldPrice: previousPrice,
        priceChanged: changed,
      };
    });

    // Audit tranzaksiya muvaffaqiyatli yakunlangach (sessions.service dagi kabi)
    if (priceChanged && this.auditService) {
      this.auditService.log({
        action: 'table.price',
        clubId,
        userId: user?.id ?? null,
        actorRole: user?.role ?? null,
        entity: 'table',
        entityId: id,
        meta: { oldPrice, newPrice: saved.pricePerHour },
      });
    }

    return saved;
  }

  /**
   * Stolni o'chirish (soft-delete). Tekshiruv va yozuv BITTA tranzaksiyada:
   * aks holda sessions.start() bilan poyga bo'lardi — tekshiruv "bo'sh" deb
   * ko'rsatib, shu orada sessiya yaratilib, stol faol o'yin ustida o'chib ketardi.
   *
   * QULFLASH TARTIBI: avval stol, keyin sessiya — sessions.service dagi
   * start()/transfer() bilan bir xil, aks holda deadlock bo'lardi.
   */
  async remove(clubId: number, id: number) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(Table, {
        where: { id, clubId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!table) throw new NotFoundException({ key: 'tables.notFound' });

      const activeSession = await manager.findOne(Session, {
        where: { tableId: id, status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]) },
      });
      if (activeSession) throw new BadRequestException({ key: 'tables.hasActiveSession' });

      await manager.update(Table, id, { isActive: false });
      return true;
    });
  }

  private async ensureNumberFree(clubId: number, number: number, excludeId?: number) {
    const existing = await this.tableRepo.findOne({
      where: {
        clubId,
        number,
        isActive: true,
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
    });
    if (existing) throw new ConflictException({ key: 'tables.numberTaken' });
  }
}
