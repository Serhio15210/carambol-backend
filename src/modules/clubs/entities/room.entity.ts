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
import { Club } from './club.entity';

// One name per club. A composite index is right here: the PAIR (club, name) must be unique,
// two clubs may both have a "Main hall".
@Entity('rooms')
@Index(['clubId', 'name'], { unique: true })
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The column itself, so code can write where: { clubId } without loading the club.
  @Column()
  clubId: string;

  // RESTRICT: PostgreSQL refuses to delete a club that still has rooms. The error code (23503)
  // reaches AllExceptionsFilter, which answers 409. No "has rooms" check is needed in code.
  @ManyToOne(() => Club, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column()
  name: string;

  // Hall plan: x runs along the width, y along the length, both measured from one corner.
  @Column({ type: 'int' })
  widthCm: number;

  @Column({ type: 'int' })
  lengthCm: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
