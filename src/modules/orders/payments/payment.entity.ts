import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { PaymentStatus } from './payment-status.enum';

// One payment can cover several bookings (a request for several tables). The money is kept in the
// smallest unit as an INTEGER (1999 = 19.99): floating point numbers cannot store money exactly.
@Entity('payments')
@Check('CHK_payments_amount_positive', '"amountCents" > 0')
export class Payment {
  // Our own id is also the idempotency key of the Stripe request that creates the payment.
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int' })
  amountCents: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  // null until Stripe answers; UNIQUE, so one Stripe payment can never belong to two payments of ours.
  @Column({ type: 'varchar', nullable: true, unique: true })
  stripePaymentIntentId: string | null;

  // After this moment an unpaid payment and its pending bookings are cancelled by the cron job.
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
