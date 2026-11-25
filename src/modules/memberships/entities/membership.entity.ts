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
import { Club } from '@/modules/clubs/entities/club.entity';
import { User } from '@/modules/users/entities/user.entity';
import { MembershipPlan } from './membership-plan.entity';
import { MembershipStatus } from '../types/membership-status.enum';

@Entity('memberships')
// One live membership per user IN EACH CLUB: Gold in club A and Silver in club B may live together.
@Index(['userId', 'clubId'], { unique: true, where: `"status" <> '${MembershipStatus.CANCELED}'` })
export class Membership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // The plan that was bought and its club (copied from the plan: the unique index needs it in this
  // table, an index cannot reach into another one). null only for memberships bought before plans existed.
  @Column({ type: 'uuid', nullable: true })
  planId: string | null;

  @ManyToOne(() => MembershipPlan, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planId' })
  plan: MembershipPlan | null;

  @Column({ type: 'uuid', nullable: true })
  clubId: string | null;

  @ManyToOne(() => Club, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club | null;

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
