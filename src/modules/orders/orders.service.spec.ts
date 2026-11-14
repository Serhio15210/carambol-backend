import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { ClubScheduleService } from '@/modules/clubs/club-schedule.service';
import { RoomsService } from '@/modules/clubs/rooms.service';
import { BilliardTablesService } from '@/modules/tables/billiard-tables.service';
import { BilliardTableStatus } from '@/modules/tables/types/table-status.enum';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { Order } from './entities/order.entity';
import { OrderStatus } from './types/order-status.enum';
import { OrdersService } from './orders.service';

// "Today" is 1 December 2029; the bookings below are on Monday 7 January 2030. Kyiv is UTC+2 in winter.
const NOW = new Date('2029-12-01T08:00:00Z');
const kyiv = (local: string) => new Date(`${local}:00+02:00`);

const MONDAY_10_22 = {
  timezone: 'Europe/Kyiv',
  hours: [{ weekday: 1, opensAt: '10:00', closesAt: '22:00' }],
  exceptions: [],
};

// t1 and t2 stand in room r1 of club c1, t3 in room r2 of ANOTHER club c2, tm is under repair.
const TABLES = {
  t1: { id: 't1', roomId: 'r1', number: 1, status: BilliardTableStatus.ACTIVE },
  t2: { id: 't2', roomId: 'r1', number: 2, status: BilliardTableStatus.ACTIVE },
  t3: { id: 't3', roomId: 'r2', number: 3, status: BilliardTableStatus.ACTIVE },
  tm: { id: 'tm', roomId: 'r1', number: 4, status: BilliardTableStatus.MAINTENANCE },
} as Record<string, { id: string; roomId: string; number: number; status: BilliardTableStatus }>;
const CLUB_OF_ROOM: Record<string, string> = { r1: 'c1', r2: 'c2' };

function setup(schedule: object = MONDAY_10_22) {
  const tables = {
    findById: jest.fn((id: string) =>
      id in TABLES
        ? Promise.resolve(TABLES[id])
        : Promise.reject(new NotFoundException(`Table ${id} not found`)),
    ),
  };
  const rooms = {
    findRoomWithClub: jest.fn((roomId: string) =>
      Promise.resolve({ id: roomId, clubId: CLUB_OF_ROOM[roomId] }),
    ),
  };
  const schedules = { getSchedule: jest.fn(() => Promise.resolve(schedule)) };
  const service = new OrdersService(
    {} as Repository<Order>,
    {} as DataSource,
    tables as unknown as BilliardTablesService,
    rooms as unknown as RoomsService,
    schedules as unknown as ClubScheduleService,
    {} as AuditService,
  );
  return { service, tables, rooms, schedules };
}

const request = (tableIds: string[], from = '2030-01-07T12:00', to = '2030-01-07T14:00') => ({
  tableIds,
  startsAt: kyiv(from),
  endsAt: kyiv(to),
});

