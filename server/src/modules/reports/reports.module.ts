import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../../entities/session.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session])],
  controllers: [ReportsController],
  providers: [ReportsService],
  // Klub egasining Telegram hisoboti xuddi shu raqamlardan foydalanadi
  exports: [ReportsService],
})
export class ReportsModule {}
