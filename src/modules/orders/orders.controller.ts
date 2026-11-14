import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/types/request-user.type';
import { CreateOrderDto } from './dto/create-order.dto';
import { MyOrdersQueryDto } from './dto/orders-query.dto';
import { OrdersService } from './orders.service';

// Any logged-in user books for themselves: the owner is taken from the token, never from the body.
@Auth()
@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // POST /api/v1/orders  { "tableIds": ["..."], "startsAt": "2030-01-07T12:00:00+02:00", "endsAt": "...T14:00:00+02:00" }
  // -> 201 [ one order per table ]
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.id, dto);
  }

  // GET /api/v1/orders/my?page=1&limit=20&status=reserved  -> the caller's own bookings, newest first
  @Get('my')
  findMine(@CurrentUser() user: RequestUser, @Query() query: MyOrdersQueryDto) {
    return this.ordersService.findMine(user.id, query);
  }

  // PATCH /api/v1/orders/:id/cancel  -> the order with status "cancelled"
  // The owner (before the start) or an admin; a verb in the path, because cancelling is an action on
  // the order, not an edit of one of its fields.
  @Patch(':id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.cancel(user, id);
  }
}
