import { OrderStatus } from '@/entities/orders/model/order.entity';

export type OrderFindAllFilters = {
  userId?: string;
  statuses?: OrderStatus[];
};
