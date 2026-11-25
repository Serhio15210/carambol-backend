import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { MembershipPlan } from '@/modules/memberships/entities/membership-plan.entity';
import { Membership } from '@/modules/memberships/entities/membership.entity';
import { MembershipStatus } from '@/modules/memberships/types/membership-status.enum';
import { OrdersService } from '@/modules/orders/orders.service';
import { FakePaymentGateway } from './utils/fake-payment-gateway';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

type Created = { id: string };
type BookingBody = {
  orders: { id: string; priceCents: number }[];
  payment: { amountCents: number } | null;
};

// Monday 7 January 2030 (Kyiv is UTC+2 in winter): the club works 10:00-22:00.
const at = (time: string) => `2030-01-07T${time}:00+02:00`;

// The membership discount on a booking, against a real PostgreSQL. The membership status is set
// directly in the table here: how it becomes active (webhooks) is tested in memberships-webhook.
describe('Memberships: the discount on bookings (e2e)', () => {
  let app: INestApplication;
  let gateway: FakePaymentGateway;
  let memberships: Repository<Membership>;
  let plans: Repository<MembershipPlan>;
  let lastClubId: string; // the club the last clubWithTables() made
  let planNo = 0;
  let adminToken: string;
  let player: { accessToken: string; user: { id: string } };

  const adminPost = async (url: string, body: object) =>
    (await api(app).post(url).set('Authorization', `Bearer ${adminToken}`).send(body).expect(201))
      .body as Created;

  const book = (tableIds: string[]) =>
    api(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .send({ tableIds, startsAt: at('12:00'), endsAt: at('14:00') }); // 2 hours

  // A membership in a plan of the last club made (20% off unless told otherwise).
  const membership = async (
    userId: string,
    status: MembershipStatus,
    discountPercent = 20,
    clubId = lastClubId,
  ) => {
    planNo += 1;
    const plan = await plans.save(
      plans.create({
        clubId,
        name: `Plan ${planNo}`,
        priceCents: 3000,
        discountPercent,
        stripePriceId: `price_${planNo}`,
      }),
    );
    return memberships.save(memberships.create({ userId, status, planId: plan.id, clubId }));
  };

  // A club with the given hourly rate, open on Mondays, with two tables.
  const clubWithTables = async (hourlyRateCents: number) => {
    const club = await adminPost('/api/v1/admin/clubs', {
      name: `Club ${hourlyRateCents}`,
      address: 'Kyiv',
      lat: 50.45,
      lng: 30.52,
      hourlyRateCents,
    });
    lastClubId = club.id;
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
    memberships = app.get(DataSource).getRepository(Membership);
    plans = app.get(DataSource).getRepository(MembershipPlan);
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

  it('without a membership: the full price (2 hours x 10.00 = 20.00)', async () => {
    const [table] = await clubWithTables(1000);

    const body = (await book([table]).expect(201)).body as BookingBody;

    expect(body.orders[0].priceCents).toBe(2000);
    expect(body.payment?.amountCents).toBe(2000);
  });

  it('an ACTIVE member pays 20% less: on every table, in the payment and at Stripe', async () => {
    const [tableA, tableB] = await clubWithTables(1000);
    await membership(player.user.id, MembershipStatus.ACTIVE);

    const body = (await book([tableA, tableB]).expect(201)).body as BookingBody;

    expect(body.orders.map((order) => order.priceCents)).toEqual([1600, 1600]);
    expect(body.payment?.amountCents).toBe(3200);
    expect(gateway.intents[0].amountCents).toBe(3200); // what the card is charged
  });

  it('the discount is taken from the booking price the customer sees (5.02 -> 4.02, not 4.01)', async () => {
    const [table] = await clubWithTables(1003); // 30 minutes cost 501.5 -> 502 cents
    await membership(player.user.id, MembershipStatus.ACTIVE);

    const res = await api(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .send({ tableIds: [table], startsAt: at('12:00'), endsAt: at('12:30') })
      .expect(201);

    // 20% off 502 = 401.6 -> 402. Discounting the hourly rate first (1003 -> 802) rounds twice
    // and ends one cent lower: 401, which does not match "full price minus 20%" on the receipt.
    expect((res.body as BookingBody).orders[0].priceCents).toBe(402);
  });

  it('the 0.50 minimum is checked on the DISCOUNTED total: 0.50 - 20% = 0.40 is refused with 400', async () => {
    const [table] = await clubWithTables(100); // 1.00 per hour: 30 minutes = 50 cents, 40 after the discount
    await membership(player.user.id, MembershipStatus.ACTIVE);

    await api(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .send({ tableIds: [table], startsAt: at('12:00'), endsAt: at('12:30') })
      .expect(400); // our own clear answer, not a 503 after Stripe refused 40 cents

    expect(gateway.intents).toEqual([]);
  });

  it.each([MembershipStatus.PENDING, MembershipStatus.PAST_DUE, MembershipStatus.CANCELED])(
    'a %s membership gives no discount',
    async (status) => {
      const [table] = await clubWithTables(1000);
      await membership(player.user.id, status);

      const body = (await book([table]).expect(201)).body as BookingBody;

      expect(body.orders[0].priceCents).toBe(2000);
    },
  );

  it("somebody else's membership does not help", async () => {
    const [table] = await clubWithTables(1000);
    const other = await registerUser(app, {
      userName: 'player2',
      email: 'player2@example.com',
      phone: '+380671110002',
    });
    await membership(other.user.id, MembershipStatus.ACTIVE);

    const body = (await book([table]).expect(201)).body as BookingBody;

    expect(body.orders[0].priceCents).toBe(2000);
  });

  it('a free club stays free for a member (no payment at all)', async () => {
    const [table] = await clubWithTables(0);
    await membership(player.user.id, MembershipStatus.ACTIVE);

    const body = (await book([table]).expect(201)).body as BookingBody;

    expect(body.orders[0].priceCents).toBe(0);
    expect(body.payment).toBeNull();
  });

  it('cancelling a discounted booking refunds what was PAID, not the full price', async () => {
    const [table] = await clubWithTables(1000);
    await membership(player.user.id, MembershipStatus.ACTIVE);
    const body = (await book([table]).expect(201)).body as BookingBody;
    await app.get(OrdersService).confirmPayment(gateway.intents[0].id); // the money arrived

    await api(app)
      .patch(`/api/v1/orders/${body.orders[0].id}/cancel`)
      .set('Authorization', `Bearer ${player.accessToken}`)
      .expect(200);

    expect(gateway.refunds).toHaveLength(1);
    expect(gateway.refunds[0].amountCents).toBe(1600);
  });

  describe('step 6b: the discount of the plan, only in its club', () => {
    it("the plan's own discount is used (25% off 20.00 = 15.00)", async () => {
      const [table] = await clubWithTables(1000);
      await membership(player.user.id, MembershipStatus.ACTIVE, 25);

      const body = (await book([table]).expect(201)).body as BookingBody;

      expect(body.orders[0].priceCents).toBe(1500);
    });

    it('a membership of ANOTHER club gives no discount here', async () => {
      await clubWithTables(1000);
      const otherClub = lastClubId;
      const [table] = await clubWithTables(2000); // the club where the booking is made
      await membership(player.user.id, MembershipStatus.ACTIVE, 50, otherClub);

      const body = (await book([table]).expect(201)).body as BookingBody;

      expect(body.orders[0].priceCents).toBe(4000); // 2 hours x 20.00, no discount
    });

    it('an old membership without a plan (bought before plans existed) gives no discount', async () => {
      const [table] = await clubWithTables(1000);
      await memberships.save(
        memberships.create({
          userId: player.user.id,
          status: MembershipStatus.ACTIVE,
          clubId: lastClubId,
        }),
      );

      const body = (await book([table]).expect(201)).body as BookingBody;

      expect(body.orders[0].priceCents).toBe(2000);
    });
  });
});
