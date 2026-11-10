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

type Schedule = {
  timezone: string;
  hours: { weekday: number; opensAt: string; closesAt: string }[];
  exceptions: {
    date: string;
    closed: boolean;
    opensAt: string | null;
    closesAt: string | null;
    note: string | null;
  }[];
};

describe('Club schedule (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let clubId: string;

  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const hoursUrl = (weekday: number | string, club = clubId) =>
    `/api/v1/admin/clubs/${club}/schedule/hours/${weekday}`;
  const putHours = (weekday: number | string, body: object, club = clubId) =>
    api(app).put(hoursUrl(weekday, club)).set(auth()).send(body);
  const getSchedule = async (club = clubId) =>
    (await api(app).get(`/api/v1/clubs/${club}/schedule`).set(auth()).expect(200)).body as Schedule;
  const exceptionUrl = (date: string, club = clubId) =>
    `/api/v1/admin/clubs/${club}/schedule/exceptions/${date}`;
  const putException = (date: string, body: object, club = clubId) =>
    api(app).put(exceptionUrl(date, club)).set(auth()).send(body);
  const getStatus = (at?: string, club = clubId) =>
    api(app)
      .get(`/api/v1/clubs/${club}/schedule/status`)
      .set(auth())
      .query(at ? { at } : {});
  const createClub = (extra: object = {}) =>
    api(app)
      .post('/api/v1/admin/clubs')
      .set(auth())
      .send({ name: 'Carambol', address: 'Kyiv', lat: 50.45, lng: 30.52, ...extra });

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    adminToken = await loginAsSuperadmin(app);
    clubId = ((await createClub().expect(201)).body as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a new club has the default time zone and no working days', async () => {
    expect(await getSchedule()).toEqual({ timezone: 'Europe/Kyiv', hours: [], exceptions: [] });
  });

  it('sets a day (PUT is idempotent) and shows times as HH:MM, not HH:MM:SS', async () => {
    await putHours(1, { opensAt: '10:00', closesAt: '22:00' }).expect(200);
    await putHours(1, { opensAt: '10:00', closesAt: '22:00' }).expect(200);
    await putHours(7, { opensAt: '18:00', closesAt: '02:00' }).expect(200); // overnight

    expect((await getSchedule()).hours).toMatchObject([
      { weekday: 1, opensAt: '10:00', closesAt: '22:00' },
      { weekday: 7, opensAt: '18:00', closesAt: '02:00' },
    ]);
  });

  it('changes the hours of a day with another PUT', async () => {
    await putHours(2, { opensAt: '10:00', closesAt: '22:00' }).expect(200);
    await putHours(2, { opensAt: '12:00', closesAt: '23:30' }).expect(200);

    expect((await getSchedule()).hours).toMatchObject([
      { weekday: 2, opensAt: '12:00', closesAt: '23:30' },
    ]);
  });

  it('rejects a wrong weekday or a wrong time (400)', async () => {
    const ok = { opensAt: '10:00', closesAt: '22:00' };
    await putHours(0, ok).expect(400);
    await putHours(8, ok).expect(400);
    await putHours('monday', ok).expect(400);
    await putHours(1, { opensAt: '9:00', closesAt: '22:00' }).expect(400); // not zero padded
    await putHours(1, { opensAt: '10:00', closesAt: '24:00' }).expect(400);
    await putHours(1, { opensAt: '10:00', closesAt: '22:60' }).expect(400);
    await putHours(1, { opensAt: '10:00' }).expect(400);
    await putHours(1, { ...ok, extra: 1 }).expect(400);
  });

  it('answers 404 for an unknown club', async () => {
    await putHours(1, { opensAt: '10:00', closesAt: '22:00' }, randomUUID()).expect(404);
    await api(app).get(`/api/v1/clubs/${randomUUID()}/schedule`).set(auth()).expect(404);
  });

  it('removes a day (204); removing it again is 404', async () => {
    await putHours(3, { opensAt: '10:00', closesAt: '22:00' }).expect(200);

    await api(app).delete(hoursUrl(3)).set(auth()).expect(204);
    await api(app).delete(hoursUrl(3)).set(auth()).expect(404);
    expect((await getSchedule()).hours).toEqual([]);
  });

  it('accepts an IANA time zone, rejects an offset or a nonsense name (400)', async () => {
    await createClub({ name: 'London', timezone: 'Europe/London' }).expect(201);

    await createClub({ name: 'A', timezone: '+02:00' }).expect(400); // an offset forgets daylight saving
    await createClub({ name: 'B', timezone: 'Mars/Base' }).expect(400);
    await createClub({ name: 'C', timezone: 'Kyiv' }).expect(400);
    await api(app)
      .patch(`/api/v1/admin/clubs/${clubId}`)
      .set(auth())
      .send({ timezone: 'America/New_York' })
      .expect(200);
    expect((await getSchedule()).timezone).toBe('America/New_York');
  });

  it('deleting the club removes its hours (ON DELETE CASCADE)', async () => {
    await putHours(1, { opensAt: '10:00', closesAt: '22:00' }).expect(200);

    await api(app).delete(`/api/v1/admin/clubs/${clubId}`).set(auth()).expect(204);

    const rows: { n: string }[] = await app
      .get(DataSource)
      .query('SELECT count(*) AS n FROM club_opening_hours');
    expect(Number(rows[0].n)).toBe(0);
  });

  it('is open to read for a logged-in user, closed to write (403), closed to anonymous (401)', async () => {
    const player = await registerUser(app);

    await api(app)
      .get(`/api/v1/clubs/${clubId}/schedule`)
      .set(auth(player.accessToken))
      .expect(200);
    await api(app)
      .put(hoursUrl(1))
      .set(auth(player.accessToken))
      .send({ opensAt: '10:00', closesAt: '22:00' })
      .expect(403);
    await api(app).get(`/api/v1/clubs/${clubId}/schedule`).expect(401);
  });

  describe('exceptions for single dates', () => {
    it('sets them (PUT is idempotent) and lists them with the schedule, earliest date first', async () => {
      await putException('2026-12-31', { closed: true, note: ' New Year ' }).expect(200);
      await putException('2026-12-31', { closed: true, note: 'New Year' }).expect(200);
      await putException('2026-05-01', {
        closed: false,
        opensAt: '10:00',
        closesAt: '16:00',
      }).expect(200);

      expect((await getSchedule()).exceptions).toMatchObject([
        { date: '2026-05-01', closed: false, opensAt: '10:00', closesAt: '16:00', note: null },
        { date: '2026-12-31', closed: true, opensAt: null, closesAt: null, note: 'New Year' },
      ]);
    });

    it('a closed day keeps no times even if the client sent them', async () => {
      await putException('2026-12-31', {
        closed: true,
        opensAt: '10:00',
        closesAt: '12:00',
      }).expect(200);

      expect((await getSchedule()).exceptions).toMatchObject([
        { date: '2026-12-31', closed: true, opensAt: null, closesAt: null },
      ]);
    });

    it('rejects a wrong date or wrong body (400)', async () => {
      const ok = { closed: true };
      await putException('2026-02-30', ok).expect(400); // no such day
      await putException('2026-1-1', ok).expect(400); // not zero padded
      await putException('2026-12-31T10:00:00Z', ok).expect(400); // a timestamp, not a day
      await putException('tomorrow', ok).expect(400);
      await putException('2026-12-31', {}).expect(400); // closed is required
      await putException('2026-12-31', { closed: false }).expect(400); // an open day needs times
      await putException('2026-12-31', { closed: false, opensAt: '10:00' }).expect(400);
      await putException('2026-12-31', {
        closed: false,
        opensAt: '10:00',
        closesAt: '24:00',
      }).expect(400);
      await putException('2026-12-31', { closed: 'yes' }).expect(400);
      await putException('2026-12-31', { ...ok, extra: 1 }).expect(400);
    });

    it('answers 404 for an unknown club; removes one (204), removing it again is 404', async () => {
      await putException('2026-12-31', { closed: true }, randomUUID()).expect(404);

      await putException('2026-12-31', { closed: true }).expect(200);
      await api(app).delete(exceptionUrl('2026-12-31')).set(auth()).expect(204);
      await api(app).delete(exceptionUrl('2026-12-31')).set(auth()).expect(404);
      expect((await getSchedule()).exceptions).toEqual([]);
    });

    it('are removed with the club (ON DELETE CASCADE) and closed to non-admins (403)', async () => {
      const player = await registerUser(app);
      await api(app)
        .put(exceptionUrl('2026-12-31'))
        .set(auth(player.accessToken))
        .send({ closed: true })
        .expect(403);

      await putException('2026-12-31', { closed: true }).expect(200);
      await api(app).delete(`/api/v1/admin/clubs/${clubId}`).set(auth()).expect(204);

      const rows: { n: string }[] = await app
        .get(DataSource)
        .query('SELECT count(*) AS n FROM club_schedule_exceptions');
      expect(Number(rows[0].n)).toBe(0);
    });
  });

  // 2026-11-14 is a Saturday, 2026-11-15 a Sunday; Kyiv is UTC+2 in November.
  describe('status: is the club open at a moment?', () => {
    beforeEach(async () => {
      await putHours(6, { opensAt: '18:00', closesAt: '02:00' }).expect(200); // Saturday, overnight
      await putHours(7, { opensAt: '12:00', closesAt: '20:00' }).expect(200); // Sunday
    });

    const isOpen = async (at: string) =>
      (await getStatus(at).expect(200)).body as { open: boolean; at: string };

    it('reads the moment in the club time zone', async () => {
      expect(await isOpen('2026-11-15T10:30:00Z')).toEqual({
        open: true, // Sunday 12:30 in Kyiv
        at: '2026-11-15T10:30:00.000Z',
      });
      expect((await isOpen('2026-11-15T09:30:00Z')).open).toBe(false); // 11:30, opens at 12:00
    });

    it('the same moment written with another offset gives the same answer', async () => {
      expect(await isOpen('2026-11-15T12:30:00+02:00')).toEqual({
        open: true,
        at: '2026-11-15T10:30:00.000Z',
      });
    });

    it('Saturday night is open after midnight until exactly 02:00', async () => {
      expect((await isOpen('2026-11-14T23:30:00Z')).open).toBe(true); // Sunday 01:30
      expect((await isOpen('2026-11-15T00:00:00Z')).open).toBe(false); // 02:00 sharp
    });

    it('an exception overrides the weekday rule of its date', async () => {
      await putException('2026-11-15', { closed: true }).expect(200);

      expect((await isOpen('2026-11-15T10:30:00Z')).open).toBe(false);
      expect((await isOpen('2026-11-14T23:30:00Z')).open).toBe(true); // the Saturday tail stays
    });

    it('without `at` it answers for now', async () => {
      const body = (await getStatus().expect(200)).body as { open: boolean };

      expect(typeof body.open).toBe('boolean');
    });

    it('rejects a time without an offset or a wrong time (400)', async () => {
      await getStatus('2026-11-15T12:30:00').expect(400); // which zone? the server would guess
      await getStatus('2026-11-15').expect(400);
      await getStatus('yesterday').expect(400);
      await getStatus('2026-13-15T12:30:00Z').expect(400);
    });

    it('answers 404 for an unknown club and 401 to anonymous', async () => {
      await getStatus('2026-11-15T10:30:00Z', randomUUID()).expect(404);
      await api(app)
        .get(`/api/v1/clubs/${clubId}/schedule/status`)
        .query({ at: '2026-11-15T10:30:00Z' })
        .expect(401);
    });
  });
});
