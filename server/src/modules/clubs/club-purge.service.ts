import { promises as fs } from 'node:fs';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { User } from '../../entities/user.entity';
import { feedbackUploadDir } from '../feedback/feedback.service';

/**
 * Klubga tegishli jadvallar — O'CHIRISH TARTIBIDA. FK lar RESTRICT bo'lgani uchun
 * avval bolalar, keyin ular ishora qiladigan yozuvlar o'chiriladi. Ichki jadvallar
 * o'z otasi bilan CASCADE o'chadi: order_items (orders), session_segments (sessions),
 * refresh_sessions (users).
 *
 * "clubId" ustunli HAR BIR jadval shu ro'yxatda yoki RETAINED_BILLING_TABLES da
 * bo'lishi SHART — integratsion test (16-club-purge) buni katalogdan tekshiradi:
 * yangi jadval qo'shilsa, uni bu yerga kiritmaguncha test yiqiladi.
 */
export const CLUB_PURGE_ORDER = [
  'session_payments',
  'debt_payments',
  'debts',
  'sales',
  'orders',
  'sessions',
  'reservations',
  'table_light_events',
  'tables',
  'products',
  'categories',
  'customers',
  'expenses',
  'cash_shifts',
  'club_bridges',
  'feedbacks',
  'club_notifications',
  'owner_telegram_link_tokens',
  'owner_telegram_chats',
  'idempotency_keys',
  'audit_logs',
  'settings',
  'users',
] as const;

export type ClubPurgeTable = (typeof CLUB_PURGE_ORDER)[number];

/**
 * Platforma to'lov tarixi — klub bilan o'chirilMAYdi: shartnomalar va TO'LANGAN
 * fakturalar klubdan ajratiladi (clubId null, nomi `clubName` ga muhrlanadi),
 * daromad statistikasi va faktura raqamlari buzilmaydi. To'lanmagan so'rovlar o'chadi.
 */
export const RETAINED_BILLING_TABLES = ['contracts', 'invoices'] as const;

/** Katta klubda ham o'chirish uzilmasin: ilovadagi 15 s chegarasi faqat shu tranzaksiyada kengayadi */
const PURGE_STATEMENT_TIMEOUT = '120s';

export interface ClubPurgeBilling {
  /** Saqlanadigan shartnomalar (platforma daromadi) va ularning summasi */
  contracts: number;
  contractsAmount: number;
  /** Saqlanadigan to'langan fakturalar va summasi */
  paidInvoices: number;
  paidInvoicesAmount: number;
  /** O'chiriladigan to'lanmagan so'rovlar (kutilayotgan, rad etilgan, muddati o'tgan) */
  unpaidInvoices: number;
}

export interface ClubPurgePreview {
  club: { id: number; name: string };
  /** Har jadvalda o'chiriladigan yozuvlar soni */
  counts: Record<ClubPurgeTable, number>;
  billing: ClubPurgeBilling;
}

export interface ClubPurgeResult {
  club: { id: number; name: string };
  deleted: Record<ClubPurgeTable, number>;
  /** Klubdan ajratilib saqlangan to'lov tarixi */
  kept: { contracts: number; invoices: number };
  /** O'chirilgan to'lanmagan so'rovlar */
  deletedInvoices: number;
}

export interface PurgeRequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

const toInt = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const toAmount = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const quoted = (table: string): string => `"${table}"`;

/**
 * Superadmin: klubni BARCHA ma'lumotlari bilan butunlay o'chirish.
 *
 * Bitta tranzaksiya — yo hammasi o'chadi, yo hech narsa (yarim o'chgan klub qolmaydi).
 * Tasdiq sifatida klub nomi aynan yozilishi shart. Fikr-mulohaza rasmlari diskdan
 * tranzaksiya muvaffaqiyatli tugagandan keyin o'chiriladi; amal audit jurnaliga
 * platforma darajasida (clubId = null) yoziladi.
 */
@Injectable()
export class ClubPurgeService {
  private readonly logger = new Logger(ClubPurgeService.name);

  /**
   * Bitta fikr-mulohaza biriktirmalari papkasi. Testlar buni vaqtinchalik katalogga
   * yo'naltiradi — haqiqiy server/uploads ga hech qachon tegilmasin.
   */
  feedbackDir: (feedbackId: number) => string = feedbackUploadDir;

  constructor(
    private readonly dataSource: DataSource,
    // Global AuditModule ro'yxatdan o'tmagan bo'lsa ham servis ishlayveradi
    @Optional() private readonly auditService?: AuditService,
  ) {}

