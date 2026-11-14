// Единственное место, где приложение читает process.env.
// Остальной код получает настройки через ConfigService: config.get('jwt.secret').

export type AppConfig = {
  app: {
    nodeEnv: string;
    port: number;
  };
  database: {
    url: string;
  };
  jwt: {
    secret: string;
    accessExpiresIn: string;
    refreshExpiresInDays: number;
  };
  scheduler: {
    // false switches the background jobs off (the e2e tests do that: a cron tick in the middle of a
    // test would change its data).
    enabled: boolean;
  };
};

export const configuration = (): AppConfig => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresInDays: Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? 30),
  },
  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED !== 'false',
  },
});
