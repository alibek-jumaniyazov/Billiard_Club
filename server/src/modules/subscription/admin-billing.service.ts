import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Not, Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { Coupon } from '../../entities/coupon.entity';
import { CouponType, InvoiceStatus } from '../../entities/enums';
import { Invoice } from '../../entities/invoice.entity';
import { Plan } from '../../entities/plan.entity';
import { TelegramService } from '../../telegram/telegram.service';
import { ClubsService } from '../clubs/clubs.service';
import { contractTypeFromDays } from './billing.util';
import {
  ConfirmInvoiceDto,
  CreateCouponDto,
  CreatePlanDto,
  ListAdminInvoicesQueryDto,
  RejectInvoiceDto,
  UpdateCouponDto,
  UpdatePlanDto,
} from './dto/subscription.dto';

/**
 * Superadmin savdo boshqaruvi: tariflar va kuponlar CRUD,
 * hisob-fakturalarni tasdiqlash (to'lov qabul qilish) / rad etish.
 */
@Injectable()
export class AdminBillingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly telegram: TelegramService,
    private readonly clubsService: ClubsService,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(Coupon) private readonly couponRepo: Repository<Coupon>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  // ==================== Tariflar ====================

  async listPlans() {
    return this.planRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async createPlan(dto: CreatePlanDto) {
    const existing = await this.planRepo.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException({ key: 'subscription.planCodeTaken' });

    return this.planRepo.save({
      code: dto.code,
      nameUz: dto.nameUz,
      nameRu: dto.nameRu,
      descriptionUz: dto.descriptionUz ?? null,
      descriptionRu: dto.descriptionRu ?? null,
      durationDays: dto.durationDays,
      price: dto.price,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      features: dto.features ?? null,
    });
  }

  async updatePlan(id: number, dto: UpdatePlanDto) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException({ key: 'subscription.planNotFound' });

    if (dto.code !== undefined && dto.code !== plan.code) {
      const dup = await this.planRepo.findOne({ where: { code: dto.code, id: Not(id) } });
      if (dup) throw new ConflictException({ key: 'subscription.planCodeTaken' });
      plan.code = dto.code;
    }
    if (dto.nameUz !== undefined) plan.nameUz = dto.nameUz;
    if (dto.nameRu !== undefined) plan.nameRu = dto.nameRu;
    if (dto.descriptionUz !== undefined) plan.descriptionUz = dto.descriptionUz;
    if (dto.descriptionRu !== undefined) plan.descriptionRu = dto.descriptionRu;
    if (dto.durationDays !== undefined) plan.durationDays = dto.durationDays;
    if (dto.price !== undefined) plan.price = dto.price;
    if (dto.sortOrder !== undefined) plan.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) plan.isActive = dto.isActive;
    if (dto.features !== undefined) plan.features = dto.features;

    return this.planRepo.save(plan);
  }

  /** Yumshoq o'chirish — tarif faolsizlantiriladi (eski fakturalar buzilmaydi) */
  async deactivatePlan(id: number) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException({ key: 'subscription.planNotFound' });
    plan.isActive = false;
    return this.planRepo.save(plan);
  }

  // ==================== Kuponlar ====================

  async listCoupons() {
    return this.couponRepo.find({ relations: { plan: true }, order: { createdAt: 'DESC' } });
  }

  async createCoupon(dto: CreateCouponDto) {
    this.assertCouponValue(dto.type, dto.value);
    this.assertCouponWindow(dto.validFrom, dto.validTo);

    const dup = await this.couponRepo
      .createQueryBuilder('coupon')
      .where('LOWER(coupon.code) = LOWER(:code)', { code: dto.code })
      .getOne();
    if (dup) throw new ConflictException({ key: 'subscription.couponCodeTaken' });

    if (dto.planId !== undefined) {
      const plan = await this.planRepo.findOne({ where: { id: dto.planId } });
      if (!plan) throw new NotFoundException({ key: 'subscription.planNotFound' });
    }

    return this.couponRepo.save({
      code: dto.code,
      type: dto.type,
      value: dto.value,
      maxUses: dto.maxUses ?? null,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      isActive: dto.isActive ?? true,
      planId: dto.planId ?? null,
    });
  }

  async updateCoupon(id: number, dto: UpdateCouponDto) {
    const coupon = await this.couponRepo.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException({ key: 'subscription.couponNotFound' });

    const type = dto.type ?? coupon.type;
    const value = dto.value ?? coupon.value;
    this.assertCouponValue(type, value);

    // null — maydonni TOZALASH, undefined — tegilmaydi.
    // (avval null uchun `new Date(null)` = 1970-01-01 yozilib qolardi)
    const validFrom =
      dto.validFrom === undefined ? coupon.validFrom : this.parseCouponDate(dto.validFrom);
    const validTo =
      dto.validTo === undefined ? coupon.validTo : this.parseCouponDate(dto.validTo);
    this.assertCouponWindow(validFrom, validTo);

    if (dto.planId !== undefined) {
      if (dto.planId === null) {
        // Tarif cheklovini olib tashlash — kupon barcha tariflarga ishlaydi
        coupon.planId = null;
      } else {
        const plan = await this.planRepo.findOne({ where: { id: dto.planId } });
        if (!plan) throw new NotFoundException({ key: 'subscription.planNotFound' });
        coupon.planId = dto.planId;
      }
    }

    coupon.type = type;
    coupon.value = value;
    if (dto.maxUses !== undefined) coupon.maxUses = dto.maxUses;
    if (dto.validFrom !== undefined) coupon.validFrom = validFrom;
    if (dto.validTo !== undefined) coupon.validTo = validTo;
    if (dto.isActive !== undefined) coupon.isActive = dto.isActive;

    return this.couponRepo.save(coupon);
  }

  /** Yumshoq o'chirish — kupon faolsizlantiriladi */
  async deactivateCoupon(id: number) {
    const coupon = await this.couponRepo.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException({ key: 'subscription.couponNotFound' });
    coupon.isActive = false;
    return this.couponRepo.save(coupon);
  }

  // ==================== Hisob-fakturalar ====================

  /** Barcha fakturalar (klub bilan), status/klub filtri va sahifalash */
  async listInvoices(query: ListAdminInvoicesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.invoiceRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.club', 'club')
      .leftJoinAndSelect('invoice.plan', 'plan')
      .leftJoinAndSelect('invoice.coupon', 'coupon');

    if (query.status) qb.andWhere('invoice.status = :status', { status: query.status });
    if (query.clubId) qb.andWhere('invoice.clubId = :clubId', { clubId: query.clubId });

    const [rows, total] = await qb
      .orderBy('invoice.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * To'lovni tasdiqlash — bitta tranzaksiyada:
   *  faktura -> PAID (paidAt), shartnoma yaratiladi (boshlanish —
   *  joriy obuna tugashi yoki hozir), klub obunasi uzaytiriladi
   *  (bloklanmagan bo'lsa status ACTIVE), kupon ishlatilgan bo'lsa
   *  usedCount +1.
   * SubscriptionGuard klubni HAR so'rovda DB dan qayta o'qiydi —
   * shu tufayli tasdiqlash klubni darhol ochadi (instant unlock).
   * Tasdiqlash HECH QACHON kupon sababli rad etilmaydi: pul allaqachon
   * kelgan, xarid paytidagi snapshot — shartnoma.
   */
  async confirmInvoice(id: number, dto: ConfirmInvoiceDto) {
    const { invoice, club } = await this.dataSource.transaction(async (manager) => {
      const inv = await manager.findOne(Invoice, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inv) throw new NotFoundException({ key: 'subscription.invoiceNotFound' });
      // EXPIRED ham qabul qilinadi: cron eski PENDING fakturani yopadi, lekin
      // bank o'tkazmasi kechikib kelishi mumkin — superadmin kech kelgan
      // to'lovni baribir tasdiqlay olishi shart (aks holda faktura muzlab qolardi).
      if (![InvoiceStatus.PENDING, InvoiceStatus.EXPIRED].includes(inv.status)) {
        throw new BadRequestException({ key: 'subscription.invoiceNotPending' });
      }
      // Bir to'lov IKKI marta yozilmasin: muddati o'tgan faktura muzlab qolganda
      // klub qayta xarid qilib, o'sha to'lov yangi faktura bilan tasdiqlangan
      // bo'lishi mumkin. Shu klubda KEYINROQ berilgan faktura allaqachon to'langan
      // bo'lsa — eski fakturani tasdiqlash ikkinchi davr va ikki karra daromad
      // beradi, shuning uchun rad etiladi (uni Rad etish tugmasi bilan yopiladi).
      if (inv.status === InvoiceStatus.EXPIRED) {
        const newerPaid = await manager.findOne(Invoice, {
          where: { clubId: inv.clubId, status: InvoiceStatus.PAID, id: MoreThan(inv.id) },
        });
        if (newerPaid) throw new BadRequestException({ key: 'subscription.staleInvoice' });
      }

      const plan = inv.planId
        ? await manager.findOne(Plan, { where: { id: inv.planId } })
        : null;
      if (!plan) throw new BadRequestException({ key: 'subscription.planNotFound' });

      const lockedClub = await manager.findOne(Club, {
        where: { id: inv.clubId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedClub) throw new NotFoundException({ key: 'clubs.notFound' });

      // Davomiylik XARID PAYTIDA muhrlangan (inv.durationDays) — tasdiqlashgacha
      // tarif o'zgargan bo'lsa ham klub aynan sotib olgan muddatni oladi.
      // Eski (snapshotdan avvalgi) fakturalarda null — tarifning joriy qiymati.
      const durationDays = inv.durationDays ?? plan.durationDays;

      // Shartnoma + klub obunasini uzaytirish — clubs.service dagi umumiy yo'l.
      // Boshlanish sanasi o'sha yerda, klub qatori qulfi ostida hisoblanadi.
      const contract = await this.clubsService.applyContractInTransaction(manager, inv.clubId, {
        type: contractTypeFromDays(durationDays),
        amount: inv.amount,
        durationDays,
        notes: `Hisob-faktura ${inv.number}`,
      });

      // Kupon ishlatildi — usedCount faqat TASDIQLASHDA oshadi.
      if (inv.couponId) {
        await manager.findOne(Coupon, {
          where: { id: inv.couponId },
          lock: { mode: 'pessimistic_write' },
        });
        // Kupon so'rov va tasdiq oralig'ida tugab/o'chib/limitga yetgan bo'lishi
        // mumkin — lekin bu TO'LOVNI bekor qilmaydi. Limit shartning O'ZIDA:
        // usedCount faqat bo'sh joy bo'lsa oshadi, aks holda faqat izoh yoziladi.
        const bumped = await manager
          .createQueryBuilder()
          .update(Coupon)
          .set({ usedCount: () => '"usedCount" + 1' })
          .where('id = :id', { id: inv.couponId })
          .andWhere('("maxUses" IS NULL OR "usedCount" < "maxUses")')
          .execute();
        if (!bumped.affected) {
          inv.notes = [inv.notes, 'kupon limiti oshib ketgan'].filter(Boolean).join(' · ');
        }
      }

      inv.status = InvoiceStatus.PAID;
      inv.paidAt = new Date();
      inv.paymentMethod = dto.paymentMethod ?? inv.paymentMethod;
      inv.contractId = contract.id;
      await manager.save(Invoice, inv);

      lockedClub.subscriptionEndsAt = contract.endDate;
      inv.contract = contract;
      return { invoice: inv, club: lockedClub };
    });

    // Telegram xabarnoma (asosiy oqimni to'xtatmaydi)
    void this.telegram.notifyPayment(invoice, club);

    return invoice;
  }

  /**
   * To'lov so'rovini rad etish — faktura CANCELLED holatiga o'tadi.
   * Tasdiqlash bilan BIR XIL shart: PENDING ham, EXPIRED ham rad etiladi —
   * aks holda muddati o'tgan faktura abadiy "tasdiqlash mumkin, yopish
   * mumkin emas" holatida osilib qolardi.
   */
  async rejectInvoice(id: number, dto: RejectInvoiceDto) {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.findOne(Invoice, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice) throw new NotFoundException({ key: 'subscription.invoiceNotFound' });
      if (![InvoiceStatus.PENDING, InvoiceStatus.EXPIRED].includes(invoice.status)) {
        throw new BadRequestException({ key: 'subscription.invoiceNotPending' });
      }
      invoice.status = InvoiceStatus.CANCELLED;
      if (dto.reason) invoice.notes = dto.reason;
      return manager.save(Invoice, invoice);
    });
  }

  // ==================== Yordamchilar ====================

  /** percent kuponi 100% dan oshmasin */
  private assertCouponValue(type: CouponType, value: number): void {
    if (type === CouponType.PERCENT && value > 100) {
      throw new BadRequestException({ key: 'subscription.invalidCouponValue' });
    }
  }

  /** ISO sana -> Date; null — maydonni tozalash; o'qib bo'lmaydigan sana rad etiladi */
  private parseCouponDate(value: string | null): Date | null {
    if (value === null) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({ key: 'subscription.invalidCouponWindow' });
    }
    return d;
  }

  /** validFrom < validTo bo'lishi shart (ikkalasi ham berilgan bo'lsa) */
  private assertCouponWindow(
    from: string | Date | null | undefined,
    to: string | Date | null | undefined,
  ): void {
    if (from && to && new Date(from).getTime() >= new Date(to).getTime()) {
      throw new BadRequestException({ key: 'subscription.invalidCouponWindow' });
    }
  }
}
