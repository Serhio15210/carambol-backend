import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { Actor } from '@/modules/users/users.service';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { ClubScheduleService } from './club-schedule.service';
import { ClubsService } from './clubs.service';
import { ClubOpeningHours } from './entities/club-opening-hours.entity';
import { ClubScheduleException } from './entities/club-schedule-exception.entity';

// Like the real tables: rows are identified by `keys` (the composite primary key), save() on an
// existing key replaces the row, find() filters by clubId and sorts by `sortBy`.
class FakeRepository<T extends { clubId: string }> {
  rows: T[] = [];

  constructor(
    private readonly keys: (keyof T)[],
    private readonly sortBy: keyof T,
  ) {}

  private same = (a: T, b: Partial<T>) => this.keys.every((key) => a[key] === b[key]);

  create = (data: Partial<T>) => ({ ...data }) as T;

  save = (row: T) => {
    this.rows = [...this.rows.filter((r) => !this.same(r, row)), { ...row }];
    return Promise.resolve(row);
  };

  find = ({ where }: { where: { clubId: string } }) =>
    Promise.resolve(
      this.rows
        .filter((r) => r.clubId === where.clubId)
        .sort((a, b) =>
          String(a[this.sortBy]).localeCompare(String(b[this.sortBy]), undefined, {
            numeric: true,
          }),
        ),
    );

  delete = (key: Partial<T>) => {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !this.same(r, key));
    return Promise.resolve({ affected: before - this.rows.length });
  };
}

const actor: Actor = { id: 'admin', role: UserRole.ADMIN };
const hours = { opensAt: '10:00', closesAt: '22:00' };

