import { Matches } from 'class-validator';

export const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

// "HH:MM", zero padded, 00:00-23:59. "24:00" is not accepted: around the clock is opensAt == closesAt.
export class SetOpeningHoursDto {
  @Matches(HH_MM, { message: 'opensAt must be HH:MM (00:00-23:59)' })
  opensAt: string;

  @Matches(HH_MM, { message: 'closesAt must be HH:MM (00:00-23:59)' })
  closesAt: string;
}
