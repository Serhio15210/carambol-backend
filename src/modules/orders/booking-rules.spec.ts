import {
  bookingTimeProblem,
  isInsideWorkingHours,
  isOnStep,
  MAX_BOOKING_MINUTES,
  slotStarts,
} from './booking-rules';

const at = (iso: string) => new Date(iso);
// Kyiv is UTC+2 in winter: "local" times of December 2026 are written with +02:00.
const kyiv = (local: string) => new Date(`${local}:00+02:00`);
const iso = (dates: Date[]) => dates.map((date) => date.toISOString());

describe('slotStarts (your part)', () => {
  it('lists the start of every 30-minute slot of the booking', () => {
    expect(iso(slotStarts(at('2026-12-07T10:00:00Z'), at('2026-12-07T11:30:00Z')))).toEqual([
      '2026-12-07T10:00:00.000Z',
      '2026-12-07T10:30:00.000Z',
      '2026-12-07T11:00:00.000Z',
    ]);
  });

  it('the last slot starts one step before the end, the end itself is not a slot', () => {
    const slots = slotStarts(at('2026-12-07T10:00:00Z'), at('2026-12-07T10:30:00Z'));
    expect(iso(slots)).toEqual(['2026-12-07T10:00:00.000Z']);
  });

  it('a four hour booking has eight slots', () => {
    expect(slotStarts(at('2026-12-07T10:00:00Z'), at('2026-12-07T14:00:00Z'))).toHaveLength(8);
  });

  it('has no slots when the booking ends before or when it starts', () => {
    expect(slotStarts(at('2026-12-07T10:00:00Z'), at('2026-12-07T10:00:00Z'))).toEqual([]);
    expect(slotStarts(at('2026-12-07T11:00:00Z'), at('2026-12-07T10:00:00Z'))).toEqual([]);
  });
});

describe('isOnStep (your part)', () => {
  it('is true for :00 and :30 of the club local time', () => {
    expect(isOnStep(kyiv('2026-12-07T12:00'), 'Europe/Kyiv')).toBe(true);
    expect(isOnStep(kyiv('2026-12-07T12:30'), 'Europe/Kyiv')).toBe(true);
  });

  it('is false for any other minute', () => {
    expect(isOnStep(kyiv('2026-12-07T12:15'), 'Europe/Kyiv')).toBe(false);
    expect(isOnStep(kyiv('2026-12-07T12:45'), 'Europe/Kyiv')).toBe(false);
    expect(isOnStep(kyiv('2026-12-07T12:01'), 'Europe/Kyiv')).toBe(false);
  });

  it('is false when there are seconds, although the clock shows a round minute', () => {
    expect(isOnStep(at('2026-12-07T10:00:30Z'), 'Europe/Kyiv')).toBe(false);
    expect(isOnStep(at('2026-12-07T10:00:00.500Z'), 'Europe/Kyiv')).toBe(false);
  });

  it('counts in the LOCAL time: 10:00 UTC is 15:30 in Kolkata (on the grid) but 15:45 in Kathmandu', () => {
    expect(isOnStep(at('2026-12-07T10:00:00Z'), 'Asia/Kolkata')).toBe(true);
    expect(isOnStep(at('2026-12-07T10:00:00Z'), 'Asia/Kathmandu')).toBe(false);
  });
});

