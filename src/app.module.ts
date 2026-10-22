import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { configuration } from '@/config/configuration';
import { validateEnv } from '@/config/env.validation';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseExceptionFilter } from '@/common/filters/database-exception.filter';
import { HealthModule } from '@/modules/health/health.module';
import { UsersModule } from '@/modules/users/users.module';
import { AuthModule } from '@/modules/auth/auth.module';
const unused = 1;
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
  ],
  providers: [{ provide: APP_FILTER, useClass: DatabaseExceptionFilter }],
})
export class AppModule {}
