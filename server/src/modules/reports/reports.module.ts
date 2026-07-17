import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebtPayment } from '../../entities/debt-payment.entity';
import { Debt } from '../../entities/debt.entity';
import { Sale } from '../../entities/sale.entity';
import { Session } from '../../entities/session.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session, Sale, Debt, DebtPayment])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
