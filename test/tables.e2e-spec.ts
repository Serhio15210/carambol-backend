import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

type Created = { id: string };

// The club keeps 150 cm (the default passage) between tables and from the walls.
const PASSAGE = 150;

describe('Billiard tables (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let clubId: string;
  let roomId: string; // a 3000 × 3000 cm room, plenty of space

  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

  // A 300 × 150 cm table; at x = 500, y = 500 it occupies x 350..650, y 425..575.
  const table = (number: number, x: number, extra: Record<string, unknown> = {}) => ({
    roomId,
    number,
    type: 'pool',
    lengthCm: 300,
    widthCm: 150,
    x,
    y: 500,
    ...extra,
  });

  const createTable = (body: object) =>
    api(app).post('/api/v1/admin/tables').set('Authorization', `Bearer ${adminToken}`).send(body);

  const createRoom = async (name: string, widthCm = 3000, lengthCm = 3000) =>
    (
      await api(app)
        .post(`/api/v1/admin/clubs/${clubId}/rooms`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name, widthCm, lengthCm })
        .expect(201)
    ).body as Created;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    adminToken = await loginAsSuperadmin(app);
    const club = await api(app)
      .post('/api/v1/admin/clubs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Carambol', address: 'Kyiv', lat: 50.4501, lng: 30.5234 })
      .expect(201);
    clubId = (club.body as Created).id;
    roomId = (await createRoom('Main hall')).id;
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

  it('rejects a table closer than the passage to another one (409)', async () => {
    await createTable(table(1, 500)).expect(201);

    // Table 2's left edge is 650 + PASSAGE at x = 800 + PASSAGE; one cm closer is too close.
    await createTable(table(2, 800 + PASSAGE - 1)).expect(409);
    await createTable(table(2, 800 + PASSAGE)).expect(201); // exactly the passage is allowed
  });

  it("frees a deleted table's number for a new table (201)", async () => {
    const first = await createTable(table(1, 500)).expect(201);

    await asAdmin(api(app).delete(`/api/v1/admin/tables/${(first.body as Created).id}`)).expect(
      204,
    );

    await createTable(table(1, 500)).expect(201);
  });

  it('needs an existing room: 400 without roomId, 404 for an unknown room', async () => {
    const withoutRoom: Record<string, unknown> = { ...table(1, 500) };
    delete withoutRoom.roomId;

    await createTable(withoutRoom).expect(400);
    await createTable(table(1, 500, { roomId: '00000000-0000-4000-8000-000000000000' })).expect(
      404,
    );
  });

  it('rejects a table that is closer to a wall than the passage (409)', async () => {
    // Table 300 × 150: the center must be at x >= 300 for a 150 cm margin to the left wall.
    await createTable(table(1, 299)).expect(409);
    await createTable(table(1, 300, { y: 225 })).expect(201); // exactly at the margin
  });

  it('allows the same table number in different rooms, but not twice in one room', async () => {
    const annex = await createRoom('Annex');

    await createTable(table(1, 500)).expect(201);
    await createTable(table(1, 1500)).expect(409); // same room, same number
    await createTable(table(1, 500, { roomId: annex.id })).expect(201); // other room: same place, same number
  });

  it('keeps the tables of different rooms apart when checking the passage', async () => {
    const annex = await createRoom('Annex');
    await createTable(table(1, 500)).expect(201);

    // Same coordinates in another room do not collide with table 1.
    await createTable(table(2, 500, { roomId: annex.id })).expect(201);
  });

  it('lists the tables of one room with ?roomId=', async () => {
    const annex = await createRoom('Annex');
    await createTable(table(1, 500)).expect(201);
    await createTable(table(2, 500, { roomId: annex.id })).expect(201);

    const res = await asAdmin(api(app).get(`/api/v1/tables?roomId=${annex.id}`)).expect(200);

    expect((res.body as { items: { number: number }[] }).items.map((t) => t.number)).toEqual([2]);
  });

  it('a table cannot move to another room: roomId is not editable (400)', async () => {
    const annex = await createRoom('Annex');
    const created = (await createTable(table(1, 500)).expect(201)).body as Created;

    await asAdmin(api(app).patch(`/api/v1/admin/tables/${created.id}`))
      .send({ roomId: annex.id })
      .expect(400);
  });

  it('PostgreSQL refuses to delete a room that has tables (409)', async () => {
    await createTable(table(1, 500)).expect(201);

    await asAdmin(api(app).delete(`/api/v1/admin/clubs/${clubId}/rooms/${roomId}`)).expect(409);
  });

  it('known limit: a room whose only table is soft-deleted still cannot be deleted (409)', async () => {
    const created = (await createTable(table(1, 500)).expect(201)).body as Created;
    await asAdmin(api(app).delete(`/api/v1/admin/tables/${created.id}`)).expect(204);

    // The deleted row still references the room, and the foreign key checks real rows.
    await asAdmin(api(app).delete(`/api/v1/admin/clubs/${clubId}/rooms/${roomId}`)).expect(409);
  });
});
