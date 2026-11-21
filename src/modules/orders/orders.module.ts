import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from '@/common/jobs/jobs.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { ClubsModule } from '@/modules/clubs/clubs.module';
import { BilliardTablesModule } from '@/modules/tables/billiard-tables.module';
import { AdminOrdersController } from './admin-orders.controller';
import { Order } from './entities/order.entity';
import { OrdersController } from './orders.controller';
import { OrdersJobs } from './orders.jobs';
import { OrdersService } from './orders.service';
import { PAYMENT_GATEWAY } from './payments/payment-gateway';
import { Payment } from './payments/payment.entity';
import { StripePaymentGateway } from './payments/stripe-payment-gateway';
import { StripeWebhookController } from './payments/stripe-webhook.controller';

// Orders -> Tables, Clubs, Audit (never the other way round). Everything about tables, rooms and the
// club schedule is asked through their exported services, not through their repositories.
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Payment]),
    BilliardTablesModule,
    ClubsModule,
    AuditModule,
    JobsModule,
  ],
  controllers: [OrdersController, AdminOrdersController, StripeWebhookController],
  // The payment code lives inside the orders module: a payment and its bookings are one unit, and a
  // separate Payments module would import Orders while Orders imports Payments (a cycle, lesson 10).
  // shortcut: extract it when subscriptions (lesson 20) need payments without bookings.
  providers: [
    OrdersService,
    OrdersJobs,
    { provide: PAYMENT_GATEWAY, useClass: StripePaymentGateway },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