describe('OrdersService.assertBookable (your part)', () => {
  it('accepts a good request for several tables and loads the club schedule only once', async () => {
    const { service, schedules } = setup();

    await expect(service.assertBookable(request(['t1', 't2']), NOW)).resolves.toBeUndefined();

    expect(schedules.getSchedule).toHaveBeenCalledTimes(1);
    expect(schedules.getSchedule).toHaveBeenCalledWith('c1');
  });

  it('a table that does not exist: 404', async () => {
    const { service } = setup();

    await expect(service.assertBookable(request(['t1', 'ghost']), NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('a table under repair: 409', async () => {
    const { service } = setup();

    await expect(service.assertBookable(request(['t1', 'tm']), NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('tables of different clubs: 400, and the schedule is not even loaded', async () => {
    const { service, schedules } = setup();

    await expect(service.assertBookable(request(['t1', 't3']), NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(schedules.getSchedule).not.toHaveBeenCalled();
  });

  it('a problem with the time is a 400 with the reason from bookingTimeProblem', async () => {
    const { service } = setup();
    const inThePast = request(['t1'], '2029-11-30T12:00', '2029-11-30T14:00');
    const offTheGrid = request(['t1'], '2030-01-07T12:15', '2030-01-07T14:00');

    await expect(service.assertBookable(inThePast, NOW)).rejects.toThrow(
      'Booking must start in the future',
    );
    await expect(service.assertBookable(offTheGrid, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('the 30-minute grid is checked in the time zone of the CLUB, not in UTC', async () => {
    // 10:00-11:00 UTC is 15:45-16:45 in Kathmandu: not on the grid there, although it is in UTC.
    const kathmandu = { ...MONDAY_10_22, timezone: 'Asia/Kathmandu' };
    const { service } = setup(kathmandu);
    const utc = { tableIds: ['t1'], startsAt: new Date('2030-01-07T10:00:00Z') };

    await expect(
      service.assertBookable({ ...utc, endsAt: new Date('2030-01-07T11:00:00Z') }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a booking outside the working hours, or on a day without hours: 400', async () => {
    const { service } = setup();
    const afterClosing = request(['t1'], '2030-01-07T21:30', '2030-01-07T22:30');
    const tuesday = request(['t1'], '2030-01-08T12:00', '2030-01-08T13:00');

    await expect(service.assertBookable(afterClosing, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.assertBookable(tuesday, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tables are checked first: a missing table beats a bad time (404, not 400)', async () => {
    const { service } = setup();
    const badTime = request(['ghost'], '2029-11-30T12:00', '2029-11-30T14:00');

    await expect(service.assertBookable(badTime, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// A tiny imitation of a database transaction: rows saved inside are "pending" and become
// "committed" only when the callback finishes; if it throws, they vanish (ROLLBACK).
// The manager understands manager.create / manager.save / manager.getRepository(...).create|save,
// with or without the entity class as the first argument.
type Row = { userId: string; tableId: string };
type Save = (...args: unknown[]) => Promise<unknown>;
type FakeManager = {
  create: (target: unknown, data: object) => object;
  save: Save;
  getRepository: (target: unknown) => { create: (data: object) => object; save: Save };
};

class FakeDataSource {
  committed: Row[] = [];
  transactions = 0;
  conflictingTables = new Set<string>(); // saving one of these fails, like the exclusion constraint

  transaction = async <T>(work: (manager: FakeManager) => Promise<T>): Promise<T> => {
    this.transactions += 1;
    const pending: Row[] = [];
    const save: Save = (...args) => {
      const row = args[args.length - 1] as Row;
      if (this.conflictingTables.has(row.tableId)) {
        return Promise.reject(new Error('conflicting key value violates exclusion constraint'));
      }
      pending.push(row);
      return Promise.resolve(row);
    };
    const create = (_target: unknown, data: object) => ({ ...data });
    const manager: FakeManager = {
      create,
      save,
      getRepository: () => ({ create: (data) => data, save }),
    };
    const result = await work(manager);
    this.committed.push(...pending); // only reached when `work` did not throw
    return result;
  };
}

describe('OrdersService.saveAll (your part)', () => {
  const when = { startsAt: kyiv('2030-01-07T12:00'), endsAt: kyiv('2030-01-07T14:00') };

  function setupSave() {
    const db = new FakeDataSource();
    // Using the plain repository means working OUTSIDE the transaction: the test forbids it.
    const outsideTheTransaction = () => {
      throw new Error('the plain repository was used: that is outside the transaction');
    };
    const service = new OrdersService(
      {
        create: outsideTheTransaction,
        save: outsideTheTransaction,
      } as unknown as Repository<Order>,
      db as unknown as DataSource,
      {} as BilliardTablesService,
      {} as RoomsService,
      {} as ClubScheduleService,
      {} as AuditService,
    );
    return { service, db };
  }

  it('books every table in ONE transaction and returns one order per table', async () => {
    const { service, db } = setupSave();

    const created = await service.saveAll('u1', { tableIds: ['t1', 't2'], ...when });

    expect(db.transactions).toBe(1);
    expect(created).toHaveLength(2);
    expect(db.committed).toEqual([
      expect.objectContaining({ userId: 'u1', tableId: 't1' }),
      expect.objectContaining({ userId: 'u1', tableId: 't2' }),
    ]);
  });

  it('takes the tables in sorted order, whatever the order of the request (no deadlocks)', async () => {
    const { service, db } = setupSave();

    await service.saveAll('u1', { tableIds: ['t3', 't1', 't2'], ...when });

    expect(db.committed.map((row) => row.tableId)).toEqual(['t1', 't2', 't3']);
  });

  it('does not reorder the array of the caller', async () => {
    const { service } = setupSave();
    const tableIds = ['t3', 't1', 't2'];

    await service.saveAll('u1', { tableIds, ...when });

    expect(tableIds).toEqual(['t3', 't1', 't2']);
  });

  it('all or nothing: when one table conflicts nothing is committed and the error reaches the caller', async () => {
    const { service, db } = setupSave();
    db.conflictingTables.add('t2');

    await expect(service.saveAll('u1', { tableIds: ['t1', 't2', 't3'], ...when })).rejects.toThrow(
      'exclusion constraint',
    );

    expect(db.committed).toEqual([]); // t1 was saved before t2 failed, and it was rolled back
  });
});

// ---- Stage 5: cancelling and listing ----------------------------------------------------------------

const USER1 = { id: 'u1', role: UserRole.USER };
const ADMIN = { id: 'a1', role: UserRole.ADMIN };
const BOSS = { id: 's1', role: UserRole.SUPERADMIN };

// o1 and o5 belong to u1: o1 starts in the future, o5 has already started. o2 belongs to u2.
const ORDERS: Partial<Order>[] = [
  { id: 'o1', userId: 'u1', status: OrderStatus.RESERVED, startsAt: kyiv('2030-01-07T12:00') },
  { id: 'o2', userId: 'u2', status: OrderStatus.RESERVED, startsAt: kyiv('2030-01-07T12:00') },
  { id: 'o3', userId: 'u1', status: OrderStatus.CANCELLED, startsAt: kyiv('2030-01-07T12:00') },
  { id: 'o4', userId: 'u1', status: OrderStatus.FINISHED, startsAt: kyiv('2029-11-01T12:00') },
  { id: 'o5', userId: 'u1', status: OrderStatus.RESERVED, startsAt: kyiv('2029-11-30T12:00') },
];

function setupOrders(findAndCount = jest.fn()) {
  const rows = ORDERS.map((order) => ({ ...order }) as Order);
  const repo = {
    findOneBy: jest.fn(({ id }: { id: string }) =>
      Promise.resolve(rows.find((row) => row.id === id) ?? null),
    ),
    save: jest.fn((order: Order) => Promise.resolve(order)),
    findAndCount,
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new OrdersService(
    repo as unknown as Repository<Order>,
    {} as DataSource,
    {} as BilliardTablesService,
    {} as RoomsService,
    {} as ClubScheduleService,
    audit as unknown as AuditService,
  );
  return { service, repo, audit };
}

describe('OrdersService.cancel (your part)', () => {
  it('the owner cancels a reserved booking that has not started: it becomes cancelled, no audit entry', async () => {
    const { service, repo, audit } = setupOrders();

    const cancelled = await service.cancel(USER1, 'o1', NOW);

    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o1', status: OrderStatus.CANCELLED }),
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('a booking of somebody else looks exactly like a missing one: 404, nothing saved', async () => {
    const { service, repo } = setupOrders();

    await expect(service.cancel(USER1, 'o2', NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cancel(USER1, 'ghost', NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('only a reserved booking can be cancelled: cancelled and finished ones give 409', async () => {
    const { service, repo } = setupOrders();

    await expect(service.cancel(USER1, 'o3', NOW)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.cancel(USER1, 'o4', NOW)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('a regular user cannot cancel a booking that has already started (409)', async () => {
    const { service, repo } = setupOrders();

    await expect(service.cancel(USER1, 'o5', NOW)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('an admin cancels a booking of another user and the action is written to the audit journal', async () => {
    const { service, audit } = setupOrders();

    const cancelled = await service.cancel(ADMIN, 'o2', NOW);

    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(audit.record).toHaveBeenCalledWith('a1', AuditAction.OrderCancel, 'o2', {
      userId: 'u2',
    });
  });

  it('an admin and a superadmin may also cancel a booking that has already started', async () => {
    // Fresh data for each check: after the first cancellation the booking is no longer reserved.
    await expect(setupOrders().service.cancel(ADMIN, 'o5', NOW)).resolves.toMatchObject({
      status: OrderStatus.CANCELLED,
    });
    await expect(setupOrders().service.cancel(BOSS, 'o5', NOW)).resolves.toMatchObject({
      status: OrderStatus.CANCELLED,
    });
  });

  it('the state rule holds for admins too: a cancelled booking cannot be cancelled again (409)', async () => {
    const { service, audit } = setupOrders();

    await expect(service.cancel(ADMIN, 'o3', NOW)).rejects.toBeInstanceOf(ConflictException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('OrdersService.findAll (your part)', () => {
  it('asks the database for ONE page: skip = (page - 1) * limit, newest bookings first', async () => {
    const findAndCount = jest.fn().mockResolvedValue([[], 25]);
    const { service } = setupOrders(findAndCount);

    await service.findAll({ page: 3, limit: 10 });

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ order: { startsAt: 'DESC' }, skip: 20, take: 10 }),
    );
  });

  it('passes the filters to the query', async () => {
    const findAndCount = jest.fn().mockResolvedValue([[], 0]);
    const { service } = setupOrders(findAndCount);

    await service.findAll({
      page: 1,
      limit: 20,
      status: OrderStatus.RESERVED,
      tableId: 't1',
      userId: 'u1',
    });

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: OrderStatus.RESERVED, tableId: 't1', userId: 'u1' },
      }),
    );
  });

  it('returns the items of the page with the paging meta (25 bookings, 10 per page = 3 pages)', async () => {
    const page = [{ id: 'o1' }, { id: 'o2' }] as Order[];
    const { service } = setupOrders(jest.fn().mockResolvedValue([page, 25]));

    const result = await service.findAll({ page: 3, limit: 10 });

    expect(result.items).toBe(page); // the last page holds fewer items than the limit
    expect(result.meta).toEqual({ page: 3, limit: 10, total: 25, totalPages: 3 });
  });

  it('a page beyond the end is empty, but the meta still tells the truth', async () => {
    const { service } = setupOrders(jest.fn().mockResolvedValue([[], 25]));

    const result = await service.findAll({ page: 4, limit: 10 });

    expect(result.items).toEqual([]);
    expect(result.meta).toMatchObject({ page: 4, total: 25, totalPages: 3 });
  });
});

describe('OrdersService.findMine', () => {
  it('always filters by the user from the token', async () => {
    const findAndCount = jest.fn().mockResolvedValue([[], 0]);
    const { service } = setupOrders(findAndCount);

    await service.findMine('u1', { page: 1, limit: 20, status: OrderStatus.RESERVED });

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: OrderStatus.RESERVED, userId: 'u1' } }),
    );
  });
});
