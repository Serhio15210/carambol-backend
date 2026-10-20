import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Базовый DTO для списков: ?page=2&limit=20.
// Query-параметры всегда приходят строками, поэтому @Type(() => Number)
// превращает '2' в 2 до того, как сработает проверка @IsInt().
export class PaginationQueryDto {
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
}
