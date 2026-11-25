import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentEvent, PaymentGateway, SubscriptionSnapshot } from './payment-gateway';

@Injectable()
export class StripePaymentGateway implements PaymentGateway {
  private client?: Stripe;

  constructor(private readonly config: ConfigService) {}

  // Created on first use: the application starts without Stripe keys (only paying needs them).
  private get stripe(): Stripe {
    const key = this.config.get<string>('stripe.secretKey');
    if (!key) {
      throw new ServiceUnavailableException('Payments are not configured (STRIPE_SECRET_KEY)');
    }
    this.client ??= new Stripe(key);
    return this.client;
  }

  async createPaymentIntent(input: {
    amountCents: number;
    currency: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; clientSecret: string }> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: input.currency,
        metadata: input.metadata,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!intent.client_secret) {
      throw new Error('Stripe returned a payment without client_secret');
    }
    return { id: intent.id, clientSecret: intent.client_secret };
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(paymentIntentId);
  }

  async refund(input: {
    paymentIntentId: string;
    amountCents?: number;
    idempotencyKey: string;
  }): Promise<void> {
    await this.stripe.refunds.create(
      { payment_intent: input.paymentIntentId, amount: input.amountCents },
      { idempotencyKey: input.idempotencyKey },
    );
  }

  async createPlanPrice(input: {
    name: string;
    priceCents: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ priceId: string }> {
    const price = await this.stripe.prices.create(
      {
        currency: input.currency,
        unit_amount: input.priceCents,
        recurring: { interval: 'month' },
        product_data: { name: input.name }, // the Product is created in the same call
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { priceId: price.id };
  }

  async createSubscriptionCheckout(input: {
    priceId: string;
    referenceId: string;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string }> {
    const returnUrl = this.config.getOrThrow<string>('stripe.checkoutReturnUrl');
    // In subscription mode Checkout always creates a Customer (a subscription needs one to charge
    // every month), so we do not create it ourselves.
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: input.priceId, quantity: 1 }],
        client_reference_id: input.referenceId,
        subscription_data: { metadata: { membershipId: input.referenceId } },
        // An abandoned page keeps our row pending (and blocks a new purchase) until it expires:
        // 35 minutes instead of Stripe's default 24 hours (Stripe allows 30 minutes..24 hours; the
        // 5 extra minutes cover a clock difference between our server and Stripe).
        expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
        success_url: `${returnUrl}?result=success`,
        cancel_url: `${returnUrl}?result=cancel`,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!session.url) {
      throw new Error('Stripe returned a checkout session without url');
    }
    return { id: session.id, url: session.url };
  }

  async cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  }

  async retrieveSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    // Since API 2025-03 the billing period lives on the subscription ITEM, not on the subscription.
    const periodEnd = sub.items.data[0]?.current_period_end;
    return {
      id: sub.id,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      status: sub.status,
      membershipId: sub.metadata.membershipId ?? null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent {
    const secret = this.config.get<string>('stripe.webhookSecret');
    if (!secret) {
      throw new ServiceUnavailableException('Webhooks are not configured (STRIPE_WEBHOOK_SECRET)');
    }
    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    let event: Stripe.Event;
    try {
      // Static helper: needs no API key and makes no network call, it only checks the HMAC and the
      // age of the timestamp (5 minutes by default: a replayed old request is refused).
      event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    // A payment_intent.* event IS the payment intent; a charge.* event points to it.
    const object = event.data.object as {
      id?: string;
      object?: string;
      payment_intent?: unknown;
      subscription?: unknown;
      parent?: { subscription_details?: { subscription?: unknown } | null } | null;
      client_reference_id?: unknown;
    };
    const paymentIntentId =
      object.object === 'payment_intent'
        ? (object.id ?? null)
        : typeof object.payment_intent === 'string'
          ? object.payment_intent
          : null;
    return {
      id: event.id,
      type: event.type,
      paymentIntentId,
      subscriptionId: subscriptionOf(object),
      referenceId:
        object.object === 'checkout.session' && typeof object.client_reference_id === 'string'
          ? object.client_reference_id
          : null,
    };
  }
}

// customer.subscription.* IS the subscription; a checkout session points to it; an invoice points to it
// through parent.subscription_details (since API 2025-03 an invoice has no top-level "subscription").
function subscriptionOf(object: {
  id?: string;
  object?: string;
  subscription?: unknown;
  parent?: { subscription_details?: { subscription?: unknown } | null } | null;
}): string | null {
  if (object.object === 'subscription') return object.id ?? null;
  const link =
    object.object === 'invoice'
      ? object.parent?.subscription_details?.subscription
      : object.subscription;
  return typeof link === 'string' ? link : null;
}
