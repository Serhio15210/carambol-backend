import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Auth } from '@/entities/auth/decorators/auth.decorator';
import { CurrentUser } from '@/entities/auth/decorators/current-user.decorator';
import { RequestUser } from '@/entities/users/interfaces/user.interface';
import { UserRole } from '@/entities/users/model/user.entity';
import { CreateOrderDto } from '@/entities/orders/dto/create-order.dto';
import { UpdateOrderDto } from '@/entities/orders/dto/update-order.dto';
import { OrdersService } from '@/entities/orders/service/orders.service';
import { CreateOrderCheckoutDto } from '@/entities/orders/dto/create-order-checkout.dto';

@Auth(UserRole.ADMIN, UserRole.USER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  getMyOrders(@CurrentUser() user: RequestUser) {
    return this.ordersService.getMyOrders(user.id);
  }

  @Post()
  createOrder(@CurrentUser() user: RequestUser, @Body() body: CreateOrderDto) {
    return this.ordersService.createOrderCheckout(user.id, body);
  }

  @Post('checkout')
  createOrderCheckout(@CurrentUser() user: RequestUser, @Body() body: CreateOrderCheckoutDto) {
    return this.ordersService.createOrderCheckout(user.id, body);
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
