import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Order } from '@/modules/orders/entities/order.entity';
import {
  api,
  createTestApp,
  loginAsSuperadmin,
  registerUser,
  resetDatabase,
} from './utils/test-app';

type Created = { id: string };
type OrderBody = { id: string; userId: string; tableId: string; status: string; startsAt: string };

// Monday 7 January 2030 (Kyiv is UTC+2 in winter): the club works 10:00-22:00.
const at = (time: string, date = '2030-01-07') => `${date}T${time}:00+02:00`;

describe('Orders: booking tables (e2e)', () => {
  let app: INestApplication;
  let orders: Repository<Order>;
  let adminToken: string;
  let player: { accessToken: string; user: { id: string } };
  let tableA: string;
  let tableB: string;

  const adminPost = async (url: string, body: object) =>
    (await api(app).post(url).set('Authorization', `Bearer ${adminToken}`).send(body).expect(201))
      .body as Created;

  const book = (tableIds: string[], startsAt: string, endsAt: string, token = player.accessToken) =>
    api(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`).send({
      tableIds,
      startsAt,
      endsAt,
    });

  // A club with one room and `count` tables (300 x 150 cm, far enough apart), open on Mondays.
  const createClubWithTables = async (name: string, count: number, withHours = true) => {
    const club = await adminPost('/api/v1/admin/clubs', {
      name,
      address: 'Kyiv',
      lat: 50.45,
      lng: 30.52,
    });
    if (withHours) {
      await api(app)
        .put(`/api/v1/admin/clubs/${club.id}/schedule/hours/1`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ opensAt: '10:00', closesAt: '22:00' })
        .expect(200);
    }
    const room = await adminPost(`/api/v1/admin/clubs/${club.id}/rooms`, {
      name: 'Main hall',
      widthCm: 3000,
      lengthCm: 3000,
    });
    const ids: string[] = [];
    for (let number = 1; number <= count; number++) {
      const table = await adminPost('/api/v1/admin/tables', {
        roomId: room.id,
        number,
        type: 'pool',
        lengthCm: 300,
        widthCm: 150,
        x: 500 * number,
        y: 500,
      });
      ids.push(table.id);
    }
    return ids;
  };

  beforeAll(async () => {
    app = await createTestApp();
    orders = app.get(DataSource).getRepository(Order);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    adminToken = await loginAsSuperadmin(app);
    player = await registerUser(app);
    [tableA, tableB] = await createClubWithTables('Carambol', 2);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates one order per table for the user from the token (201)', async () => {
    const res = await book([tableA, tableB], at('12:00'), at('14:00')).expect(201);

    const body = res.body as OrderBody[];
    expect(body).toHaveLength(2);
    expect(body.map((order) => order.tableId).sort()).toEqual([tableA, tableB].sort());
    expect(body.every((order) => order.userId === player.user.id)).toBe(true);
    expect(body.every((order) => order.status === 'reserved')).toBe(true);
    expect(new Date(body[0].startsAt).toISOString()).toBe('2030-01-07T10:00:00.000Z');
  });

  it('is closed to anonymous users (401)', async () => {
    await api(app)
      .post('/api/v1/orders')
      .send({ tableIds: [tableA], startsAt: at('12:00'), endsAt: at('14:00') })
      .expect(401);
  });

  it('rejects a malformed request (400)', async () => {
    const ok = { tableIds: [tableA], startsAt: at('12:00'), endsAt: at('14:00') };
    const send = (body: object) =>
      api(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${player.accessToken}`)
        .send(body);

    await send({ ...ok, tableIds: [] }).expect(400);
    await send({ ...ok, tableIds: [tableA, tableA] }).expect(400); // duplicates
    await send({ ...ok, tableIds: ['not-a-uuid'] }).expect(400);
    await send({ ...ok, tableIds: Array.from({ length: 6 }, () => randomUUID()) }).expect(400);
    await send({ ...ok, startsAt: '2030-01-07T12:00:00' }).expect(400); // no offset: which zone?
    await send({ ...ok, endsAt: 'tomorrow' }).expect(400);
    await send({ ...ok, userId: randomUUID() }).expect(400); // the owner is never taken from the body
    await send({ tableIds: [tableA] }).expect(400);
  });

  it('refuses a booking that breaks the time rules (400)', async () => {
    await book([tableA], at('12:15'), at('14:00')).expect(400); // not on the 30-minute grid
    await book([tableA], at('12:00'), at('17:00')).expect(400); // longer than 4 hours
    await book([tableA], at('14:00'), at('12:00')).expect(400); // ends before it starts
    await book([tableA], '2020-01-06T12:00:00+02:00', '2020-01-06T14:00:00+02:00').expect(400); // past
    expect(await orders.count()).toBe(0);
  });

  it('refuses a booking outside the working hours (400)', async () => {
    await book([tableA], at('21:30'), at('22:30')).expect(400); // closes at 22:00
    await book([tableA], at('09:30'), at('10:30')).expect(400); // opens at 10:00
    await book([tableA], at('12:00', '2030-01-08'), at('13:00', '2030-01-08')).expect(400); // Tuesday
    expect(await orders.count()).toBe(0);
  });

  it('answers 404 for a table that does not exist', async () => {
    await book([tableA, randomUUID()], at('12:00'), at('14:00')).expect(404);
    expect(await orders.count()).toBe(0);
  });

  it('answers 409 for a table under repair', async () => {
    await app
      .get(DataSource)
      .query(`UPDATE billiard_tables SET status = 'maintenance' WHERE id = $1`, [tableB]);

    await book([tableA, tableB], at('12:00'), at('14:00')).expect(409);
    expect(await orders.count()).toBe(0);
  });

  it('refuses tables of two different clubs in one booking (400)', async () => {
    const [otherClubTable] = await createClubWithTables('Other club', 1);

    await book([tableA, otherClubTable], at('12:00'), at('14:00')).expect(400);
    expect(await orders.count()).toBe(0);
  });

  it('answers 409 when the time is taken; back-to-back bookings are fine', async () => {
    await book([tableA], at('12:00'), at('14:00')).expect(201);

    await book([tableA], at('13:00'), at('15:00')).expect(409);
    await book([tableA], at('14:00'), at('15:00')).expect(201); // starts when the first ends
    await book([tableB], at('13:00'), at('15:00')).expect(201); // another table
  });

  // The transaction (stage 4): either every table of the request is booked, or none is.
  it.each([
    ['second', 1],
    ['first', 0],
  ])(
    'all or nothing: when the %s table is taken, no order is left behind',
    async (_name, index) => {
      const [taken, free] = index === 1 ? [tableB, tableA] : [tableA, tableB];
      await book([taken], at('12:00'), at('14:00')).expect(201);

      await book([tableA, tableB], at('12:00'), at('14:00')).expect(409);

      expect(await orders.countBy({ tableId: free })).toBe(0);
      expect(await orders.count()).toBe(1);
    },
  );

  // The reason the rule lives in the database: two requests at the very same moment.
  it('of two simultaneous requests for the same table and time exactly one wins', async () => {
    for (const hour of ['12', '14', '16']) {
      const statuses = await Promise.all([
        book([tableA], at(`${hour}:00`), at(`${hour}:30`)).then((res) => res.status),
        book([tableA], at(`${hour}:00`), at(`${hour}:30`)).then((res) => res.status),
      ]);

      expect(statuses.sort()).toEqual([201, 409]);
    }
    expect(await orders.countBy({ tableId: tableA })).toBe(3);
  });

  // Two multi-table requests that name the tables in OPPOSITE order must not deadlock each other
  // into a 500: one wins (201), the other gets a clean 409.
  it('two simultaneous requests with the tables in opposite order: one 201, one 409, never 500', async () => {
    const statuses = await Promise.all([
      book([tableA, tableB], at('12:00'), at('13:00')).then((res) => res.status),
      book([tableB, tableA], at('12:00'), at('13:00')).then((res) => res.status),
    ]);

    expect(statuses.sort()).toEqual([201, 409]);
    expect(await orders.count()).toBe(2);
  });

  // ---- Stage 5: my bookings, cancelling, the admin list -----------------------------------------

  type Page = {
    items: OrderBody[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  };
  const get = (url: string, token = player.accessToken) =>
    api(app).get(url).set('Authorization', `Bearer ${token}`);
  const cancel = (id: string, token = player.accessToken) =>
    api(app).patch(`/api/v1/orders/${id}/cancel`).set('Authorization', `Bearer ${token}`);
  const bookOne = async (tableId: string, from: string, to: string, token = player.accessToken) =>
    ((await book([tableId], at(from), at(to), token).expect(201)).body as OrderBody[])[0];

  describe('my bookings', () => {
    it('lists only my own bookings, the latest start first, with the paging meta', async () => {
      const second = await registerUser(app, {
        userName: 'player2',
        email: 'player2@example.com',
        phone: '+380671110002',
      });
      const early = await bookOne(tableA, '10:00', '11:00');
      const late = await bookOne(tableA, '15:00', '16:00');
      await bookOne(tableB, '12:00', '13:00', second.accessToken);

      const page = (await get('/api/v1/orders/my').expect(200)).body as Page;

      expect(page.items.map((order) => order.id)).toEqual([late.id, early.id]);
      expect(page.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    });

    it('is cut into pages by the database; a page past the end is empty', async () => {
      await bookOne(tableA, '10:00', '11:00');
      await bookOne(tableA, '12:00', '13:00');
      await bookOne(tableA, '14:00', '15:00');

      const second = (await get('/api/v1/orders/my?limit=2&page=2').expect(200)).body as Page;
      const beyond = (await get('/api/v1/orders/my?limit=2&page=3').expect(200)).body as Page;

      expect(second.items).toHaveLength(1); // the last page holds fewer than the limit
      expect(second.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
      expect(beyond.items).toEqual([]);
      expect(beyond.meta.total).toBe(3);
    });

    it('filters by status', async () => {
      const keep = await bookOne(tableA, '10:00', '11:00');
      const drop = await bookOne(tableA, '12:00', '13:00');
      await cancel(drop.id).expect(200);

      const reserved = (await get('/api/v1/orders/my?status=reserved').expect(200)).body as Page;
      const cancelled = (await get('/api/v1/orders/my?status=cancelled').expect(200)).body as Page;

      expect(reserved.items.map((order) => order.id)).toEqual([keep.id]);
      expect(cancelled.items.map((order) => order.id)).toEqual([drop.id]);
    });

    it('rejects a wrong query (400) and anonymous users (401)', async () => {
      await get('/api/v1/orders/my?status=weird').expect(400);
      await get('/api/v1/orders/my?limit=0').expect(400);
      await api(app).get('/api/v1/orders/my').expect(401);
    });
  });

  describe('cancelling', () => {
    it('the owner cancels a booking (200) and the time becomes free for others again', async () => {
      const order = await bookOne(tableA, '12:00', '14:00');

      const res = await cancel(order.id).expect(200);

      expect((res.body as OrderBody).status).toBe('cancelled');
      await book([tableA], at('12:00'), at('14:00')).expect(201); // the exclusion constraint ignores it
    });

    it('cancelling twice gives 409', async () => {
      const order = await bookOne(tableA, '12:00', '14:00');
      await cancel(order.id).expect(200);

      await cancel(order.id).expect(409);
    });

    it('a booking of somebody else is 404, exactly like a missing one, and stays untouched', async () => {
      const order = await bookOne(tableA, '12:00', '14:00');
      const stranger = await registerUser(app, {
        userName: 'player2',
        email: 'player2@example.com',
        phone: '+380671110002',
      });

      await cancel(order.id, stranger.accessToken).expect(404);
      await cancel(randomUUID()).expect(404);
      await cancel('not-a-uuid').expect(400);
      expect((await orders.findOneByOrFail({ id: order.id })).status).toBe('reserved');
    });

    it('a booking that has already started: 409 for the user, 200 for an admin', async () => {
      const started = (
        await orders.insert({
          userId: player.user.id,
          tableId: tableA,
          startsAt: new Date('2020-01-06T10:00:00Z'),
          endsAt: new Date('2020-01-06T11:00:00Z'),
        })
      ).identifiers[0] as Created;

      await cancel(started.id).expect(409);
      await cancel(started.id, adminToken).expect(200);
    });

    it('an admin cancels a booking of a user and it is written to the audit journal; the owner leaves no entry', async () => {
      const mine = await bookOne(tableA, '10:00', '11:00');
      const theirs = await bookOne(tableA, '12:00', '13:00');
      const countAudit = async () => {
        const rows: { n: string }[] = await app
          .get(DataSource)
          .query(`SELECT count(*) AS n FROM audit_logs WHERE action = 'order.cancel'`);
        return Number(rows[0].n);
      };

      await cancel(mine.id).expect(200);
      expect(await countAudit()).toBe(0);

      await cancel(theirs.id, adminToken).expect(200);
      expect(await countAudit()).toBe(1);
    });
  });

  describe('the admin list', () => {
    it('is closed to regular users (403) and to anonymous (401)', async () => {
      await get('/api/v1/admin/orders').expect(403);
      await api(app).get('/api/v1/admin/orders').expect(401);
    });

    it('shows everybody, and filters by table, user and status', async () => {
      const second = await registerUser(app, {
        userName: 'player2',
        email: 'player2@example.com',
        phone: '+380671110002',
      });
      const a = await bookOne(tableA, '10:00', '11:00');
      const b = await bookOne(tableB, '10:00', '11:00', second.accessToken);
      const c = await bookOne(tableA, '12:00', '13:00', second.accessToken);
      await cancel(c.id, second.accessToken).expect(200);
      const ids = async (query: string) =>
        ((await get(`/api/v1/admin/orders${query}`, adminToken).expect(200)).body as Page).items
          .map((order) => order.id)
          .sort();

      expect(await ids('')).toEqual([a.id, b.id, c.id].sort());
      expect(await ids(`?tableId=${tableA}`)).toEqual([a.id, c.id].sort());
      expect(await ids(`?userId=${second.user.id}`)).toEqual([b.id, c.id].sort());
      expect(await ids('?status=cancelled')).toEqual([c.id]);
      expect(await ids(`?userId=${second.user.id}&status=reserved`)).toEqual([b.id]);
    });
  });
});
