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

  return env;
};
