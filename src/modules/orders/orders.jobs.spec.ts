import { ConfigService } from '@nestjs/config';
import { JOB_LOCK_KEYS, JobLockService } from '@/common/jobs/job-lock.service';
import { OrdersJobs } from './orders.jobs';
import { OrdersService } from './orders.service';

function setup({ enabled, lockGranted }: { enabled: boolean; lockGranted: boolean }) {
  const config = { getOrThrow: jest.fn().mockReturnValue(enabled) };
  const orders = { finishPastOrders: jest.fn().mockResolvedValue(3) };
  const locks = {
    runExclusive: jest.fn(async (_key: number, work: () => Promise<number>) =>
      lockGranted ? { ran: true, result: await work() } : { ran: false },
    ),
  };
  const jobs = new OrdersJobs(
    orders as unknown as OrdersService,
    locks as unknown as JobLockService,
    config as unknown as ConfigService,
  );
  return { jobs, orders, locks };
}

describe('OrdersJobs', () => {
  it('a tick goes through the lock of its own job and finishes the past orders', async () => {
    const { jobs, orders, locks } = setup({ enabled: true, lockGranted: true });

    await jobs.tick();

    expect(locks.runExclusive).toHaveBeenCalledWith(
      JOB_LOCK_KEYS.finishPastOrders,
      expect.any(Function),
    );
    expect(orders.finishPastOrders).toHaveBeenCalledTimes(1);
  });

  it('when another copy of the application holds the lock the tick is skipped quietly', async () => {
    const { jobs, orders } = setup({ enabled: true, lockGranted: false });

    await expect(jobs.tick()).resolves.toBeUndefined();

    expect(orders.finishPastOrders).not.toHaveBeenCalled();
  });

  it('with SCHEDULER_ENABLED=false a tick does nothing, not even asking for the lock', async () => {
    const { jobs, orders, locks } = setup({ enabled: false, lockGranted: true });

    await jobs.tick();

    expect(locks.runExclusive).not.toHaveBeenCalled();
    expect(orders.finishPastOrders).not.toHaveBeenCalled();
  });

  it('finishPastOrders (without the clock and the switch) passes its "now" on', async () => {
    const { jobs, orders } = setup({ enabled: false, lockGranted: true });
    const now = new Date('2030-01-07T10:00:00Z');

    await jobs.finishPastOrders(now);

    expect(orders.finishPastOrders).toHaveBeenCalledWith(now);
  });
});
