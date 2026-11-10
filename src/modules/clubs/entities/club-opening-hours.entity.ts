import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Club } from './club.entity';
import { hhmm } from './hhmm.transformer';

// Opening hours of one weekday: one interval per day, so (clubId, weekday) is the primary key.
// weekday follows ISO: 1 = Monday ... 7 = Sunday (JavaScript's getDay() has Sunday = 0!).
// closesAt <= opensAt means "closes the next day" (18:00-02:00); equal times mean around the clock.
// A weekday without a row is a closed day.
@Entity('club_opening_hours')
@Check('"weekday" BETWEEN 1 AND 7')
export class ClubOpeningHours {
  @PrimaryColumn('uuid')
  clubId: string;

  @PrimaryColumn({ type: 'smallint' })
  weekday: number;

  // CASCADE: hours mean nothing without their club.
  @ManyToOne(() => Club, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'time', transformer: hhmm })
  opensAt: string;

  @Column({ type: 'time', transformer: hhmm })
  closesAt: string;
}
