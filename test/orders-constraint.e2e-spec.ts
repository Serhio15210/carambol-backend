import { INestApplication } from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Order } from '@/modules/orders/entities/order.entity';
import { OrderStatus } from '@/modules/orders/types/order-status.enum';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

type Created = { id: string };

// The booking rule "one table, one time" is enforced by PostgreSQL itself (exclusion constraint
// no_double_booking), so these tests go straight to the table, below any service code.
describe('orders: the database refuses double bookings (e2e)', () => {
  let app: INestApplication;
  let orders: Repository<Order>;
  let userId: string;
  let tableA: string;
  let tableB: string;

  const adminPost = async (token: string, url: string, body: object) =>
    (await api(app).post(url).set('Authorization', `Bearer ${token}`).send(body).expect(201))
      .body as Created;

  const book = (tableId: string, startsAt: string, endsAt: string, status?: OrderStatus) =>
    orders.insert({
      userId,
      tableId,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      status,
    });

  // The PostgreSQL error code of a failed query, or 'ok' when it succeeded.
  const outcome = async (query: Promise<unknown>): Promise<string> => {
    try {
      await query;
      return 'ok';
    } catch (error) {
      return ((error as QueryFailedError).driverError as { code?: string }).code ?? 'unknown';
    }
  };

  beforeAll(async () => {
    app = await createTestApp();
    orders = app.get(DataSource).getRepository(Order);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    const admin = await loginAsSuperadmin(app);
    userId = (await registerUser(app)).user.id;
    const club = await adminPost(admin, '/api/v1/admin/clubs', {
      name: 'Carambol',
      address: 'Kyiv',
      lat: 50.45,
      lng: 30.52,
    });
    const room = await adminPost(admin, `/api/v1/admin/clubs/${club.id}/rooms`, {
      name: 'Main hall',
      widthCm: 3000,
      lengthCm: 3000,
    });
    const table = (number: number, x: number) => ({
      roomId: room.id,
      number,
      type: 'pool',
      lengthCm: 300,
      widthCm: 150,
      x,
      y: 500,
    });
    tableA = (await adminPost(admin, '/api/v1/admin/tables', table(1, 500))).id;
    tableB = (await adminPost(admin, '/api/v1/admin/tables', table(2, 1500))).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses an overlapping booking of the same table (23P01)', async () => {
    await book(tableA, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');

    expect(await outcome(book(tableA, '2026-12-01T10:30:00Z', '2026-12-01T11:30:00Z'))).toBe(
      '23P01',
    );
    expect(await outcome(book(tableA, '2026-12-01T09:00:00Z', '2026-12-01T12:00:00Z'))).toBe(
      '23P01',
    ); // swallows it
    expect(await outcome(book(tableA, '2026-12-01T10:15:00Z', '2026-12-01T10:45:00Z'))).toBe(
      '23P01',
    ); // inside it
  });

  it('allows back-to-back bookings (half-open interval) and the same time on another table', async () => {
    await book(tableA, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');

    expect(await outcome(book(tableA, '2026-12-01T11:00:00Z', '2026-12-01T12:00:00Z'))).toBe('ok');
    expect(await outcome(book(tableA, '2026-12-01T09:00:00Z', '2026-12-01T10:00:00Z'))).toBe('ok');
    expect(await outcome(book(tableB, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'))).toBe('ok');
  });

  it('a cancelled booking frees the table; bringing it back while the slot is taken is refused', async () => {
    const { identifiers } = await book(tableA, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
    const firstId = (identifiers[0] as Created).id;
    await orders.update(firstId, { status: OrderStatus.CANCELLED });

    expect(await outcome(book(tableA, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'))).toBe('ok');
    expect(await outcome(orders.update(firstId, { status: OrderStatus.RESERVED }))).toBe('23P01');
  });

  it('a booking must end after it starts (CHECK 23514), zero length included', async () => {
    expect(await outcome(book(tableA, '2026-12-01T11:00:00Z', '2026-12-01T10:00:00Z'))).toBe(
      '23514',
    );
    expect(await outcome(book(tableA, '2026-12-01T10:00:00Z', '2026-12-01T10:00:00Z'))).toBe(
      '23514',
    );
  });

  // The reason the rule lives in the database: two clients check "is it free?" at the same moment.
  // Both queries are sent without waiting, so they run on two connections at the same time.
  // The loser gets 23P01, or 40P01 (deadlock detected) when both inserts collide head-on:
  // either way it is a refusal, never two rows.
  it('of two simultaneous bookings of the same slot exactly one wins', async () => {
    for (let hour = 10; hour < 15; hour++) {
      const startsAt = `2026-12-02T${hour}:00:00Z`;
      const endsAt = `2026-12-02T${hour}:45:00Z`;

      const results = await Promise.all([
        outcome(book(tableA, startsAt, endsAt)),
        outcome(book(tableA, startsAt, endsAt)),
      ]);

      expect(results.filter((code) => code === 'ok')).toHaveLength(1);
      expect(results.find((code) => code !== 'ok')).toMatch(/^(23P01|40P01)$/);
    }
    expect(await orders.countBy({ tableId: tableA })).toBe(5);
  });

  it('a table that has bookings cannot be hard-deleted (FK RESTRICT, 23503)', async () => {
    await book(tableA, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');

    expect(await outcome(app.get(DataSource).query('DELETE FROM billiard_tables'))).toBe('23503');
  });
});
