export type AppEnv = {
  nodeEnv: string;
  port: number;
};

export type DatabaseEnv = {
  url: string;
};

export type JwtEnv = {
  secret: string;
  accessExpiresIn: string;
  refreshExpiresInDays: number;
};

export type SmtpEnv = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

export type KafkaEnv = {
  brokers: string[];
  authClientId: string;
  mailClientId: string;
  mailGroupId: string;
};

export type FrontendEnv = {
  resetPasswordUrl: string;
};

export type SmsEnv = {
  provider: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromPhone: string;
};

export type StripeEnv = {
  secretKey: string;
  webhookSecret: string;
  currency: string;
};
