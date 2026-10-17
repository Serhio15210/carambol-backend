import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TariffStatus, TariffType } from '@/entities/tariffs/model/tariff.entity';

export class UpdateTariffDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyLimitMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountPrice?: number;

  @IsOptional()
  @IsEnum(TariffType)
  type?: TariffType;

  @IsOptional()
  @IsEnum(TariffStatus)
  status?: TariffStatus;
}
