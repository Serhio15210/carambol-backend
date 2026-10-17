import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '@/entities/users/model/user.entity';
import { TableEntity } from '@/entities/tables/model/table.entity';
export enum OrderStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  RESERVED = 'reserved',
  PENDING = 'pending',
  FINISHED = 'finished',
}

export enum OrderPaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToMany(() => TableEntity, (table) => table.orders)
  @JoinTable({
    name: 'order_tables',
    joinColumn: {
      name: 'order_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'table_id',
      referencedColumnName: 'id',
    },
  })
  tables: TableEntity[];

  @ManyToOne(() => User, (user) => user.orders)
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'enum', enum: OrderPaymentStatus, default: OrderPaymentStatus.UNPAID })
  paymentStatus: OrderPaymentStatus;

  @Column({ type: 'int', default: 0 })
  totalAmount: number;

  @Column({ nullable: true })
  stripePaymentIntentId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paymentExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
