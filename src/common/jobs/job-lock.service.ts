import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

// One number per job. PostgreSQL advisory locks are keyed by a number that only our code gives
// meaning to: two jobs must never share a key, otherwise they would block each other.
export const JOB_LOCK_KEYS = { finishPastOrders: 18_001 } as const;

export type LockOutcome<T> = { ran: true; result: T } | { ran: false };

@Injectable()
export class JobLockService {
  constructor(private readonly dataSource: DataSource) {}

  // Why it exists: the same job runs in EVERY copy of the application (every copy has its own cron),
  // so at the same second three copies would start it three times. For a job with side effects (an
  // email, a payment) that means three emails. This makes sure only ONE copy works: the others get
  // { ran: false } at once and skip the tick.
  // It asks PostgreSQL for the lock inside a transaction ("try": it never waits). The "xact" variant
  // is released by itself at COMMIT or ROLLBACK, also when the work throws; a session-level lock
  // would stay on a pooled connection and block the job for ever.
  async runExclusive<T>(key: number, work: () => Promise<T>): Promise<LockOutcome<T>> {
    return await this.dataSource.transaction(async (manager) => {
      const rows: { locked: boolean }[] = await manager.query(
        'SELECT pg_try_advisory_xact_lock($1) AS locked',
        [key],
      );
      if (rows && rows[0]?.locked) {
        const result = await work();
        return { ran: true, result };
      } else {
        return { ran: false };
      }
    });
  }
}
