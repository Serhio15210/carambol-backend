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
  stripe: {
    // Both are empty until the developer fills them in .env: the app starts anyway, only paying needs them.
    secretKey: string;
    webhookSecret: string;
    // shortcut: one currency for the whole app; make it a club setting when clubs in other countries appear.
    currency: string;
    // How long a pending booking waits for the payment before the cron job cancels it.
    paymentWindowMinutes: number;
    // Where the Stripe Checkout page sends the customer back (success or "back" button).
    // shortcut: one placeholder page; point it at the real frontend when there is one.
    checkoutReturnUrl: string;
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
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    currency: 'usd',
    paymentWindowMinutes: Number(process.env.PAYMENT_WINDOW_MINUTES ?? 15),
    checkoutReturnUrl: process.env.CHECKOUT_RETURN_URL ?? 'https://example.com/membership',
  },
});
