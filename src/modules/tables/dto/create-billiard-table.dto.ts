import { IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { BilliardTableType } from '@/modules/tables/types/table-type.enum';
import { BilliardTableStatus } from '@/modules/tables/types/table-status.enum';

export class CreateBilliardTableDto {
  @IsInt()
  @Min(1)
  number: number;

  @IsEnum(BilliardTableType)
  type: BilliardTableType;

  @IsEnum(BilliardTableStatus)
  @IsOptional()
  status?: BilliardTableStatus;

  @IsInt()
  @Min(1)
  lengthCm: number;

  @IsInt()
  @Min(1)
  widthCm: number;

  @IsInt()
  @Min(0)
  x: number;

  @IsInt()
  @Min(0)
  y: number;

  @IsIn([0, 90, 180, 270])
  @IsOptional()
  rotation?: number;
}
