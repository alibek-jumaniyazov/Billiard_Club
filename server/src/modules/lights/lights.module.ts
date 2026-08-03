import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClubBridge } from '../../entities/club-bridge.entity';
import { Settings } from '../../entities/settings.entity';
import { Table } from '../../entities/table.entity';
import { TableLightEvent } from '../../entities/table-light-event.entity';
import { BridgeController } from './bridge.controller';
import { LightsController } from './lights.controller';
import { LightsService } from './lights.service';

/**
 * Stol chiroqlarini boshqarish moduli (opt-in, standart rejim 'off').
 * LightsController — klub paneli (JWT + rollar);
 * BridgeController — klubdagi lokal agent protokoli (X-Bridge-Token).
 *
 * `TableLightEvent` — diagnostika jurnali ("nega chiroq yonmadi?"); u faqat shu
 * modul ichida yoziladi va o'qiladi, kunlik cron 30 kundan eski yozuvlarni
 * tozalaydi (LightsService.cleanupEvents).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Table, Settings, ClubBridge, TableLightEvent])],
  controllers: [LightsController, BridgeController],
  providers: [LightsService],
  exports: [LightsService],
})
export class LightsModule {}
