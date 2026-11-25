import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '@/common/types/paginated-response.type';
import { MembershipsService } from '@/modules/memberships/memberships.service';
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
import { PAYMENT_GATEWAY, PaymentGateway } from '@/modules/payments/payment-gateway';
import { Payment } from './payments/payment.entity';
import { applyDiscount, MIN_CHARGE_CENTS, priceCents } from './pricing';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { PaymentStatus } from '@/modules/orders/payments/payment-status.enum';

export type BookingRequest = { tableIds: string[]; startsAt: Date; endsAt: Date };

// What one booking costs and until when it waits for the money. priceCents is per table; 0 = free.
export type PaymentTerms = { priceCents: number; currency: string; expiresAt: Date };

// What a payment_intent.succeeded webhook led to (the controller only logs it):
// confirmed = first delivery, the bookings are reserved now; duplicate = already handled, nothing done;
// refunded = the payment came too late, the money was sent back; unknown = not a payment of ours.
export type PaymentConfirmation = 'confirmed' | 'duplicate' | 'refunded' | 'unknown';

// The answer to POST /orders. `payment` is null for a free booking. The client hands clientSecret to
// Stripe.js in the browser, which shows the card form; the card never passes through our server.
export type CreatedBooking = {
  orders: Order[];
  payment: {
    id: string;
    amountCents: number;
    currency: string;
    expiresAt: Date;
    clientSecret: string;
  } | null;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order) private readonly ordersRepository: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly tables: BilliardTablesService,
    private readonly rooms: RoomsService,
    private readonly schedules: ClubScheduleService,
    private readonly audit: AuditService,
    @InjectRepository(Payment) private readonly paymentsRepository: Repository<Payment>,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly config: ConfigService,
    private readonly memberships: MembershipsService,
  ) {}

  // One order per table, all or nothing. `now` is a parameter so tests can pick any "today".
  // The path of a booking: 1) can this request be booked at all (assertBookable, throws 404/409/400)
  // -> 2) write the rows (saveAll). The database has the LAST word on overlaps (exclusion constraint).
  // 3) for a paid booking, AFTER the transaction is committed: ask Stripe for the payment (requestPayment).
  async create(userId: string, dto: CreateOrderDto, now = new Date()): Promise<CreatedBooking> {
    const request = {
      tableIds: dto.tableIds,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
    };
    const { clubId, hourlyRateCents } = await this.assertBookable(request, now);
    // A member pays less. One price for everything below: the minimum check, the payment and the
    // order rows (a refund later returns exactly this amount).
    const discount = await this.memberships.discountPercentFor(userId, clubId);
    const price = applyDiscount(
      priceCents(hourlyRateCents, request.startsAt, request.endsAt),
      discount,
    );

    const total = price * request.tableIds.length;
    // Stripe cannot charge 1-49 cents: that is a club setting to fix, not an amount to round away.
    if (total > 0 && total < MIN_CHARGE_CENTS) {
      throw new BadRequestException(`A paid booking must cost at least ${MIN_CHARGE_CENTS} cents`);
    }
    const windowMinutes = this.config.getOrThrow<number>('stripe.paymentWindowMinutes');
    const orders = await this.saveAll(userId, request, {
      priceCents: price,
      currency: this.config.getOrThrow<string>('stripe.currency'),
      expiresAt: new Date(now.getTime() + windowMinutes * 60_000),
    });
    const paymentId = orders[0].paymentId;
    if (!paymentId) {
      return { orders, payment: null };
    }
    const clientSecret = await this.requestPayment(paymentId);
    const payment = await this.paymentsRepository.findOneByOrFail({ id: paymentId });
    const { id, amountCents, currency, expiresAt } = payment;
    return { orders, payment: { id, amountCents, currency, expiresAt, clientSecret } };
  }

  // The bookings and the pending payment are already COMMITTED in our database (saveAll). Now the
  // other system: Stripe creates the payment ("PaymentIntent") and gives a clientSecret for the browser.
  //
  // Step 6a is done: Stripe creates the payment with OUR id as the idempotency key, and Stripe's id is
  // kept in our row (the webhook finds the payment by it).
  //
  // If Stripe fails (the call throws): our rows are already committed, so nothing
  // rolls back by itself: undo the booking BY HAND (a "compensation"). In ONE transaction:
  // payment pending -> failed, its orders pending -> cancelled (the table is free again). Then throw
  // ServiceUnavailableException (503): the client may simply try again later.
  async requestPayment(paymentId: string): Promise<string> {
    const payment = await this.paymentsRepository.findOneByOrFail({ id: paymentId });
    try {
      const stripe = await this.gateway.createPaymentIntent({
        amountCents: payment.amountCents,
        currency: payment.currency,
        idempotencyKey: payment.id,
        metadata: { paymentId: payment.id },
      });

      await this.paymentsRepository.update(
        { id: payment.id },
        { stripePaymentIntentId: stripe.id },
      );
      return stripe.clientSecret;
    } catch {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          Payment,
          { id: payment.id, status: PaymentStatus.PENDING },
          { status: PaymentStatus.FAILED },
        );
        await manager.update(
          Order,
          { paymentId: payment.id, status: OrderStatus.PENDING },
          { status: OrderStatus.CANCELLED },
        );
      });
      throw new ServiceUnavailableException();
    }
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
  // Returns the club and its hourly rate (cents per hour): the price is known once the club is known.
  async assertBookable(
    request: BookingRequest,
    now: Date,
  ): Promise<{ clubId: string; hourlyRateCents: number }> {
    const clubIds: string[] = [];
    let hourlyRateCents = 0;
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
        hourlyRateCents = room.club.hourlyRateCents;
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
    return { clubId: clubIds[0], hourlyRateCents };
  }

  // One transaction: every table is booked or none, so a conflict on the second table leaves nothing
  // behind. Everything goes through the transaction's `manager` (the plain repository would write
  // outside it), and the tables are taken in sorted order (on a COPY), so two requests that name the
  // same tables in opposite order cannot deadlock each other.
  //
  // A PAID booking (terms.priceCents > 0). Inside the SAME transaction:
  // a) FIRST save ONE Payment for the whole request: userId, amountCents = price of one table times the
  //    number of tables, currency and expiresAt from `terms`, status PaymentStatus.PENDING;
  // b) then every order gets status OrderStatus.PENDING, paymentId = that payment's id, and priceCents.
  // A FREE booking (priceCents 0) stays as it is now: no payment, the orders are reserved at once.
  async saveAll(
    userId: string,
    { tableIds, startsAt, endsAt }: BookingRequest,
    terms: PaymentTerms,
  ): Promise<Order[]> {
    const created: Order[] = [];

    await this.dataSource.transaction(async (manager) => {
      let payment: Payment | undefined;
      if (terms.priceCents > 0) {
        payment = manager.create(Payment, {
          userId,
          amountCents: terms.priceCents * tableIds.length,
          currency: terms.currency,
          expiresAt: terms.expiresAt,
          status: PaymentStatus.PENDING,
        });
        await manager.save(payment);
      }
      for (const tableId of [...tableIds].sort()) {
        const orderPayload: Partial<Order> = {
          userId,
          tableId,
          startsAt,
          endsAt,
        };
        if (terms.priceCents > 0 && payment) {
          orderPayload.paymentId = payment.id;
          orderPayload.priceCents = terms.priceCents;
          orderPayload.status = OrderStatus.PENDING;
        }
        const order = manager.create(Order, orderPayload);
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
  //
  // The write itself is the check (a conditional update): of two simultaneous cancellations only one
  // wins, the other gets 409.
  //
  // A PAID booking (order.paymentId) gives its money back when cancelled.
  // BEFORE the conditional update: load the payment and refund THIS booking's share:
  //   this.gateway.refund({ paymentIntentId: <the payment's>, amountCents: order.priceCents,
  //                         idempotencyKey: order.id })
  // If the refund fails, the booking must stay reserved: throw ServiceUnavailableException (503) so
  // the client can simply try again (the same key makes the retry safe). A free booking: no refund.
  // shortcut: no cancellation fee and the payment keeps status succeeded after a partial refund.
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
    if (order.paymentId) {
      const payment = await this.paymentsRepository.findOneBy({ id: order.paymentId });
      if (payment && payment.stripePaymentIntentId) {
        try {
          await this.gateway.refund({
            paymentIntentId: payment.stripePaymentIntentId,
            amountCents: order.priceCents,
            idempotencyKey: order.id,
          });
        } catch (err) {
          throw new ServiceUnavailableException(`Failed to refund the payment: ${String(err)}`);
        }
      }
    }
    const saved = await this.ordersRepository.update(
      { id: order.id, status: OrderStatus.RESERVED },
      { status: OrderStatus.CANCELLED },
    );
    if (!saved.affected) {
      throw new ConflictException('Order was already cancelled by another request');
    }
    if ([UserRole.SUPERADMIN, UserRole.ADMIN].includes(actor.role)) {
      await this.audit.record(actor.id, AuditAction.OrderCancel, id, { userId: order.userId });
    }
    return { ...order, status: OrderStatus.CANCELLED };
  }

  // The safety net of all payments: a booking that was not paid in time gives its table back. Runs by
  // the clock in every copy of the application (OrdersJobs), so two runs at the same moment must not
  // expire a payment twice. Returns how many payments expired.
  //
  // Step 4a is done: in ONE transaction the payments expire (UPDATE ... RETURNING tells which) and
  // their pending bookings are cancelled.
  //
  // AFTER the transaction Stripe is asked to cancel the PaymentIntent of every
  // expired payment that has one (this.gateway.cancelPaymentIntent(id)), so the customer cannot pay
  // late any more. This is BEST EFFORT: if Stripe fails, do NOT throw (our database is already right,
  // and a late payment is refunded by confirmPayment anyway); log a warning with this.logger.warn and
  // go on with the next payment.
  async cancelExpiredUnpaid(now = new Date()): Promise<number> {
    let expired: { id: string; stripePaymentIntentId: string | null }[] = [];
    await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(Payment)
        .set({ status: PaymentStatus.EXPIRED })
        .where('status = :status', { status: PaymentStatus.PENDING })
        .andWhere('"expiresAt" <= :now', { now })
        .returning(['id', 'stripePaymentIntentId'])
        .execute();
      expired = result.raw as { id: string; stripePaymentIntentId: string | null }[];
      await manager.update(
        Order,
        { paymentId: In(expired.map((p) => p.id)), status: OrderStatus.PENDING },
        { status: OrderStatus.CANCELLED },
      );
    });
    for (const item of expired) {
      if (item.stripePaymentIntentId) {
        try {
          await this.gateway.cancelPaymentIntent(item.stripePaymentIntentId);
        } catch (err) {
          this.logger.warn(
            `Failed to cancel PaymentIntent ${item.stripePaymentIntentId}: ${String(err)}`,
          );
        }
      }
    }
    return expired.length;
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

  // Stripe says the PaymentIntent `paymentIntentId` was paid (the controller already checked the
  // signature). The same event can come twice, even at the same moment, and it can come too late, so
  // every change is a conditional UPDATE:
  // - pending payment: it becomes succeeded and its bookings become reserved, in ONE transaction;
  // - otherwise it was a duplicate, or the payment EXPIRED (the cron job already cancelled its unpaid
  //   bookings): then the money goes back. The refund is a network call, so it is made OUTSIDE the
  //   transaction. A failed refund is not caught: the controller answers 500 and Stripe sends the event
  //   again; the idempotency key (our payment id) makes the second refund safe.
  async confirmPayment(paymentIntentId: string): Promise<PaymentConfirmation> {
    const payment = await this.paymentsRepository.findOneBy({
      stripePaymentIntentId: paymentIntentId,
    });
    if (!payment) {
      return 'unknown';
    }
    const result = await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        Payment,
        { id: payment.id, status: PaymentStatus.PENDING },
        { status: PaymentStatus.SUCCEEDED, paidAt: new Date() },
      );
      if (result.affected === 0) {
        return false;
      }
      await manager.update(
        Order,
        { paymentId: payment.id, status: OrderStatus.PENDING },
        { status: OrderStatus.RESERVED },
      );
      return true;
    });
    if (result) {
      return 'confirmed';
    }
    const refreshPayment = await this.paymentsRepository.findOneByOrFail({
      id: payment.id,
    });
    if (refreshPayment.status !== PaymentStatus.EXPIRED) {
      return 'duplicate';
    }
    // Its own idempotency key: payment.id already belongs to the request that created the
    // PaymentIntent, and Stripe ties a key to one kind of request (found in the live check).
    await this.gateway.refund({ paymentIntentId, idempotencyKey: `refund:${payment.id}` });
    await this.paymentsRepository.update(payment.id, { status: PaymentStatus.REFUNDED });
    return 'refunded';
  }
}
