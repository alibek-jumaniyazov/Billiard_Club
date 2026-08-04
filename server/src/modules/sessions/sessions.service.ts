import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { clubTimezone, parseDateParts, zonedMidnight } from '../../common/time/club-day';
import { Customer } from '../../entities/customer.entity';
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
import { normalizePhone } from '../customers/customers.service';
import { LightsService } from '../lights/lights.service';
import {
  CancelSessionDto,
  EndSessionDto,
  ListSessionsQueryDto,
  OfflineAtDto,
  StartSessionDto,
  TransferSessionDto,
} from './dto/sessions.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Bo'lib to'lashda kassir summani KO'RGAN oni bilan server yakunni YOZGAN oni
 * orasida stol taymeri ishlab turadi (pul sanash, terminal javobi, tarmoq).
 * Shu oynadagi farq eng yirik to'lov satriga singdiriladi — bu real kassa
 * xatti-harakati: qoldiq karta/naqd satriga tushadi. Oynadan kattasi RAD
 * ETILADI: demak kassir juda eskirgan summani ko'rib turibdi.
 *
 * DIQQAT: singdirish faqat BIR TOMONLAMA — hisob o'sgan holat uchun. Kassir
 * hisobdan KO'PROQ summa kiritsa (ortiqcha to'lov) hech qachon qabul qilinmaydi.
 */
const PAYMENT_DRIFT_SECONDS = 900;

/**
 * Kassir (KASSIR roli) admin ruxsatisiz bekor qila oladigan sessiya chegarasi.
 * Undan uzunroq yoki bar buyurtmasi bor sessiyani bekor qilish — pulni yo'q
 * qilish demakdir, shuning uchun admin/superadmin talab qilinadi.
 */
const CASHIER_CANCEL_MAX_SECONDS = 600;

/**
 * Oflayn navbatdan kelgan vaqt muhri eng ko'pi bilan shuncha orqada bo'lishi
 * mumkin (24 soat). Oflayn navbat bir smenadan uzoq kutmaydi; undan eskisi
 * xato yoki suiiste'mol belgisi, shuning uchun chegaraga kesiladi.
 */