describe('bookingTimeProblem (your part)', () => {
  const now = at('2026-12-01T08:00:00Z'); // 10:00 in Kyiv
  const problem = (startsAt: Date, endsAt: Date, zone = 'Europe/Kyiv') =>
    bookingTimeProblem(startsAt, endsAt, now, zone);

  it('is null for a good booking, up to the maximum length', () => {
    expect(problem(kyiv('2026-12-07T12:00'), kyiv('2026-12-07T13:00'))).toBeNull();
    expect(problem(kyiv('2026-12-07T12:30'), kyiv('2026-12-07T13:00'))).toBeNull(); // 30 minutes
    expect(problem(kyiv('2026-12-07T12:00'), kyiv('2026-12-07T16:00'))).toBeNull(); // 4 hours
  });

  it('must start in the future: not in the past, not exactly now', () => {
    expect(problem(kyiv('2026-12-01T09:00'), kyiv('2026-12-01T10:00'))).toEqual(expect.any(String));
    expect(problem(now, kyiv('2026-12-01T11:00'))).toEqual(expect.any(String));
    expect(problem(kyiv('2026-12-01T10:30'), kyiv('2026-12-01T11:00'))).toBeNull(); // 30 min ahead
  });

  it('must end after it starts', () => {
    expect(problem(kyiv('2026-12-07T13:00'), kyiv('2026-12-07T12:00'))).toEqual(expect.any(String));
    expect(problem(kyiv('2026-12-07T12:00'), kyiv('2026-12-07T12:00'))).toEqual(expect.any(String));
  });

  it('both ends must be on the 30-minute grid of the club local time', () => {
    expect(problem(kyiv('2026-12-07T12:15'), kyiv('2026-12-07T13:00'))).toEqual(expect.any(String));
    expect(problem(kyiv('2026-12-07T12:00'), kyiv('2026-12-07T12:45'))).toEqual(expect.any(String));
    expect(problem(at('2026-12-07T10:00:30Z'), at('2026-12-07T11:00:00Z'))).toEqual(
      expect.any(String),
    );
  });

  it('is longer than the maximum (4 hours)? refused', () => {
    expect(MAX_BOOKING_MINUTES).toBe(240);
    expect(problem(kyiv('2026-12-07T12:00'), kyiv('2026-12-07T16:30'))).toEqual(expect.any(String));
  });

  it('checks the grid in the local time of the club, not in UTC', () => {
    const start = at('2026-12-07T10:00:00Z');
    const end = at('2026-12-07T11:00:00Z');
    expect(problem(start, end, 'Asia/Kolkata')).toBeNull(); // 15:30-16:30
    expect(problem(start, end, 'Asia/Kathmandu')).toEqual(expect.any(String)); // 15:45-16:45
  });
});

describe('isInsideWorkingHours (your part)', () => {
  const schedule = {
    timezone: 'Europe/Kyiv',
    hours: [
      { weekday: 1, opensAt: '10:00', closesAt: '22:00' }, // Monday
      { weekday: 6, opensAt: '18:00', closesAt: '02:00' }, // Saturday, overnight
      { weekday: 7, opensAt: '12:00', closesAt: '20:00' }, // Sunday
    ],
    exceptions: [] as {
      date: string;
      closed: boolean;
      opensAt: string | null;
      closesAt: string | null;
    }[],
  };
  const inside = (from: string, to: string, data = schedule) =>
    isInsideWorkingHours(data, kyiv(from), kyiv(to));

  // 2026-12-05 is a Saturday, 12-06 a Sunday, 12-07 a Monday, 12-08 a Tuesday (no hours).
  it('is true when every slot is open, up to the closing time exactly', () => {
    expect(inside('2026-12-07T12:00', '2026-12-07T14:00')).toBe(true);
    expect(inside('2026-12-07T10:00', '2026-12-07T10:30')).toBe(true); // right at opening
    expect(inside('2026-12-07T21:30', '2026-12-07T22:00')).toBe(true); // ends at closing time
  });

  it('is false when a slot is before opening or after closing', () => {
    expect(inside('2026-12-07T09:30', '2026-12-07T10:30')).toBe(false);
    expect(inside('2026-12-07T21:30', '2026-12-07T22:30')).toBe(false);
  });

  it('is false on a day without hours', () => {
    expect(inside('2026-12-08T12:00', '2026-12-08T13:00')).toBe(false);
  });

  it('a booking may cross midnight inside an overnight interval', () => {
    expect(inside('2026-12-05T23:00', '2026-12-06T01:00')).toBe(true);
    expect(inside('2026-12-05T23:00', '2026-12-06T02:00')).toBe(true); // ends at closing time
    expect(inside('2026-12-05T23:00', '2026-12-06T02:30')).toBe(false); // the 02:00 slot is closed
  });

  it('is false when the club is closed in the middle, although the start and the end are open', () => {
    // Sunday 01:00 is open (the tail of Saturday), Sunday 13:00 is open, 02:00-12:00 is closed.
    expect(inside('2026-12-06T01:00', '2026-12-06T13:00')).toBe(false);
  });

  it('follows the exceptions of the club', () => {
    const closedMonday = {
      ...schedule,
      exceptions: [{ date: '2026-12-07', closed: true, opensAt: null, closesAt: null }],
    };
    const shortMonday = {
      ...schedule,
      exceptions: [{ date: '2026-12-07', closed: false, opensAt: '10:00', closesAt: '14:00' }],
    };

    expect(inside('2026-12-07T12:00', '2026-12-07T13:00', closedMonday)).toBe(false);
    expect(inside('2026-12-07T12:00', '2026-12-07T14:00', shortMonday)).toBe(true);
    expect(inside('2026-12-07T13:00', '2026-12-07T15:00', shortMonday)).toBe(false);
  });
});
