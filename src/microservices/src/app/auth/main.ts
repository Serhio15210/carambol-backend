import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { microserviceTCPConfig } from '@/shared/config/microserviceConfig';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AuthMicroserviceModule } from '@/microservices/src/app/auth/auth-microservice.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthMicroserviceModule,
    microserviceTCPConfig,
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
