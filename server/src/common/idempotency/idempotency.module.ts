import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from '../../entities/idempotency-key.entity';
import { IdempotencyCleanupService } from './idempotency-cleanup.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * Idempotentlik moduli — interceptor va uning kunlik tozalash croni.
 * Interceptor eksport qilinadi: uni GLOBAL qilib ulash app.module.ts da
 * (APP_INTERCEPTOR) bajariladi, qolgan guard/filtrlar bilan bir joyda.
 */
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKey])],
  providers: [IdempotencyInterceptor, IdempotencyCleanupService],
  exports: [IdempotencyInterceptor],
})
export class IdempotencyModule {}
