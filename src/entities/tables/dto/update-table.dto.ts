import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TableColor, TableStatus, TableType } from '@/entities/tables/model/table.entity';

export class UpdateTableDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  capacity: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  pricePerHour: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  height: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  width: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  length: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsEnum(TableColor)
  color?: TableColor;

  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;

  @IsOptional()
  @IsEnum(TableType)
  type?: TableType;
}
