import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { OfflineMoment, resolveOfflineAt } from '../../common/offline/offline-at';
import { CashShift, ShiftSummary } from '../../entities/cash-shift.entity';
import { User } from '../../entities/user.entity';
import { round2 } from '../subscription/billing.util';
import { CloseShiftDto, ListShiftsQueryDto, OpenShiftDto } from './dto/shifts.dto';

/** Postgres unique-violation (23505) — ikkinchi ochiq smenaga urinish */
const isUniqueViolation = (err: unknown): boolean => {
  const code =
    (err as { driverError?: { code?: string } })?.driverError?.code ??
    (err as { code?: string })?.code;
  return code === '23505';
};

type Runner = Pick<DataSource | EntityManager, 'query'>;

/**
 * Holat to'qnashuvi (smena allaqachon ochiq/yopiq) — ONLAYN 409, OFLAYN
 * navbatdan kelganda 422. Klient navbati 409 ni "idempotentlik kaliti band,
 * keyinroq qayta urin" deb tushunadi va 20 marta behuda urinardi; 422 esa
 * darhol "doimiy xato" bo'lib "Yuborilmagan amallar" oynasida ko'rinadi.
 */
const stateConflict = (offline: boolean, key: string) =>
  offline ? new UnprocessableEntityException({ key }) : new ConflictException({ key });

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(CashShift) private readonly shiftRepo: Repository<CashShift>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Ochiq smena (bo'lmasa null) va uning JONLI hisoboti */
  async current(clubId: number) {
    const shift = await this.shiftRepo.findOne({ where: { clubId, closedAt: IsNull() } });
    if (!shift) return { shift: null, summary: null, expectedCash: null };
    const summary = await this.computeSummary(this.dataSource, clubId, shift.openedAt, new Date());
    return { shift, summary, expectedCash: round2(shift.openingCash + summary.byMethod.cash) };
  }

  /**
   * Smenani ochish.
   *
   * OFLAYN (`offlineAt` bor — navbatdan): smena internetsiz paytda ochilgan
   * HAQIQIY vaqtdan boshlanadi — shu paytdan keyingi oflayn to'lovlar unga
   * tushadi. Vaqt oxirgi yopilgan smenaning yopilish vaqtidan OLDIN bo'la
   * olmaydi (oynalar ustma-ust tushsa bitta to'lov ikki smenada sanalardi).
   * Klubda ochiq smena bo'lsa (masalan boshqa kassa oflayn paytda ochgan) —
   * 422 bilan rad etiladi va navbatda ko'rinadi.
   */
  async open(clubId: number, user: User, dto: OpenShiftDto): Promise<CashShift> {
    let moment: OfflineMoment = resolveOfflineAt(undefined);
    if (dto.offlineAt !== undefined) {
      const lastClosed = await this.shiftRepo.findOne({
        where: { clubId, closedAt: Not(IsNull()) },
        order: { closedAt: 'DESC' },
      });
      moment = resolveOfflineAt(dto.offlineAt, lastClosed?.closedAt ?? null);
    }
    try {
      const shift = await this.shiftRepo.save(
        this.shiftRepo.create({
          clubId,
          openedById: user.id,
          openedByName: user.name ?? user.username ?? null,
          openingCash: round2(dto.openingCash ?? 0),
          openingNote: dto.note?.trim() || null,
          // Onlayn — DB standart qiymati (now()), oflayn — haqiqiy ochilgan payt
          ...(moment.offline ? { openedAt: moment.at } : {}),
        }),
      );
      this.audit.log({
        action: 'shift.open',
        clubId,
        userId: user.id,
        actorRole: user.role,
        entity: 'cash_shift',
        entityId: shift.id,
        meta: {
          openingCash: shift.openingCash,
          ...(moment.offline
            ? { offline: { requested: dto.offlineAt, applied: moment.at.toISOString(), clamped: moment.clamped } }
            : {}),
        },
      });
      return shift;
    } catch (err) {
      if (isUniqueViolation(err)) throw stateConflict(moment.offline, 'shifts.alreadyOpen');
      throw err;
    }
  }

  /**
   * Smenani yopish — qator qulfi ostida: ikki marta bosilgan "Yopish" yoki
   * ikki kassir bir vaqtda yopsa ham hisobot bir marta muhrlanadi.
   *
   * OFLAYN YOPISH (`offlineAt` bor — navbatdan): kassir kassani internetsiz
   * paytda sanagan. Yopilish vaqti — o'sha "Yopish" bosilgan payt (smena
   * ochilgan paytdan oldin bo'la olmaydi). Kutilgan naqd va Z-hisobot KLIENT
   * ko'rgan raqamdan EMAS — navbat yetib kelgan paytda SERVER ma'lumotidan
   * [ochilgan, offlineAt) oralig'i bo'yicha hisoblanadi; sanalgan naqd bilan
   * farq onlayn yopishdagi kabi yoziladi. Klient navbati yopishni o'zidan
   * OLDINGI barcha pul amallaridan keyin yuboradi (client/src/offline/ops.ts),
   * oflayn yakunlangan o'yinlar esa sessiyaning `endTime` i bo'yicha
   * hisoblanadi (computeSummary) — ular smenaga to'g'ri tushadi.
   */
  async close(clubId: number, user: User, id: number, dto: CloseShiftDto): Promise<CashShift> {
    const offline = dto.offlineAt !== undefined;
    let moment: OfflineMoment = resolveOfflineAt(undefined);
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CashShift);
      const shift = await repo
        .createQueryBuilder('shift')
        .setLock('pessimistic_write')
        .where('shift.id = :id AND shift.clubId = :clubId', { id, clubId })
        .getOne();
      if (!shift) throw new NotFoundException({ key: 'shifts.notFound' });
      if (shift.closedAt) throw stateConflict(offline, 'shifts.alreadyClosed');

      moment = resolveOfflineAt(dto.offlineAt, shift.openedAt);
      const closedAt = moment.at;
      const summary = await this.computeSummary(manager, clubId, shift.openedAt, closedAt);
      const cashOut = round2(dto.cashOut ?? 0);
      const expectedCash = round2(shift.openingCash + summary.byMethod.cash - cashOut);
      const countedCash = round2(dto.countedCash);

      shift.closedAt = closedAt;
      shift.closedById = user.id;
      shift.closedByName = user.name ?? user.username ?? null;
      shift.cashOut = cashOut;
      shift.expectedCash = expectedCash;
      shift.countedCash = countedCash;
      shift.difference = round2(countedCash - expectedCash);
      shift.closingNote = dto.note?.trim() || null;
      shift.summary = summary;
      return repo.save(shift);
    });

    this.audit.log({
      action: 'shift.close',
      clubId,
      userId: user.id,
      actorRole: user.role,
      entity: 'cash_shift',
      entityId: saved.id,
      meta: {
        expectedCash: saved.expectedCash,
        countedCash: saved.countedCash,
        difference: saved.difference,
        collected: saved.summary?.collected ?? 0,
        ...(moment.offline
          ? { offline: { requested: dto.offlineAt, applied: moment.at.toISOString(), clamped: moment.clamped } }
          : {}),
      },
    });
    return saved;
  }

  async list(clubId: number, query: ListShiftsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const [rows, total] = await this.shiftRepo.findAndCount({
      where: { clubId },
      order: { openedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: rows, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  /** Bitta smena — ochiq bo'lsa hisobot jonli, yopilgan bo'lsa muhrlangan nusxa */
  async findOne(clubId: number, id: number) {
    const shift = await this.shiftRepo.findOne({ where: { id, clubId } });
    if (!shift) throw new NotFoundException({ key: 'shifts.notFound' });
    if (shift.closedAt && shift.summary) {
      return { shift, summary: shift.summary, expectedCash: shift.expectedCash };
    }
    const summary = await this.computeSummary(this.dataSource, clubId, shift.openedAt, new Date());
    return { shift, summary, expectedCash: round2(shift.openingCash + summary.byMethod.cash) };
  }

  /**
   * [from, to) oralig'idagi kassa hisoboti.
   *
   * Formula hisobotlar moduli (reports.service getReport) bilan bir xil:
   * olingan pul = sales.totalAmount + debt_payments; usullar taqsimoti
   * session_payments (bo'lib to'lash satrlari) ustuvor, ular yo'q sotuvlar
   * sale.paymentMethod bilan, qarz to'lovlari o'z usuli bilan.
   *
   * VAQT TAYANCHI — PUL OLINGAN PAYT. Sotuv va uning to'lov satrlari
   * sessiyaning `endTime` i (hisob-kitob bosilgan payt) bo'yicha smenaga
   * biriktiriladi, `createdAt` (yozuv bazaga tushgan payt) bo'yicha EMAS.
   * Onlayn hisob-kitobda ikkalasi bir tranzaksiyada, millisekund farq bilan
   * yoziladi — natija o'zgarmaydi. Oflayn yakunlangan o'yin esa navbat orqali
   * soatlab kechikib keladi: `createdAt` bo'yicha uning puli kassa sanalgan
   * smenadan TUSHIB QOLIB (soxta ortiqcha) keyingi smenaga (soxta kamomad)
   * yozilardi. Hisob-kitobda yozilgan qarz ham (ma'lumot uchun) o'sha
   * `endTime` bo'yicha olinadi. Qarz to'lovlari oflayn qabul qilinganda
   * `createdAt` ning o'zi haqiqiy olingan payt bilan yoziladi
   * (debts.service.ts: pay). `endTime` bo'yicha IDX_sessions_club_endTime
   * indeksi ishlaydi.
   */
  private async computeSummary(runner: Runner, clubId: number, from: Date, to: Date): Promise<ShiftSummary> {
    const [sums] = (await runner.query(
      `SELECT
         (SELECT COUNT(*)::int FROM sessions s
           WHERE s."clubId" = $1 AND s.status = 'completed' AND s."endTime" >= $2 AND s."endTime" < $3) AS "sessionsCount",
         (SELECT COALESCE(SUM(s."tableAmount"), 0)::float FROM sessions s
           WHERE s."clubId" = $1 AND s.status = 'completed' AND s."endTime" >= $2 AND s."endTime" < $3) AS "tableRevenue",
         (SELECT COALESCE(SUM(s."barAmount"), 0)::float FROM sessions s
           WHERE s."clubId" = $1 AND s.status = 'completed' AND s."endTime" >= $2 AND s."endTime" < $3)
         + (SELECT COALESCE(SUM(sa."barAmount"), 0)::float FROM sales sa WHERE sa."clubId" = $1 AND sa."orderId" IS NOT NULL AND sa."createdAt" >= $2 AND sa."createdAt" < $3) AS "barRevenue",
         (SELECT COALESCE(SUM(s."totalAmount"), 0)::float FROM sessions s
           WHERE s."clubId" = $1 AND s.status = 'completed' AND s."endTime" >= $2 AND s."endTime" < $3)
         + (SELECT COALESCE(SUM(sa."barAmount" - sa.discount), 0)::float FROM sales sa WHERE sa."clubId" = $1 AND sa."orderId" IS NOT NULL AND sa."createdAt" >= $2 AND sa."createdAt" < $3) AS "billedRevenue",
         (SELECT COUNT(*)::int FROM sales sa WHERE sa."clubId" = $1 AND sa."orderId" IS NOT NULL AND sa."createdAt" >= $2 AND sa."createdAt" < $3) AS "barSalesCount",
         (SELECT COALESCE(SUM(sa."totalAmount"), 0)::float FROM sales sa
           JOIN sessions s ON s.id = sa."sessionId"
           WHERE sa."clubId" = $1 AND s."clubId" = $1 AND s."endTime" >= $2 AND s."endTime" < $3)
         + (SELECT COALESCE(SUM(sa."totalAmount"), 0)::float FROM sales sa WHERE sa."clubId" = $1 AND sa."orderId" IS NOT NULL AND sa."createdAt" >= $2 AND sa."createdAt" < $3) AS "collectedSales",
         (SELECT COALESCE(SUM(sa."discount"), 0)::float FROM sales sa
           JOIN sessions s ON s.id = sa."sessionId"
           WHERE sa."clubId" = $1 AND s."clubId" = $1 AND s."endTime" >= $2 AND s."endTime" < $3)
         + (SELECT COALESCE(SUM(sa."discount"), 0)::float FROM sales sa WHERE sa."clubId" = $1 AND sa."orderId" IS NOT NULL AND sa."createdAt" >= $2 AND sa."createdAt" < $3) AS "discounts",
         (SELECT COALESCE(SUM(dp."amount"), 0)::float FROM debt_payments dp
           WHERE dp."clubId" = $1 AND dp."createdAt" >= $2 AND dp."createdAt" < $3) AS "debtPayments",
         (SELECT COALESCE(SUM(d."totalDebt"), 0)::float FROM debts d
           LEFT JOIN sessions s ON s.id = d."sessionId"
           WHERE d."clubId" = $1
             AND COALESCE(s."endTime", d."createdAt") >= $2 AND COALESCE(s."endTime", d."createdAt") < $3) AS "debtsCreated",
         (SELECT COALESCE(SUM(e."amount"), 0)::float FROM expenses e
           WHERE e."clubId" = $1 AND e."createdAt" >= $2 AND e."createdAt" < $3) AS "expenses",
         (SELECT COUNT(*)::int FROM sessions s
           WHERE s."clubId" = $1 AND s.status IN ('active', 'paused')) AS "activeSessions"`,
      [clubId, from, to],
    )) as Array<Record<string, number>>;

    const methodRows = (await runner.query(
      `SELECT m.method, COALESCE(SUM(m.total), 0)::float AS total FROM (
         SELECT sp.method::text AS method, sp.amount AS total FROM session_payments sp
         JOIN sessions s ON s.id = sp."sessionId"
         WHERE sp."clubId" = $1 AND s."clubId" = $1 AND s."endTime" >= $2 AND s."endTime" < $3
         UNION ALL
         SELECT sa."paymentMethod"::text, sa."totalAmount" FROM sales sa
         JOIN sessions s ON s.id = sa."sessionId"
         WHERE sa."clubId" = $1 AND s."clubId" = $1 AND s."endTime" >= $2 AND s."endTime" < $3
           AND NOT EXISTS (SELECT 1 FROM session_payments sp2 WHERE sp2."saleId" = sa.id)
         UNION ALL
         -- Stolsiz bar savdosi: pul sotuv paytida olinadi (oflaynda — kassada bosilgan payt)
         SELECT sp.method::text, sp.amount FROM session_payments sp
         WHERE sp."clubId" = $1 AND sp."sessionId" IS NULL AND sp."createdAt" >= $2 AND sp."createdAt" < $3
         UNION ALL
         SELECT sa."paymentMethod"::text, sa."totalAmount" FROM sales sa
         WHERE sa."clubId" = $1 AND sa."orderId" IS NOT NULL AND sa."createdAt" >= $2 AND sa."createdAt" < $3
           AND NOT EXISTS (SELECT 1 FROM session_payments sp2 WHERE sp2."saleId" = sa.id)
         UNION ALL
         SELECT dp."paymentMethod"::text, dp."amount" FROM debt_payments dp
         WHERE dp."clubId" = $1 AND dp."createdAt" >= $2 AND dp."createdAt" < $3
       ) m GROUP BY m.method`,
      [clubId, from, to],
    )) as Array<{ method: string; total: number }>;

    const byMethod = { cash: 0, card: 0, transfer: 0 };
    for (const row of methodRows) {
      if (row.method === 'cash' || row.method === 'card' || row.method === 'transfer') {
        byMethod[row.method] = round2(byMethod[row.method] + Number(row.total));
      }
    }

    const n = (key: string) => Number(sums?.[key] ?? 0);
    const collectedSales = round2(n('collectedSales'));
    const debtPayments = round2(n('debtPayments'));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      sessionsCount: n('sessionsCount'),
      barSalesCount: n('barSalesCount'),
      tableRevenue: round2(n('tableRevenue')),
      barRevenue: round2(n('barRevenue')),
      billedRevenue: round2(n('billedRevenue')),
      discounts: round2(n('discounts')),
      collectedSales,
      debtPayments,
      collected: round2(collectedSales + debtPayments),
      byMethod,
      debtsCreated: round2(n('debtsCreated')),
      expenses: round2(n('expenses')),
      activeSessions: n('activeSessions'),
    };
  }
}
