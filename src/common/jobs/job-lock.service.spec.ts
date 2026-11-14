import { DataSource } from 'typeorm';
import { JobLockService } from './job-lock.service';

// A tiny imitation of the database: the callback of the transaction runs at once, and the "manager"
// only answers the lock query ("locked: true" means the lock was granted to us).
function setup(lockGranted: boolean) {
  const calls: string[] = [];
  const query = jest.fn((_sql: string, _params?: unknown[]) => {
    calls.push('lock query');
    return Promise.resolve([{ locked: lockGranted }]);
  });
  const transaction = jest.fn(<T>(callback: (manager: { query: typeof query }) => Promise<T>) =>
    callback({ query }),
  );
  const service = new JobLockService({ transaction } as unknown as DataSource);
  const work = jest.fn(() => {
    calls.push('work');
    return Promise.resolve('done');
  });
  return { service, query, transaction, work, calls };
}

describe('JobLockService.runExclusive (your part)', () => {
  it('runs the work and returns its result when the lock is granted', async () => {
    const { service, work } = setup(true);

    const outcome = await service.runExclusive(7, work);

    expect(outcome).toEqual({ ran: true, result: 'done' });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('asks for the lock of the given key inside ONE transaction, and before the work starts', async () => {
    const { service, query, transaction, work, calls } = setup(true);

    await service.runExclusive(7, work);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_xact_lock'), [7]);
    expect(calls).toEqual(['lock query', 'work']);
  });

  it('does not run the work (and does not wait) when somebody else holds the lock', async () => {
    const { service, work } = setup(false);

    const outcome = await service.runExclusive(7, work);

    expect(outcome).toEqual({ ran: false });
    expect(work).not.toHaveBeenCalled();
  });

  it('an error in the work reaches the caller (the transaction rolls back and the lock goes with it)', async () => {
    const { service } = setup(true);

    await expect(service.runExclusive(7, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
  });
});
