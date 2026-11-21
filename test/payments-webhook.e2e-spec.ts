import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Order } from '@/modules/orders/entities/order.entity';
import { PaymentStatus } from '@/modules/orders/payments/payment-status.enum';
import { Payment } from '@/modules/orders/payments/payment.entity';
import { OrderStatus } from '@/modules/orders/types/order-status.enum';
import { FakePaymentGateway, signedWebhook } from './utils/fake-payment-gateway';
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

// The Stripe webhook against a real PostgreSQL. Stripe itself is a fake gateway (no network), but the
// signature of every webhook is checked by the real library: the tests sign their requests exactly
// like Stripe does, and send them to the real route.
describe('Stripe webhook: payment_intent.succeeded (e2e)', () => {
  let app: INestApplication;
  let gateway: FakePaymentGateway;
  let payments: Repository<Payment>;
  let orders: Repository<Order>;
  let userId: string;
  let tableId: string;

  // A payment with N bookings, all in the given states. The slots never overlap (the exclusion constraint).
  const seedPayment = async ({
    status = PaymentStatus.PENDING,
    orderStatus = OrderStatus.PENDING,
    orderCount = 2,
    intentId = 'pi_test_1',
    offset = 0,
  } = {}) => {
    const payment = await payments.save(
      payments.create({
        userId,
        amountCents: 1000 * orderCount,
        currency: 'usd',
        status,
        stripePaymentIntentId: intentId,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      }),
    );
    const base = Date.now() + 20 * 24 * HOUR;
    await orders.insert(
      Array.from({ length: orderCount }, (_, i) => ({
        userId,
        tableId,
        paymentId: payment.id,
        status: orderStatus,
        priceCents: 1000,
        startsAt: new Date(base + (offset + i) * 2 * HOUR),
        endsAt: new Date(base + (offset + i) * 2 * HOUR + HOUR),
      })),
    );
    return payment;
  };

  const post = (body: string, signature?: string) => {
    const req = api(app).post('/api/stripe/webhook').set('Content-Type', 'application/json');
    return (signature ? req.set('Stripe-Signature', signature) : req).send(body);
  };
  const send = (type: string, intentId = 'pi_test_1', eventId?: string) => {
    const webhook = signedWebhook(type, intentId, eventId);
    return post(webhook.body, webhook.signature);
  };
  const succeeded = (intentId = 'pi_test_1', eventId?: string) =>
    send('payment_intent.succeeded', intentId, eventId);

  const paymentOf = (id: string) => payments.findOneByOrFail({ id });
  const orderStatuses = async (paymentId: string) =>
    (await orders.findBy({ paymentId })).map((order) => order.status);

  beforeAll(async () => {
    gateway = new FakePaymentGateway();
    app = await createTestApp({ paymentGateway: gateway });
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

  describe('the signature', () => {
    it('a forged or unsigned request is refused (400) and changes nothing', async () => {
      const payment = await seedPayment();
      const webhook = signedWebhook('payment_intent.succeeded', 'pi_test_1');

      await post(webhook.body.replace('pi_test_1', 'pi_other'), webhook.signature).expect(400);
      await post(webhook.body).expect(400); // no Stripe-Signature header
      await post(webhook.body, 't=1,v1=deadbeef').expect(400);

      expect((await paymentOf(payment.id)).status).toBe(PaymentStatus.PENDING);
      expect(await orderStatuses(payment.id)).toEqual([OrderStatus.PENDING, OrderStatus.PENDING]);
    });
  });

  describe('the money arrived', () => {
    it('the payment succeeds, its bookings become reserved, and Stripe gets a quick 200', async () => {
      const payment = await seedPayment();

      const res = await succeeded().expect(200);

      expect(res.body).toEqual({ received: true });
      const after = await paymentOf(payment.id);
      expect(after.status).toBe(PaymentStatus.SUCCEEDED);
      expect(after.paidAt).toBeInstanceOf(Date);
      expect(await orderStatuses(payment.id)).toEqual([OrderStatus.RESERVED, OrderStatus.RESERVED]);
      expect(gateway.refunds).toEqual([]);
    });

    it('touches only the bookings of THIS payment', async () => {
      const mine = await seedPayment({ intentId: 'pi_mine' });
      const other = await seedPayment({ intentId: 'pi_other', offset: 10 });

      await succeeded('pi_mine').expect(200);

      expect((await paymentOf(mine.id)).status).toBe(PaymentStatus.SUCCEEDED);
      expect((await paymentOf(other.id)).status).toBe(PaymentStatus.PENDING);
      expect(await orderStatuses(other.id)).toEqual([OrderStatus.PENDING, OrderStatus.PENDING]);
    });

    it('a payment that is not ours (unknown id) gets a 200 and changes nothing: no endless retries', async () => {
      const payment = await seedPayment();

      await succeeded('pi_somebody_elses').expect(200);

      expect((await paymentOf(payment.id)).status).toBe(PaymentStatus.PENDING);
    });

    it('other event types are accepted and ignored: a failed attempt does NOT cancel the bookings', async () => {
      const payment = await seedPayment();

      await send('payment_intent.payment_failed').expect(200);
      await send('customer.created').expect(200);

      expect((await paymentOf(payment.id)).status).toBe(PaymentStatus.PENDING);
      expect(await orderStatuses(payment.id)).toEqual([OrderStatus.PENDING, OrderStatus.PENDING]);
    });
  });

  describe('the same event twice (Stripe retries)', () => {
    it('the second delivery is a harmless 200 and does not touch the first result', async () => {
      const payment = await seedPayment();
      await succeeded('pi_test_1', 'evt_1').expect(200);
      const firstPaidAt = (await paymentOf(payment.id)).paidAt;
      await sleep(50);

      await succeeded('pi_test_1', 'evt_1').expect(200);

      const after = await paymentOf(payment.id);
      expect(after.status).toBe(PaymentStatus.SUCCEEDED);
      expect(after.paidAt).toEqual(firstPaidAt); // not overwritten
      expect(gateway.refunds).toEqual([]);
    });

    it('two deliveries at the very same moment: both get 200, the payment is confirmed once, nothing is refunded', async () => {
      const payment = await seedPayment();

      const statuses = await Promise.all([
        succeeded('pi_test_1', 'evt_1').then((res) => res.status),
        succeeded('pi_test_1', 'evt_1').then((res) => res.status),
      ]);

      expect(statuses).toEqual([200, 200]);
      expect((await paymentOf(payment.id)).status).toBe(PaymentStatus.SUCCEEDED);
      expect(await orderStatuses(payment.id)).toEqual([OrderStatus.RESERVED, OrderStatus.RESERVED]);
      expect(gateway.refunds).toEqual([]);
    });
  });

  describe('a late payment (the cron job already cancelled the unpaid bookings)', () => {
    const seedExpired = () =>
      seedPayment({ status: PaymentStatus.EXPIRED, orderStatus: OrderStatus.CANCELLED });

    it('the money is sent back, the bookings stay cancelled', async () => {
      const payment = await seedExpired();

      await succeeded().expect(200);

      expect(gateway.refunds).toEqual([
        { paymentIntentId: 'pi_test_1', idempotencyKey: `refund:${payment.id}` },
      ]);
      expect((await paymentOf(payment.id)).status).toBe(PaymentStatus.REFUNDED);
      expect(await orderStatuses(payment.id)).toEqual([
        OrderStatus.CANCELLED,
        OrderStatus.CANCELLED,
      ]);
    });

    it('when the refund fails the answer is 500 and the payment stays expired, so Stripe retries; the retry refunds', async () => {
      const payment = await seedExpired();
      gateway.failRefund = true;

      await succeeded().expect(500);
      expect((await paymentOf(payment.id)).status).toBe(PaymentStatus.EXPIRED);

      gateway.failRefund = false;
      await succeeded().expect(200); // Stripe delivers the event again

      expect((await paymentOf(payment.id)).status).toBe(PaymentStatus.REFUNDED);
      expect(gateway.refunds).toHaveLength(1);
    });

    it('two late deliveries at once: both 200, always the same idempotency key, finally refunded', async () => {
      const payment = await seedExpired();

      const statuses = await Promise.all([
        succeeded().then((res) => res.status),
        succeeded().then((res) => res.status),
      ]);

      expect(statuses).toEqual([200, 200]);
      expect(gateway.refunds.length).toBeGreaterThanOrEqual(1);
      expect(
        gateway.refunds.every((refund) => refund.idempotencyKey === `refund:${payment.id}`),
      ).toBe(true);
      expect((await paymentOf(payment.id)).status).toBe(PaymentStatus.REFUNDED);
    });

    it('a repeated event for an already refunded payment refunds nothing more', async () => {
      await seedPayment({ status: PaymentStatus.REFUNDED, orderStatus: OrderStatus.CANCELLED });

      await succeeded().expect(200);

      expect(gateway.refunds).toEqual([]);
    });
  });
});
