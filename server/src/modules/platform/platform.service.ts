import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuditLog } from '../../entities/audit-log.entity';
import { SessionStatus } from '../../entities/enums';
import { PlatformSetting } from '../../entities/platform-setting.entity';
import { Session } from '../../entities/session.entity';
import {
  DEFAULT_TELEGRAM_EVENTS,
  TELEGRAM_EVENTS_SETTING_KEY,
} from '../../telegram/telegram.service';
import { AuditLogsQueryDto, UpdateTelegramSettingsDto } from './dto/platform.dto';

/** package.json dagi versiya — bir marta o'qiladi (server/ katalogidan) */
const PACKAGE_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/**
 * Platforma boshqaruvi (faqat superadmin):
 *  - umumiy statistika (klublar, o'sish, konversiya, daromad, sessiyalar);
 *  - audit jurnali o'quvchisi;
 *  - Telegram hodisa sozlamalari (platform_settings.telegram_events);
 *  - texnik holat (health).
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(PlatformSetting)
    private readonly platformSettingRepo: Repository<PlatformSetting>,
  ) {}

  // ==================== Statistika ====================

  async stats() {
    const months = this.lastMonths(12);
    const from = this.monthsAgoStart(12);

    // Klublar holati — status ustuni 'expired' ga faqat lazily o'tgani uchun
    // amaldagi holat sana bo'yicha hisoblanadi (uxlab yotgan klublar ham to'g'ri chiqadi)
    const statusRows: { status: string; count: number }[] = await this.dataSource.query(`
      SELECT CASE
               WHEN c.status = 'blocked' THEN 'blocked'
               WHEN COALESCE(c."subscriptionEndsAt", c."trialEndsAt") < now() THEN 'expired'
               ELSE c.status::text
             END AS status,
             COUNT(*)::int AS count
      FROM clubs c
      GROUP BY 1
    `);
    const clubsByStatus: Record<string, number> = { trial: 0, active: 0, expired: 0, blocked: 0 };
    for (const row of statusRows) clubsByStatus[row.status] = row.count;

    // Oylik yangi klublar (oxirgi 12 oy)
    const newClubRows: { month: string; count: number }[] = await this.dataSource.query(
      `SELECT to_char(date_trunc('month', c."createdAt"), 'YYYY-MM') AS month,
              COUNT(*)::int AS count
       FROM clubs c
       WHERE c."createdAt" >= $1
       GROUP BY 1`,
      [from],
    );
    const newClubsPerMonth = months.map((month) => ({
      month,
      count: newClubRows.find((r) => r.month === month)?.count ?? 0,
    }));

    // Sinov -> to'lov konversiyasi: kamida bitta shartnoma YOKI to'langan
    // hisob-fakturasi bor klublar / barcha klublar
    const [conversionRow]: { total: number; converted: number }[] = await this.dataSource.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (
               WHERE EXISTS (SELECT 1 FROM contracts k WHERE k."clubId" = c.id)
                  OR EXISTS (SELECT 1 FROM invoices i WHERE i."clubId" = c.id AND i.status = 'paid')
             )::int AS converted
      FROM clubs c
    `);
    const totalClubs = conversionRow?.total ?? 0;
    const convertedClubs = conversionRow?.converted ?? 0;

    // Oylik platforma daromadi (MRR-ga yaqin): shartnomalar + to'langan
    // hisob-fakturalar. Shartnomaga bog'langan (contractId to'ldirilgan)
    // fakturalar chiqarib tashlanadi — ikki marta hisoblanmasin.
    const revenueRows: { month: string; revenue: string }[] = await this.dataSource.query(
      `SELECT month, SUM(revenue) AS revenue FROM (
         SELECT to_char(date_trunc('month', k."createdAt"), 'YYYY-MM') AS month,
                k.amount AS revenue
         FROM contracts k
         WHERE k."createdAt" >= $1
         UNION ALL
         SELECT to_char(date_trunc('month', i."paidAt"), 'YYYY-MM') AS month,
                i.amount AS revenue
         FROM invoices i
         WHERE i.status = 'paid' AND i."paidAt" IS NOT NULL
           AND i."paidAt" >= $1 AND i."contractId" IS NULL
       ) r
       GROUP BY month`,
      [from],
    );
    const revenuePerMonth = months.map((month) => ({
      month,
      revenue: parseFloat(revenueRows.find((r) => r.month === month)?.revenue ?? '0'),
    }));

    // Platforma bo'ylab sessiyalar: hozir faol (active/paused) va bugun boshlanganlar
    const activeNow = await this.sessionRepo.count({
      where: { status: In([SessionStatus.ACTIVE, SessionStatus.PAUSED]) },
    });
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const startedToday = await this.sessionRepo.count({
      where: { startTime: MoreThanOrEqual(dayStart) },
    });

    return {
      clubsByStatus,
      newClubsPerMonth,
      conversion: {
        totalClubs,
        convertedClubs,
        ratePercent: totalClubs > 0 ? Math.round((convertedClubs / totalClubs) * 1000) / 10 : 0,
      },
      revenuePerMonth,
      sessions: { activeNow, startedToday },
    };
  }

  // ==================== Audit jurnali ====================

  async auditLogs(query: AuditLogsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);

    const qb = this.auditRepo.createQueryBuilder('log').leftJoinAndSelect('log.club', 'club');

    if (query.action) qb.andWhere('log.action = :action', { action: query.action });
    if (query.clubId) qb.andWhere('log.clubId = :clubId', { clubId: query.clubId });
    if (query.userId) qb.andWhere('log.userId = :userId', { userId: query.userId });
    if (query.from) qb.andWhere('log.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('log.createdAt < :to', { to: this.parseToExclusive(query.to) });

    const [rows, total] = await qb
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ==================== Telegram sozlamalari ====================

  /** Ma'lum hodisalar ro'yxati saqlangan qiymatlar bilan birlashtiriladi */
  async getTelegramSettings() {
    const row = await this.platformSettingRepo.findOne({
      where: { key: TELEGRAM_EVENTS_SETTING_KEY },
    });
    const stored =
      row && typeof row.value === 'object' && row.value !== null && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {};

    const events: Record<string, boolean> = { ...DEFAULT_TELEGRAM_EVENTS };
    for (const key of Object.keys(events)) {
      if (typeof stored[key] === 'boolean') events[key] = stored[key] as boolean;
    }
    return { events, updatedAt: row?.updatedAt ?? null };
  }

  /**
   * Hodisa sozlamalarini yangilash. Kalitlar TelegramService eksport qilgan
   * ro'yxatga qarab tekshiriladi. To'liq birlashtirilgan xarita saqlanadi.
   * Eslatma: TelegramService 60 soniyalik kesh ishlatadi — o'zgarish
   * ko'pi bilan bir daqiqada kuchga kiradi.
   */
  async updateTelegramSettings(dto: UpdateTelegramSettingsDto) {
    const known = new Set(Object.keys(DEFAULT_TELEGRAM_EVENTS));
    for (const [key, value] of Object.entries(dto.events)) {
      if (!known.has(key)) {
        throw new BadRequestException({
          key: 'platform.unknownTelegramEvent',
          args: { event: key },
        });
      }
      if (typeof value !== 'boolean') {
        throw new BadRequestException({
          key: 'platform.invalidEventValue',
          args: { event: key },
        });
      }
    }

    const current = await this.getTelegramSettings();
    const merged: Record<string, boolean> = {
      ...current.events,
      ...(dto.events as Record<string, boolean>),
    };

    await this.platformSettingRepo.save({ key: TELEGRAM_EVENTS_SETTING_KEY, value: merged });
    return { events: merged };
  }

  // ==================== Texnik holat ====================

  async health() {
    let db: { status: 'up' | 'down'; latencyMs: number | null };
    const t0 = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      db = { status: 'up', latencyMs: Date.now() - t0 };
    } catch {
      db = { status: 'down', latencyMs: null };
    }

    const mem = process.memoryUsage();
    return {
      status: db.status === 'up' ? 'ok' : 'degraded',
      db,
      uptimeSeconds: Math.floor(process.uptime()),
      version: PACKAGE_VERSION,
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      },
    };
  }

  // ==================== Yordamchilar ====================

  /** Oxirgi N oy kalitlari (YYYY-MM), eskidan yangiga */
  private lastMonths(n: number): string[] {
    const result: string[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return result;
  }

  /** N oy avvalgi oyning birinchi kuni (server vaqti bilan) */
  private monthsAgoStart(n: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
  }

  /** 'to' faqat sana bo'lsa — keyingi kun boshi (exclusive), kun to'liq kirsin */
  private parseToExclusive(to: string): Date {
    const d = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
}
