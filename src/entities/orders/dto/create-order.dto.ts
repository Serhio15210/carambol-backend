import { ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  tableIds: string[];

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;
}
