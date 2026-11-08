import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { BilliardTableType } from '@/modules/tables/types/table-type.enum';
import { BilliardTableStatus } from '@/modules/tables/types/table-status.enum';

export class GetBilliardTablesQueryDto extends PaginationQueryDto {
  @IsUUID()
  @IsOptional()
  roomId?: string;

  @IsEnum(BilliardTableType)
  @IsOptional()
  type?: BilliardTableType;

  @IsEnum(BilliardTableStatus)
  @IsOptional()
  status?: BilliardTableStatus;
}
