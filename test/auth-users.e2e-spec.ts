import { INestApplication } from '@nestjs/common';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

describe('Auth and users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a second registration with the same email in another letter case (409)', async () => {
    await registerUser(app, { email: 'player1@example.com' });

    // Same email in capitals; userName and phone are different, so only the email can conflict.
    await api(app)
      .post('/api/v1/auth/register')
      .send({
        userName: 'player2',
        firstName: 'Test',
        lastName: 'Player',
        email: 'PLAYER1@Example.com',
        phone: '+380671110002',
        password: 'password123',
      })
      .expect(409);
  });

  it("lets a deleted user's userName, email and phone be registered again (201)", async () => {
    const adminToken = await loginAsSuperadmin(app);
    const first = await registerUser(app);

    await api(app)
      .delete(`/api/v1/admin/users/${first.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    // registerUser sends the same userName, email and phone again and expects 201.
    const second = await registerUser(app);

    expect(second.user.id).not.toBe(first.user.id); // a new account, not the deleted one revived
  });

  it('a blocked user logs in and reads /users/me, but PATCH /users/me returns 403', async () => {
    const adminToken = await loginAsSuperadmin(app);
    const player = await registerUser(app);

    await api(app)
      .post(`/api/v1/admin/users/${player.user.id}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const login = await api(app)
      .post('/api/v1/auth/login')
      .send({ login: 'player1@example.com', password: 'password123' })
      .expect(200);
    const token = (login.body as { accessToken: string }).accessToken;

    const me = await api(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((me.body as { blockedAt: string | null }).blockedAt).not.toBeNull();

    // /users/me needs no role, so this 403 can only come from BlockedUserGuard.
    await api(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'New' })
      .expect(403);
  });
});
