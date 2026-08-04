import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database/data-source';
import { envValidationSchema } from './config/env.validation';
import { AuditModule } from './common/audit/audit.module';
import { OfflineAuditInterceptor } from './common/audit/offline-audit.interceptor';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { LicenseModule } from './common/license/license.module';
import { PlatformConfigModule } from './common/platform-config/platform-config.module';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { Club } from './entities/club.entity';
import { AppController } from './app.controller';
import { TelegramModule } from './telegram/telegram.module';
import { AuthModule } from './modules/auth/auth.module';
import { PublicModule } from './modules/public/public.module';
import { ClubsModule } from './modules/clubs/clubs.module';
import { TablesModule } from './modules/tables/tables.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DebtsModule } from './modules/debts/debts.module';
import { StaffModule } from './modules/staff/staff.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PlatformModule } from './modules/platform/platform.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { LightsModule } from './modules/lights/lights.module';
import { ReleasesModule } from './modules/releases/releases.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    // retry: elektr uzilib qayta kelganda Postgres recovery bir necha daqiqa
    // cho'zilishi mumkin. Standart 10 x 3 s (30 s) yetmay server o'lib qolardi
    // va uni QO'LDA qayta ishga tushirish kerak bo'lardi — 30 x 3 s (90 s)
    // bilan server DB ni sabr bilan kutadi.
    TypeOrmModule.forRoot({ ...dataSourceOptions, retryAttempts: 30, retryDelay: 3000 }),
    TypeOrmModule.forFeature([Club]),
    // Umumiy limit: 15 daqiqada 500 so'rov (login uchun alohida qattiqroq limit bor)
    ThrottlerModule.forRoot([{ ttl: 15 * 60 * 1000, limit: 500 }]),
    // Cron ishlar (obuna muddati, eslatmalar) uchun
    ScheduleModule.forRoot(),
    AuditModule,
    IdempotencyModule,
    LicenseModule,
    PlatformConfigModule,
    TelegramModule,
    AuthModule,
    PublicModule,
    ClubsModule,
    TablesModule,
    SessionsModule,
    CatalogModule,
    OrdersModule,
    DebtsModule,
    StaffModule,
    SettingsModule,
    DashboardModule,
    ReportsModule,
    SubscriptionModule,
    FeedbackModule,
    NotificationsModule,
    PlatformModule,
    CustomersModule,
    ExpensesModule,
    ReservationsModule,
    LightsModule,
    ReleasesModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Guard tartibi muhim: throttle -> auth -> rol -> obuna
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    // Idempotentlik: guardlardan KEYIN ishlaydi (req.user tayyor bo'ladi) va
    // faqat `Idempotency-Key` sarlavhasi bor mutatsiyalarga tegadi.
    // useExisting — nusxa IdempotencyModule kontekstida yaratiladi
    // (repozitoriysi o'sha yerda ro'yxatdan o'tgan).
    { provide: APP_INTERCEPTOR, useExisting: IdempotencyInterceptor },
    // Oflayn navbatdan kelgan amallarni jurnalga yozadi (X-Offline-Origin).
    // Idempotentlikdan KEYIN: saqlangan javob qaytarilgan takroriy so'rov
    // handler'ga yetib bormaydi va bejiz ikkinchi marta yozilmaydi.
    { provide: APP_INTERCEPTOR, useExisting: OfflineAuditInterceptor },
  ],
})
export class AppModule {}
