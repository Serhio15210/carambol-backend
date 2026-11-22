import { MembershipStatus } from './types/membership-status.enum';

// Stripe's eight subscription statuses folded into our four. Only "active" gives the discount, so every
// status we do not know yet (Stripe may add one) falls into a status WITHOUT the discount.
export function toMembershipStatus(stripeStatus: string): MembershipStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return MembershipStatus.ACTIVE;
    case 'incomplete':
      return MembershipStatus.PENDING;
    case 'canceled':
    case 'incomplete_expired':
      return MembershipStatus.CANCELED;
    default: // past_due, unpaid, paused, and anything new
      return MembershipStatus.PAST_DUE;
  }
}
