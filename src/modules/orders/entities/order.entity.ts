import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Exclusion,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
// Relations need the classes: Orders points to Tables and Users, never the other way round.
import { BilliardTable } from '@/modules/tables/entities/billiard-table.entity';
import { User } from '@/modules/users/entities/user.entity';
import { OrderStatus } from '../types/order-status.enum';

// One row = one table booked for the interval [startsAt, endsAt): half-open, so a booking that ends
// at 11:00 and one that starts at 11:00 do not collide. A request for several tables becomes
// several rows, created in one transaction.
//
// The no-double-booking rule lives HERE, in the database, not in the service: checking "is the table
// free?" and then inserting is a race (two requests both see "free"). The exclusion constraint is
// checked atomically on every INSERT/UPDATE and answers with SQLSTATE 23P01 (AllExceptionsFilter -> 409).
// It needs the btree_gist extension (to compare uuid with = inside a gist index): see the migration.
@Entity('orders')
@Check('CHK_orders_ends_after_starts', '"endsAt" > "startsAt"')
@Exclusion(
  'no_double_booking',
  `USING gist ("tableId" WITH =, tstzrange("startsAt", "endsAt") WITH &&) WHERE ("status" <> 'cancelled')`,
)
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  // RESTRICT: users and tables are soft-deleted, a hard delete must not erase the booking history.
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  tableId: string;

  @ManyToOne(() => BilliardTable, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tableId' })
  table: BilliardTable;

  // timestamptz = an instant (stored in UTC), unlike the wall-clock opening hours of lesson 16.
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.RESERVED })
  status: OrderStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
