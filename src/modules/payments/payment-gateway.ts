// The only thing the rest of the code knows about the payment provider. Stripe hides behind this
// small interface: the tests plug in a fake one, and another provider could be added without
// touching the orders. The webhook signature is still checked by the REAL library in the tests.
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

// A webhook event reduced to what we use. Each id is null when the event is about something else.
// subscriptionId is found in subscription, invoice and checkout session events (lesson 20).
export type PaymentEvent = {
  id: string;
  type: string;
  paymentIntentId: string | null;
  subscriptionId: string | null;
  // client_reference_id of a checkout session: the id of OUR row the page was made for.
  referenceId: string | null;
};

// A subscription as Stripe has it RIGHT NOW (read again on every event: events can come late or twice).
export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  // Stripe's own status: incomplete, active, trialing, past_due, unpaid, paused, canceled, incomplete_expired.
  status: string;
  // Our membership id, put into the subscription metadata when the checkout page was created.
  membershipId: string | null;
  // Paid until; null when Stripe has no period yet.
  currentPeriodEnd: Date | null;
};

export interface PaymentGateway {
  // The idempotency key makes a retry of the SAME request safe: the provider answers with the first
  // result instead of creating a second payment.
  createPaymentIntent(input: {
    amountCents: number;
    currency: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; clientSecret: string }>;

  cancelPaymentIntent(paymentIntentId: string): Promise<void>;

  // No amountCents = the whole payment. The idempotency key protects from refunding twice.
  refund(input: {
    paymentIntentId: string;
    amountCents?: number;
    idempotencyKey: string;
  }): Promise<void>;

  // A monthly Stripe Price (with its Product) for a club's membership plan. A Stripe price never
  // changes: a new price for the plan means calling this again.
  createPlanPrice(input: {
    name: string;
    priceCents: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ priceId: string }>;

  // A Stripe-hosted page where the customer subscribes to the monthly membership (lesson 20).
  // `referenceId` comes back in the webhooks and tells us which row of ours the subscription belongs to.
  createSubscriptionCheckout(input: {
    priceId: string;
    referenceId: string;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string }>;

  // Stops the renewals: the subscription stays active until the paid period ends, then Stripe ends it
  // and sends customer.subscription.deleted. Asking twice is harmless.
  cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<void>;

  // Reads the current state of a subscription. Throws when Stripe is unreachable (the webhook answers
  // 500 and Stripe delivers the event again).
  retrieveSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>;

  // Throws (400) when the signature is wrong, too old or missing. `rawBody` must be the request body
  // exactly as it arrived: parsing and re-serializing it breaks the signature.
  verifyWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent;
}
