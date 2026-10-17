import { Injectable } from '@nestjs/common';
import { HealthRepository } from '@/entities/health/repository/health.repository';
import { HealthResponseDto } from '@/entities/health/dto/health-response.dto';

@Injectable()
export class HealthService {
  constructor(private readonly healthRepository: HealthRepository) {}

  getStatus(): HealthResponseDto {
    const status = this.healthRepository.getStatus();
    return {
      service: status.service,
      status: status.status,
      timestamp: status.timestamp,
    };
  }
}
