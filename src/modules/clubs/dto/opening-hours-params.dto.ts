import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

// Route parameters arrive as strings, @Type(() => Number) converts weekday before the checks.
export class OpeningHoursParamsDto {
  @IsUUID()
  clubId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;
}
