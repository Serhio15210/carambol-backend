import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { PAYMENT_GATEWAY, PaymentGateway } from '@/modules/payments/payment-gateway';
import { ClubStaffService } from '@/modules/clubs/club-staff.service';
import { ClubsService } from '@/modules/clubs/clubs.service';
import { Actor } from '@/modules/users/users.service';
import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { MembershipPlan } from './entities/membership-plan.entity';
import { UserRole } from '@/modules/users/types/user-role.enum';

@Injectable()
export class MembershipPlansService {
  constructor(
    @InjectRepository(MembershipPlan) private readonly plans: Repository<MembershipPlan>,
    private readonly clubs: ClubsService,
    private readonly staff: ClubStaffService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly config: ConfigService,
  ) {}

  async create(
    actor: Actor,
    clubId: string,
    dto: CreateMembershipPlanDto,
  ): Promise<MembershipPlan> {
    await this.clubs.findById(clubId); // 404 for an unknown club
    await this.assertCanManage(actor, clubId);
    const plan = await this.plans.save(this.plans.create({ ...dto, clubId }));
    let planPrice: { priceId: string } | undefined;
    try {
      planPrice = await this.gateway.createPlanPrice({
        name: plan.name,
        priceCents: plan.priceCents,
        currency: this.config.getOrThrow<string>('stripe.currency'),
        idempotencyKey: plan.id,
      });
    } catch {
      await this.plans.update({ id: plan.id, archivedAt: IsNull() }, { archivedAt: new Date() });
      throw new ServiceUnavailableException('Failed to create plan price at Stripe');
    }
    await this.plans.update({ id: plan.id }, { stripePriceId: planPrice.priceId });
    return { ...plan, stripePriceId: planPrice.priceId };
  }

  // Object-level access: a role is not enough, the user must work in THIS club (admins: any club).
  // 403, not 404: clubs are public, so saying "it exists but is not yours" leaks nothing.
  private async assertCanManage(actor: Actor, clubId: string): Promise<void> {
    if (actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN) {
      return;
    }
    const isStaff = await this.staff.isStaff(clubId, actor.id);
    if (!isStaff) {
      throw new ForbiddenException('Only admins and club staff can manage membership plans');
    }
  }

  // The shop window: only plans that can be bought now (not archived, already priced at Stripe).
  async findOnSale(clubId: string): Promise<MembershipPlan[]> {
    await this.clubs.findById(clubId);
    return await this.plans.find({
      where: { clubId, archivedAt: IsNull(), stripePriceId: Not(IsNull()) },
      order: { priceCents: 'ASC' },
    });
  }

  // Takes a plan off sale: archived, never deleted (memberships point at it). clubId in the condition
  // stops a manager of club A from archiving club B's plan through club A's address (404).
  // shortcut: the Stripe price stays active (only our checkout uses it); deactivate it when others can.

  async archive(actor: Actor, clubId: string, planId: string): Promise<void> {
    await this.clubs.findById(clubId);
    await this.assertCanManage(actor, clubId);
    const planResult = await this.plans.update(
      { id: planId, clubId, archivedAt: IsNull() },
      { archivedAt: new Date() },
    );
    if (!planResult.affected) {
      throw new NotFoundException('No such membership plan on sale in this club');
    }
  }
}
