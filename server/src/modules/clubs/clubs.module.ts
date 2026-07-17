import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Club } from '../../entities/club.entity';
import { User } from '../../entities/user.entity';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Club, User])],
  controllers: [ClubsController],
  providers: [ClubsService],
})
export class ClubsModule {}
