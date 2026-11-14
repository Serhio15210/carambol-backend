import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JOB_LOCK_KEYS, JobLockService } from '@/common/jobs/job-lock.service';
import { OrdersService } from './orders.service';

// The background jobs of the orders. Every copy of the application has this class and its own cron,
// so a job always goes through JobLockService: only one copy works, the rest skip the tick.
@Injectable()
export class OrdersJobs {
  private readonly logger = new Logger(OrdersJobs.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly locks: JobLockService,
    private readonly config: ConfigService,
  ) {}

  // Nest calls this by the clock. waitForCompletion: if a run is still going when the next minute
  // arrives, that tick is skipped (inside ONE copy; between copies the lock does the same).
  @Cron(CronExpression.EVERY_MINUTE, { name: 'finish-past-orders', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.config.getOrThrow<boolean>('scheduler.enabled')) {
      return;
    }
    await this.finishPastOrders();
  }

  // The job itself, without the clock and the switch: tests and a manual run call it directly.
  async finishPastOrders(now = new Date()): Promise<void> {
    const outcome = await this.locks.runExclusive(JOB_LOCK_KEYS.finishPastOrders, () =>
      this.orders.finishPastOrders(now),
    );
    if (!outcome.ran) {
      this.logger.debug('finishPastOrders skipped: another copy of the application is running it');
    } else if (outcome.result > 0) {
      this.logger.log(`Finished ${outcome.result} past order(s)`);
    }
  }
}
