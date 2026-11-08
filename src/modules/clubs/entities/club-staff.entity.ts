import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { ClubStaffRole } from '../types/club-staff-role.enum';
import { Club } from './club.entity';

// A join table between clubs and users. The PAIR (clubId, userId) is the primary key: a person
// can work in a club only once, and the database itself refuses a duplicate (code 23505 -> 409).
// This table only STORES who works where; what they may do is decided by policies (lesson 28).
@Entity('club_staff')
export class ClubStaff {
  @PrimaryColumn('uuid')
  clubId: string;

  @PrimaryColumn('uuid')
  userId: string;

  // CASCADE: an assignment means nothing without its club (or user), so it disappears with it.
  // Compare with rooms: they hold tables, i.e. real data, and therefore use RESTRICT.
  @ManyToOne(() => Club, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  // The only place where Clubs knows the User entity (a foreign key needs it). Existence of the
  // user is checked through UsersService, never through its repository.
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: ClubStaffRole })
  role: ClubStaffRole;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
