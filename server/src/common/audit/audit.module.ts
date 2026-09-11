import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { AuditCleanupService } from './audit-cleanup.service';
import { OfflineAuditInterceptor } from './offline-audit.interceptor';
import { AuditService } from './audit.service';

/**
 * Global audit moduli — istalgan modul/guard AuditService ni
 * import qilmasdan to'g'ridan-to'g'ri inject qila oladi.
 * AuditCleanupService — ixtiyoriy saqlash-muddati cron'i (AUDIT_RETENTION_DAYS
 * qo'yilmagan bo'lsa hech nima qilmaydi).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditService, OfflineAuditInterceptor, AuditCleanupService],
  exports: [AuditService, OfflineAuditInterceptor],
})
export class AuditModule {}
