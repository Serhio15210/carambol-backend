import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/modules/audit/audit.module';
import { BilliardTable } from '@/modules/tables/entities/billiard-table.entity';
import { BilliardTablesController } from '@/modules/tables/billiard-tables.controller';
import { AdminBilliardTablesController } from './admin-billiard-tables.controller';
import { BilliardTablesService } from '@/modules/tables/billiard-tables.service';

@Module({
  imports: [TypeOrmModule.forFeature([BilliardTable]), AuditModule],
  controllers: [BilliardTablesController, AdminBilliardTablesController],
  providers: [BilliardTablesService],

  exports: [BilliardTablesService],
})
export class BilliardTablesModule {}
