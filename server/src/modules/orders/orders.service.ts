import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import { OrderStatus, SessionStatus } from '../../entities/enums';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Product } from '../../entities/product.entity';
import { Session } from '../../entities/session.entity';
import { User } from '../../entities/user.entity';
import { CreateOrderDto, ListOrdersQueryDto } from './dto/orders.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  async findAll(clubId: number, query: ListOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const where: Record<string, unknown> = { clubId };
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.tableId) where.tableId = query.tableId;
    if (query.status) where.status = query.status;

    const [rows, total] = await this.orderRepo.findAndCount({
      where,
      relations: { table: true, user: true, items: { product: true } },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /** Bugungi bar savdosi — TO'LIQ ma'lumot bo'yicha (sahifadagi 10 ta yozib emas) */
  async todayStats(clubId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    const [amount, count] = await Promise.all([
      this.orderRepo.sum('totalAmount', {
        clubId,
        createdAt: Between(today, now),
        status: In([OrderStatus.OPEN, OrderStatus.CLOSED]),
      }),
      this.orderRepo.count({
        where: {
          clubId,
          createdAt: Between(today, now),
          status: In([OrderStatus.OPEN, OrderStatus.CLOSED]),
        },
      }),
    ]);

    return { todayAmount: amount ?? 0, todayCount: count };
  }

  /**
   * Sessiyaga bar buyurtmasi qo'shish.
   * - Sessiya faol/pauzada bo'lishi shart (yakunlangan sessiyaga buyurtma yozib bo'lmaydi)
   * - Mahsulot topilmasa — XATO (avval jimgina o'tkazib yuborilardi)
   * - Ombor yetarli bo'lmasa — XATO (avval "yashirin oversell" bo'lardi)
   * - Mahsulot qatori qulflanadi — parallel buyurtmalar ombor hisobini buzmaydi
   */
  async create(clubId: number, user: User, dto: CreateOrderDto) {
    return this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(Session, {
        where: {
          id: dto.sessionId,
          clubId,
          status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) throw new BadRequestException({ key: 'orders.sessionNotActive' });

      // Ochiq buyurtmani topamiz yoki yaratamiz (DB unique indeks dublikatdan himoya qiladi)
      let order = await manager.findOne(Order, {
        where: { sessionId: session.id, status: OrderStatus.OPEN },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        order = await manager.save(Order, {
          clubId,
          sessionId: session.id,
          tableId: session.tableId,
          userId: user.id,
          status: OrderStatus.OPEN,
          totalAmount: 0,
        });
      }

      // Mahsulot qatorlari HAR DOIM o'sish tartibida qulflanadi —
      // parallel tranzaksiyalar orasida deadlock bo'lmasligi uchun
      const sortedItems = [...dto.items].sort((a, b) => a.productId - b.productId);

      let addedAmount = 0;
      for (const item of sortedItems) {
        const product = await manager.findOne(Product, {
          where: { id: item.productId, clubId, isActive: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (!product) {
          throw new BadRequestException({
            key: 'orders.productNotFound',
            args: { name: `#${item.productId}` },
          });
        }
        if (product.stock < item.quantity) {
          throw new BadRequestException({
            key: 'orders.insufficientStock',
            args: { name: product.name, stock: product.stock },
          });
        }

        const subtotal = round2(product.price * item.quantity);
        await manager.save(OrderItem, {
          orderId: order.id,
          productId: product.id,
          quantity: item.quantity,
          price: product.price,
          subtotal,
        });
        await manager.update(Product, product.id, { stock: product.stock - item.quantity });
        addedAmount += subtotal;
      }

      const newTotal = round2(order.totalAmount + addedAmount);
      await manager.update(Order, order.id, { totalAmount: newTotal });
      await manager.update(Session, session.id, {
        barAmount: round2(session.barAmount + addedAmount),
      });

      return manager.findOne(Order, {
        where: { id: order.id },
        relations: { items: { product: true } },
      });
    });
  }
}
