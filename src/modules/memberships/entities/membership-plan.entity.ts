import {
  Check,
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

// A membership a club sells: "Gold, 40.00 a month, 25% off bookings in THIS club".
// Never deleted while memberships point at it: a plan is archived (archivedAt) and leaves the shop window.
@Entity('membership_plans')
// Stripe cannot charge less than 0.50 USD (lesson 19).
@Check('CHK_membership_plans_price_min', '"priceCents" >= 50')
// 0% is not a membership, more than 100% would pay the customer.
@Check('CHK_membership_plans_discount_range', '"discountPercent" BETWEEN 1 AND 100')
// Two "Gold" plans on sale in one club confuse customers; an archived "Gold" does not block a new one.
@Index(['clubId', 'name'], { unique: true, where: '"archivedAt" IS NULL' })
export class MembershipPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  clubId: string;

  // RESTRICT: a club that still has plans cannot be deleted (23503 -> 409), like a club with rooms.
  @ManyToOne(() => Club, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Monthly price in cents, shown in the shop window without asking Stripe.
  @Column({ type: 'int' })
  priceCents: number;

  // Our own business rule: Stripe knows nothing about booking discounts.
  @Column({ type: 'smallint' })
  discountPercent: number;

  // The Stripe Price the subscriptions are charged by. A Stripe price never changes: a new price
  // means a new Price, and this column points at the one new purchases use. null until Stripe answers.
  @Column({ type: 'varchar', nullable: true, unique: true })
  stripePriceId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
