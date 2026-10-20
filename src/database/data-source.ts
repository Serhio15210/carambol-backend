// Отдельное подключение для TypeORM CLI (команды migration:generate / migration:run).
// CLI запускается без Nest, поэтому ConfigService ему недоступен: .env читаем через dotenv.
import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';

config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  entities: [join(__dirname, '../modules/**/*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
});
