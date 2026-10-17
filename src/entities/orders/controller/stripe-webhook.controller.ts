import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from '@/integrations/stripe/stripe.service';
import { OrdersService } from '@/entities/orders/service/orders.service';

@Controller('stripe')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly ordersService: OrdersService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Stripe signature is missing');
    }
    if (!request.rawBody) {
      throw new BadRequestException('Stripe raw body is missing');
    }

    const event = this.stripeService.constructWebhookEvent(request.rawBody, signature);

    if (event.type === 'payment_intent.succeeded') {
      await this.ordersService.confirmStripePayment(event.data.object);
    }

    if (event.type === 'payment_intent.payment_failed') {
      await this.ordersService.failStripePayment(event.data.object);
    }

    if (event.type === 'payment_intent.canceled') {
      await this.ordersService.cancelStripePayment(event.data.object);
    }

    return { received: true };
  }
}
