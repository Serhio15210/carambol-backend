import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

type Staff = { clubId: string; userId: string; role: string };

describe('Club staff (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let clubId: string;
  let ivan: string; // user ids
  let petro: string;

  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const url = (club = clubId, user = '') =>
    `/api/v1/admin/clubs/${club}/staff${user && `/${user}`}`;
  const put = (user: string, body: object, club = clubId) =>
    api(app).put(url(club, user)).set(auth()).send(body);
  const list = async () => (await api(app).get(url()).set(auth()).expect(200)).body as Staff[];

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    adminToken = await loginAsSuperadmin(app);
    clubId = (
      (
        await api(app)
          .post('/api/v1/admin/clubs')
          .set(auth())
          .send({ name: 'Carambol', address: 'Kyiv', lat: 50.45, lng: 30.52 })
          .expect(201)
      ).body as { id: string }
    ).id;
    ivan = (await registerUser(app, { userName: 'ivan', email: 'ivan@example.com' })).user.id;
    petro = (
      await registerUser(app, {
        userName: 'petro',
        email: 'petro@example.com',
        phone: '+380671110002',
      })
    ).user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('assigns a person; repeating the same PUT keeps one row (idempotent)', async () => {
    await put(ivan, { role: 'manager' }).expect(200);
    await put(ivan, { role: 'manager' }).expect(200);

    expect(await list()).toMatchObject([{ clubId, userId: ivan, role: 'manager' }]);
  });

  it('changes the role with another PUT', async () => {
    await put(ivan, { role: 'manager' }).expect(200);
    await put(petro, { role: 'owner' }).expect(200);
    await put(ivan, { role: 'owner' }).expect(200);

    const roles = Object.fromEntries((await list()).map((s) => [s.userId, s.role]));
    expect(roles).toEqual({ [ivan]: 'owner', [petro]: 'owner' });
  });

  it('answers 404 for an unknown club or user (not a misleading 409)', async () => {
    await put(ivan, { role: 'manager' }, randomUUID()).expect(404);
    await put(randomUUID(), { role: 'manager' }).expect(404);
    await api(app).get(url(randomUUID())).set(auth()).expect(404);
  });

  it('rejects a wrong role or a malformed id (400)', async () => {
    await put(ivan, { role: 'king' }).expect(400);
    await put(ivan, {}).expect(400);
    await put('not-a-uuid', { role: 'manager' }).expect(400);
  });

  it('keeps the last owner: demoting or removing the only owner is 409', async () => {
    await put(ivan, { role: 'owner' }).expect(200);
    await put(petro, { role: 'manager' }).expect(200);

    await put(ivan, { role: 'manager' }).expect(409);
    await api(app).delete(url(clubId, ivan)).set(auth()).expect(409);

    await put(petro, { role: 'owner' }).expect(200); // a second owner appears
    await put(ivan, { role: 'manager' }).expect(200); // now the demotion is fine
  });

  it('removes a person (204); removing again is 404', async () => {
    await put(ivan, { role: 'manager' }).expect(200);

    await api(app).delete(url(clubId, ivan)).set(auth()).expect(204);
    await api(app).delete(url(clubId, ivan)).set(auth()).expect(404);
    expect(await list()).toEqual([]);
  });

  it('deleting the club removes its staff rows (ON DELETE CASCADE)', async () => {
    await put(ivan, { role: 'owner' }).expect(200);
    const count = async () =>
      Number(
        (await app.get(DataSource).query('SELECT count(*) AS n FROM club_staff'))[0].n as string,
      );
    expect(await count()).toBe(1);

    await api(app).delete(`/api/v1/admin/clubs/${clubId}`).set(auth()).expect(204);

    expect(await count()).toBe(0);
  });

  it('is closed to a regular user (403) and to an anonymous caller (401)', async () => {
    const player = await registerUser(app, {
      userName: 'player9',
      email: 'player9@example.com',
      phone: '+380671110009',
    });

    await api(app).get(url()).set(auth(player.accessToken)).expect(403);
    await api(app)
      .put(url(clubId, ivan))
      .set(auth(player.accessToken))
      .send({ role: 'owner' })
      .expect(403);
    await api(app).get(url()).expect(401);
  });
});
