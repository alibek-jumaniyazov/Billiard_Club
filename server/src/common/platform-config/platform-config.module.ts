import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformSetting } from '../../entities/platform-setting.entity';
import { PlatformConfigService } from './platform-config.service';

/**
 * Global — sozlamani ro'yxatdan o'tish, klub yaratish, cron va ommaviy
 * endpointlar o'qiydi. Har birida modulni import qilib yurmaslik uchun
 * (AuditModule / LicenseModule bilan bir xil naqsh).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting])],
  providers: [PlatformConfigService],
  exports: [PlatformConfigService],
})
export class PlatformConfigModule {}
