import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { Order } from '@/modules/orders/entities/order.entity';
import { OrdersService } from '@/modules/orders/orders.service';
import { PaymentStatus } from '@/modules/orders/payments/payment-status.enum';
import { Payment } from '@/modules/orders/payments/payment.entity';
import { OrderStatus } from '@/modules/orders/types/order-status.enum';
import { FakePaymentGateway } from './utils/fake-payment-gateway';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

type Created = { id: string };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// The cron job that cancels unpaid bookings, against a real PostgreSQL. The clock is switched off in
// the tests: they call OrdersService.cancelExpiredUnpaid(now) directly with the "now" they want.
describe('Payments: unpaid bookings expire (e2e)', () => {
  let app: INestApplication;
  let gateway: FakePaymentGateway;
  let service: OrdersService;
  let payments: Repository<Payment>;
  let orders: Repository<Order>;
  let userId: string;
  let tableId: string;
  let slot = 0; // every seeded booking gets its own time: the exclusion constraint stays quiet

  const NOW = new Date();

  // A payment with `orderCount` bookings. `expiresAt` is relative to NOW (negative = already over).
  const seed = async ({
    status = PaymentStatus.PENDING,
    orderStatus = OrderStatus.PENDING,
    expiresInMinutes = -1,
    orderCount = 2,
    intentId = `pi_${slot}`,
  } = {}) => {
    const payment = await payments.save(
      payments.create({
        userId,
        amountCents: 1000 * orderCount,
        currency: 'usd',
        status,
        stripePaymentIntentId: intentId,
        expiresAt: new Date(NOW.getTime() + expiresInMinutes * MINUTE),
      }),
    );
    const base = NOW.getTime() + 20 * 24 * HOUR;
    for (let i = 0; i < orderCount; i++) {
      slot += 1;
      await orders.insert({
        userId,
        tableId,
        paymentId: payment.id,
        status: orderStatus,
        priceCents: 1000,
        startsAt: new Date(base + slot * 2 * HOUR),
        endsAt: new Date(base + slot * 2 * HOUR + HOUR),
      });
    }
    return payment;
  };
  const statusOf = async (id: string) => (await payments.findOneByOrFail({ id })).status;
  const orderStatuses = async (paymentId: string) =>
    (await orders.findBy({ paymentId })).map((order) => order.status);

  beforeAll(async () => {
    gateway = new FakePaymentGateway();
    app = await createTestApp({ paymentGateway: gateway });
    service = app.get(OrdersService);
    payments = app.get(DataSource).getRepository(Payment);
    orders = app.get(DataSource).getRepository(Order);
  });

  beforeEach(async () => {
    gateway.reset();
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

  describe('step 4a: our database', () => {
    it('a pending payment whose time is up expires, and its pending bookings are cancelled', async () => {
      const payment = await seed();

      expect(await service.cancelExpiredUnpaid(NOW)).toBe(1);

      expect(await statusOf(payment.id)).toBe(PaymentStatus.EXPIRED);
      expect(await orderStatuses(payment.id)).toEqual([
        OrderStatus.CANCELLED,
        OrderStatus.CANCELLED,
      ]);
    });

    it('leaves alone a payment still in time, and payments that are not pending any more', async () => {
      const inTime = await seed({ expiresInMinutes: 10 });
      const paid = await seed({
        status: PaymentStatus.SUCCEEDED,
        orderStatus: OrderStatus.RESERVED,
      });
      const failed = await seed({
        status: PaymentStatus.FAILED,
        orderStatus: OrderStatus.CANCELLED,
      });

      expect(await service.cancelExpiredUnpaid(NOW)).toBe(0);

      expect(await statusOf(inTime.id)).toBe(PaymentStatus.PENDING);
      expect(await orderStatuses(inTime.id)).toEqual([OrderStatus.PENDING, OrderStatus.PENDING]);
      expect(await statusOf(paid.id)).toBe(PaymentStatus.SUCCEEDED); // paid bookings are never touched
      expect(await orderStatuses(paid.id)).toEqual([OrderStatus.RESERVED, OrderStatus.RESERVED]);
      expect(await statusOf(failed.id)).toBe(PaymentStatus.FAILED);
    });

    it('cancels only the bookings OF the expired payments', async () => {
      const expired = await seed();
      const inTime = await seed({ expiresInMinutes: 10 });

      await service.cancelExpiredUnpaid(NOW);

      expect(await orderStatuses(expired.id)).toEqual([
        OrderStatus.CANCELLED,
        OrderStatus.CANCELLED,
      ]);
      expect(await orderStatuses(inTime.id)).toEqual([OrderStatus.PENDING, OrderStatus.PENDING]);
    });

    it('a payment whose time ends exactly now is over (the boundary is inclusive)', async () => {
      const payment = await seed({ expiresInMinutes: 0 });

      expect(await service.cancelExpiredUnpaid(NOW)).toBe(1);
      expect(await statusOf(payment.id)).toBe(PaymentStatus.EXPIRED);
    });

    it('is idempotent: the second run finds nothing left', async () => {
      await seed();

      expect(await service.cancelExpiredUnpaid(NOW)).toBe(1);
      expect(await service.cancelExpiredUnpaid(NOW)).toBe(0);
    });

    it('two runs at the very same moment (two copies of the application) expire every payment exactly once', async () => {
      for (let i = 0; i < 10; i++) {
        await seed({ orderCount: 1 });
      }

      const [a, b] = await Promise.all([
        service.cancelExpiredUnpaid(NOW),
        service.cancelExpiredUnpaid(NOW),
      ]);

      expect(a + b).toBe(10);
      expect(await payments.countBy({ status: PaymentStatus.EXPIRED })).toBe(10);
      expect(await orders.countBy({ status: OrderStatus.CANCELLED })).toBe(10);
    });

    it('the table is free again: another booking can take the same time', async () => {
      const payment = await seed({ orderCount: 1 });
      const [booking] = await orders.findBy({ paymentId: payment.id });

      await service.cancelExpiredUnpaid(NOW);

      await expect(
        orders.insert({
          userId,
          tableId,
          status: OrderStatus.RESERVED,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
        }),
      ).resolves.toBeDefined();
    });

    it('the money that comes AFTER the expiry is sent back (the webhook of step 2 meets the cron job)', async () => {
      const payment = await seed();
      await service.cancelExpiredUnpaid(NOW);

      expect(await service.confirmPayment(payment.stripePaymentIntentId!)).toBe('refunded');

      expect(gateway.refunds).toEqual([
        { paymentIntentId: payment.stripePaymentIntentId, idempotencyKey: `refund:${payment.id}` },
      ]);
      expect(await orderStatuses(payment.id)).toEqual([
        OrderStatus.CANCELLED,
        OrderStatus.CANCELLED,
      ]);
    });

    it('the cron job is registered under its name', () => {
      expect(app.get(SchedulerRegistry).getCronJob('cancel-expired-unpaid')).toBeDefined();
    });
  });

  describe('step 4b: telling Stripe (best effort)', () => {
    it('asks Stripe to cancel the payment intents of the expired payments, and only of them', async () => {
      const expired = await seed({ orderCount: 1 });
      const withoutIntent = await seed({ orderCount: 1 });
      await payments.update(withoutIntent.id, { stripePaymentIntentId: null }); // Stripe never answered
      await seed({ orderCount: 1, expiresInMinutes: 10 }); // still in time

      expect(await service.cancelExpiredUnpaid(NOW)).toBe(2);

      expect(gateway.cancelled).toEqual([expired.stripePaymentIntentId]);
    });

    it('Stripe failing to cancel does not break the job: the payment expires and the table is free', async () => {
      const payment = await seed();
      gateway.failCancel = true;

      await expect(service.cancelExpiredUnpaid(NOW)).resolves.toBe(1);

      expect(await statusOf(payment.id)).toBe(PaymentStatus.EXPIRED);
      expect(await orderStatuses(payment.id)).toEqual([
        OrderStatus.CANCELLED,
        OrderStatus.CANCELLED,
      ]);
    });

    it('the job waits for Stripe: when it returns, the cancellations are done (no fire-and-forget)', async () => {
      await seed({ orderCount: 1 });
      const original = gateway.cancelPaymentIntent.bind(gateway);
      gateway.cancelPaymentIntent = (id: string) =>
        new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            original(id).then(resolve, reject);
          }, 100);
        });

      try {
        await service.cancelExpiredUnpaid(NOW);
        expect(gateway.cancelled).toHaveLength(1); // not 0: the job did not leave the call behind
      } finally {
        gateway.cancelPaymentIntent = original;
      }
    });

    it('one failing cancellation does not stop the others', async () => {
      await seed({ orderCount: 1 });
      await seed({ orderCount: 1 });
      let calls = 0;
      const original = gateway.cancelPaymentIntent.bind(gateway);
      gateway.cancelPaymentIntent = (id: string) =>
        ++calls === 1 ? Promise.reject(new Error('Stripe is down')) : original(id);

      try {
        expect(await service.cancelExpiredUnpaid(NOW)).toBe(2);
        expect(calls).toBe(2); // the second one was still asked
        expect(gateway.cancelled).toHaveLength(1);
      } finally {
        gateway.cancelPaymentIntent = original;
      }
    });
  });
});