describe('ClubScheduleService', () => {
  let repo: FakeRepository<ClubOpeningHours>;
  let exceptions: FakeRepository<ClubScheduleException>;
  let service: ClubScheduleService;
  const record = jest.fn();

  beforeEach(() => {
    record.mockReset().mockResolvedValue(undefined);
    repo = new FakeRepository<ClubOpeningHours>(['clubId', 'weekday'], 'weekday');
    exceptions = new FakeRepository<ClubScheduleException>(['clubId', 'date'], 'date');
    const clubs = {
      findById: jest.fn((id: string) =>
        id === 'ghost'
          ? Promise.reject(new NotFoundException('no club'))
          : Promise.resolve({ id, timezone: id === 'utc' ? 'UTC' : 'Europe/Kyiv' }),
      ),
    };
    service = new ClubScheduleService(
      repo as unknown as Repository<ClubOpeningHours>,
      exceptions as unknown as Repository<ClubScheduleException>,
      clubs as unknown as ClubsService,
      { record } as unknown as AuditService,
    );
  });

  it('sets a day, repeats the same call and changes it: still one row for that day', async () => {
    await service.setHours(actor, 'c1', 1, hours);
    await service.setHours(actor, 'c1', 1, hours);
    await service.setHours(actor, 'c1', 1, { opensAt: '12:00', closesAt: '23:00' });

    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ clubId: 'c1', weekday: 1, opensAt: '12:00' });
    expect(record).toHaveBeenLastCalledWith('admin', AuditAction.ClubHoursSet, 'c1', {
      weekday: 1,
      opensAt: '12:00',
      closesAt: '23:00',
    });
  });

  it('returns the time zone and the days ordered Monday first', async () => {
    await service.setHours(actor, 'c1', 3, hours);
    await service.setHours(actor, 'c1', 1, hours);
    await service.setHours(actor, 'c2', 2, hours); // another club

    const schedule = await service.getSchedule('c1');

    expect(schedule.timezone).toBe('Europe/Kyiv');
    expect(schedule.hours.map((h) => h.weekday)).toEqual([1, 3]);
  });

  it('answers 404 for an unknown club and writes nothing', async () => {
    await expect(service.setHours(actor, 'ghost', 1, hours)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.setException(actor, 'ghost', '2026-12-31', { closed: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getSchedule('ghost')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.isOpen('ghost', new Date())).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.rows).toHaveLength(0);
    expect(exceptions.rows).toHaveLength(0);
    expect(record).not.toHaveBeenCalled();
  });

  it('removes a day; removing a day that is not set is 404 and writes no audit entry', async () => {
    await service.setHours(actor, 'c1', 1, hours);
    record.mockClear();

    await service.removeHours(actor, 'c1', 1);
    expect(repo.rows).toHaveLength(0);
    expect(record).toHaveBeenCalledWith('admin', AuditAction.ClubHoursRemove, 'c1', {
      weekday: 1,
    });

    record.mockClear();
    await expect(service.removeHours(actor, 'c1', 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(record).not.toHaveBeenCalled();
  });

  describe('exceptions for single dates', () => {
    it('sets one, repeats the call and changes it: still one row for that date', async () => {
      await service.setException(actor, 'c1', '2026-12-31', { closed: true, note: 'New Year' });
      await service.setException(actor, 'c1', '2026-12-31', { closed: false, ...hours });

      expect(exceptions.rows).toHaveLength(1);
      expect(exceptions.rows[0]).toMatchObject({
        date: '2026-12-31',
        closed: false,
        opensAt: '10:00',
        closesAt: '22:00',
        note: null,
      });
      expect(record).toHaveBeenLastCalledWith('admin', AuditAction.ClubExceptionSet, 'c1', {
        date: '2026-12-31',
        closed: false,
        ...hours,
      });
    });

    it('a closed day keeps no times, even if the client sent them', async () => {
      await service.setException(actor, 'c1', '2026-12-31', { closed: true, ...hours });

      expect(exceptions.rows[0]).toMatchObject({ closed: true, opensAt: null, closesAt: null });
    });

    it('are listed with the schedule, earliest date first, only for that club', async () => {
      await service.setException(actor, 'c1', '2026-12-31', { closed: true });
      await service.setException(actor, 'c1', '2026-05-01', { closed: true });
      await service.setException(actor, 'c2', '2026-01-01', { closed: true });

      const schedule = await service.getSchedule('c1');

      expect(schedule.exceptions.map((e) => e.date)).toEqual(['2026-05-01', '2026-12-31']);
    });

    it('removing one that is not set is 404 and writes no audit entry', async () => {
      await service.setException(actor, 'c1', '2026-12-31', { closed: true });
      record.mockClear();

      await service.removeException(actor, 'c1', '2026-12-31');
      expect(exceptions.rows).toHaveLength(0);
      expect(record).toHaveBeenCalledWith('admin', AuditAction.ClubExceptionRemove, 'c1', {
        date: '2026-12-31',
      });

      record.mockClear();
      await expect(service.removeException(actor, 'c1', '2026-12-31')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(record).not.toHaveBeenCalled();
    });
  });

  // Is the club open at this INSTANT? The instant is turned into the club's LOCAL time first.
  // Kyiv is UTC+2 in winter and UTC+3 in summer. 2026-11-14 is a Saturday, 2026-11-15 a Sunday.
  describe('isOpen', () => {
    const at = (iso: string) => new Date(iso);

    beforeEach(async () => {
      for (const club of ['c1', 'utc']) {
        await service.setHours(actor, club, 6, { opensAt: '18:00', closesAt: '02:00' }); // Saturday, overnight
        await service.setHours(actor, club, 7, { opensAt: '12:00', closesAt: '20:00' }); // Sunday
      }
    });

    it('reads the instant in the club time zone: Sunday 12:30 in Kyiv is 10:30 UTC', async () => {
      expect(await service.isOpen('c1', at('2026-11-15T10:30:00Z'))).toBe(true);
      expect(await service.isOpen('utc', at('2026-11-15T10:30:00Z'))).toBe(false);
    });

    it('Saturday night stays open after midnight until exactly 02:00 local, then it is closed', async () => {
      expect(await service.isOpen('c1', at('2026-11-14T23:30:00Z'))).toBe(true); // Sunday 01:30 in Kyiv
      expect(await service.isOpen('c1', at('2026-11-14T23:59:00Z'))).toBe(true); // 01:59
      expect(await service.isOpen('c1', at('2026-11-15T00:00:00Z'))).toBe(false); // 02:00 sharp
      expect(await service.isOpen('c1', at('2026-11-15T00:30:00Z'))).toBe(false); // 02:30
      expect(await service.isOpen('utc', at('2026-11-15T00:30:00Z'))).toBe(true); // 00:30 UTC
    });

    it('a day without a rule and without an exception is closed', async () => {
      expect(await service.isOpen('c1', at('2026-11-16T10:00:00Z'))).toBe(false); // Monday
    });

    it('a closed exception on Saturday also removes the night that starts on Saturday', async () => {
      await service.setException(actor, 'c1', '2026-11-14', { closed: true });

      expect(await service.isOpen('c1', at('2026-11-14T18:00:00Z'))).toBe(false); // Sat 20:00
      expect(await service.isOpen('c1', at('2026-11-14T23:30:00Z'))).toBe(false); // Sun 01:30, no tail
    });

    it('a closed exception on Sunday does not cut the Saturday tail, but closes Sunday', async () => {
      await service.setException(actor, 'c1', '2026-11-15', { closed: true });

      expect(await service.isOpen('c1', at('2026-11-14T23:30:00Z'))).toBe(true); // Sun 01:30
      expect(await service.isOpen('c1', at('2026-11-15T10:30:00Z'))).toBe(false); // Sun 12:30
    });

    it('an exception with its own hours replaces the weekday rule of that date', async () => {
      await service.setException(actor, 'c1', '2026-11-15', {
        closed: false,
        opensAt: '10:00',
        closesAt: '14:00',
      });

      expect(await service.isOpen('c1', at('2026-11-15T08:30:00Z'))).toBe(true); // 10:30
      expect(await service.isOpen('c1', at('2026-11-15T13:30:00Z'))).toBe(false); // 15:30
    });

    it('follows daylight saving: on 29 March 2026 Kyiv jumps from 03:00 to 04:00', async () => {
      await service.setHours(actor, 'c1', 7, { opensAt: '04:00', closesAt: '06:00' }); // Sunday

      expect(await service.isOpen('c1', at('2026-03-29T00:59:00Z'))).toBe(false); // 02:59 (+2)
      expect(await service.isOpen('c1', at('2026-03-29T01:00:00Z'))).toBe(true); // 04:00 (+3)
    });
  });
});
