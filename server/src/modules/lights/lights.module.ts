import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClubBridge } from '../../entities/club-bridge.entity';
import { Settings } from '../../entities/settings.entity';
import { Table } from '../../entities/table.entity';
import { BridgeController } from './bridge.controller';
import { LightsController } from './lights.controller';
import { LightsService } from './lights.service';

/**
 * Stol chiroqlarini boshqarish moduli (opt-in, standart rejim 'off').
 * LightsController — klub paneli (JWT + rollar);
 * BridgeController — klubdagi lokal agent protokoli (X-Bridge-Token).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Table, Settings, ClubBridge])],
  controllers: [LightsController, BridgeController],
  providers: [LightsService],
  exports: [LightsService],
})
export class LightsModule {}
