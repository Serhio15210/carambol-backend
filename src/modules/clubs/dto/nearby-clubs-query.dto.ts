import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

// page and limit come from PaginationQueryDto (the same ?page=2&limit=20 as every other list).
// Query parameters always arrive as strings: @Type(() => Number) converts them BEFORE validation.
// "?lat=abc" becomes NaN, which @IsNumber() rejects.
export class NearbyClubsQueryDto extends PaginationQueryDto {
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radiusKm = 10;
}
