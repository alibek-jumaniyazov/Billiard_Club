import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { Debt } from '../../entities/debt.entity';
import {
  OrderStatus,
  PaymentMethod,
  SessionStatus,
  TableStatus,
} from '../../entities/enums';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Product } from '../../entities/product.entity';
import { Sale } from '../../entities/sale.entity';
import { Session } from '../../entities/session.entity';
import { Table } from '../../entities/table.entity';
import { User } from '../../entities/user.entity';
import { EndSessionDto, ListSessionsQueryDto, StartSessionDto } from './dto/sessions.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class SessionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
  ) {}

  async findAll(clubId: number, query: ListSessionsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.sessionRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.table', 'table')
      .leftJoinAndSelect('session.user', 'user')
      .where('session.clubId = :clubId', { clubId });

    if (query.status) {
      qb.andWhere('session.status = :status', { status: query.status });
    } else {
      qb.andWhere('session.status != :cancelled', { cancelled: SessionStatus.CANCELLED });
    }
    if (query.tableId) qb.andWhere('session.tableId = :tableId', { tableId: query.tableId });
    if (query.search) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('session.customerName ILIKE :search', { search: `%${query.search}%` }).orWhere(
            'session.customerPhone ILIKE :search',
            { search: `%${query.search}%` },
          );
        }),
      );
    }
    if (query.from) {
      const from = new Date(query.from);
      if (Number.isNaN(from.getTime())) throw new BadRequestException({ key: 'reports.invalidRange' });
      qb.andWhere('session.startTime >= :from', { from });
    }
    if (query.to) {
      const to = new Date(query.to);
      if (Number.isNaN(to.getTime())) throw new BadRequestException({ key: 'reports.invalidRange' });
      qb.andWhere('session.startTime <= :to', { to });
    }

    const [rows, total] = await qb
      .orderBy('session.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(clubId: number, id: number) {
    const session = await this.sessionRepo.findOne({
      where: { id, clubId },
      relations: {
        table: true,
        user: true,
        orders: { items: { product: true } },
        sale: true,
      },
    });
    if (!session) throw new NotFoundException({ key: 'sessions.notFound' });
    return session;
  }

  /**
   * Yangi o'yin boshlash. Stol band bo'lsa — RAD ETILADI (avvalgi
   * "eski sessiyani naqd to'landi deb yopish" xatti-harakati olib tashlandi:
   * u yig'ilmagan pulni kassaga yozar va rol nazoratini chetlab o'tardi).
   * Poyga holatlaridan stol qatori qulfi + DB partial unique indeks himoya qiladi.
   */
  async start(clubId: number, user: User, dto: StartSessionDto) {
    return this.dataSource.transaction(async (manager) => {
      const table = await manager.findOne(Table, {
        where: { id: dto.tableId, clubId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!table) throw new NotFoundException({ key: 'tables.notFound' });

      const existing = await manager.findOne(Session, {
        where: {
          tableId: table.id,
          status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]),
        },
      });
      if (existing) throw new BadRequestException({ key: 'sessions.tableBusy' });

      const session = await manager.save(Session, {
        clubId,
        tableId: table.id,
        userId: user.id,
        customerName: dto.customerName?.trim() || null,
        customerPhone: dto.customerPhone?.trim() || null,
        startTime: new Date(),
        status: SessionStatus.ACTIVE,
        totalPausedMs: 0,
        // Narx muhrlanadi: keyin stol narxi o'zgarsa ham hisob shu narxda
        pricePerHour: table.pricePerHour,
        notes: dto.notes ?? null,
      });

      await manager.save(Order, {
        clubId,
        sessionId: session.id,
        tableId: table.id,
        userId: user.id,
        status: OrderStatus.OPEN,
        totalAmount: 0,
      });

      await manager.update(Table, table.id, { status: TableStatus.BUSY });

      return manager.findOne(Session, { where: { id: session.id }, relations: { table: true } });
    });
  }

  async pause(clubId: number, id: number) {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, clubId, id);
      if (session.status !== SessionStatus.ACTIVE) {
        throw new BadRequestException({ key: 'sessions.onlyActivePausable' });
      }
      await manager.update(Session, id, {
        status: SessionStatus.PAUSED,
        pausedAt: new Date(),
      });
      return manager.findOne(Session, { where: { id }, relations: { table: true } });
    });
  }

  async resume(clubId: number, id: number) {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, clubId, id);
      if (session.status !== SessionStatus.PAUSED || !session.pausedAt) {
        throw new BadRequestException({ key: 'sessions.notPaused' });
      }
      const pausedDuration = Date.now() - new Date(session.pausedAt).getTime();
      await manager.update(Session, id, {
        status: SessionStatus.ACTIVE,
        pausedAt: null,
        totalPausedMs: session.totalPausedMs + Math.max(0, pausedDuration),
      });
      return manager.findOne(Session, { where: { id }, relations: { table: true } });
    });
  }

  /**
   * O'yinni yakunlash va hisob-kitob.
   * - Chegirma tekshiriladi (0 <= discount <= stol+bar)
   * - Qarz: umumiy summadan oshmaydigan qilib chegaralanadi
   * - Sale = HAQIQATDA hozir to'langan pul (tushum hisobotlari uchun)
   * - Kassir (userId) Sale va Debt yozuvlariga muhrlanadi
   */
  async end(clubId: number, user: User, id: number, dto: EndSessionDto) {
    const result = await this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, clubId, id);
      if (session.status !== SessionStatus.ACTIVE && session.status !== SessionStatus.PAUSED) {
        throw new BadRequestException({ key: 'sessions.alreadyEnded' });
      }

      const table = await manager.findOne(Table, {
        where: { id: session.tableId },
        lock: { mode: 'pessimistic_write' },
      });

      // Davomiylik: pauza vaqtlari ayiriladi
      const endTime = new Date();
      let activeMs = endTime.getTime() - new Date(session.startTime).getTime();
      activeMs -= session.totalPausedMs;
      if (session.status === SessionStatus.PAUSED && session.pausedAt) {
        activeMs -= endTime.getTime() - new Date(session.pausedAt).getTime();
      }
      activeMs = Math.max(0, activeMs);
      const durationMinutes = Math.ceil(activeMs / 60_000);

      // Sessiya boshlanganida muhrlangan narx; eski yozuvlar uchun joriy narx
      const pricePerHour = session.pricePerHour ?? (table ? table.pricePerHour : 0);
      const tableAmount = round2((pricePerHour * durationMinutes) / 60);

      // Ochiq buyurtmalarni yopamiz va bar summasini yig'amiz
      const openOrders = await manager.find(Order, {
        where: { sessionId: session.id, status: OrderStatus.OPEN },
        lock: { mode: 'pessimistic_write' },
      });
      let barAmount = 0;
      for (const order of openOrders) {
        barAmount += order.totalAmount;
        await manager.update(Order, order.id, { status: OrderStatus.CLOSED });
      }
      barAmount = round2(barAmount);

      const gross = round2(tableAmount + barAmount);
      const discount = round2(dto.discount ?? 0);
      if (discount < 0 || discount > gross) {
        throw new BadRequestException({ key: 'sessions.invalidDiscount' });
      }
      const totalAmount = round2(gross - discount);

      // Qarz hisobi
      const isDebt = dto.isDebt === true;
      let totalDebt = 0;
      let debtRecord: Debt | null = null;
      const customerName = dto.customerName?.trim() || session.customerName;
      const customerPhone = dto.customerPhone?.trim() || session.customerPhone;

      if (isDebt) {
        if (!customerName) {
          throw new BadRequestException({ key: 'sessions.debtNeedsCustomer' });
        }
        if (!dto.isTableDebt && !dto.isBarDebt) {
          throw new BadRequestException({ key: 'sessions.debtNeedsComponent' });
        }
        const tDebt = dto.isTableDebt ? tableAmount : 0;
        const bDebt = dto.isBarDebt ? barAmount : 0;
        // Chegirma qo'llangan umumiy summadan oshmasin
        totalDebt = round2(Math.min(tDebt + bDebt, totalAmount));

        if (totalDebt > 0) {
          debtRecord = await manager.save(Debt, {
            clubId,
            sessionId: session.id,
            userId: user.id,
            customerName,
            customerPhone: customerPhone ?? null,
            tableAmount: round2(Math.min(tDebt, totalDebt)),
            barAmount: round2(Math.max(0, totalDebt - Math.min(tDebt, totalDebt))),
            totalDebt,
            paidAmount: 0,
            remainingDebt: totalDebt,
            description: dto.notes ?? null,
            isPaid: false,
          });
        }
      }

      const paidNow = round2(totalAmount - totalDebt);
      const paymentMethod = dto.paymentMethod ?? PaymentMethod.CASH;

      await manager.update(Session, session.id, {
        endTime,
        durationMinutes,
        tableAmount,
        barAmount,
        totalAmount,
        status: SessionStatus.COMPLETED,
        paymentMethod,
        isPaid: totalDebt === 0,
        customerName,
        customerPhone: customerPhone ?? null,
        notes: dto.notes ?? session.notes,
        pausedAt: null,
      });

      if (table) {
        await manager.update(Table, table.id, { status: TableStatus.FREE });
      }

      // Hisob-kitob yozuvi: haqiqatda hozir olingan pul
      await manager.save(Sale, {
        clubId,
        sessionId: session.id,
        userId: user.id,
        tableAmount,
        barAmount,
        totalAmount: paidNow,
        paymentMethod,
        discount,
        notes: dto.notes ?? null,
      });

      return {
        sessionId: session.id,
        durationMinutes,
        tableAmount,
        barAmount,
        discount,
        totalAmount,
        paidNow,
        totalDebt,
        debtId: debtRecord?.id ?? null,
        isDebt: totalDebt > 0,
      };
    });

    const session = await this.sessionRepo.findOne({
      where: { id: result.sessionId },
      relations: { table: true },
    });
    return { ...result, session };
  }

  /**
   * Bekor qilish: buyurtmalar bekor bo'ladi va OMBOR QAYTARILADI
   * (avval bekor qilingan sessiyalar omborni "yeb ketardi").
   */
  async cancel(clubId: number, id: number) {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, clubId, id);
      if (session.status !== SessionStatus.ACTIVE && session.status !== SessionStatus.PAUSED) {
        throw new BadRequestException({ key: 'sessions.onlyActiveCancellable' });
      }

      const orders = await manager.find(Order, {
        where: { sessionId: session.id, status: OrderStatus.OPEN },
        lock: { mode: 'pessimistic_write' },
      });

      // Ombor qaytarish: mahsulot bo'yicha yig'ib, o'sish tartibida qulflaymiz
      // (createOrder bilan bir xil tartib — deadlock oldini oladi)
      const restoreByProduct = new Map<number, number>();
      for (const order of orders) {
        const items = await manager.find(OrderItem, { where: { orderId: order.id } });
        for (const item of items) {
          restoreByProduct.set(
            item.productId,
            (restoreByProduct.get(item.productId) ?? 0) + item.quantity,
          );
        }
        await manager.update(Order, order.id, { status: OrderStatus.CANCELLED });
      }
      const productIds = [...restoreByProduct.keys()].sort((a, b) => a - b);
      for (const productId of productIds) {
        await manager.increment(Product, { id: productId }, 'stock', restoreByProduct.get(productId)!);
      }

      await manager.update(Session, session.id, {
        status: SessionStatus.CANCELLED,
        endTime: new Date(),
        tableAmount: 0,
        barAmount: 0,
        totalAmount: 0,
        pausedAt: null,
      });
      await manager.update(Table, session.tableId, { status: TableStatus.FREE });

      return manager.findOne(Session, { where: { id }, relations: { table: true } });
    });
  }

  private async lockSession(manager: EntityManager, clubId: number, id: number): Promise<Session> {
    const session = await manager.findOne(Session, {
      where: { id, clubId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) throw new NotFoundException({ key: 'sessions.notFound' });
    return session;
  }
}
