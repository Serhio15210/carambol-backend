import { Controller, Get } from '@nestjs/common';
import { HealthService } from '@/entities/health/service/health.service';
import { HealthResponseDto } from '@/entities/health/dto/health-response.dto';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthResponseDto {
    return this.healthService.getStatus();
  }
}
