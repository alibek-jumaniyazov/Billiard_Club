import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { Club } from '../../entities/club.entity';
import { Debt } from '../../entities/debt.entity';
import { Order } from '../../entities/order.entity';
import { PlatformSetting } from '../../entities/platform-setting.entity';
import { Session } from '../../entities/session.entity';
import { User } from '../../entities/user.entity';
import { ClubDataController } from './club-data.controller';
import { ClubDataService } from './club-data.service';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, Session, PlatformSetting, Club, Order, Debt, User]),
  ],
  // Tartib MUHIM: `admin/platform/clubs/:clubId/...` yo'llari
  // `admin/platform/...` yo'llaridan oldin ro'yxatdan o'tishi kerak emas —
  // ular bir-biriga to'qnashmaydi (prefikslar aniq), lekin aniqroq
  // kontroller birinchi turgani o'qishni osonlashtiradi.
  controllers: [ClubDataController, PlatformController],
  providers: [PlatformService, ClubDataService],
})
export class PlatformModule {}
