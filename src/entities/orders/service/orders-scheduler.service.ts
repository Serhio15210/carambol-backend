import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrdersService } from '@/entities/orders/service/orders.service';

@Injectable()
export class OrdersSchedulerService {
  constructor(private readonly ordersService: OrdersService) {}

  @Interval(60_000)
  async refreshOrderStatuses() {
    await this.ordersService.refreshOrderStatuses();
  }
}
