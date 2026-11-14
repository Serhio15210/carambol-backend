import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { configuration } from '@/config/configuration';
import { validateEnv } from '@/config/env.validation';
import { DatabaseModule } from '@/database/database.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { HealthModule } from '@/modules/health/health.module';
import { UsersModule } from '@/modules/users/users.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { BilliardTablesModule } from '@/modules/tables/billiard-tables.module';
import { ClubsModule } from '@/modules/clubs/clubs.module';
import { OrdersModule } from '@/modules/orders/orders.module';

// Корневой модуль: собирает инфраструктуру (конфиг, БД) и все фича-модули.
// Новый модуль (например, Tables) подключается одной строкой в imports.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    DatabaseModule,
    // Starts the timers of every @Cron method in the application.
    ScheduleModule.forRoot(),
    HealthModule,
    UsersModule,
    ClubsModule,
    BilliardTablesModule,
    OrdersModule,
    AuthModule,
    AuditModule,
  ],
  providers: [
    // Регистрируем фильтр глобально: он работает для всех контроллеров.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
