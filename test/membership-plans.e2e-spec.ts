import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { MembershipPlan } from '@/modules/memberships/entities/membership-plan.entity';
import { FakePaymentGateway } from './utils/fake-payment-gateway';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

type Created = { id: string };

const GOLD = { name: 'Gold', priceCents: 4000, discountPercent: 25 };

// Club plans: who may create them. A role alone is not enough: a manager manages only HIS club.
describe('Membership plans: who may manage them (e2e)', () => {
  let app: INestApplication;
  let plans: Repository<MembershipPlan>;
  let gateway: FakePaymentGateway;
  let admin: string;
  let clubA: string;
  let clubB: string;
  let userNo = 0;

  const adminPost = async (url: string, body: object) =>
    (await api(app).post(url).set('Authorization', `Bearer ${admin}`).send(body).expect(201))
      .body as Created;

  // A new player; with `role` they also work in `clubId` (set by the admin, lesson 15).
  const person = async (staffOf?: { clubId: string; role: 'owner' | 'manager' }) => {
    userNo += 1;
    const user = await registerUser(app, {
      userName: `person${userNo}`,
      email: `person${userNo}@example.com`,
      phone: `+3806722200${String(userNo).padStart(2, '0')}`,
    });
    if (staffOf) {
      await api(app)
        .put(`/api/v1/admin/clubs/${staffOf.clubId}/staff/${user.user.id}`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ role: staffOf.role })
        .expect(200);
    }
    return user.accessToken;
  };

  const createPlan = (token: string | null, clubId: string, body: object = GOLD) => {
    const req = api(app).post(`/api/v1/clubs/${clubId}/membership-plans`);
    return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(body);
  };

  beforeAll(async () => {
    gateway = new FakePaymentGateway();
    app = await createTestApp({ paymentGateway: gateway });
    plans = app.get(DataSource).getRepository(MembershipPlan);
  });

  beforeEach(async () => {
    gateway.reset();
    await resetDatabase(app);
    admin = await loginAsSuperadmin(app);
    const club = (name: string) =>
      adminPost('/api/v1/admin/clubs', { name, address: 'Kyiv', lat: 50.45, lng: 30.52 });
    clubA = (await club('Club A')).id;
    clubB = (await club('Club B')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('step 2: object-level access', () => {
    it('a manager of the club creates a plan (201)', async () => {
      const manager = await person({ clubId: clubA, role: 'manager' });

      const res = await createPlan(manager, clubA).expect(201);

      expect(res.body).toMatchObject({ ...GOLD, clubId: clubA, archivedAt: null });
      expect(await plans.countBy({ clubId: clubA })).toBe(1);
    });

    it('the owner of the club may too', async () => {
      const owner = await person({ clubId: clubA, role: 'owner' });

      await createPlan(owner, clubA).expect(201);
    });

    it('an admin may manage any club without working in it', async () => {
      await createPlan(admin, clubB).expect(201);
    });

    it('a manager of club A gets 403 for club B, and nothing is written', async () => {
      const managerOfA = await person({ clubId: clubA, role: 'manager' });

      await createPlan(managerOfA, clubB).expect(403);

      expect(await plans.count()).toBe(0);
    });

    it('a player who works in no club gets 403', async () => {
      const player = await person();

      await createPlan(player, clubA).expect(403);
    });

    it('without a token: 401', async () => {
      await createPlan(null, clubA).expect(401);
    });
  });

  describe('the request itself (ready, not part of the task)', () => {
    it('an unknown club is a 404', async () => {
      await createPlan(admin, '00000000-0000-4000-8000-000000000000').expect(404);
    });

    it.each([
      ['price below the 0.50 Stripe minimum', { ...GOLD, priceCents: 30 }],
      ['discount 0%', { ...GOLD, discountPercent: 0 }],
      ['discount 150%', { ...GOLD, discountPercent: 150 }],
      ['empty name', { ...GOLD, name: '  ' }],
    ])('%s: 400 from the DTO (never a 500 from the CHECK)', async (_, body) => {
      await createPlan(admin, clubA, body).expect(400);
    });

    it('a second "Gold" on sale in the same club: 409; another club may have its own "Gold"', async () => {
      await createPlan(admin, clubA).expect(201);

      await createPlan(admin, clubA).expect(409);
      await createPlan(admin, clubB).expect(201);
    });
  });

  describe('step 3: the plan goes on sale at Stripe', () => {
    it('creates a monthly Stripe price with our id as the idempotency key, and keeps its id', async () => {
      const res = await createPlan(admin, clubA).expect(201);
      const body = res.body as { id: string; stripePriceId: string };

      expect(gateway.planPrices).toEqual([
        {
          name: 'Gold',
          priceCents: 4000,
          currency: 'usd',
          idempotencyKey: body.id,
          priceId: body.stripePriceId,
        },
      ]);
      expect((await plans.findOneByOrFail({ id: body.id })).stripePriceId).toBe(body.stripePriceId);
    });

    it('Stripe fails: 503, the plan is archived (off the shop window), and "Gold" can be tried again', async () => {
      gateway.failPlanPrice = true;

      await createPlan(admin, clubA).expect(503);

      const [failed] = await plans.findBy({ clubId: clubA });
      expect(failed.archivedAt).toBeInstanceOf(Date);
      expect(failed.stripePriceId).toBeNull();

      gateway.failPlanPrice = false;
      await createPlan(admin, clubA).expect(201); // the name is free again
      expect(await plans.countBy({ clubId: clubA })).toBe(2);
    });
  });

  describe('step 4: the shop window (public)', () => {
    const shop = (clubId: string) => api(app).get(`/api/v1/clubs/${clubId}/membership-plans`);
    const names = (body: unknown) => (body as { name: string }[]).map((plan) => plan.name);

    it('anyone sees the plans on sale of THIS club, cheapest first, without logging in', async () => {
      await createPlan(admin, clubA, { name: 'Gold', priceCents: 4000, discountPercent: 25 });
      await createPlan(admin, clubA, { name: 'Silver', priceCents: 2000, discountPercent: 10 });
      await createPlan(admin, clubB, { name: 'Other', priceCents: 1000, discountPercent: 5 });

      const res = await shop(clubA).expect(200);

      expect(names(res.body)).toEqual(['Silver', 'Gold']);
    });

    it('archived plans and plans not on sale at Stripe yet are not shown', async () => {
      await createPlan(admin, clubA, { name: 'Gold', priceCents: 4000, discountPercent: 25 });
      const old = (
        await createPlan(admin, clubA, { name: 'Old', priceCents: 3000, discountPercent: 20 })
      ).body as Created;
      await plans.update(old.id, { archivedAt: new Date() });
      await plans.save(
        plans.create({ clubId: clubA, name: 'No price', priceCents: 500, discountPercent: 5 }),
      );

      const res = await shop(clubA).expect(200);

      expect(names(res.body)).toEqual(['Gold']);
    });

    it('a club without plans: an empty list; an unknown club: 404', async () => {
      expect((await shop(clubB).expect(200)).body).toEqual([]);
      await shop('00000000-0000-4000-8000-000000000000').expect(404);
    });
  });

  describe('step 5: taking a plan off sale', () => {
    const archive = (token: string, clubId: string, planId: string) =>
      api(app)
        .delete(`/api/v1/clubs/${clubId}/membership-plans/${planId}`)
        .set('Authorization', `Bearer ${token}`);
    const planOf = async (clubId: string) =>
      ((await createPlan(admin, clubId).expect(201)).body as Created).id;

    it('a manager of the club archives a plan: 204, gone from the shop window, the row stays', async () => {
      const manager = await person({ clubId: clubA, role: 'manager' });
      const gold = await planOf(clubA);

      await archive(manager, clubA, gold).expect(204);

      const shop = await api(app).get(`/api/v1/clubs/${clubA}/membership-plans`).expect(200);
      expect(shop.body).toEqual([]);
      expect((await plans.findOneByOrFail({ id: gold })).archivedAt).toBeInstanceOf(Date);
    });

    it("a manager of club A cannot reach club B's plan through club A's address (404, plan untouched)", async () => {
      const managerOfA = await person({ clubId: clubA, role: 'manager' });
      const planOfB = await planOf(clubB);

      await archive(managerOfA, clubA, planOfB).expect(404); // allowed in A, but the plan is not A's

      expect((await plans.findOneByOrFail({ id: planOfB })).archivedAt).toBeNull();
    });

    it("...nor through club B's address (403)", async () => {
      const managerOfA = await person({ clubId: clubA, role: 'manager' });
      const planOfB = await planOf(clubB);

      await archive(managerOfA, clubB, planOfB).expect(403);
    });

    it('archiving twice: the second time there is nothing on sale to archive (404)', async () => {
      const gold = await planOf(clubA);

      await archive(admin, clubA, gold).expect(204);
      await archive(admin, clubA, gold).expect(404);
    });

    it('after archiving, the name is free: a new "Gold" (with a new price) can be created', async () => {
      const gold = await planOf(clubA);
      await archive(admin, clubA, gold).expect(204);

      await createPlan(admin, clubA, { ...GOLD, priceCents: 5000 }).expect(201);
    });
  });
});
