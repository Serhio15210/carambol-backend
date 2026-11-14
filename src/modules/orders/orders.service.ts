import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '@/common/types/paginated-response.type';
import { AuditService } from '@/modules/audit/audit.service';
import { ClubScheduleService } from '@/modules/clubs/club-schedule.service';
import { RoomsService } from '@/modules/clubs/rooms.service';
import { Actor } from '@/modules/users/users.service';
import { BilliardTablesService } from '@/modules/tables/billiard-tables.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AdminOrdersQueryDto, MyOrdersQueryDto } from './dto/orders-query.dto';
import { Order } from './entities/order.entity';
import { BilliardTableStatus } from '@/modules/tables/types/table-status.enum';
import { bookingTimeProblem, isInsideWorkingHours } from '@/modules/orders/booking-rules';
import { OrderStatus } from '@/modules/orders/types/order-status.enum';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';

export type BookingRequest = { tableIds: string[]; startsAt: Date; endsAt: Date };

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly ordersRepository: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly tables: BilliardTablesService,
    private readonly rooms: RoomsService,
    private readonly schedules: ClubScheduleService,
    private readonly audit: AuditService,
  ) {}

  // One order per table, all or nothing. `now` is a parameter so tests can pick any "today".
  // The path of a booking: 1) can this request be booked at all (assertBookable, throws 404/409/400)
  // -> 2) write the rows (saveAll). The database has the LAST word on overlaps (exclusion constraint).
  async create(userId: string, dto: CreateOrderDto, now = new Date()): Promise<Order[]> {
    const request = {
      tableIds: dto.tableIds,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
    };
    await this.assertBookable(request, now);
    return this.saveAll(userId, request);
  }

  // Why it exists: the server never trusts the client. A booking request can name a table that does
  // not exist, a table under repair, tables of two different clubs, a time in the past or a time when
  // the club is closed, and every case has to end with the RIGHT status code, before anything is
  // written. It is also where the pure rules of booking-rules.ts meet the services of other modules.
  // What it trains (backend job skills): orchestrating several services, one error type per failure,
  // fail fast, and loading shared data (the schedule) once instead of once per table.
  //
  // The checks run in this order, throwing at the FIRST failure:
  //  1. for every table: this.tables.findById(id) (404 for a missing or deleted table by itself);
  //     a table that is not BilliardTableStatus.ACTIVE -> ConflictException (409).
  //  2. all tables must be in ONE club: this.rooms.findRoomWithClub(table.roomId) gives room.clubId;
  //     tables of different clubs -> BadRequestException (400).
  //  3. load the schedule of that club ONCE: this.schedules.getSchedule(clubId).
  //  4. bookingTimeProblem(startsAt, endsAt, now, schedule.timezone): a problem -> BadRequestException(problem).
  //  5. !isInsideWorkingHours(schedule, startsAt, endsAt) -> BadRequestException (outside working hours).
  async assertBookable(request: BookingRequest, now: Date): Promise<void> {
    const clubIds: string[] = [];
    for (const tableId of request.tableIds) {
      const table = await this.tables.findById(tableId);
      if (table.status !== BilliardTableStatus.ACTIVE) {
        throw new ConflictException(`Table ${tableId} is not active`);
      }
      const room = await this.rooms.findRoomWithClub(table.roomId);

      if (!clubIds.includes(room.clubId)) {
        if (clubIds.length >= 1) {
          throw new BadRequestException('Tables must be in one club');
        }
        clubIds.push(room.clubId);
      }
    }
    const schedule = await this.schedules.getSchedule(clubIds[0]);
    const problem = bookingTimeProblem(request.startsAt, request.endsAt, now, schedule.timezone);
    if (problem) {
      throw new BadRequestException(problem);
    }
    if (!isInsideWorkingHours(schedule, request.startsAt, request.endsAt)) {
      throw new BadRequestException('Outside working hours');
    }
  }

  // One transaction: every table is booked or none, so a conflict on the second table leaves nothing
  // behind. Everything goes through the transaction's `manager` (the plain repository would write
  // outside it), and the tables are taken in sorted order (on a COPY), so two requests that name the
  // same tables in opposite order cannot deadlock each other.
  async saveAll(userId: string, { tableIds, startsAt, endsAt }: BookingRequest): Promise<Order[]> {
    const created: Order[] = [];
    await this.dataSource.transaction(async (manager) => {
      for (const tableId of [...tableIds].sort()) {
        const order = manager.create(Order, { userId, tableId, startsAt, endsAt });
        await manager.save(order);
        created.push(order);
      }
    });

    return created;
  }

  // The user's own bookings. The owner comes from the token and is forced into the filter: a query
  // string can never ask for somebody else's list.
  findMine(userId: string, query: MyOrdersQueryDto): Promise<PaginatedResponse<Order>> {
    return this.findAll({ ...query, userId });
  }

  // The admin list of bookings with optional filters, cut into PAGES by the database (skip/take),
  // not in Node. TypeORM ignores a filter whose value is undefined, so there are no if-s.
  async findAll(query: AdminOrdersQueryDto): Promise<PaginatedResponse<Order>> {
    const { page, limit, status, tableId, userId } = query;
    const orders = await this.ordersRepository.findAndCount({
      where: { status, tableId, userId },
      order: { startsAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(orders[0], orders[1], page, limit);
  }

  // The id comes from the URL, so anybody can type anybody's order id: the owner is checked on EVERY
  // call (object-level authorization, "IDOR"), and an order of somebody else looks exactly like a
  // missing one (404, not 403) so the API does not reveal what exists. Only a reserved order can be
  // cancelled; a regular user cannot cancel a booking that has already started. The time becomes
  // free for others by itself: the exclusion constraint ignores cancelled rows.
  // shortcut: read, check, write. Two simultaneous cancellations both pass; the atomic form is
  // update({ id, status: RESERVED }, { status: CANCELLED }) and a check of the affected rows.
  async cancel(actor: Actor, id: string, now = new Date()): Promise<Order> {
    const order = await this.ordersRepository.findOneBy({ id });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    if (actor.role === UserRole.USER) {
      if (order.userId !== actor.id) {
        throw new NotFoundException(`Order ${id} not found`);
      }
      if (order.startsAt <= now) {
        throw new ConflictException(`Order ${id} has already started`);
      }
    }
    if (order.status !== OrderStatus.RESERVED) {
      throw new ConflictException(`Order ${id} is not reserved`);
    }
    order.status = OrderStatus.CANCELLED;
    const saved = await this.ordersRepository.save(order);
    if ([UserRole.SUPERADMIN, UserRole.ADMIN].includes(actor.role)) {
      await this.audit.record(actor.id, AuditAction.OrderCancel, id, { userId: order.userId });
    }
    return saved;
  }

  // A booking that is over must stop being "reserved". The job runs by the clock in every copy of
  // the application, so it must be safe to run twice, even at the same moment: ONE conditional
  // UPDATE (the status is still reserved and endsAt is not in the future), no find() first. A booking
  // that ends exactly now is over. Returns how many orders were finished.
  async finishPastOrders(now = new Date()): Promise<number> {
    const result = await this.ordersRepository.update(
      { status: OrderStatus.RESERVED, endsAt: LessThanOrEqual(now) },
      { status: OrderStatus.FINISHED },
    );
    return result.affected ?? 0;
  }
}
