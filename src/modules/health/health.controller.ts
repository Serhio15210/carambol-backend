import { Controller, Get } from '@nestjs/common';
import { HealthService } from '@/modules/health/health.service';

// Контроллер отвечает только за HTTP: какой URL, какой метод, что вернуть.
// Логика проверки живёт в HealthService.
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check() {
    return this.healthService.check();
  }
}
