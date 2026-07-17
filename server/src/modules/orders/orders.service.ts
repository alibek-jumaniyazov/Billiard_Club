import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import { OrderStatus, SessionStatus } from '../../entities/enums';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Product } from '../../entities/product.entity';
import { Session } from '../../entities/session.entity';
import { User } from '../../entities/user.entity';
import { safeTimezone } from '../settings/timezones';
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

  /**
   * Bugungi bar savdosi — TO'LIQ ma'lumot bo'yicha (sahifadagi 10 ta yozib emas).
   * "Bugun" chegarasi klub vaqt mintaqasida (dashboard/hisobotlar bilan bir xil).
   */
  async todayStats(clubId: number) {
    const tzRows: Array<{ timezone: string | null }> = await this.dataSource.query(
      `SELECT s.timezone FROM settings s WHERE s."clubId" = $1`,
      [clubId],
    );
    const tz = safeTimezone(tzRows[0]?.timezone);
    const dayRows: Array<{ start: Date }> = await this.dataSource.query(
      `SELECT (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1) AS start`,
      [tz],
    );
    const today = new Date(dayRows[0].start);
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

  /**
   * OCHIQ buyurtmani bekor qilish (masalan, xato kiritilgan pozitsiyalar):
   * - Faqat OPEN holatdagi buyurtma bekor qilinadi (yopilgani — hisobga kirgan)
   * - Ombor QAYTARILADI (sessions.cancel bilan bir xil: mahsulotlar bo'yicha
   *   yig'ib, o'sish tartibida — deadlock oldini oladi)
   * - Qulflash tartibi createOrder bilan bir xil: sessiya -> buyurtma -> mahsulotlar
   * - Sessiyaning jonli bar summasi (barAmount) buyurtma summasiga kamaytiriladi
   */
  async cancel(clubId: number, id: number) {
    // Qulflashdan avval sessionId ni aniqlab olamiz (qulf tartibi uchun)
    const existing = await this.orderRepo.findOne({ where: { id, clubId } });
    if (!existing) throw new NotFoundException({ key: 'orders.notFound' });

    return this.dataSource.transaction(async (manager) => {
      let session: Session | null = null;
      if (existing.sessionId) {
        session = await manager.findOne(Session, {
          where: { id: existing.sessionId, clubId },
          lock: { mode: 'pessimistic_write' },
        });
      }

      const order = await manager.findOne(Order, {
        where: { id, clubId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException({ key: 'orders.notFound' });
      if (order.status !== OrderStatus.OPEN) {
        throw new BadRequestException({ key: 'orders.notCancellable' });
      }

      // Ombor qaytarish: mahsulot bo'yicha yig'amiz, o'sish tartibida qulflaymiz
      const items = await manager.find(OrderItem, { where: { orderId: order.id } });
      const restoreByProduct = new Map<number, number>();
      for (const item of items) {
        restoreByProduct.set(
          item.productId,
          (restoreByProduct.get(item.productId) ?? 0) + item.quantity,
        );
      }
      const productIds = [...restoreByProduct.keys()].sort((a, b) => a - b);
      for (const productId of productIds) {
        await manager.increment(
          Product,
          { id: productId },
          'stock',
          restoreByProduct.get(productId)!,
        );
      }

      await manager.update(Order, order.id, { status: OrderStatus.CANCELLED });

      // Jonli bar summasi kamayadi (sessiya yakunida bar summasi baribir
      // faqat OCHIQ buyurtmalardan yig'iladi — bekor qilingani kirmaydi)
      if (session) {
        await manager.update(Session, session.id, {
          barAmount: round2(Math.max(0, session.barAmount - order.totalAmount)),
        });
      }

      return manager.findOne(Order, {
        where: { id: order.id },
        relations: { items: { product: true } },
      });
    });
  }
}
