import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { OrderStatus } from '../types/order-status.enum';

// ?page=1&limit=20&status=reserved
export class MyOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

// The admin list can also look at one table or one user. (shortcut: no date range filter yet.)
export class AdminOrdersQueryDto extends MyOrdersQueryDto {
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
