import { INestApplication } from '@nestjs/common';
import { api, createTestApp } from './utils/test-app';

describe('App wiring (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close(); // closes the database pool, otherwise Jest never exits
  });

  it('GET /api/health is version-neutral and sees the database', async () => {
    const res = await api(app).get('/api/health').expect(200);

    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('serves feature routes under /api/v1, like production', async () => {
    await api(app).get('/api/v1/users/me').expect(401); // the route exists, a token is required
    await api(app).get('/api/users/me').expect(404); // no unversioned route
  });

  it('validates bodies with the global ValidationPipe', async () => {
    const res = await api(app).post('/api/v1/auth/register').send({ userName: 'x' }).expect(400);

    expect(Array.isArray(res.body.message)).toBe(true);
  });
});
