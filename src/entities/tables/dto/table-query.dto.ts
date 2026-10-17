import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TableColor, TableStatus, TableType } from '@/entities/tables/model/table.entity';

export class TableQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;

  @IsOptional()
  @IsEnum(TableType)
  type?: TableType;

  @IsOptional()
  @IsEnum(TableColor)
  color?: TableColor;
}
