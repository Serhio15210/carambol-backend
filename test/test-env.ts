// The e2e tests truncate every table before each test, so they must never touch a real database.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/carambol_test';

// Sets process.env BEFORE the app or the TypeORM CLI read it. Values already in process.env win
// over .env (both @nestjs/config and dotenv skip existing keys), so .env cannot point us elsewhere.
export function useTestEnv(): void {
  const databaseName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e tests against "${databaseName}": the database name must end with _test`,
    );
  }
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_SECRET ??= 'e2e-test-secret';
  process.env.NODE_ENV = 'test';
  process.env.SCHEDULER_ENABLED = 'false'; // a cron tick in the middle of a test would change its data
  // The tests never talk to Stripe: the secret key is emptied (a real test key from .env must not
  // leak in), and the webhook secret is a fixed fake one that the tests sign their webhooks with.
  process.env.STRIPE_SECRET_KEY = '';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e_test_secret';
}
