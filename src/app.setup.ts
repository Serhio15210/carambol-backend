import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';

// Everything the app needs on top of its modules. main.ts and the e2e tests both call this,
// so the tests exercise the same routes, versions and validation as production.
export function configureApp(app: INestApplication): void {
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
}
