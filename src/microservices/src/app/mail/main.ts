import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { Logger, ValidationPipe } from '@nestjs/common';
import { MailMicroserviceModule } from '@/microservices/src/app/mail/mail-microservice.module';
import { mailKafkaMicroserviceConfig } from '@/shared/config/microserviceConfig';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    MailMicroserviceModule,
    mailKafkaMicroserviceConfig,
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen();
  Logger.log('Microservice is listening...', 'Bootstrap');
}
bootstrap();
