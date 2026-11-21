import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentGateway } from '@/modules/orders/payments/payment-gateway';
import { StripePaymentGateway } from '@/modules/orders/payments/stripe-payment-gateway';

// Must equal STRIPE_WEBHOOK_SECRET from test-env.ts.
export const TEST_WEBHOOK_SECRET = 'whsec_e2e_test_secret';

type CreateInput = Parameters<PaymentGateway['createPaymentIntent']>[0];
type RefundInput = Parameters<PaymentGateway['refund']>[0];

// A stand-in for Stripe in the e2e tests: it remembers every call, makes no network request, and
// can be told to fail. Like the real Stripe it answers a repeated idempotency key with the first
// result. The webhook signature is checked by the REAL library (StripePaymentGateway.verifyWebhook).
export class FakePaymentGateway implements PaymentGateway {
  intents: (CreateInput & { id: string; clientSecret: string })[] = [];
  cancelled: string[] = [];
  refunds: RefundInput[] = [];
  failCreate = false;
  failRefund = false;
  failCancel = false;

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
    this.keyEndpoints = new Map();
  }

  createPaymentIntent(input: CreateInput): Promise<{ id: string; clientSecret: string }> {
    if (this.failCreate) return Promise.reject(new Error('Stripe is down'));
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
  const body = JSON.stringify({
    id: eventId,
    object: 'event',
    type,
    data: { object: { id: paymentIntentId, object: 'payment_intent' } },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: TEST_WEBHOOK_SECRET,
  });
  return { body, signature, eventId };
}
