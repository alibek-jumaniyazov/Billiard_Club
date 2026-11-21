import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { addConnectRetry } from './pool-retry';

/**
 * Ilova ishga tushganda TypeORM ning pg pool iga ulanish bosqichidagi qayta
 * urinishni qo'shadi (pool-retry.ts). Baza bir lahza sekinlashsa so'rov
 * foydalanuvchiga xato bo'lib qaytmaydi — server o'zi yana bir bor ulanadi.
 */
@Injectable()
export class DbResilienceService implements OnModuleInit {
  private readonly logger = new Logger('Database');

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    const pool = (this.dataSource.driver as unknown as { master?: { connect: (...args: unknown[]) => unknown } }).master;
    if (!pool || typeof pool.connect !== 'function') {
      this.logger.warn("pg pool topilmadi — ulanishni qayta urinish o'rnatilmadi");
      return;
    }
    addConnectRetry(pool, {
      retries: 1,
      baseDelayMs: 300,
      onRetry: (err, attempt) =>
        this.logger.warn(`Bazaga ulanish qayta urinilmoqda (${attempt}): ${(err as Error)?.message ?? String(err)}`),
    });
  }
}
