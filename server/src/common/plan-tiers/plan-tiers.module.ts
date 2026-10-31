import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformSetting } from '../../entities/platform-setting.entity';
import { PlanTiersService } from './plan-tiers.service';

/**
 * Global — tarif imkoniyatlarini SubscriptionGuard (har so'rov), stol/xodim
 * qo'shish, sessiya yakunlash, chiroq avtomatikasi va /auth/me o'qiydi.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting])],
  providers: [PlanTiersService],
  exports: [PlanTiersService],
})
export class PlanTiersModule {}
