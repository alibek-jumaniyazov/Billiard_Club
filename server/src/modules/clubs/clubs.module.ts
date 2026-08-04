import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Club } from '../../entities/club.entity';
import { RefreshSession } from '../../entities/refresh-session.entity';
import { User } from '../../entities/user.entity';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Club, RefreshSession, User])],
  controllers: [ClubsController],
  providers: [ClubsService],
  // SubscriptionModule shartnoma yaratish yo'lini qayta ishlatadi
  exports: [ClubsService],
})
export class ClubsModule {}
