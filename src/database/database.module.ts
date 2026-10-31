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
        // The schema changes ONLY through migrations (src/database/migrations), in every environment:
        // synchronize can drop columns with data and leaves no history to review or roll back.
        synchronize: false,
        logging: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
