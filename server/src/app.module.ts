import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database/data-source';
import { envValidationSchema } from './config/env.validation';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    TypeOrmModule.forFeature([Club]),
    // Umumiy limit: 15 daqiqada 500 so'rov (login uchun alohida qattiqroq limit bor)
    ThrottlerModule.forRoot([{ ttl: 15 * 60 * 1000, limit: 500 }]),
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
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Guard tartibi muhim: throttle -> auth -> rol -> obuna
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class AppModule {}
