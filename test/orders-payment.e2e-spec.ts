import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Order } from '@/modules/orders/entities/order.entity';
import { PaymentStatus } from '@/modules/orders/payments/payment-status.enum';
import { Payment } from '@/modules/orders/payments/payment.entity';
import { OrdersService } from '@/modules/orders/orders.service';
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
type OrderBody = { id: string; status: string; paymentId: string | null; priceCents: number };
type BookingBody = {
  orders: OrderBody[];
  payment: { id: string; amountCents: number; currency: string; clientSecret: string } | null;
};

// Monday 7 January 2030 (Kyiv is UTC+2 in winter): the club works 10:00-22:00.
const at = (time: string) => `2030-01-07T${time}:00+02:00`;

// Booking for money, stage 1: only OUR database. A paid booking writes one pending payment and
// pending orders that point at it, in one transaction. (Stripe joins in the next step.)
describe('Orders: a paid booking (e2e)', () => {
  let app: INestApplication;
  let orders: Repository<Order>;
  let payments: Repository<Payment>;
  let gateway: FakePaymentGateway;
  let adminToken: string;
  let player: { accessToken: string; user: { id: string } };

  const adminPost = async (url: string, body: object) =>
    (await api(app).post(url).set('Authorization', `Bearer ${adminToken}`).send(body).expect(201))
      .body as Created;

  const book = (tableIds: string[], startsAt: string, endsAt: string) =>
    api(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .send({ tableIds, startsAt, endsAt });

  // A club with the given hourly rate (cents per hour), open on Mondays, with two tables.
  const clubWithTables = async (hourlyRateCents: number) => {
    const club = await adminPost('/api/v1/admin/clubs', {
      name: `Club ${hourlyRateCents}`,
      address: 'Kyiv',
      lat: 50.45,
      lng: 30.52,
      hourlyRateCents,
    });
    await api(app)
      .put(`/api/v1/admin/clubs/${club.id}/schedule/hours/1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ opensAt: '10:00', closesAt: '22:00' })
      .expect(200);
    const room = await adminPost(`/api/v1/admin/clubs/${club.id}/rooms`, {
      name: 'Main hall',
      widthCm: 3000,
      lengthCm: 3000,
    });
    const ids: string[] = [];
    for (const number of [1, 2]) {
      const table = await adminPost('/api/v1/admin/tables', {
        roomId: room.id,
        number,
        type: 'pool',
        lengthCm: 300,
        widthCm: 150,
        x: 500 * number,
        y: 500,
      });
      ids.push(table.id);
    }
    return ids;
  };

  beforeAll(async () => {
    gateway = new FakePaymentGateway();
    app = await createTestApp({ paymentGateway: gateway });
    orders = app.get(DataSource).getRepository(Order);
    payments = app.get(DataSource).getRepository(Payment);
  });

  beforeEach(async () => {
    gateway.reset();
    await resetDatabase(app);
    adminToken = await loginAsSuperadmin(app);
    player = await registerUser(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('books two tables for money: pending orders, one pending payment for the total (201)', async () => {
    const [tableA, tableB] = await clubWithTables(1000); // 10.00 USD per hour
    const before = Date.now();

    const res = await book([tableA, tableB], at('12:00'), at('14:00')).expect(201);

    const body = (res.body as BookingBody).orders;
    expect(body).toHaveLength(2);
    expect(body.every((order) => order.status === 'pending')).toBe(true);
    expect(body.every((order) => order.priceCents === 2000)).toBe(true); // 2 hours x 1000

    const all = await payments.find();
    expect(all).toHaveLength(1);
    const payment = all[0];
    expect(payment).toMatchObject({
      userId: player.user.id,
      amountCents: 4000, // two tables
      currency: 'usd',
      status: PaymentStatus.PENDING,
    });
    expect(body.every((order) => order.paymentId === payment.id)).toBe(true);
    // The payment waits PAYMENT_WINDOW_MINUTES (15 by default) for the money.
    const waits = payment.expiresAt.getTime() - before;
    expect(waits).toBeGreaterThan(14 * 60_000);
    expect(waits).toBeLessThan(16 * 60_000);
  });

  it('a free club: the orders are reserved at once and no payment is written', async () => {
    const [tableA] = await clubWithTables(0);

    const res = await book([tableA], at('12:00'), at('14:00')).expect(201);

    const [order] = (res.body as BookingBody).orders;
    expect(order.status).toBe(OrderStatus.RESERVED);
    expect(order.paymentId ?? null).toBeNull();
    expect(await payments.count()).toBe(0);
    expect((res.body as BookingBody).payment).toBeNull();
    expect(gateway.intents).toEqual([]); // nothing to pay, Stripe is not even asked
  });

  it('an unpaid (pending) booking already holds the table: the same time again is a 409', async () => {
    const [tableA] = await clubWithTables(1000);
    await book([tableA], at('12:00'), at('14:00')).expect(201);

    await book([tableA], at('13:00'), at('15:00')).expect(409);

    expect(await orders.count()).toBe(1);
    expect(await payments.count()).toBe(1);
  });

  it('all or nothing: when the second table is taken, no order and NO payment of the request remain', async () => {
    const [tableA, tableB] = await clubWithTables(1000);
    await book([tableB], at('12:00'), at('14:00')).expect(201);

    await book([tableA, tableB], at('12:00'), at('14:00')).expect(409);

    expect(await orders.countBy({ tableId: tableA })).toBe(0);
    expect(await payments.count()).toBe(1); // only the payment of the first booking
  });

  it('a price Stripe cannot charge (1-49 cents) is refused before anything is written (400)', async () => {
    const [tableA] = await clubWithTables(30); // 30 cents per hour: one hour costs 0.30

    await book([tableA], at('12:00'), at('13:00')).expect(400);

    expect(await orders.count()).toBe(0);
    expect(await payments.count()).toBe(0);
  });
  // ---- step 6a: Stripe creates the payment, AFTER our rows are committed ----
  it('asks Stripe once, with OUR payment id as the idempotency key, and hands the clientSecret to the client', async () => {
    const [tableA, tableB] = await clubWithTables(1000);

    const res = await book([tableA, tableB], at('12:00'), at('14:00')).expect(201);

    const payment = await payments.findOneByOrFail({});
    expect(gateway.intents).toHaveLength(1);
    expect(gateway.intents[0]).toMatchObject({
      amountCents: 4000,
      currency: 'usd',
      idempotencyKey: payment.id,
    });
    // Stripe's id is kept in OUR row: the webhook finds the payment by it.
    expect(payment.stripePaymentIntentId).toBe(gateway.intents[0].id);
    expect((res.body as BookingBody).payment).toMatchObject({
      id: payment.id,
      amountCents: 4000,
      currency: 'usd',
      clientSecret: gateway.intents[0].clientSecret,
    });
  });

  // Found in the live check with the real Stripe: the payment was created with one key, and the late
  // refund reused the SAME key -> Stripe refused it (500). Every kind of request needs its own key.
  it('the whole road: book, pay too late (after the expiry), get the money back', async () => {
    const [tableA] = await clubWithTables(1000);
    await book([tableA], at('12:00'), at('14:00')).expect(201);
    const service = app.get(OrdersService);
    const created = await payments.findOneByOrFail({});

    await service.cancelExpiredUnpaid(new Date(Date.now() + 16 * 60_000)); // the window is over
    const result = await service.confirmPayment(created.stripePaymentIntentId!); // the money arrives late

    expect(result).toBe('refunded');
    expect(gateway.refunds).toHaveLength(1);
    expect(gateway.refunds[0].idempotencyKey).not.toBe(gateway.intents[0].idempotencyKey);
    expect((await payments.findOneByOrFail({ id: created.id })).status).toBe(
      PaymentStatus.REFUNDED,
    );
  });

  // ---- step 6b: Stripe fails, so the booking is undone by hand (compensation) ----
  it('Stripe is down: 503, the payment is failed, the bookings are cancelled and the table is free again', async () => {
    const [tableA] = await clubWithTables(1000);
    gateway.failCreate = true;

    await book([tableA], at('12:00'), at('14:00')).expect(503);

    const payment = await payments.findOneByOrFail({});
    expect(payment.status).toBe(PaymentStatus.FAILED);
    expect((await orders.find()).map((order) => order.status)).toEqual([OrderStatus.CANCELLED]);

    gateway.failCreate = false; // Stripe is back: the same time can be booked again
    await book([tableA], at('12:00'), at('14:00')).expect(201);
  });
});
