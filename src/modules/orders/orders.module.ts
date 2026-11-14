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

// Orders -> Tables, Clubs, Audit (never the other way round). Everything about tables, rooms and the
// club schedule is asked through their exported services, not through their repositories.
@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    BilliardTablesModule,
    ClubsModule,
    AuditModule,
    JobsModule,
  ],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, OrdersJobs],
  exports: [OrdersService],
})
export class OrdersModule {}
