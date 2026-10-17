import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { appConfig, validateEnv } from '@/shared/config';
import { DatabaseModule } from '@/database/database.module';
import { MICROSERVICE_CLIENTS } from '@/microservices/src/shared/injected-tokens';
import { OutboxEvent } from '@/shared/outbox/model/outbox-event.entity';
import { OutboxPublisherService } from '@/shared/outbox/service/outbox-publisher.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    TypeOrmModule.forFeature([OutboxEvent]),
    ClientsModule.registerAsync([
      {
        name: MICROSERVICE_CLIENTS.MAIL,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'outbox-worker',
              brokers: config.getOrThrow<string[]>('kafka.brokers'),
            },
            producerOnlyMode: true,
          },
        }),
      },
    ]),
  ],
  providers: [OutboxPublisherService],
})
export class OutboxWorkerModule {}
