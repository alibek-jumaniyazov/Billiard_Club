import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Debt } from '../../entities/debt.entity';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Debt])],
  controllers: [DebtsController],
  providers: [DebtsService],
})
export class DebtsModule {}
