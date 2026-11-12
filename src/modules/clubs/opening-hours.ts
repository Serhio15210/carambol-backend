// The opening hours of one day: "HH:MM" strings, zero padded ("09:00", not "9:00"), so plain
// string comparison (<, >=) orders them correctly. No dates, no time zones here: the caller has
// already turned the moment into the club's LOCAL time of day.
//
// Rule for closesAt <= opensAt: the club closes on the NEXT day (18:00-02:00). Equal times mean
// around the clock (10:00-10:00 is open from 10:00 until 10:00 the next day).
// An interval is half-open: [opensAt, closesAt), so exactly closesAt is already closed.
export type DayHours = { opensAt: string; closesAt: string };

// Is `time` inside the part of the interval that lies on the SAME day it starts?
// Normal hours (10:00-22:00): opens <= time < closes. Overnight or around-the-clock
// hours (closes <= opens): from opensAt to the end of the day, i.e. time >= opensAt.
export function isInInterval(time: string, hours: DayHours): boolean {
  const openHours = parseInt(hours.opensAt.split(':')[0]);
  const openMinutes = parseInt(hours.opensAt.split(':')[1]);
  const closeHours = parseInt(hours.closesAt.split(':')[0]);
  const closeMinutes = parseInt(hours.closesAt.split(':')[1]);
  const timeHours = parseInt(time.split(':')[0]);
  const timeMinutes = parseInt(time.split(':')[1]);
  const openSeconds = openHours * 3600 + openMinutes * 60;
  const closeSeconds = closeHours * 3600 + closeMinutes * 60;
  const seconds = timeHours * 3600 + timeMinutes * 60;
  if (closeSeconds > openSeconds) {
    return openSeconds <= seconds && seconds < closeSeconds;
  }
  return openSeconds <= seconds;
}

// Is `time` inside the "tail" that the interval of the PREVIOUS day leaves on this day
// (the 00:00-02:00 part of yesterday's 18:00-02:00)? Normal hours have no tail.
// Only overnight or around-the-clock hours (closes <= opens) have one:
// from 00:00 until closesAt, exclusive.
export function isInTail(time: string, hours: DayHours): boolean {
  const openHours = parseInt(hours.opensAt.split(':')[0]);
  const openMinutes = parseInt(hours.opensAt.split(':')[1]);
  const closeHours = parseInt(hours.closesAt.split(':')[0]);
  const closeMinutes = parseInt(hours.closesAt.split(':')[1]);
  const timeHours = parseInt(time.split(':')[0]);
  const timeMinutes = parseInt(time.split(':')[1]);
  const openSeconds = openHours * 3600 + openMinutes * 60;
  const closeSeconds = closeHours * 3600 + closeMinutes * 60;
  const seconds = timeHours * 3600 + timeMinutes * 60;
  return closeSeconds <= openSeconds && seconds < closeSeconds;
}

// ---- From a moment in time to "is the club open?" ----------------------------------------------

// The club's LOCAL calendar date ("2026-11-15"), ISO weekday (1 = Monday ... 7 = Sunday) and
// time of day ("01:30") of one instant.
export type LocalMoment = { date: string; weekday: number; time: string };

const ISO_WEEKDAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

// Intl knows the IANA zone rules, daylight saving included. hourCycle h23 prints midnight as
// "00", not "24". An instant always has exactly ONE local time (the opposite, local -> instant,
// is ambiguous twice a year, and we never need it).
export function toLocal(at: Date, timeZone: string): LocalMoment {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: ISO_WEEKDAY[parts.weekday],
    time: `${parts.hour}:${parts.minute}`,
  };
}

// "2026-03-01" -> "2026-02-28". Pure calendar arithmetic in UTC, no time zone involved.
export function previousDate(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export const previousWeekday = (weekday: number): number => (weekday === 1 ? 7 : weekday - 1);

export type WeekdayHours = DayHours & { weekday: number };
export type DateException = {
  date: string;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

// The hours that apply on one local date: an exception for that exact date beats the weekday
// rule; no exception and no weekday rule = closed all day (null).
export function effectiveHours(
  date: string,
  weekday: number,
  week: WeekdayHours[],
  exceptions: DateException[],
): DayHours | null {
  const exception = exceptions.find((e) => e.date === date);
  if (exception) {
    const { closed, opensAt, closesAt } = exception;
    return closed || opensAt === null || closesAt === null ? null : { opensAt, closesAt };
  }
  return week.find((h) => h.weekday === weekday) ?? null;
}

// Is the club open at `time` of the local day? `today` and `yesterday` are the hours of the two
// calendar days (null = closed that day). Two things can keep the club open at this time:
// today's own interval, or the tail that YESTERDAY's overnight interval leaves on today.
// A null day (closed all day) adds nothing, but it must not switch off the other day's part.
export function isOpenAt(
  time: string,
  today: DayHours | null,
  yesterday: DayHours | null,
): boolean {
  return (
    (today ? isInInterval(time, today) : false) || (yesterday ? isInTail(time, yesterday) : false)
  );
}

// Everything needed to answer "is the club open at this instant?", already loaded from the database.
export type ScheduleData = {
  timezone: string;
  hours: WeekdayHours[];
  exceptions: DateException[];
};

// instant -> the club's local date, weekday and time -> hours of today and of yesterday
// (an exception for the date beats the weekday rule) -> isOpenAt. No database access: bookings call
// it for every slot of a booking with one loaded schedule.
export function isClubOpenAt({ timezone, hours, exceptions }: ScheduleData, at: Date): boolean {
  const local = toLocal(at, timezone);
  const yesterday = previousDate(local.date);
  return isOpenAt(
    local.time,
    effectiveHours(local.date, local.weekday, hours, exceptions),
    effectiveHours(yesterday, previousWeekday(local.weekday), hours, exceptions),
  );
}
