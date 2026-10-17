import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OrderEntity, OrderPaymentStatus, OrderStatus } from '@/entities/orders/model/order.entity';
import { TableEntity } from '@/entities/tables/model/table.entity';
import { OrderFindAllFilters } from '@/entities/orders/interfaces/order.interfaces';

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepository: Repository<OrderEntity>,
    @InjectRepository(TableEntity)
    private readonly tablesRepository: Repository<TableEntity>,
  ) {}

  findAll(filters: OrderFindAllFilters = {}): Promise<OrderEntity[]> {
    const query = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.tables', 'table')
      .orderBy('order.startsAt', 'DESC');

    if (filters.userId) {
      query.andWhere('order.userId = :userId', { userId: filters.userId });
    }

    if (filters.statuses?.length) {
      query.andWhere('order.status IN (:...statuses)', { statuses: filters.statuses });
    }

    return query.getMany();
  }

  findById(id: string): Promise<OrderEntity | null> {
    return this.ordersRepository.findOne({
      where: { id },
      relations: { tables: true },
    });
  }

  findTablesByIds(ids: string[]): Promise<TableEntity[]> {
    return this.tablesRepository.findBy({ id: In(ids) });
  }

  create(data: Partial<OrderEntity>): OrderEntity {
    return this.ordersRepository.create(data);
  }

  save(order: OrderEntity): Promise<OrderEntity> {
    return this.ordersRepository.save(order);
  }

  async hasTableConflict(params: {
    tableIds: string[];
    startsAt: Date;
    endsAt: Date;
    excludeOrderId?: string;
  }): Promise<boolean> {
    const query = this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin('order.tables', 'table')
      .where('table.id IN (:...tableIds)', { tableIds: params.tableIds })
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.ACTIVE, OrderStatus.RESERVED, OrderStatus.PENDING],
      })
      .andWhere('order.startsAt < :endsAt', { endsAt: params.endsAt })
      .andWhere('order.endsAt > :startsAt', { startsAt: params.startsAt });

    if (params.excludeOrderId) {
      query.andWhere('order.id != :excludeOrderId', { excludeOrderId: params.excludeOrderId });
    }

    return (await query.getExists()) === true;
  }

  async activateStartedOrders(now: Date): Promise<void> {
    await this.ordersRepository
      .createQueryBuilder()
      .update(OrderEntity)
      .set({ status: OrderStatus.ACTIVE })
      .where('status = :status', { status: OrderStatus.RESERVED })
      .andWhere('paymentStatus = :paymentStatus', { paymentStatus: OrderPaymentStatus.PAID })
      .andWhere('startsAt <= :now', { now })
      .andWhere('endsAt > :now', { now })
      .execute();
  }

  async finishEndedOrders(now: Date): Promise<void> {
    await this.ordersRepository
      .createQueryBuilder()
      .update(OrderEntity)
      .set({ status: OrderStatus.FINISHED })
      .where('status IN (:...statuses)', {
        statuses: [OrderStatus.ACTIVE, OrderStatus.RESERVED],
      })
      .andWhere('endsAt <= :now', { now })
      .execute();
  }

  async cancelExpiredPendingPayments(now: Date): Promise<void> {
    await this.ordersRepository
      .createQueryBuilder()
      .update(OrderEntity)
      .set({ status: OrderStatus.CANCELED })
      .where('status = :status', { status: OrderStatus.PENDING })
      .andWhere('paymentStatus = :paymentStatus', { paymentStatus: OrderPaymentStatus.UNPAID })
      .andWhere('paymentExpiresAt IS NOT NULL')
      .andWhere('paymentExpiresAt <= :now', { now })
      .execute();
  }
}
