import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { parseDateParts, zonedMidnight } from '../../common/time/club-day';
import { DEFAULT_TIMEZONE } from '../settings/timezones';
import { Club } from '../../entities/club.entity';
import { ClubNotification } from '../../entities/club-notification.entity';
import { ClubStatus } from '../../entities/enums';
import { User } from '../../entities/user.entity';
import {
  AdminHistoryQueryDto,
  BatchRecipientsQueryDto,
  ListNotificationsQueryDto,
  NotificationAudience,
  SendNotificationDto,
} from './dto/notifications.dto';

/** Fan-out da bitta INSERT ga sig'adigan yozuvlar soni */
const FANOUT_CHUNK_SIZE = 500;

/** Klub ro'yxatining tepasiga yopishtiriladigan (pinned) muhim turlar */
export const PINNED_TYPES = ['maintenance', 'warning'] as const;

/**
 * Pinned tartiblash ifodasi. Turlar modul konstantasi (foydalanuvchi kiritmasi
 * emas), shuning uchun to'g'ridan-to'g'ri SQL ga yoziladi — ORDER BY ichida
 * `:...param` kengaytmasiga tayanmaslik uchun.
 */
const PINNED_ORDER_SQL = `CASE WHEN n."readAt" IS NULL AND n."type" IN (${PINNED_TYPES.map(
  (type) => `'${type}'`,
).join(', ')}) THEN 0 ELSE 1 END`;

/** Superadmin tarixidagi bitta e'lon (batch) */
export interface NotificationBatch {
  batchId: string;
  title: string;
  body: string;
  type: string;
  createdAt: Date;
  createdById: number | null;
  createdByName: string | null;
  recipients: number;
  readCount: number;
  unreadCount: number;
  readRatePercent: number;
  /** Faqat bitta qabul qiluvchi bo'lganda to'ldiriladi */
  clubId: number | null;
  clubName: string | null;
}

/** Guruhlangan so'rovning xom qatori */
interface RawBatchRow {
  batchId: string;
  createdAt: Date;
  title: string;
  body: string;
  type: string;
  createdById: number | null;
  createdByName: string | null;
  recipients: number;
  readCount: number;
  firstClubId: number | null;
  firstClubName: string | null;
}

