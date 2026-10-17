import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TariffsService } from '@/entities/tariffs/service/tariffs.service';

@Injectable()
export class TariffsSchedulerService {
  constructor(private readonly tariffsService: TariffsService) {}

  @Interval(60_000)
  async expireFinishedTariffs() {
    await this.tariffsService.expireFinishedUserTariffs();
  }
}
