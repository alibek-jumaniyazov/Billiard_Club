import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { Debt } from '../../entities/debt.entity';
import {
  OrderStatus,
  PaymentMethod,
  SessionStatus,
  TableStatus,
  UserRole,
} from '../../entities/enums';
import { Order } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Product } from '../../entities/product.entity';
import { Sale } from '../../entities/sale.entity';
import { Session } from '../../entities/session.entity';
import { SessionPayment } from '../../entities/session-payment.entity';
import { SessionSegment } from '../../entities/session-segment.entity';
import { Table } from '../../entities/table.entity';
import { User } from '../../entities/user.entity';
import {
  EndSessionDto,
  ListSessionsQueryDto,
  StartSessionDto,
  TransferSessionDto,
} from './dto/sessions.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Segment bo'yicha hisoblangan bandning ko'rinishi (chek/receipt uchun) */
interface SegmentBillingItem {
  id: number;
  tableId: number;
  pricePerHour: number;
  startedAt: Date;
  endedAt: Date | null;
  pausedMs: number;
  billedSeconds: number;
  amount: number;
}

/**
 * SEKUNDLIK HISOB MODELI (v2):
 *  - Faol soniyalar: activeSeconds = floor(activeMs / 1000),
 *    activeMs = (tugash - boshlanish) - totalPausedMs - joriy tugallanmagan pauza.
 *  - Narx: round2(pricePerHour * soniyalar / 3600). durationMinutes = ceil(soniyalar / 60)
 *    faqat KO'RSATISH uchun saqlanadi, hisob har doim soniyalarda.
 *  - Segmentlar (session_segments): devor-soat oraliqlar [startedAt, endedAt ?? sessiya tugashi].
 *    Pauzalar sessiyada global, lekin resume() pauza davomiyligini JORIY ochiq segmentning
 *    pausedMs ustuniga ham qo'shadi. Pauzada transfer TAQIQLANGAN, shuning uchun bitta pauza
 *    hech qachon segment chegarasidan oshmaydi. Segment hisobi:
 *      billedSeconds = floor((min(endedAt ?? now, sessiyaTugashi) - startedAt - pausedMs) / 1000)
 *    Jami stol summasi = segmentlar summalarining yig'indisi (har biri round2).
 *  - Segmentlarsiz eski sessiyalar (v2 dan avval boshlangan) session.pricePerHour muhri
 *    bo'yicha sekundlik hisobda yakunlanadi (legacy yo'l).
 *
 * QULFLASH TARTIBI (deadlock oldini olish): sessiya -> stollar (id o'sish tartibida)
 * -> buyurtmalar; mahsulotlar id o'sish tartibida. start() faqat stolni qulflaydi.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(SessionSegment)
    private readonly segmentRepo: Repository<SessionSegment>,
    // Global AuditModule ro'yxatdan o'tmagan bo'lsa ham servis ishga tushaveradi
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async findAll(clubId: number, query: ListSessionsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    // Ro'yxatda segments/payments YUKLANMAYDI (N+1 oldini olish) — faqat detalda
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
        segments: { table: true },
        payments: true,
      },
      order: { segments: { startedAt: 'ASC', id: 'ASC' } },
    });
    if (!session) throw new NotFoundException({ key: 'sessions.notFound' });
    // serverNow — mijoz soat siljishini (clock offset) hisoblashi uchun
    return { ...session, serverNow: new Date().toISOString() };
  }

  /**
   * Chek oldindan ko'rish (checkout modal): sessiyani YAKUNLAMASDAN joriy
   * sekundlik summalarni qaytaradi. Yakunlangan sessiya uchun saqlangan qiymatlar.
   */
  async receipt(clubId: number, id: number) {
    const session = await this.sessionRepo.findOne({
      where: { id, clubId },
      relations: { table: true },
    });
    if (!session) throw new NotFoundException({ key: 'sessions.notFound' });

    const segments = await this.segmentRepo.find({
      where: { sessionId: id },
      order: { startedAt: 'ASC', id: 'ASC' },
    });

    const now = new Date();

    if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.CANCELLED) {
      return {
        serverNow: now.toISOString(),
        sessionId: session.id,
        status: session.status,
        live: false,
        startTime: session.startTime,
        endTime: session.endTime,
        durationSeconds: session.durationSeconds,
        durationMinutes: session.durationMinutes,
        totalPausedMs: session.totalPausedMs,
        tableAmount: session.tableAmount,
        barAmount: session.barAmount,
        adjustmentAmount: session.adjustmentAmount,
        adjustmentReason: session.adjustmentReason,
        totalAmount: session.totalAmount,
        segments,
      };
    }

    // Joriy tugallanmagan pauza (pauzada turgan bo'lsa)
    const currentPauseMs =
      session.status === SessionStatus.PAUSED && session.pausedAt
        ? Math.max(0, now.getTime() - new Date(session.pausedAt).getTime())
        : 0;
    const totalPausedMs = session.totalPausedMs + currentPauseMs;
    const activeMs = Math.max(
      0,
      now.getTime() - new Date(session.startTime).getTime() - totalPausedMs,
    );
    const durationSeconds = Math.floor(activeMs / 1000);

    let tableAmount: number;
    let segmentItems: SegmentBillingItem[] | null = null;
    let currentPricePerHour: number;
    if (segments.length > 0) {
      const billing = this.billSegments(segments, now, currentPauseMs);
      tableAmount = billing.tableAmount;
      segmentItems = billing.items;
      const openSegment = segments.find((s) => !s.endedAt);
      currentPricePerHour = openSegment?.pricePerHour ?? segments[segments.length - 1].pricePerHour;
    } else {
      // Legacy: segmentlarsiz sessiya — muhrlangan narxda sekundlik hisob
      currentPricePerHour = session.pricePerHour ?? session.table?.pricePerHour ?? 0;
      tableAmount = round2((currentPricePerHour * durationSeconds) / 3600);
    }

    // barAmount buyurtmalar modulida jonli yangilanadi (sessiya qulfi ostida)
    const barAmount = round2(session.barAmount);

    return {
      serverNow: now.toISOString(),
      sessionId: session.id,
      status: session.status,
      live: true,
      startTime: session.startTime,
      pausedAt: session.pausedAt,
      totalPausedMs,
      durationSeconds,
      durationMinutes: Math.ceil(durationSeconds / 60),
      pricePerHour: currentPricePerHour,
      tableAmount,
      barAmount,
      grossAmount: round2(tableAmount + barAmount),
      segments: segmentItems ?? segments,
    };
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

      // Birinchi segment: hisob segmentlar bo'yicha yuritiladi (transfer tarixi)
      await manager.save(SessionSegment, {
        sessionId: session.id,
        tableId: table.id,
        pricePerHour: table.pricePerHour,
        startedAt: session.startTime,
        endedAt: null,
        pausedMs: 0,
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

      const fresh = await manager.findOne(Session, {
        where: { id: session.id },
        relations: { table: true },
      });
      return { ...fresh!, serverNow: new Date().toISOString() };
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
      const fresh = await manager.findOne(Session, { where: { id }, relations: { table: true } });
      return { ...fresh!, serverNow: new Date().toISOString() };
    });
  }

  async resume(clubId: number, id: number) {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, clubId, id);
      if (session.status !== SessionStatus.PAUSED || !session.pausedAt) {
        throw new BadRequestException({ key: 'sessions.notPaused' });
      }
      const pausedDuration = Math.max(
        0,
        Date.now() - new Date(session.pausedAt).getTime(),
      );
      await manager.update(Session, id, {
        status: SessionStatus.ACTIVE,
        pausedAt: null,
        totalPausedMs: session.totalPausedMs + pausedDuration,
      });
      // Pauza JORIY ochiq segmentga ham yoziladi — segment hisobi to'g'ri bo'lishi uchun
      // (sessiya qatori qulfi ostidamiz, parallel resume bo'lishi mumkin emas)
      await manager.increment(
        SessionSegment,
        { sessionId: id, endedAt: IsNull() },
        'pausedMs',
        pausedDuration,
      );
      const fresh = await manager.findOne(Session, { where: { id }, relations: { table: true } });
      return { ...fresh!, serverNow: new Date().toISOString() };
    });
  }

  /**
   * Sessiyani boshqa stolga ko'chirish (transfer). Faqat FAOL sessiya uchun;
   * pauzada taqiqlanadi (pauza segment chegarasidan oshmasligi invarianti).
   * Tranzaksiya ichida: sessiya qulfi -> ikkala stol id O'SISH TARTIBIDA qulflanadi
   * (parallel transferlar deadlock bo'lmasligi uchun). Joriy segment yopiladi,
   * yangi stolning JORIY narxida yangi segment ochiladi.
   */
  async transfer(clubId: number, id: number, dto: TransferSessionDto) {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, clubId, id);
      if (session.status === SessionStatus.PAUSED) {
        throw new BadRequestException({ key: 'sessions.transferWhilePaused' });
      }
      if (session.status !== SessionStatus.ACTIVE) {
        throw new BadRequestException({ key: 'sessions.alreadyEnded' });
      }
      if (dto.tableId === session.tableId) {
        throw new BadRequestException({ key: 'sessions.transferSameTable' });
      }

      // Ikkala stolni id o'sish tartibida qulflaymiz (deadlock oldini olish)
      const lockedTables = new Map<number, Table>();
      const tableIds = [session.tableId, dto.tableId].sort((a, b) => a - b);
      for (const tableId of tableIds) {
        const table = await manager.findOne(Table, {
          where: { id: tableId, clubId },
          lock: { mode: 'pessimistic_write' },
        });
        if (table) lockedTables.set(tableId, table);
      }
      const oldTable = lockedTables.get(session.tableId);
      const newTable = lockedTables.get(dto.tableId);
      if (!newTable || !newTable.isActive) {
        throw new NotFoundException({ key: 'tables.notFound' });
      }

      // Yangi stol band bo'lmasligi kerak (holat + faol sessiya tekshiruvi)
      const busySession = await manager.findOne(Session, {
        where: {
          tableId: newTable.id,
          status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]),
        },
      });
      if (busySession || newTable.status === TableStatus.BUSY) {
        throw new BadRequestException({ key: 'sessions.tableBusy' });
      }

      const now = new Date();

      // Joriy ochiq segmentni yopamiz; legacy sessiyada (segmentlarsiz)
      // birinchi segmentni retrospektiv yaratamiz — hisob uzluksiz qoladi
      const openSegment = await manager.findOne(SessionSegment, {
        where: { sessionId: session.id, endedAt: IsNull() },
      });
      if (openSegment) {
        await manager.update(SessionSegment, openSegment.id, { endedAt: now });
      } else {
        await manager.save(SessionSegment, {
          sessionId: session.id,
          tableId: session.tableId,
          pricePerHour: session.pricePerHour ?? oldTable?.pricePerHour ?? 0,
          startedAt: session.startTime,
          endedAt: now,
          // Shu paytgacha yig'ilgan pauzalar to'liq shu segmentga tegishli
          pausedMs: session.totalPausedMs,
        });
      }

      // Yangi segment — yangi stolning JORIY narxida
      await manager.save(SessionSegment, {
        sessionId: session.id,
        tableId: newTable.id,
        pricePerHour: newTable.pricePerHour,
        startedAt: now,
        endedAt: null,
        pausedMs: 0,
      });

      await manager.update(Table, session.tableId, { status: TableStatus.FREE });
      await manager.update(Table, newTable.id, { status: TableStatus.BUSY });

      await manager.update(Session, session.id, {
        tableId: newTable.id,
        // Ko'rsatish uchun joriy segment narxi; hisob baribir segmentlar bo'yicha
        pricePerHour: newTable.pricePerHour,
      });

      const fresh = await manager.findOne(Session, {
        where: { id: session.id },
        relations: { table: true, segments: true },
        order: { segments: { startedAt: 'ASC', id: 'ASC' } },
      });
      return { ...fresh!, serverNow: new Date().toISOString() };
    });
  }

  /**
   * O'yinni yakunlash va hisob-kitob (SEKUNDLIK ANIQLIK).
   * - Stol summasi segmentlar bo'yicha; segmentlarsiz eski sessiyalar — legacy yo'l
   * - Chegirma tekshiriladi (0 <= discount <= stol+bar)
   * - Qo'lda tuzatish (adjustment): totalAmount = max(0, jami - chegirma + tuzatish)
   * - Qarz: umumiy summadan oshmaydigan qilib chegaralanadi
   * - Bo'lib to'lash: payments yig'indisi = totalAmount - qarz (0.01 chidamlilik)
   * - Sale = HAQIQATDA hozir to'langan pul (tushum hisobotlari uchun)
   * - Kassir (userId) Sale va Debt yozuvlariga muhrlanadi
   */
  async end(clubId: number, user: User, id: number, dto: EndSessionDto) {
    // Qo'lda tuzatish FAQAT admin/superadmin uchun — kassir to'g'ridan-to'g'ri API
    // orqali summani nol qilib yoki oshirib yubora olmasligi kerak (UI ham shunday gate qiladi)
    if (dto.adjustment && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({ key: 'sessions.adjustmentForbidden' });
    }
    const result = await this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, clubId, id);
      if (session.status !== SessionStatus.ACTIVE && session.status !== SessionStatus.PAUSED) {
        throw new BadRequestException({ key: 'sessions.alreadyEnded' });
      }

      const table = await manager.findOne(Table, {
        where: { id: session.tableId },
        lock: { mode: 'pessimistic_write' },
      });

      // Davomiylik: pauza vaqtlari ayiriladi (joriy tugallanmagan pauza ham)
      const endTime = new Date();
      const currentPauseMs =
        session.status === SessionStatus.PAUSED && session.pausedAt
          ? Math.max(0, endTime.getTime() - new Date(session.pausedAt).getTime())
          : 0;
      const totalPausedMs = session.totalPausedMs + currentPauseMs;
      const activeMs = Math.max(
        0,
        endTime.getTime() - new Date(session.startTime).getTime() - totalPausedMs,
      );
      // SEKUNDLIK hisob: floor(activeMs/1000); daqiqa faqat ko'rsatish uchun
      const durationSeconds = Math.floor(activeMs / 1000);
      const durationMinutes = Math.ceil(durationSeconds / 60);

      // Segmentlarni yopamiz va stol summasini segmentlar bo'yicha hisoblaymiz
      const segments = await manager.find(SessionSegment, {
        where: { sessionId: session.id },
        order: { startedAt: 'ASC', id: 'ASC' },
      });
      const openSegment = segments.find((s) => !s.endedAt);
      if (openSegment) {
        // Joriy pauza ochiq segmentga yoziladi (resume bo'lmagan, sessiya pauzada yakunlandi)
        openSegment.endedAt = endTime;
        openSegment.pausedMs += currentPauseMs;
        await manager.update(SessionSegment, openSegment.id, {
          endedAt: endTime,
          pausedMs: openSegment.pausedMs,
        });
      }

      let tableAmount: number;
      let segmentItems: SegmentBillingItem[] | null = null;
      if (segments.length > 0) {
        const billing = this.billSegments(segments, endTime);
        tableAmount = billing.tableAmount;
        segmentItems = billing.items;
      } else {
        // LEGACY: v2 dan avval boshlangan sessiya (segment yozuvlari yo'q) —
        // muhrlangan narxda sekundlik hisob
        const pricePerHour = session.pricePerHour ?? (table ? table.pricePerHour : 0);
        tableAmount = round2((pricePerHour * durationSeconds) / 3600);
      }

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

      // Qo'lda tuzatish: musbat — ustama, manfiy — qo'shimcha chegirma (sabab majburiy)
      const adjustmentAmount = round2(dto.adjustment?.amount ?? 0);
      const adjustmentReason = dto.adjustment ? dto.adjustment.reason.trim() : null;
      const totalAmount = Math.max(0, round2(gross - discount + adjustmentAmount));

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
        // Chegirma/tuzatish qo'llangan umumiy summadan oshmasin
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

      // Bo'lib to'lash: BO'SH ro'yxat berilmagani kabi qabul qilinadi (100% qarz holati);
      // berilsa yig'indi hozir to'lanadigan summaga teng bo'lishi shart
      let payments: Array<{ method: PaymentMethod; amount: number }>;
      let paymentMethod: PaymentMethod;
      if (dto.payments && dto.payments.length > 0) {
        payments = dto.payments.map((p) => ({ method: p.method, amount: round2(p.amount) }));
        const paymentsSum = round2(payments.reduce((sum, p) => sum + p.amount, 0));
        if (Math.abs(paymentsSum - paidNow) > 0.01) {
          throw new BadRequestException({ key: 'sessions.paymentsMismatch' });
        }
        // Orqaga moslik: Sale.paymentMethod = eng katta ulushli usul
        const sumByMethod = new Map<PaymentMethod, number>();
        for (const p of payments) {
          sumByMethod.set(p.method, round2((sumByMethod.get(p.method) ?? 0) + p.amount));
        }
        paymentMethod = [...sumByMethod.entries()].sort((a, b) => b[1] - a[1])[0][0];
      } else {
        paymentMethod = dto.paymentMethod ?? PaymentMethod.CASH;
        payments = paidNow > 0 ? [{ method: paymentMethod, amount: paidNow }] : [];
      }

      await manager.update(Session, session.id, {
        endTime,
        durationMinutes,
        durationSeconds,
        totalPausedMs,
        tableAmount,
        barAmount,
        totalAmount,
        status: SessionStatus.COMPLETED,
        paymentMethod,
        isPaid: totalDebt === 0,
        adjustmentAmount,
        adjustmentReason,
        customerName,
        customerPhone: customerPhone ?? null,
        notes: dto.notes ?? session.notes,
        pausedAt: null,
      });

      if (table) {
        await manager.update(Table, table.id, { status: TableStatus.FREE });
      }

      // Hisob-kitob yozuvi: haqiqatda hozir olingan pul
      const sale = await manager.save(Sale, {
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

      // Bo'lib to'lash yozuvlari (bitta usulda ham bitta yozuv yoziladi)
      for (const p of payments) {
        if (p.amount <= 0) continue;
        await manager.save(SessionPayment, {
          clubId,
          sessionId: session.id,
          saleId: sale.id,
          method: p.method,
          amount: p.amount,
        });
      }

      return {
        sessionId: session.id,
        durationSeconds,
        durationMinutes,
        tableAmount,
        barAmount,
        discount,
        adjustmentAmount,
        adjustmentReason,
        totalAmount,
        paidNow,
        payments,
        totalDebt,
        debtId: debtRecord?.id ?? null,
        isDebt: totalDebt > 0,
        segments: segmentItems,
      };
    });

    // Qo'lda tuzatish audit jurnaliga yoziladi (tranzaksiya muvaffaqiyatli yakunlangach)
    if (this.auditService && result.adjustmentAmount !== 0) {
      this.auditService.log({
        action: 'session.adjust',
        clubId,
        userId: user.id,
        actorRole: user.role,
        entity: 'session',
        entityId: result.sessionId,
        meta: {
          adjustmentAmount: result.adjustmentAmount,
          adjustmentReason: result.adjustmentReason,
          totalAmount: result.totalAmount,
        },
      });
    }

    // Chegirma ham audit jurnaliga yoziladi: qo'lda tuzatishdan (adjustment)
    // farqli ravishda chegirmani KASSIR ham qo'llashi mumkin — kim, qancha
    // chegirma bergani egaga ko'rinadigan/izlanadigan bo'lishi uchun.
    if (this.auditService && result.discount > 0) {
      this.auditService.log({
        action: 'session.discount',
        clubId,
        userId: user.id,
        actorRole: user.role,
        entity: 'session',
        entityId: result.sessionId,
        meta: { discount: result.discount, totalAmount: result.totalAmount },
      });
    }

    const session = await this.sessionRepo.findOne({
      where: { id: result.sessionId },
      relations: { table: true },
    });
    return { ...result, session, serverNow: new Date().toISOString() };
  }

  /**
   * Bekor qilish: buyurtmalar bekor bo'ladi va OMBOR QAYTARILADI
   * (avval bekor qilingan sessiyalar omborni "yeb ketardi").
   * Ochiq segment ham yopiladi — jadval izchil qoladi.
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

      const endTime = new Date();
      const currentPauseMs =
        session.status === SessionStatus.PAUSED && session.pausedAt
          ? Math.max(0, endTime.getTime() - new Date(session.pausedAt).getTime())
          : 0;

      // Ochiq segmentni yopamiz (joriy pauza ham unga yoziladi)
      const openSegment = await manager.findOne(SessionSegment, {
        where: { sessionId: session.id, endedAt: IsNull() },
      });
      if (openSegment) {
        await manager.update(SessionSegment, openSegment.id, {
          endedAt: endTime,
          pausedMs: openSegment.pausedMs + currentPauseMs,
        });
      }

      await manager.update(Session, session.id, {
        status: SessionStatus.CANCELLED,
        endTime,
        totalPausedMs: session.totalPausedMs + currentPauseMs,
        tableAmount: 0,
        barAmount: 0,
        totalAmount: 0,
        pausedAt: null,
      });
      await manager.update(Table, session.tableId, { status: TableStatus.FREE });

      const fresh = await manager.findOne(Session, { where: { id }, relations: { table: true } });
      return { ...fresh!, serverNow: new Date().toISOString() };
    });
  }

  /**
   * Segmentlar bo'yicha sekundlik hisob.
   * openExtraPausedMs — hali resume/yakun bo'lmagan JORIY pauza (faqat ochiq segmentga
   * virtual qo'shiladi; oldindan ko'rishda ishlatiladi, yozuvlar o'zgarmaydi).
   */
  private billSegments(
    segments: SessionSegment[],
    at: Date,
    openExtraPausedMs = 0,
  ): { items: SegmentBillingItem[]; tableAmount: number } {
    const atMs = at.getTime();
    const items: SegmentBillingItem[] = segments.map((seg) => {
      const endMs = seg.endedAt ? Math.min(new Date(seg.endedAt).getTime(), atMs) : atMs;
      const pausedMs = seg.pausedMs + (seg.endedAt ? 0 : openExtraPausedMs);
      const billedSeconds = Math.max(
        0,
        Math.floor((endMs - new Date(seg.startedAt).getTime() - pausedMs) / 1000),
      );
      return {
        id: seg.id,
        tableId: seg.tableId,
        pricePerHour: seg.pricePerHour,
        startedAt: seg.startedAt,
        endedAt: seg.endedAt,
        pausedMs,
        billedSeconds,
        amount: round2((seg.pricePerHour * billedSeconds) / 3600),
      };
    });
    const tableAmount = round2(items.reduce((sum, i) => sum + i.amount, 0));
    return { items, tableAmount };
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
