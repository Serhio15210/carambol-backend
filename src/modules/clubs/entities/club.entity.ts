import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// A club is deleted for real (there is no deletedAt): once rooms reference it, the database
// itself refuses the DELETE (foreign key with ON DELETE RESTRICT, added together with rooms).
@Entity('clubs')
@Index(['lat', 'lng']) // narrows the "nearby" search to a bounding box before exact distances
export class Club {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  address: string;

  // double precision: node-postgres returns it as a JS number (numeric would arrive as a string).
  @Column({ type: 'double precision' })
  lat: number;

  @Column({ type: 'double precision' })
  lng: number;

  // Minimum passage in this club, in cm: between two tables and between a table and a wall.
  @Column({ type: 'int', default: 150 })
  minGapCm: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
