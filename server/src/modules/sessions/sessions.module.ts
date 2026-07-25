import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../../entities/session.entity';
import { SessionSegment } from '../../entities/session-segment.entity';
import { LightsModule } from '../lights/lights.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

// LightsModule — chiroqni sessiya amallaridan keyin moslashtirish uchun
// (fire-and-forget: chiroq xatosi sessiya oqimiga umuman ta'sir qilmaydi)
@Module({
  imports: [TypeOrmModule.forFeature([Session, SessionSegment]), LightsModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
