import { applyDiscount, MIN_CHARGE_CENTS, priceCents } from './pricing';

const at = (iso: string) => new Date(iso);

describe('priceCents', () => {
  it('is the hourly rate times the length: 10.00 per hour', () => {
    const start = at('2030-01-07T10:00:00Z');

    expect(priceCents(1000, start, at('2030-01-07T11:00:00Z'))).toBe(1000);
    expect(priceCents(1000, start, at('2030-01-07T11:30:00Z'))).toBe(1500);
    expect(priceCents(1000, start, at('2030-01-07T10:30:00Z'))).toBe(500);
    expect(priceCents(1000, start, at('2030-01-07T14:00:00Z'))).toBe(4000); // 4 hours, the maximum
  });

  it('always returns a whole number of cents', () => {
    const start = at('2030-01-07T10:00:00Z');

    // 999 per hour for 30 minutes is 499.5 cents: rounded to a whole cent, never 499.5
    expect(priceCents(999, start, at('2030-01-07T10:30:00Z'))).toBe(500);
    expect(Number.isInteger(priceCents(333, start, at('2030-01-07T11:30:00Z')))).toBe(true);
  });

  it('a free club (rate 0) costs nothing', () => {
    expect(priceCents(0, at('2030-01-07T10:00:00Z'), at('2030-01-07T12:00:00Z'))).toBe(0);
  });

  it('the shortest booking of an ordinary club is above the Stripe minimum', () => {
    // 30 minutes at the default rate of 1000: 500 cents, the minimum is 50
    expect(
      priceCents(1000, at('2030-01-07T10:00:00Z'), at('2030-01-07T10:30:00Z')),
    ).toBeGreaterThanOrEqual(MIN_CHARGE_CENTS);
  });
});

describe('applyDiscount', () => {
  it.each([
    [2000, 20, 1600],
    [1500, 20, 1200],
    [999, 20, 799], // 799.2 -> a whole cent
    [1000, 0, 1000], // no membership
    [1000, 100, 0],
    [0, 20, 0], // a free club stays free
  ])('%i cents, %i%% off -> %i', (cents, percent, expected) => {
    expect(applyDiscount(cents, percent)).toBe(expected);
  });
});
