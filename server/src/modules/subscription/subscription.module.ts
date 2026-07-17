import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Club } from '../../entities/club.entity';
import { Coupon } from '../../entities/coupon.entity';
import { Invoice } from '../../entities/invoice.entity';
import { Plan } from '../../entities/plan.entity';
import { PlatformSetting } from '../../entities/platform-setting.entity';
import { ClubsModule } from '../clubs/clubs.module';
import { AdminBillingController } from './admin-billing.controller';
import { AdminBillingService } from './admin-billing.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionCronService } from './subscription-cron.service';
import { SubscriptionService } from './subscription.service';

/**
 * Obuna savdosi moduli:
 *  - klub egasi uchun /subscription (holat, tariflar, sotib olish, fakturalar);
 *  - superadmin uchun /admin/plans, /admin/coupons, /admin/invoices;
 *  - kunlik cron (muddati tugaganlarni belgilash, eski fakturalarni yopish,
 *    tugash eslatmalari).
 * Eslatma: cron ishlashi uchun app.module da ScheduleModule.forRoot()
 * ro'yxatdan o'tgan bo'lishi kerak.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Club, Plan, Invoice, Coupon, PlatformSetting]),
    ClubsModule,
  ],
  controllers: [SubscriptionController, AdminBillingController],
  providers: [SubscriptionService, AdminBillingService, SubscriptionCronService],
})
export class SubscriptionModule {}
