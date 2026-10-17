import { OrderEntity } from '@/entities/orders/model/order.entity';

export type OrderCheckoutResponse = {
  order: OrderEntity;
  clientSecret: string;
};