  /** O'chirishdan oldin: nima o'chadi va nima saqlanadi (tasdiq oynasi uchun) */
  async preview(clubId: number): Promise<ClubPurgePreview> {
    const club = await this.findClub(this.dataSource.manager, clubId, false);

    const selects = CLUB_PURGE_ORDER.map(
      (table) => `(SELECT COUNT(*) FROM ${quoted(table)} WHERE "clubId" = $1) AS ${quoted(table)}`,
    );
    const [row] = (await this.dataSource.query(`SELECT ${selects.join(', ')}`, [clubId])) as Array<
      Record<string, unknown>
    >;
    const counts = {} as Record<ClubPurgeTable, number>;
    for (const table of CLUB_PURGE_ORDER) counts[table] = toInt(row?.[table]);

    const [billing] = (await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*) FROM contracts WHERE "clubId" = $1) AS contracts,
         (SELECT COALESCE(SUM(amount), 0) FROM contracts WHERE "clubId" = $1) AS "contractsAmount",
         (SELECT COUNT(*) FROM invoices WHERE "clubId" = $1 AND status = 'paid') AS "paidInvoices",
         (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE "clubId" = $1 AND status = 'paid') AS "paidInvoicesAmount",
         (SELECT COUNT(*) FROM invoices WHERE "clubId" = $1 AND status <> 'paid') AS "unpaidInvoices"`,
      [clubId],
    )) as Array<Record<string, unknown>>;

    return {
      club,
      counts,
      billing: {
        contracts: toInt(billing?.contracts),
        contractsAmount: toAmount(billing?.contractsAmount),
        paidInvoices: toInt(billing?.paidInvoices),
        paidInvoicesAmount: toAmount(billing?.paidInvoicesAmount),
        unpaidInvoices: toInt(billing?.unpaidInvoices),
      },
    };
  }

  /**
   * Klubni o'chirish. `confirmName` — superadmin yozgan klub nomi (aynan mos kelishi shart).
   * Superadmin o'zi biriktirilgan klubni o'chira olmaydi (o'z hisobi ham o'chib ketardi).
   */
  async purge(
    clubId: number,
    actor: User,
    confirmName: string,
    ctx: PurgeRequestContext = {},
  ): Promise<ClubPurgeResult> {
    if (actor.clubId != null && actor.clubId === clubId) {
      throw new BadRequestException({ key: 'clubs.purgeOwnClub' });
    }

    const { feedbackIds, ...result } = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL statement_timeout = '${PURGE_STATEMENT_TIMEOUT}'`);

      // Klub qatori qulflanadi: shu payt boshqa kassada yozilayotgan o'yin yoki
      // buyurtma (FK klub qatoriga KEY SHARE qulf oladi) tranzaksiya tugashini
      // kutadi va klub yo'qligi sababli rad etiladi — "yetim" yozuv qolmaydi.
      const club = await this.findClub(manager, clubId, true);
      if (confirmName.trim() !== club.name.trim()) {
        throw new BadRequestException({ key: 'clubs.purgeNameMismatch' });
      }

      const feedbackRows = (await manager.query(`SELECT id FROM feedbacks WHERE "clubId" = $1`, [
        clubId,
      ])) as Array<{ id: number | string }>;

      // 1. Platforma to'lov tarixi: klubdan ajratiladi, nomi muhrlanadi
      const keptContracts = await this.affected(
        manager,
        `UPDATE contracts SET "clubName" = $2, "clubId" = NULL WHERE "clubId" = $1`,
        [clubId, club.name],
      );
      const keptInvoices = await this.affected(
        manager,
        `UPDATE invoices SET "clubName" = $2, "clubId" = NULL WHERE "clubId" = $1 AND status = 'paid'`,
        [clubId, club.name],
      );
      const deletedInvoices = await this.affected(manager, `DELETE FROM invoices WHERE "clubId" = $1`, [clubId]);

      // 2. Klub ma'lumotlari — FK tartibida
      const deleted = {} as Record<ClubPurgeTable, number>;
      for (const table of CLUB_PURGE_ORDER) {
        deleted[table] = await this.affected(manager, `DELETE FROM ${quoted(table)} WHERE "clubId" = $1`, [clubId]);
      }
      await manager.query(`DELETE FROM clubs WHERE id = $1`, [clubId]);

      return {
        club,
        deleted,
        kept: { contracts: keptContracts, invoices: keptInvoices },
        deletedInvoices,
        feedbackIds: feedbackRows.map((r) => Number(r.id)),
      };
    });

    // 3. Fayllar — tranzaksiyadan KEYIN: bekor bo'lgan o'chirish fayllarni yo'qotmasin
    await this.removeFeedbackFiles(feedbackIds);

    // 4. Jurnal — platforma darajasida: klub endi yo'q, uning ma'lumoti meta da
    this.auditService?.log({
      action: 'club.purged',
      clubId: null,
      userId: actor.id,
      actorRole: actor.role,
      entity: 'club',
      entityId: clubId,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      meta: {
        clubName: result.club.name,
        deleted: result.deleted,
        kept: result.kept,
        deletedInvoices: result.deletedInvoices,
      },
    });
    this.logger.warn(`Klub butunlay o'chirildi: #${clubId} «${result.club.name}» (superadmin #${actor.id})`);

    return result;
  }

  private async findClub(
    manager: EntityManager,
    clubId: number,
    lock: boolean,
  ): Promise<{ id: number; name: string }> {
    const rows = (await manager.query(
      `SELECT id, name FROM clubs WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [clubId],
    )) as Array<{ id: number | string; name: string }>;
    if (!rows[0]) throw new NotFoundException({ key: 'clubs.notFound' });
    return { id: Number(rows[0].id), name: rows[0].name };
  }

  /** UPDATE/DELETE — ta'sirlangan qatorlar soni (qatorlarning o'zi Node ga tashilmaydi) */
  private async affected(manager: EntityManager, statement: string, params: unknown[]): Promise<number> {
    const rows = (await manager.query(
      `WITH affected AS (${statement} RETURNING 1) SELECT count(*)::int AS n FROM affected`,
      params,
    )) as Array<{ n: number | string }>;
    return toInt(rows[0]?.n);
  }

  private async removeFeedbackFiles(ids: number[]): Promise<void> {
    for (const id of ids) {
      try {
        await fs.rm(this.feedbackDir(id), { recursive: true, force: true });
      } catch (err) {
        this.logger.error(`Fikr-mulohaza fayllari o'chirilmadi (#${id}): ${(err as Error).message}`);
      }
    }
  }
}
