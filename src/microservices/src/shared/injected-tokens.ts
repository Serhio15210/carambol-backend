export const MICROSERVICE_CLIENTS = {
  AUTH: 'AUTH_SERVICE',
  MAIL: 'MAIL_SERVICE',
} as const;
export type MicroserviceClientName =
  (typeof MICROSERVICE_CLIENTS)[keyof typeof MICROSERVICE_CLIENTS];
