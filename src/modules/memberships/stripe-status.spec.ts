import { toMembershipStatus } from './stripe-status';
import { MembershipStatus } from './types/membership-status.enum';

describe('toMembershipStatus', () => {
  it.each([
    ['incomplete', MembershipStatus.PENDING],
    ['active', MembershipStatus.ACTIVE],
    ['trialing', MembershipStatus.ACTIVE],
    ['past_due', MembershipStatus.PAST_DUE],
    ['unpaid', MembershipStatus.PAST_DUE],
    ['paused', MembershipStatus.PAST_DUE],
    ['canceled', MembershipStatus.CANCELED],
    ['incomplete_expired', MembershipStatus.CANCELED],
  ])('Stripe %s -> %s', (stripe, ours) => {
    expect(toMembershipStatus(stripe)).toBe(ours);
  });

  it('a status Stripe adds in the future gives NO discount', () => {
    expect(toMembershipStatus('something_new')).toBe(MembershipStatus.PAST_DUE);
  });
});
