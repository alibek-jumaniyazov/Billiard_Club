import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { SessionsModule } from '../sessions/sessions.module';
import { OwnerAlertsService } from './owner-alerts.service';
import { OwnerReportService } from './owner-report.service';
import { OwnerTelegramController, OwnerTelegramWebhookController } from './owner-telegram.controller';
import { OwnerTelegramService } from './owner-telegram.service';

/**
 * Klub egasi uchun Telegram bot: kunlik hisobot, buyruqlar (/bugun, /hozir...) va
 * darhol xabarlar. Boshqa modullar bu modulni IMPORT QILMAYDI — darhol xabarlar
 * global audit jurnalidan kuzatiladi (aylanma bog'liqlik bo'lmaydi).
 */
@Module({
  imports: [ReportsModule, SessionsModule],
  controllers: [OwnerTelegramController, OwnerTelegramWebhookController],
  providers: [OwnerReportService, OwnerTelegramService, OwnerAlertsService],
  exports: [OwnerTelegramService],
})
export class OwnerTelegramModule {}
