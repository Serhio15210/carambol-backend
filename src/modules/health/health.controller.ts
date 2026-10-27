import { ApiTags } from '@nestjs/swagger';
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthService } from '@/modules/health/health.service';

// Контроллер отвечает только за HTTP: какой URL, какой метод, что вернуть.
// Логика проверки живёт в HealthService.
@ApiTags('health')
// VERSION_NEUTRAL: Docker and load balancers probe a fixed URL (/api/health), not an API version.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check() {
    return this.healthService.check();
  }
}
