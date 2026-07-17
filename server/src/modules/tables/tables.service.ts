import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { SessionStatus } from '../../entities/enums';
import { Session } from '../../entities/session.entity';
import { Table } from '../../entities/table.entity';
import { CreateTableDto, UpdateTableDto } from './dto/tables.dto';

@Injectable()
export class TablesService {
  constructor(
    @InjectRepository(Table) private readonly tableRepo: Repository<Table>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
  ) {}

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const counts: Array<{ tableId: number; cnt: string }> = await this.sessionRepo
      .createQueryBuilder('session')
      .select('session.tableId', 'tableId')
      .addSelect('COUNT(*)', 'cnt')
      .where('session.tableId IN (:...tableIds)', { tableIds })
      .andWhere('session.status = :status', { status: SessionStatus.COMPLETED })
      .andWhere('session.endTime >= :today', { today })
      .groupBy('session.tableId')
      .getRawMany();
    const countByTable = new Map(counts.map((c) => [Number(c.tableId), parseInt(c.cnt, 10)]));

    return tables.map((table) => ({
      ...table,
      sessions: activeByTable.has(table.id) ? [activeByTable.get(table.id)] : [],
      todayCompletedSessions: countByTable.get(table.id) ?? 0,
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

  async update(clubId: number, id: number, dto: UpdateTableDto) {
    const table = await this.tableRepo.findOne({ where: { id, clubId, isActive: true } });
    if (!table) throw new NotFoundException({ key: 'tables.notFound' });
    if (dto.number !== undefined && dto.number !== table.number) {
      await this.ensureNumberFree(clubId, dto.number, id);
    }
    Object.assign(table, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.number !== undefined ? { number: dto.number } : {}),
      ...(dto.pricePerHour !== undefined ? { pricePerHour: dto.pricePerHour } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    });
    return this.tableRepo.save(table);
  }

  async remove(clubId: number, id: number) {
    const table = await this.tableRepo.findOne({ where: { id, clubId, isActive: true } });
    if (!table) throw new NotFoundException({ key: 'tables.notFound' });

    const activeSession = await this.sessionRepo.findOne({
      where: { tableId: id, status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]) },
    });
    if (activeSession) throw new BadRequestException({ key: 'tables.hasActiveSession' });

    await this.tableRepo.update(id, { isActive: false });
    return true;
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
