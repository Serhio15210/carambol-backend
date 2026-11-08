import { Transform } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '@/common/transforms/trim.transform';

export class CreateClubDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trim)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(trim)
  address: string;

  // IsNumber rejects "50.45" sent as a string; IsLatitude / IsLongitude check the range.
  @IsNumber()
  @IsLatitude()
  lat: number;

  @IsNumber()
  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  minGapCm?: number;
}
