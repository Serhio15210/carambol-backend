import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '@/entities/orders/model/order.entity';
import { TableEntity } from '@/entities/tables/model/table.entity';
import { User } from '@/entities/users/model/user.entity';
import { OrdersController } from '@/entities/orders/controller/orders.controller';
import { AdminOrdersController } from '@/entities/orders/controller/admin-orders.controller';
import { StripeWebhookController } from '@/entities/orders/controller/stripe-webhook.controller';
import { OrdersRepository } from '@/entities/orders/repository/orders.repository';
import { OrdersService } from '@/entities/orders/service/orders.service';
import { OrdersSchedulerService } from '@/entities/orders/service/orders-scheduler.service';
import { UserBaseRepository } from '@/entities/users/repository/user-base.repository';
import { OutboxModule } from '@/shared/outbox/outbox.module';
import { StripeModule } from '@/integrations/stripe/stripe.module';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, TableEntity, User]), OutboxModule, StripeModule],
  controllers: [OrdersController, AdminOrdersController, StripeWebhookController],
  providers: [OrdersRepository, OrdersService, OrdersSchedulerService, UserBaseRepository],
})
export class OrdersModule {}
