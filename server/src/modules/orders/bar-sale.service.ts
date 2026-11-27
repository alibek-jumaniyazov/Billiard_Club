import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { clampOfflineAt } from '../../common/time/offline-at';
import { Customer } from '../../entities/customer.entity';
import { Debt } from '../../entities/debt.entity';
import { OrderStatus, PaymentMethod } from '../../entities/enums';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Product } from '../../entities/product.entity';
import { Sale } from '../../entities/sale.entity';
import { SessionPayment } from '../../entities/session-payment.entity';
import { User } from '../../entities/user.entity';
import { normalizePhone } from '../customers/customers.service';
import { CreateBarSaleDto } from './dto/orders.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Bitta pozitsiya (chek va javob uchun) */
export interface BarSaleLine {
  productId: number;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

/** Stolsiz bar savdosi natijasi — kassa ekrani va chek shu bilan quriladi */
export interface BarSaleResult {
  orderId: number;
  saleId: number;
  items: BarSaleLine[];
  /** Pozitsiyalar yig'indisi (chegirmadan oldin) */
  barAmount: number;
  discount: number;
  /** To'lanadigan summa: barAmount − discount */
  totalAmount: number;
  /** Hozir olingan pul (qarzga yozilsa 0) */
  paidNow: number;
  payments: Array<{ method: PaymentMethod; amount: number }>;
  totalDebt: number;
  debtId: number | null;
  customerId: number | null;
  customerName: string | null;
  /** Savdo vaqti (oflayn savdoda — kassada bosilgan payt) */
  soldAt: string;
  serverNow: string;
}

/**
 * STOLSIZ BAR SAVDOSI — billiard o'ynamaydigan mijozga bardan to'g'ridan-to'g'ri sotish.
 *
 * Bitta tranzaksiyada: mahsulot qatorlari (o'sish tartibida — deadlock yo'q) qulflanadi,
 * ombor kamayadi, YOPIQ buyurtma + pozitsiyalar, sotuv (`sales.orderId`) va to'lov
 * satrlari (`session_payments.saleId`) yoziladi; qarzga sotilsa — qarz yozuvi.
 * Pul o'yin hisob-kitobi bilan bir xil jadvallarda bo'lgani uchun tushum, to'lov
 * usullari, smena (Z-hisobot) va Telegram hisobotlari uni o'zi hisobga oladi.
 *
 * ONLAYN: kassir ekranidagi narx (`items[].price`) joriy narxdan farq qilsa 409 —
 * ekranda ko'rsatilganidan boshqa pul olinmasin. Ombor yetmasa 400.
 *
 * OFLAYN (`offlineAt` bor, navbatdan): pul kassada ALLAQACHON olingan, shuning uchun
 * rad etilmaydi — sotuv kassada bosilgan vaqt va O'SHA narx bilan yoziladi, ombor
 * yetmasa noldan pastga tushmaydi; farqlar audit jurnaliga yoziladi (egaga ko'rinadi).
 * Internetsiz qarz — faqat ro'yxatdagi mijozga (sessions.end bilan bir xil qoida).
 */
@Injectable()
export class BarSaleService {
  constructor(
    private readonly dataSource: DataSource,
    // Global AuditModule ro'yxatdan o'tmagan bo'lsa ham servis ishlayveradi
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async sell(clubId: number, user: User, dto: CreateBarSaleDto): Promise<BarSaleResult> {
    const offline = dto.offlineAt !== undefined;
    const isDebt = dto.isDebt === true;

    const { result, notes } = await this.dataSource.transaction(async (manager) => {
      const [soldAt, timeClamped] = offline ? clampOfflineAt(dto.offlineAt) : [new Date(), false];
      // Onlayn — ustun standarti (now()); oflayn — kassada bosilgan payt
      const at = offline ? { createdAt: soldAt } : {};

      // 1. Pozitsiyalar mahsulot bo'yicha yig'iladi; qatorlar O'SISH tartibida qulflanadi
      const wanted = new Map<number, { quantity: number; price?: number }>();
      for (const item of dto.items) {
        const prev = wanted.get(item.productId);
        wanted.set(item.productId, {
          quantity: (prev?.quantity ?? 0) + item.quantity,
          price: prev?.price ?? item.price,
        });
      }
      const productIds = [...wanted.keys()].sort((a, b) => a - b);

      const lines: BarSaleLine[] = [];
      const oversold: Array<{ productId: number; name: string; requested: number; stock: number }> = [];
      const repriced: Array<{ productId: number; name: string; sold: number; current: number }> = [];
      for (const productId of productIds) {
        const { quantity, price: shownPrice } = wanted.get(productId)!;
        const product = await manager.findOne(Product, {
          where: { id: productId, clubId, isActive: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (!product) {
          throw new BadRequestException({ key: 'orders.productNotFound', args: { name: `#${productId}` } });
        }

        let price = product.price;
        if (shownPrice !== undefined && Math.abs(round2(shownPrice) - product.price) >= 0.01) {
          if (!offline) {
            // Kassir eski narxni ko'rib turibdi — boshqa pul olinmasin
            throw new ConflictException({
              key: 'orders.priceChanged',
              args: { name: product.name, price: product.price },
            });
          }
          price = round2(shownPrice);
          repriced.push({ productId, name: product.name, sold: price, current: product.price });
        }

        if (product.stock < quantity) {
          if (!offline) {
            throw new BadRequestException({
              key: 'orders.insufficientStock',
              args: { name: product.name, stock: product.stock },
            });
          }
          oversold.push({ productId, name: product.name, requested: quantity, stock: product.stock });
        }
        await manager.update(Product, product.id, { stock: Math.max(0, product.stock - quantity) });
        lines.push({ productId, name: product.name, quantity, price, subtotal: round2(price * quantity) });
      }
      // Qulflash id tartibida bo'ldi; chek va buyurtma esa kassir savatga qo'shgan tartibda
      const cartOrder = new Map([...wanted.keys()].map((id, index) => [id, index]));
      lines.sort((a, b) => cartOrder.get(a.productId)! - cartOrder.get(b.productId)!);
      const barAmount = round2(lines.reduce((sum, line) => sum + line.subtotal, 0));

      // 2. Chegirma: 0 ≤ chegirma ≤ jami (oflaynda — kesiladi, pul allaqachon olingan)
      const requestedDiscount = round2(dto.discount ?? 0);
      const discount = offline ? Math.min(Math.max(requestedDiscount, 0), barAmount) : requestedDiscount;
      if (discount < 0 || discount > barAmount) {
        throw new BadRequestException({ key: 'sessions.invalidDiscount' });
      }
      const totalAmount = round2(barAmount - discount);

      // 3. Mijoz: ro'yxatdagi (customerId) — eng ishonchli manba; aks holda ism + telefon
      let customerId: number | null = null;
      let customerName: string | null = dto.customerName?.trim() || null;
      let customerPhone: string | null = normalizePhone(dto.customerPhone) ?? null;
      const listed =
        dto.customerId !== undefined
          ? await manager.findOne(Customer, { where: { id: dto.customerId, clubId } })
          : null;
      if (listed) {
        customerId = listed.id;
        customerName = listed.name;
        customerPhone = listed.phone;
      } else if (dto.customerId !== undefined && isDebt) {
        throw new BadRequestException({ key: 'sessions.debtCustomerNotFound' });
      } else if (offline && isDebt) {
        // Internetsiz qarz faqat ro'yxatdagi mijozga: erkin ism bilan qarzni keyin undirib bo'lmasligi mumkin
        throw new BadRequestException({ key: 'sessions.offlineDebtNeedsCustomer' });
      } else if (customerPhone) {
        customerId = await this.linkCustomer(manager, clubId, customerPhone);
      }
      if (isDebt && !customerName) {
        throw new BadRequestException({ key: 'sessions.debtNeedsCustomer' });
      }

      // 4. To'lov: qarz — butun summa qarzga; aks holda to'lov satrlari = to'lanadigan summa
      const totalDebt = isDebt ? totalAmount : 0;
      let paidNow = round2(totalAmount - totalDebt);
      let payments: Array<{ method: PaymentMethod; amount: number }>;
      let mismatch: { expected: number; collected: number } | null = null;
      const listedPayments = (dto.payments ?? [])
        .map((p) => ({ method: p.method, amount: round2(p.amount) }))
        .filter((p) => p.amount > 0);
      if (isDebt) {
        if (listedPayments.length > 0) throw new BadRequestException({ key: 'sessions.paymentsMismatch' });
        payments = [];
      } else if (listedPayments.length > 0) {
        payments = listedPayments;
        const collected = round2(payments.reduce((sum, p) => sum + p.amount, 0));
        if (Math.abs(collected - paidNow) > 0.01) {
          // Oflayn: kassada olingan pul yoziladi, farq belgilanadi; onlayn — kassir xatosi
          if (!offline) throw new BadRequestException({ key: 'sessions.paymentsMismatch' });
          mismatch = { expected: paidNow, collected };
          paidNow = collected;
        } else if (collected !== paidNow) {
          // Tiyin farqi eng yirik satrga singadi: sum(to'lov satrlari) = sotuv summasi
          const largest = payments.reduce((best, p, i) => (p.amount > payments[best].amount ? i : best), 0);
          payments[largest] = { ...payments[largest], amount: round2(payments[largest].amount + paidNow - collected) };
        }
      } else {
        const method = dto.paymentMethod ?? PaymentMethod.CASH;
        payments = paidNow > 0 ? [{ method, amount: paidNow }] : [];
      }
      // Sotuv yozuvidagi usul — eng katta ulush (o'yin hisob-kitobi bilan bir xil)
      const byMethod = new Map<PaymentMethod, number>();
      for (const p of payments) byMethod.set(p.method, round2((byMethod.get(p.method) ?? 0) + p.amount));
      const paymentMethod =
        [...byMethod.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? dto.paymentMethod ?? PaymentMethod.CASH;

      const note = dto.notes?.trim() || null;

      // 5. Yozuvlar: yopiq buyurtma + pozitsiyalar, sotuv, to'lov satrlari, qarz
      const order = await manager.save(Order, {
        clubId,
        sessionId: null,
        tableId: null,
        userId: user.id,
        customerId,
        customerName,
        status: OrderStatus.CLOSED,
        totalAmount: barAmount,
        notes: note,
        ...at,
      });
      for (const line of lines) {
        await manager.save(OrderItem, {
          orderId: order.id,
          productId: line.productId,
          quantity: line.quantity,
          price: line.price,
          subtotal: line.subtotal,
          ...at,
        });
      }
      const sale = await manager.save(Sale, {
        clubId,
        sessionId: null,
        orderId: order.id,
        userId: user.id,
        tableAmount: 0,
        barAmount,
        totalAmount: paidNow,
        paymentMethod,
        discount,
        notes: note,
        ...at,
      });
      for (const p of payments) {
        await manager.save(SessionPayment, {
          clubId,
          sessionId: null,
          saleId: sale.id,
          method: p.method,
          amount: p.amount,
          ...at,
        });
      }
      let debtId: number | null = null;
      if (totalDebt > 0) {
        const debt = await manager.save(Debt, {
          clubId,
          sessionId: null,
          userId: user.id,
          customerName: customerName as string,
          customerPhone,
          customerId,
          tableAmount: 0,
          barAmount: totalDebt,
          totalDebt,
          paidAmount: 0,
          remainingDebt: totalDebt,
          description: note,
          isPaid: false,
          ...at,
        });
        debtId = debt.id;
      }

      const result: BarSaleResult = {
        orderId: order.id,
        saleId: sale.id,
        items: lines,
        barAmount,
        discount,
        totalAmount,
        paidNow,
        payments,
        totalDebt,
        debtId,
        customerId,
        customerName,
        soldAt: (order.createdAt ? new Date(order.createdAt) : soldAt).toISOString(),
        serverNow: new Date().toISOString(),
      };
      return {
        result,
        notes: { timeClamped, oversold, repriced, mismatch, requestedAt: dto.offlineAt ?? null },
      };
    });

    // Jurnal — tranzaksiya muvaffaqiyatli tugagach (orqaga qaytgani soxta iz qoldirmasin)
    if (result.discount > 0) {
      this.auditService?.log({
        action: 'order.discount',
        clubId,
        userId: user.id,
        actorRole: user.role,
        entity: 'order',
        entityId: result.orderId,
        meta: { discount: result.discount, totalAmount: result.totalAmount, barAmount: result.barAmount },
      });
    }
    if (notes.timeClamped || notes.oversold.length || notes.repriced.length || notes.mismatch) {
      this.auditService?.log({
        action: 'order.sale_offline_adjusted',
        clubId,
        userId: user.id,
        actorRole: user.role,
        entity: 'order',
        entityId: result.orderId,
        meta: {
          requestedAt: notes.requestedAt,
          appliedAt: result.soldAt,
          timeClamped: notes.timeClamped,
          oversold: notes.oversold,
          repriced: notes.repriced,
          mismatch: notes.mismatch,
        },
      });
    }
    return result;
  }

  /**
   * Telefon bo'yicha RO'YXATDAGI mijozni bog'laydi. Faqat O'QISH: kassa tranzaksiyasi
   * ichida yangi mijoz yaratilmaydi (sessions.service.ts: linkCustomer bilan bir xil sabab).
   */
  private async linkCustomer(manager: EntityManager, clubId: number, phone: string): Promise<number | null> {
    const customer = await manager.findOne(Customer, { where: { clubId, phone }, select: { id: true } });
    return customer?.id ?? null;
  }
}
