import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { Coupon } from '../../entities/coupon.entity';
import { InvoiceStatus } from '../../entities/enums';
import { Invoice } from '../../entities/invoice.entity';
import { Plan } from '../../entities/plan.entity';
import { TelegramService } from '../../telegram/telegram.service';
import {
  couponDiscount,
  DAY_MS,
  nextInvoiceNumber,
  round2,
  validateCouponForPlan,
} from './billing.util';
import { ListMyInvoicesQueryDto, PurchaseDto } from './dto/subscription.dto';

/**
 * Klub egasi (admin) uchun obuna xizmati: holat, tariflar katalogi,
 * to'lov so'rovi (hisob-faktura) yaratish va o'z fakturalarini boshqarish.
 * Muddati tugagan (LOCKED) klublar ham sotib olishi uchun barcha
 * endpointlar @SkipSubscription bilan ochiladi.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly telegram: TelegramService,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  /** Klubning obuna holati: muddatlar, qolgan kunlar, joriy/oxirgi faktura, faol tarif */
  async status(clubId: number) {
    const club = await this.clubRepo.findOne({ where: { id: clubId } });
    if (!club) throw new NotFoundException({ key: 'subscription.clubNotFound' });

    const effectiveEndsAt = club.subscriptionEndsAt ?? club.trialEndsAt ?? null;
    const isExpired = !!effectiveEndsAt && new Date(effectiveEndsAt).getTime() < Date.now();
    const daysLeft = effectiveEndsAt
      ? Math.max(0, Math.ceil((new Date(effectiveEndsAt).getTime() - Date.now()) / DAY_MS))
      : null;

    const [currentInvoice, lastInvoice, lastPaidInvoice] = await Promise.all([
      // Tasdiqlanishi kutilayotgan faktura (bo'lsa)
      this.invoiceRepo.findOne({
        where: { clubId, status: InvoiceStatus.PENDING },
        relations: { plan: true, coupon: true },
        order: { createdAt: 'DESC' },
      }),
      // Holatidan qat'i nazar eng oxirgi faktura
      this.invoiceRepo.findOne({
        where: { clubId },
        relations: { plan: true },
        order: { createdAt: 'DESC' },
      }),
      // Faol tarifga ishora — oxirgi to'langan faktura tarifi
      this.invoiceRepo.findOne({
        where: { clubId, status: InvoiceStatus.PAID },
        relations: { plan: true },
        order: { paidAt: 'DESC' },
      }),
    ]);

    return {
      club: {
        id: club.id,
        name: club.name,
        status: club.status,
        trialEndsAt: club.trialEndsAt,
        subscriptionEndsAt: club.subscriptionEndsAt,
        effectiveEndsAt,
        isExpired,
        daysLeft,
      },
      currentInvoice,
      lastInvoice,
      activePlan: lastPaidInvoice?.plan ?? null,
    };
  }

  /** Faol tariflar katalogi — uz+ru maydonlar birga qaytadi, klient tanlaydi */
  async plans() {
    return this.planRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', price: 'ASC' },
    });
  }

  /**
   * To'lov so'rovi: tarif + (ixtiyoriy) kupon -> PENDING hisob-faktura.
   * Klub qatori qulflanadi — bir klubda bir vaqtda faqat bitta PENDING
   * faktura bo'lishi kafolatlanadi. Kupon usedCount bu yerda OSHMAYDI —
   * faqat superadmin tasdiqlaganda oshadi.
   */
  async purchase(clubId: number, dto: PurchaseDto) {
    const { invoice, club } = await this.dataSource.transaction(async (manager) => {
      const lockedClub = await manager.findOne(Club, {
        where: { id: clubId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedClub) throw new NotFoundException({ key: 'subscription.clubNotFound' });

      const pending = await manager.findOne(Invoice, {
        where: { clubId, status: InvoiceStatus.PENDING },
      });
      if (pending) throw new ConflictException({ key: 'subscription.pendingExists' });

      const plan = await manager.findOne(Plan, { where: { id: dto.planId } });
      if (!plan) throw new NotFoundException({ key: 'subscription.planNotFound' });
      if (!plan.isActive) throw new BadRequestException({ key: 'subscription.planInactive' });

      let coupon: Coupon | null = null;
      let discount = 0;
      if (dto.couponCode) {
        const found = await manager
          .getRepository(Coupon)
          .createQueryBuilder('coupon')
          .where('LOWER(coupon.code) = LOWER(:code)', { code: dto.couponCode.trim() })
          .getOne();
        coupon = validateCouponForPlan(found, plan);
        discount = couponDiscount(coupon, plan.price);
      }

      const amount = Math.max(0, round2(plan.price - discount));

      const created = await manager.save(Invoice, {
        clubId,
        planId: plan.id,
        number: await nextInvoiceNumber(manager),
        amount,
        discountAmount: discount,
        // Muddatni MUHRLAYMIZ: tasdiqlashgacha tarif o'zgarsa ham klub aynan
        // sotib olgan muddatni oladi
        durationDays: plan.durationDays,
        couponId: coupon?.id ?? null,
        status: InvoiceStatus.PENDING,
      });

      // Javob uchun bog'liq obyektlarni biriktirib qaytaramiz
      created.plan = plan;
      created.coupon = coupon;
      return { invoice: created, club: lockedClub };
    });

    // Telegram xabarnoma (asosiy oqimni to'xtatmaydi)
    void this.telegram.notifyPurchaseRequest(invoice, club);

    return invoice;
  }

  /** O'z hisob-fakturalari tarixi (sahifalangan) */
  async myInvoices(clubId: number, query: ListMyInvoicesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const [rows, total] = await this.invoiceRepo.findAndCount({
      where: { clubId },
      relations: { plan: true, coupon: true, contract: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /** O'zining PENDING fakturasini bekor qilish */
  async cancelMyInvoice(clubId: number, id: number) {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.findOne(Invoice, {
        where: { id, clubId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice) throw new NotFoundException({ key: 'subscription.invoiceNotFound' });
      if (invoice.status !== InvoiceStatus.PENDING) {
        throw new BadRequestException({ key: 'subscription.invoiceNotPending' });
      }
      invoice.status = InvoiceStatus.CANCELLED;
      return manager.save(Invoice, invoice);
    });
  }
}
