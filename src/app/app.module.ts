import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig, validateEnv } from '@/shared/config';
import { AppController } from '@/app/app.controller';
import { HealthModule } from '@/entities/health/health.module';
import { UsersModule } from '@/entities/users/users.module';
import { DatabaseModule } from '@/database/database.module';
import { ClientsModule } from '@nestjs/microservices';
import { authServiceClientOptions } from '@/shared/config/microserviceConfig';
import { AuthModule } from '@/entities/auth/auth.module';
import { TablesModule } from '@/entities/tables/tables.module';
import { TariffsModule } from '@/entities/tariffs/tariffs.module';
import { OrdersModule } from '@/entities/orders/orders.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    ClientsModule.register([authServiceClientOptions]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    HealthModule,
    UsersModule,
    AuthModule,
    TablesModule,
    TariffsModule,
    OrdersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
