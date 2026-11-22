import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from '@/common/jobs/jobs.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { ClubsModule } from '@/modules/clubs/clubs.module';
import { MembershipsModule } from '@/modules/memberships/memberships.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { BilliardTablesModule } from '@/modules/tables/billiard-tables.module';
import { AdminOrdersController } from './admin-orders.controller';
import { Order } from './entities/order.entity';
import { OrdersController } from './orders.controller';
import { OrdersJobs } from './orders.jobs';
import { OrdersService } from './orders.service';
import { Payment } from './payments/payment.entity';
import { StripeWebhookController } from './payments/stripe-webhook.controller';

// Orders -> Tables, Clubs, Audit, Payments, Memberships (never the other way round). Everything about tables, rooms and the
// club schedule is asked through their exported services, not through their repositories.
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Payment]),
    BilliardTablesModule,
    ClubsModule,
    AuditModule,
    JobsModule,
    PaymentsModule,
    MembershipsModule,
  ],
  controllers: [OrdersController, AdminOrdersController, StripeWebhookController],
  // A booking payment and its bookings are one unit, so the Payment entity stays here; only the door
  // to Stripe (PAYMENT_GATEWAY) comes from PaymentsModule, shared with the memberships.
  providers: [OrdersService, OrdersJobs],
  exports: [OrdersService],
})
export class OrdersModule {}
