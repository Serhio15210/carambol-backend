import { Module } from '@nestjs/common';
import { JobLockService } from './job-lock.service';

// Shared by every feature that has background jobs. DataSource comes from the global TypeORM module.
@Module({
  providers: [JobLockService],
  exports: [JobLockService],
})
export class JobsModule {}
