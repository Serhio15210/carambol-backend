import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { OrderPaymentStatus, OrderStatus } from '@/entities/orders/model/order.entity';

export class UpdateOrderDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  tableIds?: string[];

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;
}