/**
 * Klub xabarnomalari:
 *  - klub egasi o'z xabarnomalarini o'qiydi, filtrlaydi, belgilaydi, o'chiradi;
 *  - superadmin bitta/bir nechta klubga yoki auditoriya bo'yicha yuboradi,
 *    yuborilganlarni E'LON (batch) darajasida ko'radi va qaytarib oladi.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(ClubNotification)
    private readonly notificationRepo: Repository<ClubNotification>,
    @InjectRepository(Club) private readonly clubRepo: Repository<Club>,
    private readonly dataSource: DataSource,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  // ==================== Klub egasi tomoni ====================

  /**
   * O'z klubining xabarnomalari + o'qilmaganlar soni.
   * @SkipSubscription tufayli klub konteksti foydalanuvchidan olinadi —
   * obunasi tugagan egasi ham platforma xabarlarini ko'ra olsin.
   */
  async listForClub(user: User, query: ListNotificationsQueryDto) {
    const clubId = this.requireClubId(user);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n."clubId" = :clubId', { clubId });

    if (query.status === 'unread') qb.andWhere('n."readAt" IS NULL');
    if (query.status === 'read') qb.andWhere('n."readAt" IS NOT NULL');
    if (query.type) qb.andWhere('n."type" = :type', { type: query.type });
    if (query.search) {
      qb.andWhere('(n."title" ILIKE :q OR n."body" ILIKE :q)', { q: `%${query.search}%` });
    }

    // Sanoq — tartiblash/sahifalashdan OLDIN, toza nusxada
    const total = await qb.clone().getCount();

    // Muhim (maintenance/warning) O'QILMAGAN xabarlar ro'yxat boshiga
    // yopishtiriladi — obuna/texnik ishlar haqidagi ogohlantirish 3-sahifada
    // ko'milib qolmasin. Keyin — vaqt bo'yicha.
    // `id` teng-ajratuvchi SHART: bitta fan-out chunkining barcha qatorlari
    // aynan bir xil createdAt oladi (INSERT ichida now() statement-stable),
    // shusiz OFFSET sahifalari orasida tartib beqaror bo'lardi.
    const rows = await qb
      .orderBy(PINNED_ORDER_SQL, 'ASC')
      .addOrderBy('n."createdAt"', 'DESC')
      .addOrderBy('n."id"', 'DESC')
      .limit(limit)
      .offset((page - 1) * limit)
      .getMany();

    // Qo'ng'iroq shu raqamni o'qiydi — u HAR DOIM "klubdagi jami o'qilmagan"
    // ma'nosini bildirishi kerak, shuning uchun filtrlarga bog'lanmaydi.
    const unreadCount = await this.notificationRepo.count({
      where: { clubId, readAt: IsNull() },
    });

    return {
      data: rows,
      unreadCount,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /** Bitta xabarnoma — `/notifications?id=` chuqur havolasi uchun */
  async findOneForClub(user: User, id: number): Promise<ClubNotification> {
    const clubId = this.requireClubId(user);
    const notification = await this.notificationRepo.findOne({ where: { id, clubId } });
    if (!notification) throw new NotFoundException({ key: 'notifications.notFound' });
    return notification;
  }

  /** Qo'ng'iroq uchun arzon so'rov — IDX_club_notifications_club_readAt xizmat qiladi */
  async unreadCountForClub(user: User): Promise<number> {
    const clubId = this.requireClubId(user);
    return this.notificationRepo.count({ where: { clubId, readAt: IsNull() } });
  }

  /**
   * O'qilgan/o'qilmagan deb belgilash. Orqaga qaytarish imkoni bo'lgani uchun
   * uzun xabarni ochib ko'rish endi qaytarib bo'lmaydigan amal emas.
   */
  async setRead(user: User, id: number, read: boolean) {
    const clubId = this.requireClubId(user);
    const notification = await this.notificationRepo.findOne({ where: { id, clubId } });
    if (!notification) throw new NotFoundException({ key: 'notifications.notFound' });

    const readAt = read ? (notification.readAt ?? new Date()) : null;
    if (notification.readAt?.getTime() !== readAt?.getTime()) {
      notification.readAt = readAt;
      await this.notificationRepo.update({ id, clubId }, { readAt });
    }

    return { data: notification, unreadCount: await this.unreadCountForClub(user) };
  }

  /** Barchasini o'qilgan deb belgilash */
  async markAllRead(user: User) {
    const clubId = this.requireClubId(user);
    const result = await this.notificationRepo.update(
      { clubId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { count: result.affected ?? 0, unreadCount: 0 };
  }

  /**
   * Tanlanganlarni ommaviy belgilash. WHERE dagi `clubId` — ijarachi (tenant)
   * qalqoni: begona ID lar shunchaki hech nimaga ta'sir qilmaydi.
   *
   * O'qilgan deb belgilashda `readAt IS NULL` sharti MUHIM: aks holda
   * "sahifadagi hammasini tanlash" allaqachon o'qilgan xabarlarning BIRINCHI
   * o'qilgan vaqtini bugungi sanaga almashtirib yuborardi (bu vaqt klub
   * oynasida ham, superadminning o'qish tahlilida ham ko'rinadi).
   */
  async bulkSetRead(user: User, ids: number[], read: boolean) {
    const clubId = this.requireClubId(user);
    const result = await this.notificationRepo.update(
      { id: In(ids), clubId, ...(read ? { readAt: IsNull() } : {}) },
      { readAt: read ? new Date() : null },
    );
    return { count: result.affected ?? 0, unreadCount: await this.unreadCountForClub(user) };
  }

  /** Bitta xabarnomani o'chirish (faqat o'z klubidan) */
  async removeForClub(user: User, id: number) {
    const clubId = this.requireClubId(user);
    const result = await this.notificationRepo.delete({ id, clubId });
    if (!result.affected) throw new NotFoundException({ key: 'notifications.notFound' });
    return { unreadCount: await this.unreadCountForClub(user) };
  }

  /** Tanlanganlarni ommaviy o'chirish */
  async bulkRemoveForClub(user: User, ids: number[]) {
    const clubId = this.requireClubId(user);
    const result = await this.notificationRepo.delete({ id: In(ids), clubId });
    return { count: result.affected ?? 0, unreadCount: await this.unreadCountForClub(user) };
  }

  // ==================== Superadmin: yuborish ====================

  /**
   * Xabarnoma yuborish. Qabul qiluvchilar uch usulda aniqlanadi:
   *  - clubId    — aynan bitta klub;
   *  - clubIds   — tanlangan klublar;
   *  - audience  — klub holati bo'yicha segment (all/trial/active/expired).
   *
   * Butun fan-out BITTA tranzaksiyada: yarim yo'lda uzilib qolgan yuborish
   * platformaning yarmini xabardor qilib, qaytadan urinishda ikkinchi yarmiga
   * dublikat yozib qo'yishi mumkin edi.
   */
  async adminSend(admin: User, dto: SendNotificationDto) {
    const includeBlocked = dto.includeBlocked === true;
    const clubIds = await this.resolveRecipients(dto, includeBlocked);

    if (clubIds.length === 0) {
      throw new BadRequestException({ key: 'notifications.noRecipients' });
    }

    const batchId = randomUUID();
    const base = {
      batchId,
      title: dto.title,
      body: dto.body,
      type: dto.type ?? 'info',
      createdById: admin.id,
    };

    let count = 0;
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClubNotification);
      for (let i = 0; i < clubIds.length; i += FANOUT_CHUNK_SIZE) {
        const chunk = clubIds
          .slice(i, i + FANOUT_CHUNK_SIZE)
          .map((clubId) => ({ ...base, clubId }));
        const result = await repo.insert(chunk);
        count += result.identifiers.length;
      }
    });

    this.auditService?.log({
      action: 'notification.send',
      userId: admin.id,
      actorRole: admin.role,
      clubId: clubIds.length === 1 ? clubIds[0] : null,
      entity: 'club_notification',
      meta: {
        batchId,
        type: base.type,
        recipients: count,
        broadcast: !dto.clubId && !dto.clubIds,
        audience: dto.audience ?? 'all',
        includeBlocked,
        titleLength: dto.title.length,
        bodyLength: dto.body.length,
      },
    });

    // Bitta klubga yuborilganda mijozga yozuvning o'zi qaytariladi
    const data =
      clubIds.length === 1
        ? await this.notificationRepo.findOne({
            where: { batchId },
            order: { id: 'DESC' },
          })
        : null;

    return { count, batchId, data };
  }

  /** Yuborishdan oldin "nechta klubga boradi" — compose oynasidagi jonli hisob */
  async audienceCount(audience: NotificationAudience | undefined, includeBlocked: boolean) {
    return this.clubRepo.count({ where: this.audienceWhere(audience, includeBlocked) });
  }

  // ==================== Superadmin: tarix va tahlil ====================

  /**
   * Yuborilganlar tarixi — E'LON (batch) bo'yicha guruhlangan: 300 ta klubga
   * ketgan bitta e'lon endi bitta qator, yonida yetkazilgan/o'qilgan hisobi.
   */
  async adminHistory(query: AdminHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const { whereSql, having, params } = this.buildHistoryFilters(query);
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    const rows: RawBatchRow[] = await this.dataSource.query(
      `${this.batchSelectSql(whereSql, having)}
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      [...params, limit, (page - 1) * limit],
    );

    // Umumiy son — aynan shu filtrlar bilan guruhlangan qatorlar soni
    const totalRows: { count: number }[] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT 1 FROM club_notifications n
         ${whereSql}
         GROUP BY n."batchId"
         ${having}
       ) s`,
      params,
    );
    const total = totalRows[0]?.count ?? 0;

    return {
      data: rows.map((row) => this.toBatch(row)),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /** Bitta e'lonning umumlashtirilgan ko'rinishi */
  async adminBatchDetail(batchId: string): Promise<NotificationBatch> {
    const rows: RawBatchRow[] = await this.dataSource.query(
      this.batchSelectSql(`WHERE n."batchId" = $1`, ''),
      [batchId],
    );
    if (rows.length === 0) throw new NotFoundException({ key: 'notifications.batchNotFound' });
    return this.toBatch(rows[0]);
  }

  /** E'lon qabul qiluvchilari — "qaysi klub hali o'qimagan?" savoliga javob */
  async adminBatchRecipients(batchId: string, query: BatchRecipientsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);

    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .innerJoin(Club, 'c', 'c.id = n."clubId"')
      .select([
        'n."id" AS "id"',
        'n."clubId" AS "clubId"',
        'c."name" AS "clubName"',
        'c."status" AS "clubStatus"',
        'n."readAt" AS "readAt"',
      ])
      .where('n."batchId" = :batchId', { batchId });

    if (query.status === 'read') qb.andWhere('n."readAt" IS NOT NULL');
    if (query.status === 'unread') qb.andWhere('n."readAt" IS NULL');
    if (query.search) qb.andWhere('c."name" ILIKE :q', { q: `%${query.search}%` });

    const total = await qb.clone().getCount();

    const data = await qb
      // O'qimaganlar oldinda — ro'yxatning maqsadi aynan shular
      .orderBy('n."readAt"', 'ASC', 'NULLS FIRST')
      .addOrderBy('c."name"', 'ASC')
      .limit(limit)
      .offset((page - 1) * limit)
      .getRawMany();

    return {
      data,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * E'lonni qaytarib olish. Standart holatda FAQAT o'qilmagan nusxalar
   * o'chiriladi: allaqachon o'qilgan klub xabarni ko'rgan, uni tarixdan
   * yashirish yolg'on manzara yaratadi. Butunlay o'chirish — aniq tanlov.
   */
  async adminRecallBatch(admin: User, batchId: string, onlyUnread: boolean) {
    const batch = await this.adminBatchDetail(batchId);

    const result = await this.notificationRepo.delete({
      batchId,
      ...(onlyUnread ? { readAt: IsNull() } : {}),
    });
    const deleted = result.affected ?? 0;

    this.auditService?.log({
      action: 'notification.recall',
      userId: admin.id,
      actorRole: admin.role,
      entity: 'club_notification',
      meta: {
        batchId,
        recipients: batch.recipients,
        readCount: batch.readCount,
        deleted,
        onlyUnread,
      },
    });

    return { count: deleted, keptCount: batch.recipients - deleted };
  }

  /** Bitta yozuvni o'chirish — sinov yuborishlarini tozalash uchun */
  async adminRemoveRow(admin: User, id: number) {
    const result = await this.notificationRepo.delete({ id });
    if (!result.affected) throw new NotFoundException({ key: 'notifications.notFound' });

    this.auditService?.log({
      action: 'notification.delete_row',
      userId: admin.id,
      actorRole: admin.role,
      entity: 'club_notification',
      entityId: id,
    });
  }

  /** Panel tepasidagi ko'rsatkichlar */
  async adminStats() {
    const rows: {
      batches: number;
      recipients: number;
      read: number;
      batches30d: number;
      recipients30d: number;
    }[] = await this.dataSource.query(
      `SELECT
         COUNT(DISTINCT "batchId")::int AS "batches",
         COUNT(*)::int AS "recipients",
         COUNT("readAt")::int AS "read",
         COUNT(DISTINCT "batchId") FILTER (WHERE "createdAt" >= now() - interval '30 days')::int AS "batches30d",
         COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '30 days')::int AS "recipients30d"
       FROM club_notifications`,
    );

    const row = rows[0] ?? {
      batches: 0,
      recipients: 0,
      read: 0,
      batches30d: 0,
      recipients30d: 0,
    };

    return {
      batches: row.batches,
      recipients: row.recipients,
      read: row.read,
      unread: row.recipients - row.read,
      readRatePercent: this.percent(row.read, row.recipients),
      batches30d: row.batches30d,
      recipients30d: row.recipients30d,
    };
  }

  // ==================== Yordamchilar ====================

  private requireClubId(user: User): number {
    if (!user.clubId) {
      throw new ForbiddenException({ key: 'subscription.clubContextRequired' });
    }
    return user.clubId;
  }

  /** Qabul qiluvchi klub ID lari — uchala nishonlash usuli uchun yagona joy */
  private async resolveRecipients(
    dto: SendNotificationDto,
    includeBlocked: boolean,
  ): Promise<number[]> {
    // ATAYLAB: aniq tanlangan klub(lar)ga holatidan qat'i nazar yuboriladi —
    // superadmin klubni nomi bo'yicha o'zi tanlagan, `includeBlocked` esa
    // faqat auditoriya bo'yicha fan-out ga taalluqli.
    if (dto.clubId) {
      const club = await this.clubRepo.findOne({
        select: { id: true },
        where: { id: dto.clubId },
      });
      if (!club) throw new NotFoundException({ key: 'clubs.notFound' });
      return [club.id];
    }

    if (dto.clubIds?.length) {
      const clubs = await this.clubRepo.find({
        select: { id: true },
        where: { id: In(dto.clubIds) },
      });
      if (clubs.length !== dto.clubIds.length) {
        throw new NotFoundException({ key: 'clubs.notFound' });
      }
      return clubs.map((club) => club.id);
    }

    const clubs = await this.clubRepo.find({
      select: { id: true },
      where: this.audienceWhere(dto.audience, includeBlocked),
    });
    return clubs.map((club) => club.id);
  }

  /** Auditoriya -> klub holati sharti */
  private audienceWhere(audience: NotificationAudience | undefined, includeBlocked: boolean) {
    switch (audience) {
      case 'trial':
        return { status: ClubStatus.TRIAL };
      case 'active':
        return { status: ClubStatus.ACTIVE };
      case 'expired':
        return { status: ClubStatus.EXPIRED };
      default:
        return includeBlocked ? {} : { status: Not(ClubStatus.BLOCKED) };
    }
  }

  /** Guruhlangan tarix SELECTi — ro'yxat va bitta batch tafsiloti uchun bir xil */
  private batchSelectSql(whereSql: string, having: string): string {
    return `
      SELECT n."batchId"                 AS "batchId",
             MAX(n."createdAt")          AS "createdAt",
             MIN(n."title")              AS "title",
             MIN(n."body")               AS "body",
             MIN(n."type")               AS "type",
             MIN(n."createdById")::int   AS "createdById",
             MIN(u."name")               AS "createdByName",
             COUNT(*)::int               AS "recipients",
             COUNT(n."readAt")::int      AS "readCount",
             MIN(n."clubId")::int        AS "firstClubId",
             MIN(c."name")               AS "firstClubName"
      FROM club_notifications n
      LEFT JOIN users u ON u.id = n."createdById"
      LEFT JOIN clubs c ON c.id = n."clubId"
      ${whereSql}
      GROUP BY n."batchId"
      ${having}
      ORDER BY MAX(n."createdAt") DESC, MIN(n."id") DESC
    `;
  }

  /** Tarix filtrlari -> WHERE/HAVING + pozitsion parametrlar */
  private buildHistoryFilters(query: AdminHistoryQueryDto) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const p = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (query.type) conditions.push(`n."type" = ${p(query.type)}`);
    if (query.createdById) conditions.push(`n."createdById" = ${p(query.createdById)}`);
    if (query.search) {
      const like = `%${query.search}%`;
      conditions.push(`(n."title" ILIKE ${p(like)} OR n."body" ILIKE ${p(like)})`);
    }
    // Kun chegaralari ANIQ mintaqada hisoblanadi. `::date` bilan taqqoslash
    // Postgres SESSIYA TimeZone iga tayanadi — u konteynerlarda odatda UTC,
    // ya'ni Toshkent bo'yicha tanlangan kun 5 soatga siljib ketardi.
    // Loyihadagi boshqa sana-kesimlari (dashboard, orders, reports) ham
    // aynan shu helperlardan foydalanadi.
    if (query.from) {
      const d = parseDateParts(query.from);
      const fromAt = zonedMidnight(DEFAULT_TIMEZONE, d.year, d.month, d.day);
      conditions.push(`n."createdAt" >= ${p(fromAt.toISOString())}::timestamptz`);
    }
    // `to` kiritilgan kunni ham qamrab olsin — +1 kun va qat'iy kichik
    if (query.to) {
      const d = parseDateParts(query.to);
      const toAt = zonedMidnight(DEFAULT_TIMEZONE, d.year, d.month, d.day + 1);
      conditions.push(`n."createdAt" < ${p(toAt.toISOString())}::timestamptz`);
    }
    if (query.clubId) {
      // ATAYLAB EXISTS: oddiy `n."clubId" = :clubId` har bir e'lonni bitta
      // qabul qiluvchiga qisqartirib, hisobni buzib ko'rsatgan bo'lardi.
      conditions.push(
        `EXISTS (SELECT 1 FROM club_notifications x
                 WHERE x."batchId" = n."batchId" AND x."clubId" = ${p(query.clubId)})`,
      );
    }

    const having =
      query.target === 'single'
        ? 'HAVING COUNT(*) = 1'
        : query.target === 'broadcast'
          ? 'HAVING COUNT(*) > 1'
          : '';

    return {
      whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      having,
      params,
    };
  }

  private toBatch(row: RawBatchRow): NotificationBatch {
    const single = row.recipients === 1;
    return {
      batchId: row.batchId,
      title: row.title,
      body: row.body,
      type: row.type,
      createdAt: row.createdAt,
      createdById: row.createdById,
      createdByName: row.createdByName,
      recipients: row.recipients,
      readCount: row.readCount,
      unreadCount: row.recipients - row.readCount,
      readRatePercent: this.percent(row.readCount, row.recipients),
      clubId: single ? row.firstClubId : null,
      clubName: single ? row.firstClubName : null,
    };
  }

  private percent(part: number, total: number): number {
    return total > 0 ? Math.round((part / total) * 100) : 0;
  }
}
