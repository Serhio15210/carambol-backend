import { INestApplication } from '@nestjs/common';
import { MIN_GAP_CM } from '@/modules/tables/table-layout';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

// A 300 × 150 cm table; at x = 500 it occupies x 350..650.
const table = (number: number, x: number) => ({
  number,
  type: 'pool',
  lengthCm: 300,
  widthCm: 150,
  x,
  y: 500,
});

describe('Billiard tables (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  const createTable = (body: object) =>
    api(app).post('/api/v1/admin/tables').set('Authorization', `Bearer ${adminToken}`).send(body);

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

  it('a regular user cannot create a table (403)', async () => {
    const player = await registerUser(app);

    await api(app)
      .post('/api/v1/admin/tables')
      .set('Authorization', `Bearer ${player.accessToken}`)
      .send(table(1, 500))
      .expect(403);
  });

  it('rejects a table closer than MIN_GAP_CM to another one (409)', async () => {
    await createTable(table(1, 500)).expect(201);

    // Table 2's left edge is 650 + MIN_GAP_CM at x = 800 + MIN_GAP_CM; one cm closer is too close.
    await createTable(table(2, 800 + MIN_GAP_CM - 1)).expect(409);
    await createTable(table(2, 800 + MIN_GAP_CM)).expect(201); // exactly the passage is allowed
  });

  it("frees a deleted table's number for a new table (201)", async () => {
    const first = await createTable(table(1, 500)).expect(201);

    await api(app)
      .delete(`/api/v1/admin/tables/${(first.body as { id: string }).id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await createTable(table(1, 500)).expect(201);
  });
});
