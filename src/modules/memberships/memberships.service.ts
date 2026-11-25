import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { PAYMENT_GATEWAY, PaymentGateway } from '@/modules/payments/payment-gateway';
import { MembershipPlan } from './entities/membership-plan.entity';
import { Membership } from './entities/membership.entity';
import { MembershipStatus } from './types/membership-status.enum';
import { toMembershipStatus } from './stripe-status';

export type StartedMembership = { membershipId: string; url: string };
// 'unknown' = the subscription is not one of ours (no membership id in its metadata, or no such row).
export type CancelledMembership = { membershipId: string; activeUntil: Date | null };
export type MembershipSync = 'synced' | 'unknown';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(MembershipPlan) private readonly plans: Repository<MembershipPlan>,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  // Our database first: the partial unique index refuses a second live membership (23505 -> 409).
  // Then Stripe: referenceId comes back in the webhooks, the idempotency key makes a retry safe.
  // If Stripe fails, our pending row would block every next try (the index), so it is cancelled
  // (kept, not deleted: a trace for support and reports) and the client gets a 503.

  async start(userId: string, planId: string): Promise<StartedMembership> {
    // Only a plan that can be bought now (the shop-window filter); its club goes into the row, so the
    // unique index (userId, clubId) allows one live membership per club.
    const plan = await this.plans.findOne({
      where: { id: planId, archivedAt: IsNull(), stripePriceId: Not(IsNull()) },
    });
    if (!plan || !plan.stripePriceId) {
      throw new NotFoundException('Plan not found or not available for purchase');
    }
    const membership = await this.memberships.save(
      this.memberships.create({ userId, planId: plan.id, clubId: plan.clubId }),
    );
    try {
      const checkout = await this.gateway.createSubscriptionCheckout({
        priceId: plan.stripePriceId,
        referenceId: membership.id,
        idempotencyKey: membership.id,
      });
      return { membershipId: membership.id, url: checkout.url };
    } catch {
      await this.memberships.update(
        { id: membership.id, status: MembershipStatus.PENDING },
        { status: MembershipStatus.CANCELED },
      );
      throw new ServiceUnavailableException('Failed to create subscription checkout');
    }
  }

  // Called by the webhook for ANY event about a subscription. The event is only a signal: the
  // subscription is read again and what Stripe says NOW is copied into our row, so late, repeated or
  // out-of-order events all end in the same state. Not ours -> 'unknown' (200, no endless retries);
  // Stripe unreachable -> the error goes up (500, Stripe delivers the event again).

  async syncFromStripe(subscriptionId: string): Promise<MembershipSync> {
    const subscription = await this.gateway.retrieveSubscription(subscriptionId);
    if (!subscription.membershipId) {
      return 'unknown';
    }
    const status = toMembershipStatus(subscription.status);
    const updates = await this.memberships.update(
      { id: subscription.membershipId },
      {
        status,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customerId,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    );
    if (!updates.affected) {
      return 'unknown';
    }
    return 'synced';
  }

  // The discount (in percent) this user gets on a booking right now: only an ACTIVE membership counts.
  // Read from OUR copy of the status, so booking keeps working when Stripe is down.

  // The discount in THIS club: the plan of the user's ACTIVE membership there; otherwise 0.
  async discountPercentFor(userId: string, clubId: string): Promise<number> {
    const membership = await this.memberships.findOne({
      where: { clubId, userId, status: MembershipStatus.ACTIVE },
      relations: { plan: true },
    });
    if (!membership) {
      return 0;
    }
    return membership.plan?.discountPercent || 0;
  }

  // The checkout page expired unpaid (checkout.session.expired): the pending membership stops blocking a
  // new purchase. Only from pending: an old page must never cancel a paid membership.

  async expireCheckout(membershipId: string): Promise<boolean> {
    const updates = await this.memberships.update(
      { id: membershipId, status: MembershipStatus.PENDING },
      { status: MembershipStatus.CANCELED },
    );
    return !!updates.affected;
  }

  // The user stops the membership at the end of the paid period. The status is NOT changed here: it
  // stays active until the period ends, then customer.subscription.deleted makes it canceled.
  async cancel(userId: string, membershipId: string): Promise<CancelledMembership> {
    const cancelableStatuses = [MembershipStatus.ACTIVE, MembershipStatus.PAST_DUE];
    const memberships = await this.memberships.findOne({
      where: { id: membershipId, userId, status: In(cancelableStatuses) },
    });
    if (!memberships || !memberships.stripeSubscriptionId) {
      throw new NotFoundException('No membership to cancel');
    }
    try {
      await this.gateway.cancelSubscriptionAtPeriodEnd(memberships.stripeSubscriptionId);
    } catch {
      throw new ServiceUnavailableException();
    }
    return { membershipId: memberships.id, activeUntil: memberships.currentPeriodEnd };
  }
}
