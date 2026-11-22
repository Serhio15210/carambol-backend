// Our short copy of the Stripe subscription status. The truth lives at Stripe, the webhooks keep this copy fresh.
// pending  - the subscription is created, the first month is not paid yet (Stripe: incomplete)
// active   - paid: bookings get the discount (Stripe: active)
// past_due - a renewal payment failed, Stripe is retrying it: no discount meanwhile (Stripe: past_due)
// canceled - over for good: cancelled, or the first payment never came (Stripe: canceled, incomplete_expired)
export enum MembershipStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}
