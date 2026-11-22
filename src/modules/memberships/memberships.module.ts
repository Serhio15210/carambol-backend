import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { Membership } from './entities/membership.entity';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

// Memberships -> Payments (the door to Stripe). Orders will ask this module about the discount, never the
// other way round.
@Module({
  imports: [TypeOrmModule.forFeature([Membership]), PaymentsModule],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
