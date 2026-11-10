import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Club } from './club.entity';
import { hhmm } from './hhmm.transformer';

// One exception per LOCAL calendar date of the club (a holiday, a day off, shortened hours).
// It replaces the weekday rule for that date: closed = true, or its own opensAt/closesAt.
// The database guards the pair: a closed day has no times, an open one has both.
// `date` is a plain "YYYY-MM-DD" string (a calendar day, not an instant: no time zone in it).
@Entity('club_schedule_exceptions')
@Check(
  '("closed" AND "opensAt" IS NULL AND "closesAt" IS NULL) OR (NOT "closed" AND "opensAt" IS NOT NULL AND "closesAt" IS NOT NULL)',
)
export class ClubScheduleException {
  @PrimaryColumn('uuid')
  clubId: string;

  @PrimaryColumn({ type: 'date' })
  date: string;

  // CASCADE: exceptions mean nothing without their club.
  @ManyToOne(() => Club, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'boolean' })
  closed: boolean;

  @Column({ type: 'time', nullable: true, transformer: hhmm })
  opensAt: string | null;

  @Column({ type: 'time', nullable: true, transformer: hhmm })
  closesAt: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;
}
