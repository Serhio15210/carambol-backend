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
import { Request } from 'express';
import { OrdersService } from '../orders.service';
import { PAYMENT_GATEWAY, PaymentGateway } from './payment-gateway';

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
    return { received: true };
  }
}
