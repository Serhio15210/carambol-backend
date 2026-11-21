// Проверка переменных окружения при старте.
// Если чего-то не хватает, приложение сразу падает с понятной ошибкой,
// а не через час на первом запросе, которому понадобилась эта настройка.

type RawEnv = Record<string, unknown>;

const REQUIRED_KEYS = ['DATABASE_URL', 'JWT_SECRET'];

export const validateEnv = (env: RawEnv): RawEnv => {
  for (const key of REQUIRED_KEYS) {
    const value = env[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Environment variable ${key} is required`);
    }
  }

  const refreshDays = Number(env.JWT_REFRESH_EXPIRES_IN_DAYS ?? 30);
  if (!Number.isInteger(refreshDays) || refreshDays < 1) {
    throw new Error('JWT_REFRESH_EXPIRES_IN_DAYS must be a positive integer');
  }

  // A typo like "False" would silently keep the jobs ON, so only the two exact words are accepted.
  const scheduler = env.SCHEDULER_ENABLED;
  if (scheduler !== undefined && scheduler !== 'true' && scheduler !== 'false') {
    throw new Error('SCHEDULER_ENABLED must be "true" or "false"');
  }

  const secretKey = env.STRIPE_SECRET_KEY;
  if (secretKey !== undefined && secretKey !== '') {
    if (typeof secretKey !== 'string' || !secretKey.startsWith('sk_')) {
      throw new Error('STRIPE_SECRET_KEY must be a Stripe secret key (starts with sk_)');
    }
    // A live key outside production would charge REAL money from a developer machine.
    if (secretKey.startsWith('sk_live_') && env.NODE_ENV !== 'production') {
      throw new Error('A live Stripe key (sk_live_) is allowed only when NODE_ENV=production');
    }
  }
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (webhookSecret !== undefined && webhookSecret !== '') {
    if (typeof webhookSecret !== 'string' || !webhookSecret.startsWith('whsec_')) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET must be a webhook signing secret (starts with whsec_)',
      );
    }
  }
  const paymentWindow = Number(env.PAYMENT_WINDOW_MINUTES ?? 15);
  if (!Number.isInteger(paymentWindow) || paymentWindow < 1) {
    throw new Error('PAYMENT_WINDOW_MINUTES must be a positive integer');
  }

  return env;
};
