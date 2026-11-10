import {
  DayHours,
  effectiveHours,
  isInInterval,
  isInTail,
  isOpenAt,
  previousDate,
  previousWeekday,
  toLocal,
} from './opening-hours';

const normal: DayHours = { opensAt: '10:00', closesAt: '22:00' };
const overnight: DayHours = { opensAt: '18:00', closesAt: '02:00' };
const allDay: DayHours = { opensAt: '00:00', closesAt: '00:00' };
const aroundFrom10: DayHours = { opensAt: '10:00', closesAt: '10:00' };

// Every minute of a day as "HH:MM".
const MINUTES = Array.from({ length: 1440 }, (_, i) => {
  const hh = String(Math.floor(i / 60)).padStart(2, '0');
  const mm = String(i % 60).padStart(2, '0');
  return `${hh}:${mm}`;
});

describe('isInInterval (your part)', () => {
  it('normal hours: from opening (inclusive) to closing (exclusive)', () => {
    expect(isInInterval('10:00', normal)).toBe(true);
    expect(isInInterval('15:30', normal)).toBe(true);
    expect(isInInterval('21:59', normal)).toBe(true);
    expect(isInInterval('22:00', normal)).toBe(false); // exactly closing time is already closed
    expect(isInInterval('09:59', normal)).toBe(false);
    expect(isInInterval('00:00', normal)).toBe(false);
  });

  it('overnight hours: only the evening part belongs to this day', () => {
    expect(isInInterval('18:00', overnight)).toBe(true);
    expect(isInInterval('23:59', overnight)).toBe(true);
    expect(isInInterval('17:59', overnight)).toBe(false);
    expect(isInInterval('01:30', overnight)).toBe(false); // that is yesterday's tail, not this day
  });

  it('around the clock: everything from opening to the end of the day', () => {
    expect(isInInterval('00:00', allDay)).toBe(true);
    expect(isInInterval('12:00', allDay)).toBe(true);
    expect(isInInterval('23:59', allDay)).toBe(true);
    expect(isInInterval('09:59', aroundFrom10)).toBe(false);
    expect(isInInterval('10:00', aroundFrom10)).toBe(true);
  });
});

describe('isInTail (your part)', () => {
  it('normal hours have no tail', () => {
    expect(isInTail('00:00', normal)).toBe(false);
    expect(isInTail('01:59', normal)).toBe(false);
    expect(isInTail('21:00', normal)).toBe(false);
  });

  it('overnight hours: from midnight until closing (exclusive)', () => {
    expect(isInTail('00:00', overnight)).toBe(true);
    expect(isInTail('01:59', overnight)).toBe(true);
    expect(isInTail('02:00', overnight)).toBe(false);
    expect(isInTail('12:00', overnight)).toBe(false);
    expect(isInTail('18:00', overnight)).toBe(false); // evening part, see isInInterval
  });

  it('around the clock from 10:00: the tail ends at 10:00 the next day', () => {
    expect(isInTail('09:59', aroundFrom10)).toBe(true);
    expect(isInTail('10:00', aroundFrom10)).toBe(false);
    expect(isInTail('00:00', aroundFrom10)).toBe(true);
  });

  it('from 00:00 to 00:00 there is nothing to carry over: the interval covers the whole day', () => {
    expect(MINUTES.some((time) => isInTail(time, allDay))).toBe(false);
  });
});

// The two parts together describe one working interval: the minutes of a day that belong to
// it (its own part today + the tail it left from yesterday) add up to exactly its length.
describe('isInInterval + isInTail together', () => {
  const coveredMinutes = (hours: DayHours) =>
    MINUTES.filter((time) => isInInterval(time, hours) || isInTail(time, hours)).length;

  it.each([
    ['10:00-22:00', normal, 12 * 60],
    ['18:00-02:00', overnight, 8 * 60],
    ['00:00-00:00', allDay, 24 * 60],
    ['10:00-10:00', aroundFrom10, 24 * 60],
  ])('%s covers the right number of minutes', (_name, hours, expected) => {
    expect(coveredMinutes(hours)).toBe(expected);
  });
});

