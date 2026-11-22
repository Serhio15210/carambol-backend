import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Membership } from '@/modules/memberships/entities/membership.entity';
import { MembershipStatus } from '@/modules/memberships/types/membership-status.enum';
import { FakePaymentGateway } from './utils/fake-payment-gateway';
import { api, createTestApp, registerUser, resetDatabase } from './utils/test-app';

type Started = { membershipId: string; url: string };

// Buying a membership, against a real PostgreSQL (the "one live membership" rule is a partial unique
// index, a fake repository would not enforce it). Stripe is the fake gateway.
describe('Memberships: start buying (e2e)', () => {
  let app: INestApplication;
  let gateway: FakePaymentGateway;
  let memberships: Repository<Membership>;
  let token: string;
  let userId: string;

  const buy = () => api(app).post('/api/v1/memberships').set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    gateway = new FakePaymentGateway();
    app = await createTestApp({ paymentGateway: gateway });
    memberships = app.get(DataSource).getRepository(Membership);
  });

  beforeEach(async () => {
    gateway.reset();
    await resetDatabase(app);
    const user = await registerUser(app);
    token = user.accessToken;
    userId = user.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('step 3a: our row first, then the Stripe page', () => {
    it('only a logged-in user can buy (401)', async () => {
      await api(app).post('/api/v1/memberships').expect(401);
      expect(gateway.checkouts).toEqual([]);
    });

    it('creates a pending membership and returns the Stripe page for it', async () => {
      const res = await buy().expect(201);
      const body = res.body as Started;

      const row = await memberships.findOneByOrFail({ id: body.membershipId });
      expect(row.userId).toBe(userId);
      expect(row.status).toBe(MembershipStatus.PENDING); // no discount before the money
      expect(body.url).toBe(gateway.checkouts[0].url);
    });

    it('tells Stripe which row it is, and uses that id as the idempotency key', async () => {
      const body = (await buy().expect(201)).body as Started;

      expect(gateway.checkouts).toHaveLength(1);
      expect(gateway.checkouts[0]).toMatchObject({
        referenceId: body.membershipId,
        idempotencyKey: body.membershipId,
      });
    });

    it('a second purchase while one is still live is a 409, and Stripe is not asked again', async () => {
      await buy().expect(201);

      await buy().expect(409);

      expect(await memberships.countBy({ userId })).toBe(1);
      expect(gateway.checkouts).toHaveLength(1);
    });

    it('after a cancelled membership the user can buy again', async () => {
      const first = (await buy().expect(201)).body as Started;
      await memberships.update(first.membershipId, { status: MembershipStatus.CANCELED });

      await buy().expect(201);

      expect(await memberships.countBy({ userId })).toBe(2);
    });

    it('two clicks at the very same moment: one 201, one 409', async () => {
      const statuses = await Promise.all([buy(), buy()].map((req) => req.then((r) => r.status)));

      expect(statuses.sort()).toEqual([201, 409]);
      expect(await memberships.countBy({ userId })).toBe(1);
    });
  });

  describe('step 3b: Stripe fails', () => {
    it('answers 503 and cancels our row, so it does not block the next try', async () => {
      gateway.failCheckout = true;

      await buy().expect(503);

      const [row] = await memberships.findBy({ userId });
      expect(row.status).toBe(MembershipStatus.CANCELED);

      gateway.failCheckout = false;
      await buy().expect(201); // the user can simply try again
    });
  });

  describe('step 7: the user cancels (at the end of the paid period)', () => {
    const PAID_UNTIL = new Date('2030-02-01T00:00:00Z');
    const cancel = () =>
      api(app).patch('/api/v1/memberships/my/cancel').set('Authorization', `Bearer ${token}`);
    // A membership the webhooks already synced (it has a Stripe subscription).
    const synced = (status: MembershipStatus, owner = userId) =>
      memberships.save(
        memberships.create({
          userId: owner,
          status,
          stripeSubscriptionId: `sub_${owner.slice(0, 8)}`,
          stripeCustomerId: 'cus_1',
          currentPeriodEnd: PAID_UNTIL,
        }),
      );

    it('only a logged-in user can cancel (401)', async () => {
      await api(app).patch('/api/v1/memberships/my/cancel').expect(401);
    });

    it('stops the renewals at Stripe and keeps the discount until the paid period ends', async () => {
      const membership = await synced(MembershipStatus.ACTIVE);

      const res = await cancel().expect(200);

      expect(res.body).toEqual({
        membershipId: membership.id,
        activeUntil: PAID_UNTIL.toISOString(),
      });
      expect(gateway.cancelledSubscriptions).toEqual([membership.stripeSubscriptionId]);
      // still active: the webhook customer.subscription.deleted ends it later
      expect((await memberships.findOneByOrFail({ id: membership.id })).status).toBe(
        MembershipStatus.ACTIVE,
      );
    });

    it('a past_due membership can be cancelled too (no more retries of the card)', async () => {
      await synced(MembershipStatus.PAST_DUE);

      await cancel().expect(200);

      expect(gateway.cancelledSubscriptions).toHaveLength(1);
    });

    it.each([MembershipStatus.PENDING, MembershipStatus.CANCELED])(
      'nothing to cancel with a %s membership: 404, Stripe is not asked',
      async (status) => {
        await memberships.save(memberships.create({ userId, status }));

        await cancel().expect(404);

        expect(gateway.cancelledSubscriptions).toEqual([]);
      },
    );

    it('no membership at all: 404', async () => {
      await cancel().expect(404);
    });

    it("somebody else's membership is never touched: 404 for me", async () => {
      const other = await registerUser(app, {
        userName: 'player2',
        email: 'player2@example.com',
        phone: '+380671110002',
      });
      await synced(MembershipStatus.ACTIVE, other.user.id);

      await cancel().expect(404);

      expect(gateway.cancelledSubscriptions).toEqual([]);
    });

    it('Stripe fails: 503, and the membership is unchanged (the user can try again)', async () => {
      const membership = await synced(MembershipStatus.ACTIVE);
      gateway.failCancelSubscription = true;

      await cancel().expect(503);

      expect((await memberships.findOneByOrFail({ id: membership.id })).status).toBe(
        MembershipStatus.ACTIVE,
      );
      gateway.failCancelSubscription = false;
      await cancel().expect(200);
    });

    it('cancelling twice is harmless: 200 both times', async () => {
      await synced(MembershipStatus.ACTIVE);

      await cancel().expect(200);
      await cancel().expect(200);
    });
  });
});
