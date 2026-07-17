import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformSetting } from '../entities/platform-setting.entity';
import { TelegramService } from './telegram.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting])],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
