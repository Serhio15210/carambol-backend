import { Injectable } from '@nestjs/common';
import { HealthStatusModel } from '@/entities/health/model/health-status.model';

@Injectable()
export class HealthRepository {
  getStatus(): HealthStatusModel {
    return new HealthStatusModel('carambol-backend', 'ok', new Date().toISOString());
  }
}
