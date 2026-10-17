import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TariffEntity } from '@/entities/tariffs/model/tariff.entity';
import { UserTariffEntity } from '@/entities/tariffs/model/user-tariff.entity';
import { TariffsController } from '@/entities/tariffs/controller/tariffs.controller';
import { AdminTariffsController } from '@/entities/tariffs/controller/admin-tariffs.controller';
import { TariffsRepository } from '@/entities/tariffs/repository/tariffs.repository';
import { TariffsService } from '@/entities/tariffs/service/tariffs.service';
import { TariffsSchedulerService } from '@/entities/tariffs/service/tariffs-scheduler.service';

@Module({
  imports: [TypeOrmModule.forFeature([TariffEntity, UserTariffEntity])],
  controllers: [TariffsController, AdminTariffsController],
  providers: [TariffsRepository, TariffsService, TariffsSchedulerService],
  exports: [TariffsService],
})
export class TariffsModule {}
