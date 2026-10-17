import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';

config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [join(__dirname, '../**/*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
});
