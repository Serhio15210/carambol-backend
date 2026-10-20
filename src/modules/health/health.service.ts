import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type HealthStatus = {
  status: 'ok';
  database: 'up' | 'down';
  timestamp: string;
};

// @Injectable() говорит Nest: «этот класс можно создавать и внедрять в другие классы».
// Сам класс ничего не знает о HTTP: только логика проверки.
@Injectable()
export class HealthService {
  // DataSource — подключение к БД от TypeORM. Мы его не создаём,
  // Nest передаёт его в конструктор сам (Dependency Injection).
  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<HealthStatus> {
    return {
      status: 'ok',
      database: await this.checkDatabase(),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }
}
