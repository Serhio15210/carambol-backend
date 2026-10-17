import { ClientProviderOptions, MicroserviceOptions, Transport } from '@nestjs/microservices';
import { MICROSERVICE_CLIENTS } from '@/microservices/src/shared/injected-tokens';

const tcpConnection = {
  host: '127.0.0.1',
  port: 8877,
};

export const microserviceTCPConfig: MicroserviceOptions = {
  transport: Transport.TCP,
  options: tcpConnection,
};

export const authServiceClientOptions: ClientProviderOptions = {
  name: MICROSERVICE_CLIENTS.AUTH,
  transport: Transport.TCP,
  options: tcpConnection,
};

const parseKafkaBrokers = (): string[] =>
  (process.env.KAFKA_BROKERS ?? 'localhost:9092')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);

export const mailKafkaMicroserviceConfig: MicroserviceOptions = {
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: process.env.KAFKA_MAIL_CLIENT_ID ?? 'mail-service',
      brokers: parseKafkaBrokers(),
    },
    consumer: {
      groupId: process.env.KAFKA_MAIL_GROUP_ID ?? 'mail-service-consumer',
    },
  },
};
