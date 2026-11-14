import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { AdminOrdersQueryDto } from './dto/orders-query.dto';
import { OrdersService } from './orders.service';

@Auth(UserRole.ADMIN, UserRole.SUPERADMIN)
@ApiTags('admin: orders')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // GET /api/v1/admin/orders?status=reserved&tableId=...&userId=...&page=1&limit=20
  @Get()
  findAll(@Query() query: AdminOrdersQueryDto) {
    return this.ordersService.findAll(query);
  }
}
