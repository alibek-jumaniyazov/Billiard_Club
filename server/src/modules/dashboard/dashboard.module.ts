import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebtPayment } from '../../entities/debt-payment.entity';
import { Sale } from '../../entities/sale.entity';
import { Session } from '../../entities/session.entity';
import { Table } from '../../entities/table.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Table, Session, Sale, DebtPayment])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
