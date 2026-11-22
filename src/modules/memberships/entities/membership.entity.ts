import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { MembershipStatus } from '../types/membership-status.enum';

@Entity('memberships')
@Index(['userId'], { unique: true, where: `"status" <> '${MembershipStatus.CANCELED}'` })
export class Membership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: MembershipStatus, default: MembershipStatus.PENDING })
  status: MembershipStatus;

  @Column({ type: 'varchar', nullable: true })
  stripeCustomerId: string | null;

  @Column({ type: 'varchar', nullable: true, unique: true })
  stripeSubscriptionId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
