import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Club } from '../../entities/club.entity';
import { ClubNotification } from '../../entities/club-notification.entity';
import { NotificationsAdminController } from './notifications-admin.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClubNotification, Club])],
  controllers: [NotificationsController, NotificationsAdminController],
  providers: [NotificationsService],
  // Kelajakdagi ishlab chiqaruvchilar xom repozitoriyni inject qilish o'rniga
  // shu servisdan foydalansin (feedback moduli hozircha repozitoriyni oladi)
  exports: [NotificationsService],
})
export class NotificationsModule {}
