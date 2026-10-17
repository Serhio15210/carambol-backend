import { IsUUID } from 'class-validator';

export class SelectTariffDto {
  @IsUUID()
  tariffId: string;
}
