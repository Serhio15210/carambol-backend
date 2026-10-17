import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import StripeConstructor from 'stripe';

export type StripePaymentIntent = {
  id: string;
  amount: number;
  client_secret: string | null;
  metadata: {
    orderId?: string;
    userId?: string;
  };
};

export type StripeWebhookEvent = {
  type: string;
  data: {
    object: StripePaymentIntent;
  };
};

@Injectable()
export class StripeService {
  private readonly stripe: InstanceType<typeof StripeConstructor>;
  private readonly currency: string;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.currency = this.config.getOrThrow<string>('stripe.currency');
    this.webhookSecret = this.config.getOrThrow<string>('stripe.webhookSecret');
    this.stripe = new StripeConstructor(this.config.getOrThrow<string>('stripe.secretKey'));
  }

  async createOrderPaymentIntent(params: {
    orderId: string;
    userId: string;
    amount: number;
  }): Promise<StripePaymentIntent> {
    return this.stripe.paymentIntents.create({
      amount: this.toMinorUnits(params.amount),
      currency: this.currency,
      metadata: {
        orderId: params.orderId,
        userId: params.userId,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  constructWebhookEvent(payload: Buffer, signature: string): StripeWebhookEvent {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    ) as unknown as StripeWebhookEvent;
  }

  private toMinorUnits(amount: number): number {
    return amount * 100;
  }
}
