import {
  AppEnv,
  DatabaseEnv,
  FrontendEnv,
  JwtEnv,
  KafkaEnv,
  SmsEnv,
  SmtpEnv,
  StripeEnv,
} from '@/shared/config/types';

const parseKafkaBrokers = (value?: string): string[] =>
  (value ?? 'localhost:9092')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);

export const appConfig = (): {
  app: AppEnv;
  database: DatabaseEnv;
  jwt: JwtEnv;
  smtp: SmtpEnv;
  kafka: KafkaEnv;
  frontend: FrontendEnv;
  sms: SmsEnv;
  stripe: StripeEnv;
} => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1h',
    refreshExpiresInDays: Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? 30),
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? '',
  },
  kafka: {
    brokers: parseKafkaBrokers(process.env.KAFKA_BROKERS),
    authClientId: process.env.KAFKA_AUTH_CLIENT_ID ?? 'auth-service',
    mailClientId: process.env.KAFKA_MAIL_CLIENT_ID ?? 'mail-service',
    mailGroupId: process.env.KAFKA_MAIL_GROUP_ID ?? 'mail-service-consumer',
  },
  frontend: {
    resetPasswordUrl: process.env.FRONTEND_RESET_PASSWORD_URL ?? '',
  },
  sms: {
    provider: process.env.SMS_PROVIDER ?? 'mock',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    twilioFromPhone: process.env.TWILIO_FROM_PHONE ?? '',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    currency: process.env.STRIPE_CURRENCY ?? 'usd',
  },
});
