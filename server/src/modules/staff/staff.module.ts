import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshSession } from '../../entities/refresh-session.entity';
import { User } from '../../entities/user.entity';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

// RefreshSession — admin parolni tiklaganda o'sha xodimning refresh
// seanslari ham bekor qilinishi uchun (o'lik qurilmalar ro'yxatda qolmasin)
@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshSession])],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
