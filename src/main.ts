import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '@/app.module';

// Точка входа. Аналог в Express:
//   const app = express(); app.use(express.json()); app.listen(3000);
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Все маршруты начинаются с /api: /api/auth/login, /api/users/me ...
  app.setGlobalPrefix('api');
  // URI versioning: every route gets /v1 (/api/v1/users/me) unless it is VERSION_NEUTRAL.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Глобальная валидация входящих данных по DTO-классам.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // удалить из body поля, которых нет в DTO
      forbidNonWhitelisted: true, // ...или вернуть 400, если такие поля пришли
      transform: true, // превратить plain JSON в экземпляр DTO-класса
    }),
  );

  // При остановке (Ctrl+C, docker stop) Nest корректно закроет соединения с БД.
  app.enableShutdownHooks();

  // OpenAPI docs: built AFTER the prefix and versioning, so the paths include /api/v1.
  // UI at /api/docs, raw spec at /api/docs-json. Real requests against the real database!
  // shortcut: docs are always on, hide or protect them in production (lesson 27).
  const docsConfig = new DocumentBuilder()
    .setTitle('Carambol API')
    .setDescription('Admin panel API for billiard clubs')
    .setVersion('1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, docsConfig), {
    swaggerOptions: { persistAuthorization: true }, // keep the token after a page reload
  });

  const port = app.get(ConfigService).getOrThrow<number>('app.port');
  await app.listen(port);
  Logger.log(`API is running on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
