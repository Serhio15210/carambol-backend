import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';

// Точка входа. Аналог в Express:
//   const app = express(); app.use(express.json()); app.listen(3000);
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Все маршруты начинаются с /api: /api/auth/login, /api/users/me ...
  app.setGlobalPrefix('api');

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

  const port = app.get(ConfigService).getOrThrow<number>('app.port');
  await app.listen(port);
  Logger.log(`API is running on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
