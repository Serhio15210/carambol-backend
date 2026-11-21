import { INestApplication } from '@nestjs/common';
import { api, createTestApp, loginAsSuperadmin, resetDatabase } from './utils/test-app';

type ClubBody = { id: string; hourlyRateCents: number };

describe('Club hourly rate (e2e)', () => {
  let app: INestApplication;
  let token: string;

  const create = (extra: object = {}) =>
    api(app)
      .post('/api/v1/admin/clubs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carambol', address: 'Kyiv', lat: 50.45, lng: 30.52, ...extra });
  const patch = (id: string, body: object) =>
    api(app).patch(`/api/v1/admin/clubs/${id}`).set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    token = await loginAsSuperadmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('a new club costs 10.00 per hour by default, stored as 1000 cents', async () => {
    const club = (await create().expect(201)).body as ClubBody;

    expect(club.hourlyRateCents).toBe(1000);
  });

  it('the rate can be set when creating and changed later; 0 means free', async () => {
    const club = (await create({ hourlyRateCents: 2500 }).expect(201)).body as ClubBody;
    expect(club.hourlyRateCents).toBe(2500);

    expect(
      ((await patch(club.id, { hourlyRateCents: 0 }).expect(200)).body as ClubBody).hourlyRateCents,
    ).toBe(0);
  });

  it('refuses a rate that is not a whole non-negative number of cents (400)', async () => {
    const club = (await create().expect(201)).body as ClubBody;

    await create({ hourlyRateCents: -1 }).expect(400);
    await create({ hourlyRateCents: 10.5 }).expect(400); // half a cent does not exist
    await create({ hourlyRateCents: '10' }).expect(400);
    await patch(club.id, { hourlyRateCents: 2_000_000 }).expect(400);
  });
});
