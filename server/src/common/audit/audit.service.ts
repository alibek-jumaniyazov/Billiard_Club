import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AuditLog } from '../../entities/audit-log.entity';

/** Audit jurnaliga yoziladigan bitta hodisa */
export interface AuditEntry {
  /** Masalan: 'auth.login', 'auth.refresh_reuse', 'admin.impersonate' */
  action: string;
  clubId?: number | null;
  userId?: number | null;
  actorRole?: string | null;
  entity?: string | null;
  entityId?: number | null;
  method?: string | null;
  path?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Qo'shimcha kontekst (eski/yangi qiymatlar va h.k.) */
  meta?: Record<string, unknown> | null;
}

/**
 * Audit jurnali servisi — hodisalarni fire-and-forget usulida yozadi:
 * jurnal yozuvidagi xato asosiy biznes oqimini hech qachon to'xtatmaydi,
 * faqat server logiga tushadi.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /** Hodisani yozish — kutmasdan (fire-and-forget) */
  log(entry: AuditEntry): void {
    void this.auditRepo
      .insert({
        action: this.trunc(entry.action, 100) ?? 'unknown',
        clubId: entry.clubId ?? null,
        userId: entry.userId ?? null,
        actorRole: this.trunc(entry.actorRole, 20),
        entity: this.trunc(entry.entity, 50),
        entityId: entry.entityId ?? null,
        method: this.trunc(entry.method, 10),
        path: this.trunc(entry.path, 500),
        ip: this.trunc(entry.ip, 45),
        userAgent: this.trunc(entry.userAgent, 255),
        // TypeORM jsonb tipi QueryDeepPartialEntity bilan chiqisha olmaydi — xavfsiz cast
        meta: (entry.meta ?? null) as QueryDeepPartialEntity<AuditLog>['meta'],
      })
      .catch((err: Error) =>
        this.logger.error(`Audit yozuvi saqlanmadi (${entry.action}): ${err.message}`),
      );
  }

  /** Ustun uzunligidan oshgan qiymatlarni kesish — insert yiqilmasin */
  private trunc(value: string | null | undefined, max: number): string | null {
    if (!value) return null;
    return value.length > max ? value.slice(0, max) : value;
  }
}
