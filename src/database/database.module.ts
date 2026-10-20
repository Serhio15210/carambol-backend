import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    // forRootAsync: настройки подключения берутся из ConfigService,
    // поэтому модуль ждёт, пока ConfigModule прочитает .env.
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('database.url'),
        // Сущности регистрируются автоматически: каждый модуль
        // подключает свои через TypeOrmModule.forFeature([...]).
        autoLoadEntities: true,
        // В разработке TypeORM сам подгоняет таблицы под сущности.
        // В продакшене так нельзя (можно потерять данные), там будут миграции.
        synchronize: config.get<string>('app.nodeEnv') === 'development',
        logging: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
