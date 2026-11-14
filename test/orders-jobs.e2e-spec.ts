import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { JOB_LOCK_KEYS, JobLockService } from '@/common/jobs/job-lock.service';
import { Order } from '@/modules/orders/entities/order.entity';
import { OrdersJobs } from '@/modules/orders/orders.jobs';
import { OrdersService } from '@/modules/orders/orders.service';
import { OrderStatus } from '@/modules/orders/types/order-status.enum';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

type Created = { id: string };

const HOUR = 3_600_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The background jobs against a real PostgreSQL. The cron itself is switched off in the tests
// (SCHEDULER_ENABLED=false), so a tick never changes data in the middle of a test: the tests call
// the job methods directly, and "two copies of the application" are two calls at the same moment.
describe('Orders: background jobs (e2e)', () => {
  let app: INestApplication;
  let orders: Repository<Order>;
  let service: OrdersService;
  let locks: JobLockService;
  let jobs: OrdersJobs;
  let userId: string;
  let tableId: string;

  // One hour long, two hours apart: never overlapping, so the exclusion constraint stays quiet.
  const seed = (
    count: number,
    from: 'past' | 'future',
    status = OrderStatus.RESERVED,
    offset = 0,
  ) => {
    const base = Date.now() + (from === 'past' ? -20 : 20) * 24 * HOUR;
    return orders.insert(
      Array.from({ length: count }, (_, i) => ({
        userId,
        tableId,
        status,
        startsAt: new Date(base + (offset + i) * 2 * HOUR),
        endsAt: new Date(base + (offset + i) * 2 * HOUR + HOUR),
      })),
    );
  };
  const countByStatus = async (status: OrderStatus) => orders.countBy({ status });

  beforeAll(async () => {
    app = await createTestApp();
    orders = app.get(DataSource).getRepository(Order);
    service = app.get(OrdersService);
    locks = app.get(JobLockService);
    jobs = app.get(OrdersJobs);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    const admin = await loginAsSuperadmin(app);
    userId = (await registerUser(app)).user.id;
    const post = async (url: string, body: object) =>
      (await api(app).post(url).set('Authorization', `Bearer ${admin}`).send(body).expect(201))
        .body as Created;
    const club = await post('/api/v1/admin/clubs', {
      name: 'Carambol',
      address: 'Kyiv',
      lat: 50.45,
      lng: 30.52,
    });
    const room = await post(`/api/v1/admin/clubs/${club.id}/rooms`, {
      name: 'Main hall',
      widthCm: 3000,
      lengthCm: 3000,
    });
    tableId = (
      await post('/api/v1/admin/tables', {
        roomId: room.id,
        number: 1,
        type: 'pool',
        lengthCm: 300,
        widthCm: 150,
        x: 500,
        y: 500,
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('finishing the past orders', () => {
    it('finishes only the reserved orders that are over: cancelled, finished and future ones stay', async () => {
      await seed(3, 'past'); // reserved, over: must become finished
      await seed(1, 'past', OrderStatus.CANCELLED, 10);
      await seed(1, 'past', OrderStatus.FINISHED, 20);
      await seed(1, 'future'); // reserved, still ahead

      const finished = await service.finishPastOrders();

      expect(finished).toBe(3);
      expect(await countByStatus(OrderStatus.FINISHED)).toBe(4); // the 3 new ones and the old one
      expect(await countByStatus(OrderStatus.CANCELLED)).toBe(1);
      expect(await countByStatus(OrderStatus.RESERVED)).toBe(1);
    });

    it('is idempotent: the second run finds nothing left', async () => {
      await seed(3, 'past');

      expect(await service.finishPastOrders()).toBe(3);
      expect(await service.finishPastOrders()).toBe(0);
    });

    it('two runs at the very same moment (two copies of the application) finish every order exactly once', async () => {
      await seed(40, 'past');

      const [first, second] = await Promise.all([
        service.finishPastOrders(),
        service.finishPastOrders(),
      ]);

      expect(first + second).toBe(40); // never 80
      expect(await countByStatus(OrderStatus.FINISHED)).toBe(40);
    });

    it('a booking that ends exactly now is over (the boundary is inclusive)', async () => {
      const now = new Date('2030-01-07T10:00:00Z');
      await orders.insert({
        userId,
        tableId,
        startsAt: new Date('2030-01-07T09:00:00Z'),
        endsAt: now,
      });

      expect(await service.finishPastOrders(new Date(now.getTime() - 1))).toBe(0);
      expect(await service.finishPastOrders(now)).toBe(1);
    });
  });

  describe('the lock that lets only one copy of the application run a job', () => {
    const KEY = JOB_LOCK_KEYS.finishPastOrders;
    const slowWork = async () => {
      await sleep(400);
      return 'done';
    };

    it('of two simultaneous runs exactly one works, the other skips at once', async () => {
      const [first, second] = await Promise.all([
        locks.runExclusive(KEY, slowWork),
        locks.runExclusive(KEY, slowWork),
      ]);

      expect([first.ran, second.ran].sort()).toEqual([false, true]);
    });

    it('the lock is released afterwards, also when the work fails', async () => {
      await expect(
        locks.runExclusive(KEY, () => Promise.reject(new Error('boom'))),
      ).rejects.toThrow('boom');

      expect(await locks.runExclusive(KEY, () => Promise.resolve('again'))).toEqual({
        ran: true,
        result: 'again',
      });
    });

    it('jobs with different keys do not block each other', async () => {
      const [first, second] = await Promise.all([
        locks.runExclusive(KEY, slowWork),
        locks.runExclusive(KEY + 1, slowWork),
      ]);

      expect([first.ran, second.ran]).toEqual([true, true]);
    });

    it('the job of the orders skips its tick while another copy holds the lock, and works afterwards', async () => {
      await seed(2, 'past');
      const otherCopy = locks.runExclusive(KEY, slowWork); // holds the lock for 400 ms
      await sleep(100);

      await jobs.finishPastOrders(); // skipped: the lock is taken
      expect(await countByStatus(OrderStatus.FINISHED)).toBe(0);

      await otherCopy;
      await jobs.finishPastOrders();
      expect(await countByStatus(OrderStatus.FINISHED)).toBe(2);
    });
  });

  describe('the schedule', () => {
    it('the cron job is registered under its name', () => {
      expect(app.get(SchedulerRegistry).getCronJob('finish-past-orders')).toBeDefined();
    });

    it('with SCHEDULER_ENABLED=false (as in the tests) a tick changes nothing', async () => {
      await seed(2, 'past');

      await jobs.tick();

      expect(await countByStatus(OrderStatus.FINISHED)).toBe(0);
    });
  });
});
