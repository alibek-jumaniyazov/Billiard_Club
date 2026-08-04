import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { OfflineAuditInterceptor } from './offline-audit.interceptor';
import { AuditService } from './audit.service';

/**
 * Global audit moduli — istalgan modul/guard AuditService ni
 * import qilmasdan to'g'ridan-to'g'ri inject qila oladi.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditService, OfflineAuditInterceptor],
  exports: [AuditService, OfflineAuditInterceptor],
})
export class AuditModule {}
