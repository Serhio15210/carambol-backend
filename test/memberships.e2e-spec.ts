import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { MembershipPlan } from '@/modules/memberships/entities/membership-plan.entity';
import { Membership } from '@/modules/memberships/entities/membership.entity';
import { MembershipStatus } from '@/modules/memberships/types/membership-status.enum';
import { FakePaymentGateway } from './utils/fake-payment-gateway';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

type Started = { membershipId: string; url: string };

// Buying a membership, against a real PostgreSQL (the "one live membership" rule is a partial unique
// index, a fake repository would not enforce it). Stripe is the fake gateway.
describe('Memberships: start buying (e2e)', () => {
  let app: INestApplication;
  let gateway: FakePaymentGateway;
  let memberships: Repository<Membership>;
  let token: string;
  let userId: string;
  let plans: Repository<MembershipPlan>;
  let admin: string;
  let clubA: string;
  let gold: MembershipPlan; // a plan of club A that is on sale

  const buy = (planId = gold.id) =>
    api(app).post('/api/v1/memberships').set('Authorization', `Bearer ${token}`).send({ planId });
  const newClub = async (name: string) =>
    (
      (
        await api(app)
          .post('/api/v1/admin/clubs')
          .set('Authorization', `Bearer ${admin}`)
          .send({ name, address: 'Kyiv', lat: 50.45, lng: 30.52 })
          .expect(201)
      ).body as { id: string }
    ).id;
  // A plan on sale: written straight into the table (how plans are created is tested elsewhere).
  const planOnSale = (clubId: string, name = 'Gold', extra: Partial<MembershipPlan> = {}) =>
    plans.save(
      plans.create({
        clubId,
        name,
        priceCents: 4000,
        discountPercent: 25,
        stripePriceId: `price_${name}_${clubId.slice(0, 8)}`,
        ...extra,
      }),
    );

  beforeAll(async () => {
    gateway = new FakePaymentGateway();
    app = await createTestApp({ paymentGateway: gateway });
    memberships = app.get(DataSource).getRepository(Membership);
    plans = app.get(DataSource).getRepository(MembershipPlan);
  });

  beforeEach(async () => {
    gateway.reset();
    await resetDatabase(app);
    const user = await registerUser(app);
    token = user.accessToken;
    userId = user.user.id;
    admin = await loginAsSuperadmin(app);
    clubA = await newClub('Club A');
    gold = await planOnSale(clubA);
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

  describe('step 6a: buying a chosen plan of a club', () => {
    it('the membership remembers its plan and club; Stripe gets the price of the PLAN', async () => {
      const body = (await buy().expect(201)).body as Started;

      const row = await memberships.findOneByOrFail({ id: body.membershipId });
      expect(row.planId).toBe(gold.id);
      expect(row.clubId).toBe(clubA);
      expect(gateway.checkouts[0].priceId).toBe(gold.stripePriceId);
    });

    it('a plan that is not on sale is a 404, and no row and no Stripe page are made', async () => {
      const archived = await planOnSale(clubA, 'Old', { archivedAt: new Date() });
      const notPriced = await planOnSale(clubA, 'Draft', { stripePriceId: null });

      await buy(archived.id).expect(404);
      await buy(notPriced.id).expect(404);
      await buy('00000000-0000-4000-8000-000000000000').expect(404);

      expect(await memberships.count()).toBe(0);
      expect(gateway.checkouts).toEqual([]);
    });

    it('one live membership PER CLUB: a second plan of the same club is a 409, another club is fine', async () => {
      const silverA = await planOnSale(clubA, 'Silver');
      const goldB = await planOnSale(await newClub('Club B'));

      await buy().expect(201);
      await buy(silverA.id).expect(409);
      await buy(goldB.id).expect(201);

      expect(await memberships.countBy({ userId })).toBe(2);
    });

    it('a planId that is not a uuid is a 400', async () => {
      await buy('gold').expect(400);
    });
  });

  describe('step 7: the user cancels (at the end of the paid period)', () => {
    const PAID_UNTIL = new Date('2030-02-01T00:00:00Z');
    const cancel = (id: string) =>
      api(app).patch(`/api/v1/memberships/${id}/cancel`).set('Authorization', `Bearer ${token}`);
    // A membership the webhooks already synced (it has a Stripe subscription).
    const synced = (status: MembershipStatus, owner = userId) =>
      memberships.save(
        memberships.create({
          userId: owner,
          status,
          planId: gold.id,
          clubId: clubA,
          stripeSubscriptionId: `sub_${owner.slice(0, 8)}`,
          stripeCustomerId: 'cus_1',
          currentPeriodEnd: PAID_UNTIL,
        }),
      );

    it('only a logged-in user can cancel (401)', async () => {
      const membership = await synced(MembershipStatus.ACTIVE);
      await api(app).patch(`/api/v1/memberships/${membership.id}/cancel`).expect(401);
    });

    it('stops the renewals at Stripe and keeps the discount until the paid period ends', async () => {
      const membership = await synced(MembershipStatus.ACTIVE);

      const res = await cancel(membership.id).expect(200);

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
      const membership = await synced(MembershipStatus.PAST_DUE);

      await cancel(membership.id).expect(200);

      expect(gateway.cancelledSubscriptions).toHaveLength(1);
    });

    it.each([MembershipStatus.PENDING, MembershipStatus.CANCELED])(
      'nothing to cancel with a %s membership: 404, Stripe is not asked',
      async (status) => {
        const membership = await memberships.save(memberships.create({ userId, status }));

        await cancel(membership.id).expect(404);

        expect(gateway.cancelledSubscriptions).toEqual([]);
      },
    );

    it('no such membership: 404', async () => {
      await cancel('00000000-0000-4000-8000-000000000000').expect(404);
    });

    it("somebody else's membership is never touched: 404 for me", async () => {
      const other = await registerUser(app, {
        userName: 'player2',
        email: 'player2@example.com',
        phone: '+380671110002',
      });
      const theirs = await synced(MembershipStatus.ACTIVE, other.user.id);

      await cancel(theirs.id).expect(404); // asking by id, but only among MY memberships

      expect(gateway.cancelledSubscriptions).toEqual([]);
    });

    it('Stripe fails: 503, and the membership is unchanged (the user can try again)', async () => {
      const membership = await synced(MembershipStatus.ACTIVE);
      gateway.failCancelSubscription = true;

      await cancel(membership.id).expect(503);

      expect((await memberships.findOneByOrFail({ id: membership.id })).status).toBe(
        MembershipStatus.ACTIVE,
      );
      gateway.failCancelSubscription = false;
      await cancel(membership.id).expect(200);
    });

    it('cancelling twice is harmless: 200 both times', async () => {
      const membership = await synced(MembershipStatus.ACTIVE);

      await cancel(membership.id).expect(200);
      await cancel(membership.id).expect(200);
    });
  });
});
