import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentEvent, PaymentGateway } from './payment-gateway';

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
    const object = event.data.object as { id?: string; object?: string; payment_intent?: unknown };
    const paymentIntentId =
      object.object === 'payment_intent'
        ? (object.id ?? null)
        : typeof object.payment_intent === 'string'
          ? object.payment_intent
          : null;
    return { id: event.id, type: event.type, paymentIntentId };
  }
}
