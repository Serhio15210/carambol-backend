import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BilliardTableType } from '@/modules/tables/types/table-type.enum';
import { BilliardTableStatus } from '@/modules/tables/types/table-status.enum';

@Entity('billiard_tables')
@Index(['number'], { unique: true, where: '"deletedAt" IS NULL' })
export class BilliardTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