describe('toLocal', () => {
  it.each([
    // [instant (UTC), zone, local date, ISO weekday, local time]
    ['2026-11-14T23:30:00Z', 'Europe/Kyiv', '2026-11-15', 7, '01:30'], // Sunday for Kyiv, Saturday in UTC
    ['2026-11-14T22:00:00Z', 'Europe/Kyiv', '2026-11-15', 7, '00:00'], // midnight is 00:00, never 24:00
    ['2026-11-14T21:59:00Z', 'Europe/Kyiv', '2026-11-14', 6, '23:59'],
    ['2026-11-14T23:30:00Z', 'UTC', '2026-11-14', 6, '23:30'],
    ['2026-11-14T23:30:00Z', 'America/New_York', '2026-11-14', 6, '18:30'],
    ['2026-03-29T00:59:00Z', 'Europe/Kyiv', '2026-03-29', 7, '02:59'], // last minute of winter time (+2)
    ['2026-03-29T01:00:00Z', 'Europe/Kyiv', '2026-03-29', 7, '04:00'], // 03:00-03:59 does not exist
  ])('%s in %s', (instant, zone, date, weekday, time) => {
    expect(toLocal(new Date(instant), zone)).toEqual({ date, weekday, time });
  });
});

describe('previousDate and previousWeekday', () => {
  it('steps one calendar day back over month, year and leap day', () => {
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
    expect(previousDate('2024-03-01')).toBe('2024-02-29');
    expect(previousDate('2026-01-01')).toBe('2025-12-31');
    expect(previousDate('2026-11-15')).toBe('2026-11-14');
  });

  it('Monday is preceded by Sunday (ISO: 1 and 7)', () => {
    expect(previousWeekday(1)).toBe(7);
    expect(previousWeekday(3)).toBe(2);
    expect(previousWeekday(7)).toBe(6);
  });
});

describe('effectiveHours: an exception for the date beats the weekday rule', () => {
  const week = [{ weekday: 1, opensAt: '10:00', closesAt: '22:00' }];
  const closedDay = { date: '2026-11-16', closed: true, opensAt: null, closesAt: null };
  const shortDay = { date: '2026-11-23', closed: false, opensAt: '10:00', closesAt: '14:00' };

  it('uses the weekday rule when the date has no exception', () => {
    expect(effectiveHours('2026-11-09', 1, week, [closedDay, shortDay])).toEqual(week[0]);
  });

  it('a closed exception makes the day closed (null)', () => {
    expect(effectiveHours('2026-11-16', 1, week, [closedDay])).toBeNull();
  });

  it('an exception with hours replaces the weekday hours', () => {
    expect(effectiveHours('2026-11-23', 1, week, [shortDay])).toEqual({
      opensAt: '10:00',
      closesAt: '14:00',
    });
  });

  it('no rule and no exception is a closed day (null)', () => {
    expect(effectiveHours('2026-11-17', 2, week, [closedDay])).toBeNull();
  });
});

// Is the club open at `time` of a local day? Two things can keep it open: TODAY's own interval,
// and the tail that YESTERDAY's overnight interval leaves on today. Both days are passed in:
// null means "closed that whole day".
describe('isOpenAt (your part)', () => {
  const monday: DayHours = { opensAt: '20:00', closesAt: '04:00' }; // overnight
  const tuesday: DayHours = { opensAt: '10:00', closesAt: '18:00' };

  it('open inside today own interval, closed outside of it', () => {
    expect(isOpenAt('12:00', normal, null)).toBe(true);
    expect(isOpenAt('09:59', normal, null)).toBe(false);
    expect(isOpenAt('22:00', normal, null)).toBe(false);
  });

  it('a day that is closed all day (null) gives false', () => {
    expect(isOpenAt('12:00', null, null)).toBe(false);
  });

  it('the evening part of an overnight interval belongs to its own day', () => {
    expect(isOpenAt('23:00', overnight, null)).toBe(true);
    expect(isOpenAt('17:59', overnight, null)).toBe(false);
  });

  it('the tail of YESTERDAY keeps the club open after midnight, until exactly closing', () => {
    expect(isOpenAt('00:00', null, overnight)).toBe(true);
    expect(isOpenAt('01:59', null, overnight)).toBe(true);
    expect(isOpenAt('02:00', null, overnight)).toBe(false);
  });

  it('yesterday normal hours leave no tail', () => {
    expect(isOpenAt('01:00', null, normal)).toBe(false);
    expect(isOpenAt('23:00', null, normal)).toBe(false);
  });

  it('today closed at this time, but yesterday tail is still running: open', () => {
    // Tuesday 03:00: Tuesday itself opens only at 10:00, Monday night works until 04:00.
    expect(isOpenAt('03:00', tuesday, monday)).toBe(true);
    // 04:00 sharp: the Monday night is over, Tuesday is not open yet.
    expect(isOpenAt('04:00', tuesday, monday)).toBe(false);
  });

  it('either part is enough, and a closed yesterday adds nothing', () => {
    expect(isOpenAt('12:00', tuesday, monday)).toBe(true); // today
    expect(isOpenAt('12:00', null, monday)).toBe(false);
    expect(isOpenAt('03:00', tuesday, null)).toBe(false);
  });
});
