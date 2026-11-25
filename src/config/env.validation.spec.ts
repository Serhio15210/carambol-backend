import { validateEnv } from './env.validation';

const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'secret' };

describe('validateEnv: payments', () => {
  it('the app starts without any Stripe settings (only paying needs them)', () => {
    expect(() => validateEnv(base)).not.toThrow();
    expect(() =>
      validateEnv({ ...base, STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' }),
    ).not.toThrow();
  });

  it('accepts test keys', () => {
    expect(() =>
      validateEnv({
        ...base,
        STRIPE_SECRET_KEY: 'sk_test_abc',
        STRIPE_WEBHOOK_SECRET: 'whsec_abc',
      }),
    ).not.toThrow();
  });

  it('refuses a value that is not a Stripe key (a publishable pk_ key pasted by mistake)', () => {
    expect(() => validateEnv({ ...base, STRIPE_SECRET_KEY: 'pk_test_abc' })).toThrow('sk_');
    expect(() => validateEnv({ ...base, STRIPE_WEBHOOK_SECRET: 'abc' })).toThrow('whsec_');
  });

  it('refuses a LIVE key outside production: it would charge real money from a laptop', () => {
    expect(() => validateEnv({ ...base, STRIPE_SECRET_KEY: 'sk_live_abc' })).toThrow('sk_live_');
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'development', STRIPE_SECRET_KEY: 'sk_live_abc' }),
    ).toThrow('sk_live_');
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', STRIPE_SECRET_KEY: 'sk_live_abc' }),
    ).not.toThrow();
  });

  it('the payment window must be a positive whole number of minutes', () => {
    expect(() => validateEnv({ ...base, PAYMENT_WINDOW_MINUTES: '15' })).not.toThrow();
    expect(() => validateEnv({ ...base, PAYMENT_WINDOW_MINUTES: '0' })).toThrow(
      'PAYMENT_WINDOW_MINUTES',
    );
    expect(() => validateEnv({ ...base, PAYMENT_WINDOW_MINUTES: '1.5' })).toThrow(
      'PAYMENT_WINDOW_MINUTES',
    );
    expect(() => validateEnv({ ...base, PAYMENT_WINDOW_MINUTES: 'soon' })).toThrow(
      'PAYMENT_WINDOW_MINUTES',
    );
  });
});
