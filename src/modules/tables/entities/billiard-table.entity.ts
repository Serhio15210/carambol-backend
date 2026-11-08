import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
// A relation needs the class, so this is the one place where Tables imports a file of Clubs.
// The dependency points one way only: Tables -> Clubs.
import { Room } from '@/modules/clubs/entities/room.entity';
import { BilliardTableType } from '@/modules/tables/types/table-type.enum';
import { BilliardTableStatus } from '@/modules/tables/types/table-status.enum';

@Entity('billiard_tables')
// A table number is unique inside ONE room (and only among tables that are not deleted).
@Index(['roomId', 'number'], { unique: true, where: '"deletedAt" IS NULL' })
export class BilliardTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roomId: string;

  // RESTRICT: a room that still has tables (even soft-deleted ones) cannot be deleted; PostgreSQL
  // answers with code 23503 and AllExceptionsFilter turns it into 409.
  @ManyToOne(() => Room, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'roomId' })
  room: Room;

  @Column()
  number: number;

  @Column({ type: 'enum', enum: BilliardTableType })
  type: BilliardTableType;

  @Column({ type: 'enum', enum: BilliardTableStatus, default: BilliardTableStatus.ACTIVE })
  status: BilliardTableStatus;

  @Column({ default: 0 })
  lengthCm: number;

  @Column({ default: 0 })
  widthCm: number;

  @Column({ default: 0 })
  x: number;

  @Column({ default: 0 })
  y: number;

  @Column({ default: 0 })
  rotation: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
