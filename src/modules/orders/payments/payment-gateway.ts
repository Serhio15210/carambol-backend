// The only thing the rest of the code knows about the payment provider. Stripe hides behind this
// small interface: the tests plug in a fake one, and another provider could be added without
// touching the orders. The webhook signature is still checked by the REAL library in the tests.
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

// A webhook event reduced to what we use. `paymentIntentId` is null for events about something else.
export type PaymentEvent = { id: string; type: string; paymentIntentId: string | null };

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

  // Throws (400) when the signature is wrong, too old or missing. `rawBody` must be the request body
  // exactly as it arrived: parsing and re-serializing it breaks the signature.
  verifyWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent;
}
