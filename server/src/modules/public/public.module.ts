import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from '../../entities/plan.entity';
import { User } from '../../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Plan]), AuthModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
