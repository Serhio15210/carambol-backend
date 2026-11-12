import { isClubOpenAt, ScheduleData, toLocal } from '@/modules/clubs/opening-hours';

// shortcut: the same step and duration limits for every club. Make them club settings
// (columns in `clubs`, like minGapCm) when a club needs its own.
export const BOOKING_STEP_MINUTES = 30;
export const MIN_BOOKING_MINUTES = 30;
export const MAX_BOOKING_MINUTES = 240;

const MINUTE_MS = 60_000;

// The start of every slot (one step long) of the booking [startsAt, endsAt):
// 10:00-11:30 with a 30-minute step gives 10:00, 10:30, 11:00. Nothing when endsAt <= startsAt.
export function slotStarts(startsAt: Date, endsAt: Date): Date[] {
  const slots: Date[] = [];
  for (let t = startsAt.getTime(); t < endsAt.getTime(); t += BOOKING_STEP_MINUTES * MINUTE_MS) {
    slots.push(new Date(t));
  }
  return slots;
}

// Does the instant fall exactly on the booking grid (:00 and :30) in the club's LOCAL time?
// Whole minutes only: 10:00:30 shows as "10:00" but is not on the grid. The grid is local:
// in Kathmandu (UTC+05:45) 10:00 UTC is 15:45 there, so it is NOT on a 30-minute grid.
export function isOnStep(at: Date, timeZone: string): boolean {
  if (at.getTime() % MINUTE_MS !== 0) return false;
  const [hours, minutes] = toLocal(at, timeZone).time.split(':').map(Number);
  return (hours * 60 + minutes) % BOOKING_STEP_MINUTES === 0;
}

// What is wrong with the requested time, or null when it is fine. `now` is passed in (not read from
// the clock here) so the rule can be tested with any date.
export function bookingTimeProblem(
  startsAt: Date,
  endsAt: Date,
  now: Date,
  timeZone: string,
): string | null {
  if (startsAt <= now) return 'Booking must start in the future';
  if (endsAt <= startsAt) return 'Booking must end after it starts';
  if (!isOnStep(startsAt, timeZone) || !isOnStep(endsAt, timeZone)) {
    return `Booking times must be on a ${BOOKING_STEP_MINUTES}-minute step`;
  }
  const minutes = (endsAt.getTime() - startsAt.getTime()) / MINUTE_MS;
  if (minutes < MIN_BOOKING_MINUTES || minutes > MAX_BOOKING_MINUTES) {
    return `Booking must last from ${MIN_BOOKING_MINUTES} to ${MAX_BOOKING_MINUTES} minutes`;
  }
  return null;
}

// Is the WHOLE booking inside the working hours? Checking only the start and the end is not enough:
// Sat 18:00-02:00 and Sun 12:00-20:00 are both open at Sun 01:00 and Sun 13:00, but the club is
// closed in between. So every slot of the booking has to be open.
export function isInsideWorkingHours(
  schedule: ScheduleData,
  startsAt: Date,
  endsAt: Date,
): boolean {
  return slotStarts(startsAt, endsAt).every((slot) => isClubOpenAt(schedule, slot));
}
