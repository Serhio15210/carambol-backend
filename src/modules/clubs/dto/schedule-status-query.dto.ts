import { IsISO8601, IsOptional, Matches } from 'class-validator';

// `at` is an INSTANT, so the offset is mandatory: "2026-11-14T23:30:00Z" or "...+02:00".
// Without it JavaScript would read the text in the SERVER's time zone, the very bug lesson 16 is about.
export class ScheduleStatusQueryDto {
  @IsOptional()
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, { message: 'at must end with Z or an offset like +02:00' })
  @IsISO8601({ strict: true })
  at?: string;
}
