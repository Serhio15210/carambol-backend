import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { configuration } from '@/config/configuration';
import { validateEnv } from '@/config/env.validation';
import { DatabaseModule } from '@/database/database.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { HealthModule } from '@/modules/health/health.module';
import { UsersModule } from '@/modules/users/users.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { AuditModule } from '@/modules/audit/audit.module';

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
    HealthModule,
    UsersModule,
    AuthModule,
    AuditModule,
  ],
  providers: [
    // Регистрируем фильтр глобально: он работает для всех контроллеров.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
