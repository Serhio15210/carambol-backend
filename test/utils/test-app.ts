import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { ensureSuperadmin } from '@/database/seeds/superadmin.seed';
import { PAYMENT_GATEWAY, PaymentGateway } from '@/modules/orders/payments/payment-gateway';
import { User } from '@/modules/users/entities/user.entity';

// The real app: the same modules as production and the same setup as main.ts (configureApp).
// Pass a payment gateway to replace Stripe (the tests never call the real one).
export async function createTestApp(
  options: { paymentGateway?: PaymentGateway } = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.paymentGateway) {
    builder = builder.overrideProvider(PAYMENT_GATEWAY).useValue(options.paymentGateway);
  }
  const moduleRef = await builder.compile();
  // rawBody: true, like main.ts: webhook signatures are checked against the original bytes.
  const app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init(); // no listen(): supertest talks to the server in memory
  return app;
}

// Empties every table of our entities, so each test starts from the same state.
// The migrations table is left alone: the schema stays as globalSetup built it.
export async function resetDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const tables = dataSource.entityMetadatas.map((meta) => `"${meta.tableName}"`).join(', ');
  await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

export const api = (app: INestApplication) => request(app.getHttpServer());

// Registers a regular user through the API and returns its tokens and public data.
export async function registerUser(
  app: INestApplication,
  overrides: Partial<Record<'userName' | 'email' | 'phone' | 'password', string>> = {},
) {
  const res = await api(app)
    .post('/api/v1/auth/register')
    .send({
      userName: 'player1',
      firstName: 'Test',
      lastName: 'Player',
      email: 'player1@example.com',
      phone: '+380671110001',
      password: 'password123',
      ...overrides,
    })
    .expect(201);
  return res.body as { accessToken: string; refreshToken: string; user: { id: string } };
}

// The first superadmin, created the same way the seed does, then logged in through the API.
export async function loginAsSuperadmin(app: INestApplication): Promise<string> {
  const settings = {
    userName: 'boss',
    email: 'boss@example.com',
    phone: '+380671110099',
    password: 'boss-pass-123',
  };
  await ensureSuperadmin(app.get(DataSource).getRepository(User), settings);
  const res = await api(app)
    .post('/api/v1/auth/login')
    .send({ login: settings.email, password: settings.password })
    .expect(200);
  return (res.body as { accessToken: string }).accessToken;
}
