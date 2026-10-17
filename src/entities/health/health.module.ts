import { Module } from '@nestjs/common';
import { HealthController } from '@/entities/health/controller/health.controller';
import { HealthService } from '@/entities/health/service/health.service';
import { HealthRepository } from '@/entities/health/repository/health.repository';

@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthRepository],
  exports: [HealthService],
})
export class HealthModule {}
