// Stripe refuses a payment below 0.50 USD, so a price between 1 and 49 cents cannot be charged.
export const MIN_CHARGE_CENTS = 50;

// The price of one booking in cents: the hourly rate (cents per hour) times the length, rounded to a
// whole cent. All numbers are integers, so there is no 0.1 + 0.2 = 0.30000000000000004 trouble.
// Example: 1000 cents per hour, 90 minutes -> 1500.
export function priceCents(hourlyRateCents: number, startsAt: Date, endsAt: Date): number {
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  return Math.round((hourlyRateCents * minutes) / 60);
}

// A price after a discount of `percent` (0..100), rounded to a whole cent. Multiply first, divide last:
// integers stay exact. Example: 1500 cents, 20% off -> 1200; 999 cents, 20% off -> 799 (799.2 rounded).
export function applyDiscount(cents: number, percent: number): number {
  return Math.round((cents * (100 - percent)) / 100);
}
