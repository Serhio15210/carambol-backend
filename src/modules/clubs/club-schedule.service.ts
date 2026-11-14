import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { Actor } from '@/modules/users/users.service';
import { ClubsService } from './clubs.service';
import { SetOpeningHoursDto } from './dto/set-opening-hours.dto';
import { SetScheduleExceptionDto } from './dto/set-schedule-exception.dto';
import { ClubOpeningHours } from './entities/club-opening-hours.entity';
import { ClubScheduleException } from './entities/club-schedule-exception.entity';
import { isClubOpenAt } from './opening-hours';

export type ClubSchedule = {
  timezone: string;
  hours: ClubOpeningHours[];
  exceptions: ClubScheduleException[];
};

@Injectable()
export class ClubScheduleService {
  constructor(
    @InjectRepository(ClubOpeningHours)
    private readonly hoursRepository: Repository<ClubOpeningHours>,
    @InjectRepository(ClubScheduleException)
    private readonly exceptionsRepository: Repository<ClubScheduleException>,
    private readonly clubs: ClubsService,
    private readonly audit: AuditService,
  ) {}

  // The weekly hours (Monday first), the exceptions for single dates (earliest first) and the
  // club's time zone: every time and date here means wall-clock time THERE. A weekday that is
  // missing from the list is a closed day.
  // shortcut: all exceptions of the club are loaded, not only the coming ones. Fine for a few
  // dozen a year; add a date range filter (or delete the past ones) when a club collects hundreds.
  async getSchedule(clubId: string): Promise<ClubSchedule> {
    const club = await this.clubs.findById(clubId); // 404 for an unknown club
    const hours = await this.hoursRepository.find({ where: { clubId }, order: { weekday: 'ASC' } });
    const exceptions = await this.exceptionsRepository.find({
      where: { clubId },
      order: { date: 'ASC' },
    });
    return { timezone: club.timezone, hours, exceptions };
  }

  // PUT is idempotent: the pair (clubId, weekday) is the primary key, so save() inserts the day
  // the first time and replaces its hours afterwards. One row per call, no transaction needed
  // (replacing a whole week at once would need one: that is lesson 17).
  async setHours(
    actor: Actor,
    clubId: string,
    weekday: number,
    dto: SetOpeningHoursDto,
  ): Promise<ClubOpeningHours> {
    await this.clubs.findById(clubId);
    const saved = await this.hoursRepository.save(
      this.hoursRepository.create({ clubId, weekday, ...dto }),
    );
    await this.audit.record(actor.id, AuditAction.ClubHoursSet, clubId, { weekday, ...dto });
    return saved;
  }

  // Removing a day's hours makes that weekday a closed day.
  async removeHours(actor: Actor, clubId: string, weekday: number): Promise<void> {
    await this.clubs.findById(clubId);
    const { affected } = await this.hoursRepository.delete({ clubId, weekday });
    if (!affected) {
      throw new NotFoundException(`Club ${clubId} has no opening hours for weekday ${weekday}`);
    }
    await this.audit.record(actor.id, AuditAction.ClubHoursRemove, clubId, { weekday });
  }

  // The exception for one local date, e.g. "2026-12-31": closed that day, or other hours.
  // Same idea as setHours: (clubId, date) is the primary key, so PUT is idempotent.
  // A closed day keeps no times (the database CHECK requires it), so they are dropped here.
  async setException(
    actor: Actor,
    clubId: string,
    date: string,
    dto: SetScheduleExceptionDto,
  ): Promise<ClubScheduleException> {
    await this.clubs.findById(clubId);
    const { closed } = dto;
    const saved = await this.exceptionsRepository.save(
      this.exceptionsRepository.create({
        clubId,
        date,
        closed,
        opensAt: closed ? null : (dto.opensAt ?? null),
        closesAt: closed ? null : (dto.closesAt ?? null),
        note: dto.note ?? null,
      }),
    );
    await this.audit.record(actor.id, AuditAction.ClubExceptionSet, clubId, { date, ...dto });
    return saved;
  }

  // After removing the exception the date follows its weekday rule again.
  async removeException(actor: Actor, clubId: string, date: string): Promise<void> {
    await this.clubs.findById(clubId);
    const { affected } = await this.exceptionsRepository.delete({ clubId, date });
    if (!affected) {
      throw new NotFoundException(`Club ${clubId} has no exception for ${date}`);
    }
    await this.audit.record(actor.id, AuditAction.ClubExceptionRemove, clubId, { date });
  }

  // Is the club open at this INSTANT? One database round trip, then the pure isClubOpenAt.
  async isOpen(clubId: string, at: Date): Promise<boolean> {
    return isClubOpenAt(await this.getSchedule(clubId), at);
  }
}
