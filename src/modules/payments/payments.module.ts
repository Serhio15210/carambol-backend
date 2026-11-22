import { Module } from '@nestjs/common';
import { PAYMENT_GATEWAY } from './payment-gateway';
import { StripePaymentGateway } from './stripe-payment-gateway';

// Only the door to the payment provider. Orders (one-off payments) and Memberships (subscriptions) both
// import it; it imports neither of them, so there is no cycle. What a payment MEANS stays in each module.
@Module({
  providers: [{ provide: PAYMENT_GATEWAY, useClass: StripePaymentGateway }],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
