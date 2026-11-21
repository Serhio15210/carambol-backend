// pending   - waiting for the customer to pay (the bookings of this payment are pending too)
// succeeded - Stripe confirmed the money by a signed webhook (the bookings become reserved)
// expired   - nobody paid in time: the bookings were cancelled by the cron job
// failed    - we could not even create the payment at Stripe: nothing was charged
// refunded  - the money was paid but sent back (a late payment after the expiry)
export enum PaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  EXPIRED = 'expired',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
