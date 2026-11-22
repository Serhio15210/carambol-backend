import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Membership } from '@/modules/memberships/entities/membership.entity';
import { MembershipStatus } from '@/modules/memberships/types/membership-status.enum';
import { SubscriptionSnapshot } from '@/modules/payments/payment-gateway';
import { FakePaymentGateway, signedEvent } from './utils/fake-payment-gateway';
import { api, createTestApp, registerUser, resetDatabase } from './utils/test-app';

const PAID_UNTIL = new Date('2030-02-01T00:00:00Z');

// Subscription webhooks against a real PostgreSQL. The fake gateway plays Stripe: a test says what the
// subscription looks like "now" (gateway.subscriptions), then sends a signed event about it.
describe('Memberships: subscription webhooks (e2e)', () => {
  let app: INestApplication;
  let gateway: FakePaymentGateway;
  let memberships: Repository<Membership>;
  let userId: string;

  // A pending membership, like POST /memberships leaves it.
  const seed = () => memberships.save(memberships.create({ userId }));

  // What Stripe says about sub_1 right now.
  const stripeSays = (membershipId: string | null, patch: Partial<SubscriptionSnapshot> = {}) =>
    gateway.subscriptions.set('sub_1', {
      id: 'sub_1',
      customerId: 'cus_1',
      status: 'active',
      membershipId,
      currentPeriodEnd: PAID_UNTIL,
      ...patch,
    });

  const send = (type: string, object: object, eventId?: string) => {
    const webhook = signedEvent(type, object, eventId);
    return api(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', webhook.signature)
      .send(webhook.body);
  };
  const subscriptionEvent = (type: string, object: object = {}, eventId?: string) =>
    send(type, { id: 'sub_1', object: 'subscription', ...object }, eventId);
  const invoicePaid = () =>
    send('invoice.paid', {
      id: 'in_1',
      object: 'invoice',
      parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
    });

  const rowOf = (id: string) => memberships.findOneByOrFail({ id });

  beforeAll(async () => {
    gateway = new FakePaymentGateway();
    app = await createTestApp({ paymentGateway: gateway });
    memberships = app.get(DataSource).getRepository(Membership);
  });

  beforeEach(async () => {
    gateway.reset();
    await resetDatabase(app);
    userId = (await registerUser(app)).user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('invoice.paid: the membership becomes active and remembers the Stripe ids and the paid period', async () => {
    const membership = await seed();
    stripeSays(membership.id);

    await invoicePaid().expect(200);

    const row = await rowOf(membership.id);
    expect(row.status).toBe(MembershipStatus.ACTIVE);
    expect(row.stripeSubscriptionId).toBe('sub_1');
    expect(row.stripeCustomerId).toBe('cus_1');
    expect(row.currentPeriodEnd).toEqual(PAID_UNTIL);
  });

  it('checkout.session.completed before the payment: linked, but still pending (no discount yet)', async () => {
    const membership = await seed();
    stripeSays(membership.id, { status: 'incomplete', currentPeriodEnd: null });

    await send('checkout.session.completed', {
      id: 'cs_1',
      object: 'checkout.session',
      subscription: 'sub_1',
    }).expect(200);

    const row = await rowOf(membership.id);
    expect(row.status).toBe(MembershipStatus.PENDING);
    expect(row.stripeSubscriptionId).toBe('sub_1');
  });

  it('the event body is NOT trusted: what Stripe says now wins', async () => {
    const membership = await seed();
    stripeSays(membership.id, { status: 'active' });

    // A late event that still carries the old status.
    await subscriptionEvent('customer.subscription.updated', { status: 'past_due' }).expect(200);

    expect((await rowOf(membership.id)).status).toBe(MembershipStatus.ACTIVE);
  });

  it('a failed renewal: past_due, no discount', async () => {
    const membership = await seed();
    stripeSays(membership.id, { status: 'past_due' });

    await subscriptionEvent('customer.subscription.updated').expect(200);

    expect((await rowOf(membership.id)).status).toBe(MembershipStatus.PAST_DUE);
  });

  it('customer.subscription.deleted: canceled, and the user may buy again', async () => {
    const membership = await seed();
    stripeSays(membership.id, { status: 'canceled' });

    await subscriptionEvent('customer.subscription.deleted').expect(200);

    expect((await rowOf(membership.id)).status).toBe(MembershipStatus.CANCELED);
    await expect(seed()).resolves.toBeDefined(); // the partial unique index lets a new one in
  });

  it('the same event twice: 200 both times, the same result', async () => {
    const membership = await seed();
    stripeSays(membership.id);

    await subscriptionEvent('customer.subscription.updated', {}, 'evt_same').expect(200);
    await subscriptionEvent('customer.subscription.updated', {}, 'evt_same').expect(200);

    expect((await rowOf(membership.id)).status).toBe(MembershipStatus.ACTIVE);
    expect(await memberships.count()).toBe(1);
  });

  it('a subscription that is not ours (no membership id) gets a 200 and changes nothing', async () => {
    const membership = await seed();
    stripeSays(null);

    await subscriptionEvent('customer.subscription.updated').expect(200);

    expect((await rowOf(membership.id)).status).toBe(MembershipStatus.PENDING);
  });

  it('a membership id that we do not have (deleted, another database) gets a 200 too', async () => {
    stripeSays('00000000-0000-4000-8000-000000000000');

    await subscriptionEvent('customer.subscription.updated').expect(200);

    expect(await memberships.count()).toBe(0);
  });

  it('Stripe cannot be read: 500 and nothing changes, so Stripe retries; the retry works', async () => {
    const membership = await seed();
    stripeSays(membership.id);
    gateway.failRetrieve = true;

    await invoicePaid().expect(500);
    expect((await rowOf(membership.id)).status).toBe(MembershipStatus.PENDING);

    gateway.failRetrieve = false;
    await invoicePaid().expect(200);
    expect((await rowOf(membership.id)).status).toBe(MembershipStatus.ACTIVE);
  });

  it('touches only THIS membership', async () => {
    const mine = await seed();
    const otherUser = (
      await registerUser(app, {
        userName: 'player2',
        email: 'player2@example.com',
        phone: '+380671110002',
      })
    ).user.id;
    const other = await memberships.save(memberships.create({ userId: otherUser }));
    stripeSays(mine.id);

    await invoicePaid().expect(200);

    expect((await rowOf(mine.id)).status).toBe(MembershipStatus.ACTIVE);
    expect((await rowOf(other.id)).status).toBe(MembershipStatus.PENDING);
  });

  describe('step 6: the checkout page expired unpaid (checkout.session.expired)', () => {
    const expired = (referenceId: string) =>
      send('checkout.session.expired', {
        id: 'cs_1',
        object: 'checkout.session',
        client_reference_id: referenceId,
        subscription: null, // nobody paid: there is no subscription
      });

    it('the pending membership is cancelled, so the user can start a new purchase', async () => {
      const membership = await seed();

      await expired(membership.id).expect(200);

      expect((await rowOf(membership.id)).status).toBe(MembershipStatus.CANCELED);
      await expect(seed()).resolves.toBeDefined(); // the index no longer blocks
    });

    it('a PAID membership is never cancelled by an old expired page', async () => {
      const membership = await seed();
      await memberships.update(membership.id, { status: MembershipStatus.ACTIVE });

      await expired(membership.id).expect(200);

      expect((await rowOf(membership.id)).status).toBe(MembershipStatus.ACTIVE);
    });

    it('the same expired event twice: 200 both times', async () => {
      const membership = await seed();

      await expired(membership.id).expect(200);
      await expired(membership.id).expect(200);

      expect((await rowOf(membership.id)).status).toBe(MembershipStatus.CANCELED);
    });

    it('an id we do not have, or one that is not even ours (not a uuid): 200, nothing changes', async () => {
      const membership = await seed();

      await expired('00000000-0000-4000-8000-000000000000').expect(200);
      await expired('order-42-from-another-system').expect(200);

      expect((await rowOf(membership.id)).status).toBe(MembershipStatus.PENDING);
    });
  });
});
