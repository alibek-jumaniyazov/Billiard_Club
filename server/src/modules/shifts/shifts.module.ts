import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashShift } from '../../entities/cash-shift.entity';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

/** Kassa smenalari va Z-hisobot (AuditModule global) */
@Module({
  imports: [TypeOrmModule.forFeature([CashShift])],
  controllers: [ShiftsController],
  providers: [ShiftsService],
})
export class ShiftsModule {}
