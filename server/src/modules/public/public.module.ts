import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from '../../entities/plan.entity';
import { User } from '../../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { OwnerTelegramModule } from '../owner-telegram/owner-telegram.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { TrialVerificationService } from './trial-verification.service';

@Module({
  // OwnerTelegramModule: umumiy botda ro'yxatdan o'tgan egasi avtomatik ulanadi va
  // webhook yangilanishlari egasi xizmati bilan taqsimlanadi
  imports: [TypeOrmModule.forFeature([User, Plan]), AuthModule, OwnerTelegramModule],
  controllers: [PublicController],
  providers: [PublicService, TrialVerificationService],
})
export class PublicModule {}
