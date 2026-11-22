import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentGateway, SubscriptionSnapshot } from '@/modules/payments/payment-gateway';
import { StripePaymentGateway } from '@/modules/payments/stripe-payment-gateway';

// Must equal STRIPE_WEBHOOK_SECRET from test-env.ts.
export const TEST_WEBHOOK_SECRET = 'whsec_e2e_test_secret';

type CreateInput = Parameters<PaymentGateway['createPaymentIntent']>[0];
type RefundInput = Parameters<PaymentGateway['refund']>[0];
type CheckoutInput = Parameters<PaymentGateway['createSubscriptionCheckout']>[0];

// A stand-in for Stripe in the e2e tests: it remembers every call, makes no network request, and
// can be told to fail. Like the real Stripe it answers a repeated idempotency key with the first
// result. The webhook signature is checked by the REAL library (StripePaymentGateway.verifyWebhook).
export class FakePaymentGateway implements PaymentGateway {
  intents: (CreateInput & { id: string; clientSecret: string })[] = [];
  cancelled: string[] = [];
  refunds: RefundInput[] = [];
  checkouts: (CheckoutInput & { id: string; url: string })[] = [];
  failCreate = false;
  failRefund = false;
  failCancel = false;
  failCheckout = false;
  // What "Stripe" says about each subscription right now; a test sets it before sending an event.
  subscriptions = new Map<string, SubscriptionSnapshot>();
  failRetrieve = false;
  cancelledSubscriptions: string[] = [];
  failCancelSubscription = false;

  // Like the real Stripe: a key first used to create a payment cannot be reused for a refund
  // (Stripe answers "Keys for idempotent requests can only be used for the same endpoint...").
  private keyEndpoints = new Map<string, string>();
  private keyError(key: string, endpoint: string): Error | null {
    const first = this.keyEndpoints.get(key);
    if (first && first !== endpoint) {
      return new Error(
        `Keys for idempotent requests can only be used for the same endpoint they were first used for ('${endpoint}' vs '${first}')`,
      );
    }
    this.keyEndpoints.set(key, endpoint);
    return null;
  }

  private readonly verifier = new StripePaymentGateway(
    new ConfigService({ stripe: { webhookSecret: TEST_WEBHOOK_SECRET } }),
  );

  // One fake is shared by all tests of a file: forget everything between the tests.
  reset(): void {
    this.intents = [];
    this.cancelled = [];
    this.refunds = [];
    this.failCreate = false;
    this.failRefund = false;
    this.failCancel = false;
    this.checkouts = [];
    this.failCheckout = false;
    this.subscriptions = new Map();
    this.failRetrieve = false;
    this.cancelledSubscriptions = [];
    this.failCancelSubscription = false;
    this.keyEndpoints = new Map();
  }

  createPaymentIntent(input: CreateInput): Promise<{ id: string; clientSecret: string }> {
    if (this.failCreate) return Promise.reject(new Error('Stripe is down'));
    // Like the real Stripe (code amount_too_small): nothing below 0.50 USD can be charged.
    if (input.amountCents < 50) {
      return Promise.reject(new Error('Amount must be at least $0.50 usd'));
    }
    const keyError = this.keyError(input.idempotencyKey, '/v1/payment_intents');
    if (keyError) return Promise.reject(keyError);
    const same = this.intents.find((intent) => intent.idempotencyKey === input.idempotencyKey);
    if (same) return Promise.resolve({ id: same.id, clientSecret: same.clientSecret });
    const id = `pi_fake_${this.intents.length + 1}`;
    const created = { ...input, id, clientSecret: `${id}_secret_fake` };
    this.intents.push(created);
    return Promise.resolve({ id, clientSecret: created.clientSecret });
  }

  cancelPaymentIntent(paymentIntentId: string): Promise<void> {
    if (this.failCancel) return Promise.reject(new Error('Stripe is down'));
    this.cancelled.push(paymentIntentId);
    return Promise.resolve();
  }

  refund(input: RefundInput): Promise<void> {
    if (this.failRefund) return Promise.reject(new Error('Stripe is down'));
    const keyError = this.keyError(input.idempotencyKey, '/v1/refunds');
    if (keyError) return Promise.reject(keyError);
    this.refunds.push(input);
    return Promise.resolve();
  }

  createSubscriptionCheckout(input: CheckoutInput): Promise<{ id: string; url: string }> {
    if (this.failCheckout) return Promise.reject(new Error('Stripe is down'));
    const keyError = this.keyError(input.idempotencyKey, '/v1/checkout/sessions');
    if (keyError) return Promise.reject(keyError);
    const same = this.checkouts.find((c) => c.idempotencyKey === input.idempotencyKey);
    if (same) return Promise.resolve({ id: same.id, url: same.url });
    const id = `cs_fake_${this.checkouts.length + 1}`;
    const created = { ...input, id, url: `https://checkout.stripe.test/${id}` };
    this.checkouts.push(created);
    return Promise.resolve({ id, url: created.url });
  }

  cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<void> {
    if (this.failCancelSubscription) return Promise.reject(new Error('Stripe is down'));
    this.cancelledSubscriptions.push(subscriptionId);
    return Promise.resolve();
  }

  retrieveSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    if (this.failRetrieve) return Promise.reject(new Error('Stripe is down'));
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return Promise.reject(new Error(`No such subscription: '${subscriptionId}'`));
    return Promise.resolve(sub);
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    return this.verifier.verifyWebhook(rawBody, signature);
  }
}

// A webhook the way Stripe sends it: the JSON body and the Stripe-Signature header over that exact body.
export function signedWebhook(
  type: string,
  paymentIntentId: string,
  eventId = `evt_${randomUUID()}`,
): { body: string; signature: string; eventId: string } {
  return signedEvent(type, { id: paymentIntentId, object: 'payment_intent' }, eventId);
}

// Any event with the given data.object, signed like Stripe does.
export function signedEvent(
  type: string,
  object: object,
  eventId = `evt_${randomUUID()}`,
): { body: string; signature: string; eventId: string } {
  const body = JSON.stringify({ id: eventId, object: 'event', type, data: { object } });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: TEST_WEBHOOK_SECRET,
  });
  return { body, signature, eventId };
}
