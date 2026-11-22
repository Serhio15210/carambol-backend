import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { Request } from 'express';
import { MembershipsService } from '@/modules/memberships/memberships.service';
import { OrdersService } from '../orders.service';
import { PAYMENT_GATEWAY, PaymentGateway } from '@/modules/payments/payment-gateway';

// The address Stripe calls: POST /api/stripe/webhook. Two things are different from every other route:
// - no login: Stripe has no JWT. The SIGNATURE of the request is the proof of who sent it.
// - VERSION_NEUTRAL (no /v1): the URL is registered at Stripe by hand, it must not change when the API
//   version does (the same reason as /api/health).
@ApiExcludeController()
@Controller({ path: 'stripe', version: VERSION_NEUTRAL })
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly memberships: MembershipsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  // 400 for a bad signature (Stripe will not retry a forged request for ever, and a real retry
  // carries a fresh signature). Any other failure is a 500 and Stripe sends the event again.
  @Post('webhook')
  @HttpCode(200)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!request.rawBody) {
      throw new BadRequestException('Missing request body');
    }
    // The original bytes, not request.body: the signature covers exactly what was sent.
    const event = this.gateway.verifyWebhook(request.rawBody, signature);

    // Only the success event changes anything. A failed attempt is NOT a reason to cancel: Stripe
    // lets the customer try another card, and the cron job cancels the bookings when time is up.
    if (event.type === 'payment_intent.succeeded' && event.paymentIntentId) {
      const result = await this.orders.confirmPayment(event.paymentIntentId);
      this.logger.log(`${event.id} ${event.type} ${event.paymentIntentId}: ${result}`);
    }
    // Subscriptions (lesson 20): every event that names one only triggers a fresh read from Stripe, so
    // late, repeated or out-of-order events all end in the same, current state.
    if (event.subscriptionId) {
      const result = await this.memberships.syncFromStripe(event.subscriptionId);
      this.logger.log(`${event.id} ${event.type} ${event.subscriptionId}: ${result}`);
    }
    // An abandoned checkout page: nobody paid, so the pending membership must stop blocking a new
    // purchase. Our ids are uuids; anything else is not ours (and would make PostgreSQL throw).
    if (
      event.type === 'checkout.session.expired' &&
      event.referenceId &&
      isUUID(event.referenceId)
    ) {
      const cancelled = await this.memberships.expireCheckout(event.referenceId);
      this.logger.log(`${event.id} ${event.type} ${event.referenceId}: cancelled=${cancelled}`);
    }
    return { received: true };
  }
}
