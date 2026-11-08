import { INestApplication } from '@nestjs/common';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

// The searched point is the center of Kyiv. Distances of the clubs created below (km):
// Center 0, East ~3.5, North ~5.0, Corner ~13.2 (inside the 10 km box, outside the circle), Lviv ~468.
const KYIV = { lat: 50.4501, lng: 30.5234 };
const CLUBS = [
  { name: 'North', lat: 50.4951, lng: 30.5234 },
  { name: 'Lviv', lat: 49.8397, lng: 24.0297 },
  { name: 'Corner', lat: 50.5351, lng: 30.6534 },
  { name: 'Center', lat: 50.4501, lng: 30.5234 },
  { name: 'East', lat: 50.4501, lng: 30.5734 },
];

type Nearby = { name: string; distanceKm: number };
type NearbyPage = {
  items: Nearby[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

describe('Nearby clubs (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  const nearby = (query: string, token = adminToken) =>
    api(app).get(`/api/v1/clubs/nearby?${query}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    adminToken = await loginAsSuperadmin(app);
    for (const club of CLUBS) {
      await api(app)
        .post('/api/v1/admin/clubs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...club, address: 'Somewhere' })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the clubs inside the radius, nearest first, with distanceKm', async () => {
    const res = await nearby(`lat=${KYIV.lat}&lng=${KYIV.lng}&radiusKm=10`).expect(200);

    const clubs = (res.body as NearbyPage).items;
    expect(clubs.map((c) => c.name)).toEqual(['Center', 'East', 'North']);
    expect(clubs[1].distanceKm).toBeCloseTo(3.5, 0);
    expect(clubs[2].distanceKm).toBeCloseTo(5, 0);
  });

  it('cuts off the corner of the bounding box that is farther than the radius', async () => {
    const tight = await nearby(`lat=${KYIV.lat}&lng=${KYIV.lng}&radiusKm=10`).expect(200);
    const wide = await nearby(`lat=${KYIV.lat}&lng=${KYIV.lng}&radiusKm=14`).expect(200);

    expect((tight.body as NearbyPage).items.map((c) => c.name)).not.toContain('Corner');
    expect((wide.body as NearbyPage).items.map((c) => c.name)).toContain('Corner');
  });

  it('with the largest allowed radius (100 km) still never returns a club 468 km away', async () => {
    const res = await nearby(`lat=${KYIV.lat}&lng=${KYIV.lng}&radiusKm=100`).expect(200);

    expect((res.body as NearbyPage).items.map((c) => c.name)).toEqual([
      'Center',
      'East',
      'North',
      'Corner',
    ]);
  });

  it('applies the default radius (10 km)', async () => {
    const res = await nearby(`lat=${KYIV.lat}&lng=${KYIV.lng}`).expect(200);

    expect((res.body as NearbyPage).items.map((c) => c.name)).toEqual(['Center', 'East', 'North']);
  });

  it('pages the distance-sorted list: page 2 continues where page 1 stopped', async () => {
    const base = `lat=${KYIV.lat}&lng=${KYIV.lng}&radiusKm=14&limit=2`;

    const first = (await nearby(`${base}&page=1`).expect(200)).body as NearbyPage;
    const second = (await nearby(`${base}&page=2`).expect(200)).body as NearbyPage;
    const third = (await nearby(`${base}&page=3`).expect(200)).body as NearbyPage;

    expect(first.items.map((c) => c.name)).toEqual(['Center', 'East']);
    expect(second.items.map((c) => c.name)).toEqual(['North', 'Corner']);
    expect(second.meta).toEqual({ page: 2, limit: 2, total: 4, totalPages: 2 });
    expect(third.items).toEqual([]);
  });

  it('returns an empty page when nothing is close', async () => {
    const res = await nearby('lat=0&lng=0&radiusKm=10').expect(200);

    expect(res.body).toEqual({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });

  it('is not swallowed by GET /clubs/:id (200, not 400 "uuid is expected")', async () => {
    await nearby(`lat=${KYIV.lat}&lng=${KYIV.lng}`).expect(200);
  });

  it('rejects wrong or missing parameters (400)', async () => {
    await nearby('lng=30.5').expect(400); // no lat
    await nearby('lat=50.4').expect(400); // no lng
    await nearby('lat=95&lng=30.5').expect(400);
    await nearby('lat=50.4&lng=181').expect(400);
    await nearby('lat=abc&lng=30.5').expect(400);
    await nearby('lat=50.4&lng=30.5&radiusKm=0').expect(400);
    await nearby('lat=50.4&lng=30.5&radiusKm=101').expect(400);
    await nearby('lat=50.4&lng=30.5&limit=101').expect(400);
    await nearby('lat=50.4&lng=30.5&page=0').expect(400);
  });

  it('any logged-in user can search, an anonymous caller cannot', async () => {
    const player = await registerUser(app);

    await nearby(`lat=${KYIV.lat}&lng=${KYIV.lng}`, player.accessToken).expect(200);
    await api(app).get(`/api/v1/clubs/nearby?lat=${KYIV.lat}&lng=${KYIV.lng}`).expect(401);
  });
});
