import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/modules/audit/audit.module';
import { UsersModule } from '@/modules/users/users.module';
import { AdminClubStaffController } from './admin-club-staff.controller';
import { AdminClubScheduleController } from './admin-club-schedule.controller';
import { AdminClubsController } from './admin-clubs.controller';
import { AdminRoomsController } from './admin-rooms.controller';
import { ClubScheduleController } from './club-schedule.controller';
import { ClubScheduleService } from './club-schedule.service';
import { ClubStaffService } from './club-staff.service';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { ClubOpeningHours } from './entities/club-opening-hours.entity';
import { ClubScheduleException } from './entities/club-schedule-exception.entity';
import { ClubStaff } from './entities/club-staff.entity';
import { Club } from './entities/club.entity';
import { Room } from './entities/room.entity';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

// Dependencies point one way: Clubs -> Users (to check that a person exists). Users knows nothing
// about clubs, so there is no import cycle (lesson 10).
@Module({
  imports: [
    TypeOrmModule.forFeature([Club, Room, ClubStaff, ClubOpeningHours, ClubScheduleException]),
    AuditModule,
    UsersModule,
  ],
  controllers: [
    ClubsController,
    AdminClubsController,
    RoomsController,
    AdminRoomsController,
    AdminClubStaffController,
    ClubScheduleController,
    AdminClubScheduleController,
  ],
  providers: [ClubsService, RoomsService, ClubStaffService, ClubScheduleService],
  // Tables will import ClubsModule (a table needs its room and club), never the other way round.
  // Orders (lesson 17) will use ClubScheduleService to ask whether a club is open.
  exports: [ClubsService, RoomsService, ClubScheduleService],
})
export class ClubsModule {}
