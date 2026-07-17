import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
