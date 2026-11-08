import { INestApplication } from '@nestjs/common';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

const club = (extra: Record<string, unknown> = {}) => ({
  name: 'Carambol',
  address: 'Khreshchatyk 1, Kyiv',
  lat: 50.4501,
  lng: 30.5234,
  ...extra,
});

describe('Clubs (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  const createClub = (body: object) =>
    api(app).post('/api/v1/admin/clubs').set('Authorization', `Bearer ${adminToken}`).send(body);

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

  it('an admin creates a club with the default passage (201)', async () => {
    const res = await createClub(club()).expect(201);

    expect(res.body).toMatchObject({ name: 'Carambol', lat: 50.4501, lng: 30.5234, minGapCm: 150 });
  });

  it('rejects wrong coordinates and missing fields (400)', async () => {
    await createClub(club({ lat: 95 })).expect(400);
    await createClub(club({ lng: -181 })).expect(400);
    await createClub(club({ lat: '50.45' })).expect(400); // a string, not a number
    await createClub({ address: 'Somewhere', lat: 1, lng: 1 }).expect(400); // no name
  });

  it('a regular user and an anonymous caller cannot create a club', async () => {
    const player = await registerUser(app);

    await api(app)
      .post('/api/v1/admin/clubs')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .send(club())
      .expect(403);
    await api(app).post('/api/v1/admin/clubs').send(club()).expect(401);
  });

  it('any logged-in user lists clubs sorted by name, page by page', async () => {
    for (const name of ['Delta', 'Alpha', 'Charlie']) await createClub(club({ name })).expect(201);
    const player = await registerUser(app);

    const res = await api(app)
      .get('/api/v1/clubs?page=2&limit=2')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .expect(200);

    const body = res.body as { items: { name: string }[]; meta: { total: number } };
    expect(body.items.map((c) => c.name)).toEqual(['Delta']);
    expect(body.meta.total).toBe(3);
  });

  it('reads one club; 404 for an unknown id; 400 for a malformed id', async () => {
    const created = (await createClub(club()).expect(201)).body as { id: string };

    await api(app)
      .get(`/api/v1/clubs/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await api(app)
      .get('/api/v1/clubs/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await api(app)
      .get('/api/v1/clubs/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('PATCH changes only the sent fields and keeps the rest', async () => {
    const created = (await createClub(club()).expect(201)).body as { id: string };

    const res = await api(app)
      .patch(`/api/v1/admin/clubs/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ minGapCm: 120 })
      .expect(200);

    expect(res.body).toMatchObject({ name: 'Carambol', lat: 50.4501, minGapCm: 120 });
  });

  it('DELETE removes the club for real (204), then it is gone (404)', async () => {
    const created = (await createClub(club()).expect(201)).body as { id: string };

    await api(app)
      .delete(`/api/v1/admin/clubs/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    await api(app)
      .get(`/api/v1/clubs/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
