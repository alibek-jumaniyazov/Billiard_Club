import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from '../../entities/lead.entity';
import { LeadsAdminController, LeadsPublicController } from './leads.controller';
import { LeadsService } from './leads.service';

/** Landing arizalari: ommaviy forma + superadmin ro'yxati (TelegramModule global) */
@Module({
  imports: [TypeOrmModule.forFeature([Lead])],
  controllers: [LeadsPublicController, LeadsAdminController],
  providers: [LeadsService],
})
export class LeadsModule {}
