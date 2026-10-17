type RawEnv = Record<string, unknown>;

export const validateEnv = (config: RawEnv): RawEnv => {
  const nodeEnv = typeof config.NODE_ENV === 'string' ? config.NODE_ENV : 'development';
  const port = Number(config.PORT ?? 3000);
  const smtpPort = Number(config.SMTP_PORT ?? 587);
  const refreshExpiresInDays = Number(config.JWT_REFRESH_EXPIRES_IN_DAYS ?? 30);
  const requiredStringKeys = [
    'DATABASE_URL',
    'JWT_SECRET',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'KAFKA_BROKERS',
    'FRONTEND_RESET_PASSWORD_URL',
    'SMS_PROVIDER',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_CURRENCY',
  ];

  for (const key of requiredStringKeys) {
    const value = config[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${key} is required`);
    }
  }

  if (Number.isNaN(smtpPort) || smtpPort < 1) {
    throw new Error('SMTP_PORT must be a valid port number');
  }

  if (Number.isNaN(refreshExpiresInDays) || refreshExpiresInDays < 1) {
    throw new Error('JWT_REFRESH_EXPIRES_IN_DAYS must be a positive number');
  }

  if (config.SMS_PROVIDER === 'twilio') {
    for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_PHONE']) {
      const value = config[key];
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${key} is required when SMS_PROVIDER=twilio`);
      }
    }
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: Number.isNaN(port) ? 3000 : port,
    SMTP_PORT: smtpPort,
    JWT_REFRESH_EXPIRES_IN_DAYS: refreshExpiresInDays,
  };
};
