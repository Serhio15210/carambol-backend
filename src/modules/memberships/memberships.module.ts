import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClubsModule } from '@/modules/clubs/clubs.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { MembershipPlan } from './entities/membership-plan.entity';
import { Membership } from './entities/membership.entity';
import { MembershipPlansController } from './membership-plans.controller';
import { MembershipPlansService } from './membership-plans.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

// Memberships -> Payments (the door to Stripe). Orders will ask this module about the discount, never the
// other way round.
@Module({
  imports: [TypeOrmModule.forFeature([Membership, MembershipPlan]), PaymentsModule, ClubsModule],
  controllers: [MembershipsController, MembershipPlansController],
  providers: [MembershipsService, MembershipPlansService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
