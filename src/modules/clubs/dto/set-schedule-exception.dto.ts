import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { trim } from '@/common/transforms/trim.transform';
import { HH_MM } from './set-opening-hours.dto';

// closed: true  -> the club is closed that date (times are ignored).
// closed: false -> the club works that date by its own hours instead of the weekday rule.
export class SetScheduleExceptionDto {
  @IsBoolean()
  closed: boolean;

  @ValidateIf((dto: SetScheduleExceptionDto) => !dto.closed)
  @Matches(HH_MM, { message: 'opensAt must be HH:MM (00:00-23:59)' })
  opensAt?: string;

  @ValidateIf((dto: SetScheduleExceptionDto) => !dto.closed)
  @Matches(HH_MM, { message: 'closesAt must be HH:MM (00:00-23:59)' })
  closesAt?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string;
}
