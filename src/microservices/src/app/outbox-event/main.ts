import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { OutboxWorkerModule } from './outbox-worker.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(OutboxWorkerModule);

  Logger.log('outbox is listening...', 'Bootstrap');
}
bootstrap();