const OFFLINE_MAX_BACKDATE_MS = 24 * 60 * 60 * 1000;

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
    // Chiroq moduli ixtiyoriy: ulanmagan bo'lsa sessiya oqimi aynan avvalgidek ishlaydi
    @Optional() private readonly lights?: LightsService,
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
      // Telefonlar KANONIK ko'rinishda saqlanadi ('+998901234567'), lekin kassir
      // ularni odam yozadigan shaklda ('+998 90 123 45 67', '90-123-45-67')
      // qidiradi — shuning uchun raqamlar bo'yicha ham solishtiramiz
      const digits = query.search.replace(/\D/g, '');
      qb.andWhere(
        new Brackets((b) => {
          b.where('session.customerName ILIKE :search', { search: `%${query.search}%` }).orWhere(
            'session.customerPhone ILIKE :search',
            { search: `%${query.search}%` },
          );
          if (digits) {
            b.orWhere('session.customerPhone ILIKE :digits', { digits: `%${digits}%` });
          }
        }),
      );
    }
    // Sana filtri KLUB mintaqasida va YARIM OCHIQ oraliqda (hisobotlar/xarajatlar
    // bilan bir xil ta'rif): avval 'YYYY-MM-DD' UTC yarim tun deb o'qilib, 'to'
    // esa yopiq (<=) edi — shu sababli ?from=X&to=X bo'sh ro'yxat qaytarardi.
    if (query.from || query.to) {
      const tz = await clubTimezone(this.dataSource, clubId);
      // 'YYYY-MM-DD' — klub mintaqasidagi yarim tun; to'liq ISO o'zgarishsiz o'tadi
      const parseBound = (value: string, endExclusive = false): Date => {
        const raw = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          const { year, month, day } = parseDateParts(raw);
          return zonedMidnight(tz, year, month, endExclusive ? day + 1 : day);
        }
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) {
          throw new BadRequestException({ key: 'reports.invalidRange' });
        }
        return date;
      };
      if (query.from) {
        qb.andWhere('session.startTime >= :from', { from: parseBound(query.from) });
      }
      if (query.to) {
        qb.andWhere('session.startTime < :to', { to: parseBound(query.to, true) });
      }
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
  /**
   * Oflayn vaqt muhrini XAVFSIZ oraliqqa keltirish.
   *
   * Qiymat klientdan keladi, shuning uchun unga ko'r-ko'rona ishonilmaydi:
   *  - kelajakdagi vaqt — hozirgi vaqtga kesiladi (kelajakka yozib qo'yib
   *    bo'lmaydi);
   *  - juda eski vaqt (24 soatdan orqada) — chegaraga kesiladi; bu oflayn
   *    navbat uchun yetarlicha keng, lekin "o'tgan oy" deb yozishga yo'l qo'ymaydi;
   *  - berilmagan yoki buzuq bo'lsa — hozirgi vaqt ishlatiladi.
   *
   * @returns [vaqt, kesilganmi] — kesilgan holat audit yozuviga tushadi
   */
  private clampOfflineAt(raw: string | undefined, floor?: Date): [Date, boolean] {
    const now = new Date();
    if (!raw) return [now, false];

    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return [now, true];

    const earliest = Math.max(
      now.getTime() - OFFLINE_MAX_BACKDATE_MS,
      floor ? new Date(floor).getTime() : 0,
    );
    const clamped = Math.min(Math.max(parsed, earliest), now.getTime());
    return [new Date(clamped), clamped !== parsed];
  }

  async start(clubId: number, user: User, dto: StartSessionDto) {
    const result = await this.dataSource.transaction(async (manager) => {
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

      // Telefon KANONIK ko'rinishda saqlanadi (customers bilan bir xil kalit) —
      // aks holda mijoz profili sessiyani/qarzni topa olmaydi
      const customerName = dto.customerName?.trim() || null;
      const customerPhone = normalizePhone(dto.customerPhone);

      // OFLAYN: o'yin internetsiz boshlangan bo'lsa HAQIQIY boshlanish vaqti
      // klientdan keladi (chegaralangan — clampOfflineAt izohiga qarang).
      // Bo'lmasa avvalgidek server vaqti ishlatiladi.
      const [startTime, startClamped] = this.clampOfflineAt(dto.offlineAt);
      // Kesilgan qiymat — kutilmagan holat (klient soati juda noto'g'ri yoki
      // navbat 24 soatdan ko'p kutgan). Pulga ta'sir qilgani uchun iz qoldiramiz.
      if (startClamped) {
        this.auditService?.log({
          action: 'session.offline_time_clamped',
          clubId,
          userId: user.id,
          actorRole: user.role,
          entity: 'session',
          entityId: 0,
          meta: { requested: dto.offlineAt ?? null, applied: startTime.toISOString() },
        });
      }

      const session = await manager.save(Session, {
        clubId,
        tableId: table.id,
        userId: user.id,
        customerName,
        customerPhone,
        startTime,
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

      // DIQQAT: bu yerda BO'SH buyurtma YARATILMAYDI. Avval har sessiyaga
      // 0 so'mlik OPEN buyurtma yozilardi — u bar statistikasini shishirar,
      // buyurtmalar ro'yxatini axlat qatorlar bilan to'ldirar va orders.createdAt
      // ni "sessiya boshlanishi"ga bog'lab hisobotlarni chalg'itardi.
      // orders.create() kerak bo'lganda ochiq buyurtmani o'zi yaratadi.

      // Ro'yxatdagi mijozga bog'lash (telefon bo'yicha) — statistika uchun
      const linked = await this.linkCustomer(manager, clubId, customerName, customerPhone);
      if (linked) await manager.update(Session, session.id, { customerId: linked });

      await manager.update(Table, table.id, { status: TableStatus.BUSY });

      const fresh = await manager.findOne(Session, {
        where: { id: session.id },
        relations: { table: true },
      });
      return { ...fresh!, serverNow: new Date().toISOString() };
    });

    // Chiroq — fire-and-forget; xato sessiyani buzmaydi
    void this.lights?.onSessionChanged(clubId, result.tableId).catch(() => undefined);
    return result;
  }

  async pause(clubId: number, id: number, dto: OfflineAtDto = {}) {
    const result = await this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, clubId, id);
      if (session.status !== SessionStatus.ACTIVE) {
        throw new BadRequestException({ key: 'sessions.onlyActivePausable' });
      }
      // OFLAYN: pauza internetsiz bosilgan bo'lsa HAQIQIY vaqti klientdan
      // keladi. Aks holda navbat yuborilgan payt yozilib, oflayn o'tgan pauza
      // vaqti mijozga hisoblanib ketardi. Quyi chegara — sessiya boshlanishi.
      const [pausedAt] = this.clampOfflineAt(dto.offlineAt, session.startTime);
      await manager.update(Session, id, {
        status: SessionStatus.PAUSED,
        pausedAt,
      });
      const fresh = await manager.findOne(Session, { where: { id }, relations: { table: true } });
      return { ...fresh!, serverNow: new Date().toISOString() };
    });

    // Chiroq — fire-and-forget; xato sessiyani buzmaydi
    void this.lights?.onSessionChanged(clubId, result.tableId).catch(() => undefined);
    return result;
  }

  async resume(clubId: number, id: number, dto: OfflineAtDto = {}) {
    const result = await this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, clubId, id);
      if (session.status !== SessionStatus.PAUSED || !session.pausedAt) {
        throw new BadRequestException({ key: 'sessions.notPaused' });
      }
      // OFLAYN: davom ettirish vaqti ham klientdan kelishi mumkin — aks holda
      // pauza navbat yuborilgunicha davom etgan hisoblanib, mijozdan KAM pul
      // olinardi. Quyi chegara — pauza boshlangan payt (manfiy davomiylik yo'q).
      const [resumedAt] = this.clampOfflineAt(dto.offlineAt, session.pausedAt);
      const pausedDuration = Math.max(
        0,
        resumedAt.getTime() - new Date(session.pausedAt).getTime(),
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

    // Chiroq — fire-and-forget; xato sessiyani buzmaydi
    void this.lights?.onSessionChanged(clubId, result.tableId).catch(() => undefined);
    return result;
  }

  /**
   * Sessiyani boshqa stolga ko'chirish (transfer). Faqat FAOL sessiya uchun;
   * pauzada taqiqlanadi (pauza segment chegarasidan oshmasligi invarianti).
   * Tranzaksiya ichida: sessiya qulfi -> ikkala stol id O'SISH TARTIBIDA qulflanadi
   * (parallel transferlar deadlock bo'lmasligi uchun). Joriy segment yopiladi,
   * yangi stolning JORIY narxida yangi segment ochiladi.
   */
  async transfer(clubId: number, id: number, dto: TransferSessionDto) {
    const result = await this.dataSource.transaction(async (manager) => {
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

      // Ochiq buyurtma ham yangi stolga ko'chadi: aks holda ko'chirilgandan
      // keyin buyurtilgan ichimliklar buyurtmalar ro'yxatida va stol bo'yicha
      // bar hisobotida ESKI stol nomi bilan ko'rinardi
      await manager.update(
        Order,
        { sessionId: session.id, status: OrderStatus.OPEN },
        { tableId: newTable.id },
      );

      const fresh = await manager.findOne(Session, {
        where: { id: session.id },
        relations: { table: true, segments: true },
        order: { segments: { startedAt: 'ASC', id: 'ASC' } },
      });
      return { ...fresh!, serverNow: new Date().toISOString() };
    });

    // Chiroq — fire-and-forget; xato sessiyani buzmaydi. Transferda IKKALA stol
    // moslashtiriladi: eskisi endigina yopilgan segmentdan olinadi (oxirgidan
    // oldingi segment), yangisi — result.tableId
    const segments = result.segments ?? [];
    const previousTableId = segments.length > 1 ? segments[segments.length - 2].tableId : null;
    if (previousTableId !== null && previousTableId !== result.tableId) {
      void this.lights?.onSessionChanged(clubId, previousTableId).catch(() => undefined);
    }
    void this.lights?.onSessionChanged(clubId, result.tableId).catch(() => undefined);
    return result;
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

      // TO'LOV HIMOYASI: kassir ko'rgan bar summasi bilan server hisoblaganini
      // solishtiramiz. Kassa oynasi ochiq turganda ofitsiant boshqa terminaldan
      // ichimlik qo'shsa (yoki buyurtmani bekor qilsa), kassir ESKI summani
      // ko'rib turgan bo'ladi — jimgina noto'g'ri pul olinmasligi uchun 409
      // qaytaramiz, klient chekni yangilab, yangi summani qayta tasdiqlaydi.
      // Stol vaqti tekshirilmaydi: u har soniyada o'sadi (soxta rad etish bo'lardi).
      if (
        dto.expectedBarAmount !== undefined &&
        Math.abs(round2(dto.expectedBarAmount) - barAmount) > 0.01
      ) {
        throw new ConflictException({
          key: 'sessions.barChanged',
          args: { expected: round2(dto.expectedBarAmount), actual: barAmount },
        });
      }

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
      // Telefon KANONIK ko'rinishda: customers jadvalidagi kalit bilan bir xil
      // bo'lmasa mijoz profilidagi "sarflagan puli"/"ochiq qarzi" 0 bo'lib qolardi
      const customerPhone = normalizePhone(dto.customerPhone) ?? normalizePhone(session.customerPhone);
      const customerId = await this.linkCustomer(manager, clubId, customerName, customerPhone);

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
            customerId,
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
        const diff = round2(paidNow - paymentsSum);
        // Hisob O'SGAN holat (diff > 0): farq oynadan kichik bo'lsa eng yirik
        // to'lov satriga SINGDIRILADI — natijada sum(session_payments) HAR DOIM
        // sales.totalAmount ga TENG bo'ladi (avvalgi 0.01 chidamlilik ikkalasini
        // bir-biridan uzib qo'yar, hisobotdagi to'lov taqsimoti to'g'ri kelmasdi).
        // Hisobdan KO'P kiritilgan bo'lsa (diff < 0) — bu kassirning xatosi,
        // singdirilmaydi, darhol rad etiladi.
        const driftAllowance = round2(
          (this.maxPricePerHour(segments, session) * PAYMENT_DRIFT_SECONDS) / 3600 + 0.01,
        );
        if (diff < -0.01 || diff > driftAllowance) {
          throw new BadRequestException({ key: 'sessions.paymentsMismatch' });
        }
        if (diff !== 0) {
          let largest = 0;
          for (let i = 1; i < payments.length; i++) {
            if (payments[i].amount > payments[largest].amount) largest = i;
          }
          const adjusted = round2(payments[largest].amount + diff);
          if (adjusted < 0) throw new BadRequestException({ key: 'sessions.paymentsMismatch' });
          payments[largest] = { ...payments[largest], amount: adjusted };
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
        ...(customerId !== null ? { customerId } : {}),
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

    // Chiroq — fire-and-forget; xato sessiyani buzmaydi
    if (session) void this.lights?.onSessionChanged(clubId, session.tableId).catch(() => undefined);

    return { ...result, session, serverNow: new Date().toISOString() };
  }

  /**
   * Bekor qilish: buyurtmalar bekor bo'ladi va OMBOR QAYTARILADI
   * (avval bekor qilingan sessiyalar omborni "yeb ketardi").
   * Ochiq segment ham yopiladi — jadval izchil qoladi.
   *
   * PUL NAZORATI: bekor qilish — hisobni NOLGA tushirish demak, ya'ni eng oson
   * "pulni yo'q qilish" yo'li. Shuning uchun:
   *  - yig'ilib qolgan summa (stol + bar) bekor qilishdan AVVAL hisoblanadi va
   *    audit jurnaliga kim/qancha/nima sababdan deb yoziladi;
   *  - kassir faqat ADASHIB boshlangan sessiyani bekor qila oladi (bar
   *    buyurtmasi yo'q va {CASHIER_CANCEL_MAX_SECONDS} soniyadan qisqa),
   *    undan kattasi uchun admin/superadmin talab qilinadi.
   */
  async cancel(clubId: number, user: User, id: number, dto: CancelSessionDto = {}) {
    const isManager = user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN;
    const result = await this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, clubId, id);
      if (session.status !== SessionStatus.ACTIVE && session.status !== SessionStatus.PAUSED) {
        throw new BadRequestException({ key: 'sessions.onlyActiveCancellable' });
      }

      const orders = await manager.find(Order, {
        where: { sessionId: session.id, status: OrderStatus.OPEN },
        lock: { mode: 'pessimistic_write' },
      });

      const endTime = new Date();
      const currentPauseMs =
        session.status === SessionStatus.PAUSED && session.pausedAt
          ? Math.max(0, endTime.getTime() - new Date(session.pausedAt).getTime())
          : 0;

      // NOLGA TUSHIRILAYOTGAN summani AVVAL hisoblaymiz — audit jurnaliga
      // "qancha pul o'chirildi" deb yozish va rol chegarasini tekshirish uchun
      const segments = await manager.find(SessionSegment, {
        where: { sessionId: session.id },
        order: { startedAt: 'ASC', id: 'ASC' },
      });
      const totalPausedMs = session.totalPausedMs + currentPauseMs;
      const voidedSeconds = Math.floor(
        Math.max(0, endTime.getTime() - new Date(session.startTime).getTime() - totalPausedMs) /
          1000,
      );
      const voidedTableAmount =
        segments.length > 0
          ? this.billSegments(segments, endTime, currentPauseMs).tableAmount
          : round2(((session.pricePerHour ?? 0) * voidedSeconds) / 3600);
      const voidedBarAmount = round2(orders.reduce((sum, o) => sum + o.totalAmount, 0));

      // Kassir faqat adashib boshlangan (qisqa va barsiz) sessiyani bekor qiladi
      if (!isManager && (voidedBarAmount > 0 || voidedSeconds > CASHIER_CANCEL_MAX_SECONDS)) {
        throw new ForbiddenException({ key: 'sessions.cancelNeedsAdmin' });
      }

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
        totalPausedMs,
        tableAmount: 0,
        barAmount: 0,
        totalAmount: 0,
        notes: dto.reason?.trim() || session.notes,
        pausedAt: null,
      });
      await manager.update(Table, session.tableId, { status: TableStatus.FREE });

      const fresh = await manager.findOne(Session, { where: { id }, relations: { table: true } });
      return {
        ...fresh!,
        serverNow: new Date().toISOString(),
        voided: {
          tableAmount: voidedTableAmount,
          barAmount: voidedBarAmount,
          durationSeconds: voidedSeconds,
          restoredProducts: [...restoreByProduct.entries()].map(([productId, quantity]) => ({
            productId,
            quantity,
          })),
        },
      };
    });

    // Bekor qilish HAR DOIM audit jurnaliga tushadi: kim, qaysi sessiyani,
    // qancha summani va nima sababdan o'chirgani egaga ko'rinadigan bo'lsin
    this.auditService?.log({
      action: 'session.cancel',
      clubId,
      userId: user.id,
      actorRole: user.role,
      entity: 'session',
      entityId: id,
      meta: { ...result.voided, reason: dto.reason?.trim() || null },
    });

    // Chiroq — fire-and-forget; xato sessiyani buzmaydi
    void this.lights?.onSessionChanged(clubId, result.tableId).catch(() => undefined);
    return result;
  }

  /**
   * Segmentlar bo'yicha sekundlik hisob.
   * openExtraPausedMs — hali resume/yakun bo'lmagan JORIY pauza (faqat ochiq segmentga
   * virtual qo'shiladi; oldindan ko'rishda ishlatiladi, yozuvlar o'zgarmaydi).
   *
   * KUMULYATIV YAXLITLASH: har segment ALOHIDA floor qilinsa, har transferda
   * bir soniyagacha hisoblanmay qolardi va chekdagi segment satrlari umumiy
   * davomiylikka teng bo'lmasdi. Shuning uchun soniyalar YIG'INDI millisekunddan
   * chiqariladi: segment_i = floor(cum_i/1000) - floor(cum_{i-1}/1000).
   * Natijada sum(billedSeconds) === floor(jami faol ms / 1000) === durationSeconds.
   */
  private billSegments(
    segments: SessionSegment[],
    at: Date,
    openExtraPausedMs = 0,
  ): { items: SegmentBillingItem[]; tableAmount: number } {
    const atMs = at.getTime();
    let cumulativeMs = 0;
    let previousSeconds = 0;
    const items: SegmentBillingItem[] = segments.map((seg) => {
      const endMs = seg.endedAt ? Math.min(new Date(seg.endedAt).getTime(), atMs) : atMs;
      const pausedMs = seg.pausedMs + (seg.endedAt ? 0 : openExtraPausedMs);
      const activeMs = Math.max(0, endMs - new Date(seg.startedAt).getTime() - pausedMs);
      cumulativeMs += activeMs;
      const cumulativeSeconds = Math.floor(cumulativeMs / 1000);
      const billedSeconds = Math.max(0, cumulativeSeconds - previousSeconds);
      previousSeconds = cumulativeSeconds;
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

  /**
   * Sessiyaning eng qimmat soatlik narxi — bo'lib to'lashdagi vaqt driftiga
   * beriladigan chidamlilikni hisoblash uchun (eng yomon holatdan kelib chiqamiz).
   */
  private maxPricePerHour(segments: SessionSegment[], session: Session): number {
    const fromSegments = segments.reduce((max, seg) => Math.max(max, seg.pricePerHour), 0);
    return Math.max(fromSegments, session.pricePerHour ?? 0);
  }

  /**
   * Telefon bo'yicha RO'YXATDAGI mijozni topib, customerId ni bog'laydi.
   * Faqat O'QISH: yangi mijoz YARATILMAYDI. Sabab — kassa tranzaksiyasi ichida
   * INSERT urinishi unique-violation bilan tushsa, PostgreSQL butun
   * tranzaksiyani "aborted" holatiga o'tkazadi va hisob-kitob yiqilardi.
   * Bog'lanmasa null qaytadi va oqim aynan avvalgidek davom etadi.
   */
  private async linkCustomer(
    manager: EntityManager,
    clubId: number,
    _name: string | null,
    phone: string | null,
  ): Promise<number | null> {
    if (!phone) return null;
    const customer = await manager.findOne(Customer, {
      where: { clubId, phone },
      select: { id: true },
    });
    return customer?.id ?? null;
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
