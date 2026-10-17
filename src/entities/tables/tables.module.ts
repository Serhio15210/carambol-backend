import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/entities/users/model/user.entity';
import { TableEntity } from '@/entities/tables/model/table.entity';
import { OrderEntity } from '@/entities/orders/model/order.entity';
import { TablesController } from '@/entities/tables/controller/tables.controller';
import { TablesAdminController } from '@/entities/tables/controller/tables.admin.controller';
import { TablesService } from '@/entities/tables/service/tables.service';
import { TablesRepository } from '@/entities/tables/repository/tables.repository';

@Module({
  imports: [TypeOrmModule.forFeature([User, TableEntity, OrderEntity])],
  controllers: [TablesController, TablesAdminController],
  providers: [TablesService, TablesRepository],
  exports: [TypeOrmModule],
})
export class TablesModule {}
