import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { OrdersRepository } from '@/entities/orders/repository/orders.repository';
import { OrderEntity, OrderPaymentStatus, OrderStatus } from '@/entities/orders/model/order.entity';
import { CreateOrderDto } from '@/entities/orders/dto/create-order.dto';
import { UpdateOrderDto } from '@/entities/orders/dto/update-order.dto';
import { RequestUser } from '@/entities/users/interfaces/user.interface';
import { UserRole } from '@/entities/users/model/user.entity';
import { TableEntity, TableStatus } from '@/entities/tables/model/table.entity';
import { UserBaseRepository } from '@/entities/users/repository/user-base.repository';
import { OutboxService } from '@/shared/outbox/service/outbox.service';
import { MAIL_SERVICE_PATTERNS } from '@/microservices/src/app/mail/shared/injection-tokens';
import { StripeService } from '@/integrations/stripe/stripe.service';
import { StripePaymentIntent } from '@/integrations/stripe/stripe.service';
import { OrderCheckoutResponse } from '@/entities/orders/interfaces/order-checkout.interface';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly userBaseRepository: UserBaseRepository,
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    private readonly stripeService: StripeService,
  ) {}

  getMyOrders(userId: string): Promise<OrderEntity[]> {
    return this.ordersRepository.findAll({ userId });
  }

  getAllOrders(): Promise<OrderEntity[]> {
    return this.ordersRepository.findAll();
  }

  async createOrder(userId: string, data: CreateOrderDto): Promise<OrderEntity> {
    const user = await this.getUserOrThrow(userId);
    const startsAt = this.parseDate(data.startsAt);
    const endsAt = this.parseDate(data.endsAt);
    this.assertValidOrderTime(startsAt, endsAt);

    const tables = await this.getAvailableTablesOrThrow(data.tableIds);
    await this.assertTablesAreFree(data.tableIds, startsAt, endsAt);

    const order = this.ordersRepository.create({
      userId,
      tables,
      startsAt,
      endsAt,
      status: startsAt <= new Date() ? OrderStatus.ACTIVE : OrderStatus.RESERVED,
      paymentStatus: OrderPaymentStatus.UNPAID,
      totalAmount: this.calculateTotalAmount(tables, startsAt, endsAt),
    });

    return this.dataSource.transaction(async (manager) => {
      const savedOrder = await manager.save(OrderEntity, order);

      await this.createOrderNotificationEvent(manager, {
        topic: MAIL_SERVICE_PATTERNS.ORDER_CREATED,
        order: savedOrder,
        user,
        tables,
        occurredAt: new Date(),
      });

      return savedOrder;
    });
  }

  async createOrderCheckout(userId: string, data: CreateOrderDto): Promise<OrderCheckoutResponse> {
    const startsAt = this.parseDate(data.startsAt);
    const endsAt = this.parseDate(data.endsAt);
    this.assertValidOrderTime(startsAt, endsAt);

    const tables = await this.getAvailableTablesOrThrow(data.tableIds);
    await this.assertTablesAreFree(data.tableIds, startsAt, endsAt);

    const order = this.ordersRepository.create({
      userId,
      tables,
      startsAt,
      endsAt,
      status: OrderStatus.PENDING,
      paymentStatus: OrderPaymentStatus.UNPAID,
      totalAmount: this.calculateTotalAmount(tables, startsAt, endsAt),
      paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      paidAt: null,
      stripePaymentIntentId: null,
    });

    const savedOrder = await this.ordersRepository.save(order);
    const paymentIntent = await this.stripeService.createOrderPaymentIntent({
      orderId: savedOrder.id,
      userId,
      amount: savedOrder.totalAmount,
    });

    savedOrder.stripePaymentIntentId = paymentIntent.id;
    const orderWithPaymentIntent = await this.ordersRepository.save(savedOrder);

    if (!paymentIntent.client_secret) {
      throw new BadRequestException('Stripe payment intent client secret was not created');
    }

    return {
      order: orderWithPaymentIntent,
      clientSecret: paymentIntent.client_secret,
    };
  }

  async updateOrder(
    orderId: string,
    data: UpdateOrderDto,
    currentUser: RequestUser,
  ): Promise<OrderEntity> {
    const order = await this.getOrderForUserOrThrow(orderId, currentUser);

    if ([OrderStatus.CANCELED, OrderStatus.FINISHED].includes(order.status)) {
      throw new BadRequestException('Finished or canceled order cannot be updated');
    }

    if (currentUser.role !== UserRole.ADMIN && (data.status || data.paymentStatus)) {
      throw new ForbiddenException('Only admin can update order status or payment status');
    }

    const startsAt = data.startsAt ? this.parseDate(data.startsAt) : order.startsAt;
    const endsAt = data.endsAt ? this.parseDate(data.endsAt) : order.endsAt;
    const tableIds = data.tableIds ?? order.tables.map((table) => table.id);
    this.assertValidOrderTime(startsAt, endsAt);

    const tables = data.tableIds
      ? await this.getAvailableTablesOrThrow(data.tableIds)
      : order.tables;
    await this.assertTablesAreFree(tableIds, startsAt, endsAt, order.id);

    order.tables = tables;
    order.startsAt = startsAt;
    order.endsAt = endsAt;
    order.totalAmount = this.calculateTotalAmount(tables, startsAt, endsAt);

    if (currentUser.role === UserRole.ADMIN) {
      if (data.status) {
        order.status = data.status;
      }
      if (data.paymentStatus) {
        order.paymentStatus = data.paymentStatus;
      }
    }

    const user = await this.getUserOrThrow(order.userId);

    return this.dataSource.transaction(async (manager) => {
      const savedOrder = await manager.save(OrderEntity, order);
      const topic =
        savedOrder.status === OrderStatus.CANCELED
          ? MAIL_SERVICE_PATTERNS.ORDER_CANCELED
          : MAIL_SERVICE_PATTERNS.ORDER_UPDATED;

      await this.createOrderNotificationEvent(manager, {
        topic,
        order: savedOrder,
        user,
        tables,
        occurredAt: new Date(),
      });

      return savedOrder;
    });
  }

  async cancelOrder(orderId: string, currentUser: RequestUser): Promise<OrderEntity> {
    const order = await this.getOrderForUserOrThrow(orderId, currentUser);
    const user = await this.getUserOrThrow(order.userId);

    if (order.status === OrderStatus.FINISHED) {
      throw new BadRequestException('Finished order cannot be canceled');
    }
    if (order.status === OrderStatus.CANCELED) {
      throw new BadRequestException('Order is already canceled');
    }

    order.status = OrderStatus.CANCELED;

    return this.dataSource.transaction(async (manager) => {
      const savedOrder = await manager.save(OrderEntity, order);

      await this.createOrderNotificationEvent(manager, {
        topic: MAIL_SERVICE_PATTERNS.ORDER_CANCELED,
        order: savedOrder,
        user,
        tables: order.tables,
        occurredAt: new Date(),
      });

      return savedOrder;
    });
  }

  async refreshOrderStatuses(now = new Date()): Promise<void> {
    await this.ordersRepository.cancelExpiredPendingPayments(now);
    await this.ordersRepository.activateStartedOrders(now);
    await this.ordersRepository.finishEndedOrders(now);
  }

  async confirmStripePayment(paymentIntent: StripePaymentIntent): Promise<void> {
    const orderId = this.getOrderIdFromPaymentIntent(paymentIntent);

    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(OrderEntity, {
        where: { id: orderId },
        relations: { tables: true },
      });

      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }
      if (order.paymentStatus === OrderPaymentStatus.PAID) {
        return;
      }
      if (order.stripePaymentIntentId !== paymentIntent.id) {
        throw new BadRequestException('Stripe payment intent does not match order');
      }
      if (order.totalAmount * 100 !== paymentIntent.amount) {
        throw new BadRequestException('Stripe payment amount does not match order total');
      }
      if (order.status === OrderStatus.CANCELED) {
        throw new BadRequestException('Canceled order cannot be confirmed as paid');
      }

      const now = new Date();
      const user = await this.getUserOrThrow(order.userId);

      order.paymentStatus = OrderPaymentStatus.PAID;
      order.paidAt = now;
      order.status = this.resolvePaidOrderStatus(order, now);

      const savedOrder = await manager.save(OrderEntity, order);

      await this.createOrderNotificationEvent(manager, {
        topic: MAIL_SERVICE_PATTERNS.ORDER_CREATED,
        order: savedOrder,
        user,
        tables: order.tables,
        occurredAt: now,
      });
    });
  }

  async failStripePayment(paymentIntent: StripePaymentIntent): Promise<void> {
    const orderId = this.getOrderIdFromPaymentIntent(paymentIntent);
    const order = await this.ordersRepository.findById(orderId);

    if (!order || order.paymentStatus === OrderPaymentStatus.PAID) {
      return;
    }
  }

  async cancelStripePayment(paymentIntent: StripePaymentIntent): Promise<void> {
    const orderId = this.getOrderIdFromPaymentIntent(paymentIntent);
    const order = await this.ordersRepository.findById(orderId);

    if (!order || order.paymentStatus === OrderPaymentStatus.PAID) {
      return;
    }

    order.status = OrderStatus.CANCELED;
    await this.ordersRepository.save(order);
  }

  private async getOrderForUserOrThrow(
    orderId: string,
    currentUser: RequestUser,
  ): Promise<OrderEntity> {
    const order = await this.ordersRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (currentUser.role !== UserRole.ADMIN && order.userId !== currentUser.id) {
      throw new ForbiddenException('Access denied');
    }

    return order;
  }

  private async getUserOrThrow(userId: string) {
    const user = await this.userBaseRepository.getUserById(userId);

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return user;
  }

  private async getAvailableTablesOrThrow(tableIds: string[]): Promise<TableEntity[]> {
    const tables = await this.ordersRepository.findTablesByIds(tableIds);

    if (tables.length !== tableIds.length) {
      throw new BadRequestException('One or more tables were not found');
    }

    const unavailableTable = tables.find((table) =>
      [TableStatus.HIDDEN, TableStatus.MAINTENANCE].includes(table.status),
    );

    if (unavailableTable) {
      throw new BadRequestException(`Table ${unavailableTable.id} is not available`);
    }

    return tables;
  }

  private async assertTablesAreFree(
    tableIds: string[],
    startsAt: Date,
    endsAt: Date,
    excludeOrderId?: string,
  ): Promise<void> {
    const hasConflict = await this.ordersRepository.hasTableConflict({
      tableIds,
      startsAt,
      endsAt,
      excludeOrderId,
    });

    if (hasConflict) {
      throw new BadRequestException('One or more tables are already reserved for this time');
    }
  }

  private parseDate(value: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    return date;
  }

  private assertValidOrderTime(startsAt: Date, endsAt: Date): void {
    if (startsAt >= endsAt) {
      throw new BadRequestException('Order end time must be after start time');
    }
  }

  private calculateTotalAmount(tables: TableEntity[], startsAt: Date, endsAt: Date): number {
    const durationHours = Math.ceil((endsAt.getTime() - startsAt.getTime()) / 3_600_000);
    const pricePerHour = tables.reduce((sum, table) => sum + table.pricePerHour, 0);

    return durationHours * pricePerHour;
  }

  private getOrderIdFromPaymentIntent(paymentIntent: StripePaymentIntent): string {
    const orderId = paymentIntent.metadata.orderId;

    if (!orderId) {
      throw new BadRequestException('Stripe payment intent metadata.orderId is missing');
    }

    return orderId;
  }

  private resolvePaidOrderStatus(order: OrderEntity, now: Date): OrderStatus {
    if (order.endsAt <= now) {
      return OrderStatus.FINISHED;
    }
    if (order.startsAt <= now) {
      return OrderStatus.ACTIVE;
    }

    return OrderStatus.RESERVED;
  }

  private async createOrderNotificationEvent(
    manager: EntityManager,
    params: {
      topic: string;
      order: OrderEntity;
      user: { id: string; email?: string | null; phone?: string | null; userName: string };
      tables: TableEntity[];
      occurredAt: Date;
    },
  ): Promise<void> {
    if (!params.user.email && !params.user.phone) {
      return;
    }

    await this.outboxService.createEvent(manager, {
      topic: params.topic,
      payload: this.createOrderMailPayload(params),
    });
  }

  private createOrderMailPayload(params: {
    order: OrderEntity;
    user: { id: string; email?: string | null; phone?: string | null; userName: string };
    tables: TableEntity[];
    occurredAt: Date;
  }) {
    return {
      eventId: randomUUID(),
      orderId: params.order.id,
      userId: params.user.id,
      email: params.user.email || undefined,
      phone: params.user.email ? undefined : params.user.phone || undefined,
      userName: params.user.userName,
      tableNames: params.tables.map((table) => table.name),
      startsAt: params.order.startsAt.toISOString(),
      endsAt: params.order.endsAt.toISOString(),
      totalAmount: params.order.totalAmount,
      occurredAt: params.occurredAt.toISOString(),
    };
  }
}
