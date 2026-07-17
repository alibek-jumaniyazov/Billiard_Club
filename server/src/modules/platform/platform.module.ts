import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { PlatformSetting } from '../../entities/platform-setting.entity';
import { Session } from '../../entities/session.entity';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Session, PlatformSetting])],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
