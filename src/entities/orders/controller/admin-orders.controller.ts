import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Auth } from '@/entities/auth/decorators/auth.decorator';
import { UserRole } from '@/entities/users/model/user.entity';
import { CurrentUser } from '@/entities/auth/decorators/current-user.decorator';
import { RequestUser } from '@/entities/users/interfaces/user.interface';
import { UpdateOrderDto } from '@/entities/orders/dto/update-order.dto';
import { OrdersService } from '@/entities/orders/service/orders.service';

@Auth(UserRole.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  getAllOrders() {
    return this.ordersService.getAllOrders();
  }

  @Patch(':id')
  updateOrder(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: UpdateOrderDto,
  ) {
    return this.ordersService.updateOrder(id, body, user);
  }

  @Post(':id/cancel')
  cancelOrder(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ordersService.cancelOrder(id, user);
  }
}
