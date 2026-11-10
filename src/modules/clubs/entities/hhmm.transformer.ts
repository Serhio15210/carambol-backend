// PostgreSQL returns a `time` column as "10:00:00". The whole code works with "HH:MM" strings
// (zero padded, so plain string comparison orders them correctly), and "10:00" < "10:00:00"
// would be a silent bug, so the seconds are cut off right here. NULL stays NULL.
export const hhmm = {
  to: (value: string | null): string | null => value,
  from: (value: string | null): string | null => (value === null ? null : value.slice(0, 5)),
};
