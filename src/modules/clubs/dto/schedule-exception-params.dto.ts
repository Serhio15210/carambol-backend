import { IsISO8601, IsUUID, Matches } from 'class-validator';

// :date is a calendar day of the club, "YYYY-MM-DD". IsISO8601({ strict: true }) also rejects
// days that do not exist ("2026-02-30"); the pattern rejects a full timestamp.
export class ScheduleExceptionParamsDto {
  @IsUUID()
  clubId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  date: string;
}
