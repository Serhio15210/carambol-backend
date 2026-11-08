import { INestApplication } from '@nestjs/common';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

type Created = { id: string };

describe('Rooms (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  const createClub = async (name = 'Carambol') =>
    (
      await api(app)
        .post('/api/v1/admin/clubs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name, address: 'Khreshchatyk 1, Kyiv', lat: 50.4501, lng: 30.5234 })
        .expect(201)
    ).body as Created;

  const roomBody = (extra: Record<string, unknown> = {}) => ({
    name: 'Main hall',
    widthCm: 1000,
    lengthCm: 800,
    ...extra,
  });

  const postRoom = (clubId: string, body: object) =>
    api(app)
      .post(`/api/v1/admin/clubs/${clubId}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    adminToken = await loginAsSuperadmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('an admin creates a room inside a club (201)', async () => {
    const club = await createClub();

    const res = await postRoom(club.id, roomBody()).expect(201);

    expect(res.body).toMatchObject({ clubId: club.id, name: 'Main hall', widthCm: 1000 });
  });

  it('rejects wrong sizes and a missing name (400)', async () => {
    const club = await createClub();

    await postRoom(club.id, roomBody({ widthCm: 50 })).expect(400);
    await postRoom(club.id, roomBody({ lengthCm: 1.5 })).expect(400);
    await postRoom(club.id, { widthCm: 1000, lengthCm: 800 }).expect(400);
  });

  it('answers 404 (not 409) when the club does not exist', async () => {
    await postRoom('00000000-0000-4000-8000-000000000000', roomBody()).expect(404);
  });

  it('a regular user reads rooms but cannot create one', async () => {
    const club = await createClub();
    await postRoom(club.id, roomBody()).expect(201);
    const player = await registerUser(app);

    await api(app)
      .get(`/api/v1/clubs/${club.id}/rooms`)
      .set('Authorization', `Bearer ${player.accessToken}`)
      .expect(200);
    await api(app)
      .post(`/api/v1/admin/clubs/${club.id}/rooms`)
      .set('Authorization', `Bearer ${player.accessToken}`)
      .send(roomBody({ name: 'Second' }))
      .expect(403);
  });

  it('lists only the rooms of the club from the path, sorted by name', async () => {
    const a = await createClub('Club A');
    const b = await createClub('Club B');
    await postRoom(a.id, roomBody({ name: 'VIP' })).expect(201);
    await postRoom(a.id, roomBody({ name: 'Annex' })).expect(201);
    await postRoom(b.id, roomBody({ name: 'Elsewhere' })).expect(201);

    const res = await api(app)
      .get(`/api/v1/clubs/${a.id}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect((res.body as { name: string }[]).map((r) => r.name)).toEqual(['Annex', 'VIP']);
  });

  it('a room of one club is not reachable through another club (404)', async () => {
    const a = await createClub('Club A');
    const b = await createClub('Club B');
    const room = (await postRoom(a.id, roomBody()).expect(201)).body as Created;

    await api(app)
      .get(`/api/v1/clubs/${a.id}/rooms/${room.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await api(app)
      .get(`/api/v1/clubs/${b.id}/rooms/${room.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await api(app)
      .patch(`/api/v1/admin/clubs/${b.id}/rooms/${room.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Hacked' })
      .expect(404);
  });

  it('the same room name is allowed in another club but not twice in one club', async () => {
    const a = await createClub('Club A');
    const b = await createClub('Club B');
    await postRoom(a.id, roomBody()).expect(201);

    await postRoom(a.id, roomBody()).expect(409);
    await postRoom(b.id, roomBody()).expect(201);
  });

  it('PATCH changes only the sent fields', async () => {
    const club = await createClub();
    const room = (await postRoom(club.id, roomBody()).expect(201)).body as Created;

    const res = await api(app)
      .patch(`/api/v1/admin/clubs/${club.id}/rooms/${room.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ widthCm: 1200 })
      .expect(200);

    expect(res.body).toMatchObject({ name: 'Main hall', widthCm: 1200, lengthCm: 800 });
  });

  it('PostgreSQL refuses to delete a club that still has a room (409), then it works', async () => {
    const club = await createClub();
    const room = (await postRoom(club.id, roomBody()).expect(201)).body as Created;
    const deleteClub = () =>
      api(app)
        .delete(`/api/v1/admin/clubs/${club.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

    await deleteClub().expect(409); // the foreign key RESTRICT, turned into 409 by the filter
    await api(app)
      .get(`/api/v1/clubs/${club.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200); // the club survived

    await api(app)
      .delete(`/api/v1/admin/clubs/${club.id}/rooms/${room.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    await deleteClub().expect(204);
  });
});
