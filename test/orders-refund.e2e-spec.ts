import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Order } from '@/modules/orders/entities/order.entity';
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

const HOUR = 3_600_000;

// Cancelling a PAID booking sends this booking's share of the money back (step 5b).
describe('Orders: refund when a paid booking is cancelled (e2e)', () => {
  let app: INestApplication;
  let gateway: FakePaymentGateway;
  let payments: Repository<Payment>;
  let orders: Repository<Order>;
  let player: { accessToken: string; user: { id: string } };
  let tableId: string;
  let slot = 0;

  const cancel = (id: string, token = player.accessToken) =>
    api(app).patch(`/api/v1/orders/${id}/cancel`).set('Authorization', `Bearer ${token}`);
  const statusOf = async (id: string) => (await orders.findOneByOrFail({ id })).status;

  // A paid booking (the webhook already confirmed it): a succeeded payment with `count` reserved orders.
  const seedPaid = async (count = 2) => {
    const payment = await payments.save(
      payments.create({
        userId: player.user.id,
        amountCents: 1000 * count,
        currency: 'usd',
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: `pi_paid_${slot}`,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        paidAt: new Date(),
      }),
    );
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      slot += 1;
      const start = Date.now() + 20 * 24 * HOUR + slot * 2 * HOUR;
      const { identifiers } = await orders.insert({
        userId: player.user.id,
        tableId,
        paymentId: payment.id,
        status: OrderStatus.RESERVED,
        priceCents: 1000,
        startsAt: new Date(start),
        endsAt: new Date(start + HOUR),
      });
      ids.push((identifiers[0] as { id: string }).id);
    }
    return { payment, ids };
  };

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
    player = await registerUser(app);
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

  it('cancelling one table of a paid booking refunds THAT table only, keyed by the booking id', async () => {
    const { payment, ids } = await seedPaid(2);

    await cancel(ids[0]).expect(200);

    expect(gateway.refunds).toEqual([
      { paymentIntentId: payment.stripePaymentIntentId, amountCents: 1000, idempotencyKey: ids[0] },
    ]);
    expect(await statusOf(ids[0])).toBe(OrderStatus.CANCELLED);
    expect(await statusOf(ids[1])).toBe(OrderStatus.RESERVED); // the other table stays booked
  });

  it('a free booking is cancelled without asking Stripe for anything', async () => {
    slot += 1;
    const start = Date.now() + 20 * 24 * HOUR + slot * 2 * HOUR;
    const { identifiers } = await orders.insert({
      userId: player.user.id,
      tableId,
      status: OrderStatus.RESERVED,
      startsAt: new Date(start),
      endsAt: new Date(start + HOUR),
    });
    const id = (identifiers[0] as { id: string }).id;

    await cancel(id).expect(200);

    expect(gateway.refunds).toEqual([]);
  });

  it('Stripe fails: 503 and the booking stays reserved; the retry refunds with the SAME key', async () => {
    const { ids } = await seedPaid(1);
    gateway.failRefund = true;

    await cancel(ids[0]).expect(503);
    expect(await statusOf(ids[0])).toBe(OrderStatus.RESERVED); // nothing lost: the client may retry

    gateway.failRefund = false;
    await cancel(ids[0]).expect(200);

    expect(await statusOf(ids[0])).toBe(OrderStatus.CANCELLED);
    expect(gateway.refunds.map((refund) => refund.idempotencyKey)).toEqual([ids[0]]);
  });

  it('two simultaneous cancellations: one 200, one 409, and every refund call carries the same key', async () => {
    const { ids } = await seedPaid(1);

    const statuses = await Promise.all([
      cancel(ids[0]).then((res) => res.status),
      cancel(ids[0]).then((res) => res.status),
    ]);

    expect(statuses.sort()).toEqual([200, 409]);
    expect(gateway.refunds.length).toBeGreaterThanOrEqual(1);
    // Stripe answers a repeated key with the FIRST refund: two calls can never refund twice.
    expect(gateway.refunds.every((refund) => refund.idempotencyKey === ids[0])).toBe(true);
  });
});
