import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { ClubScheduleService } from './club-schedule.service';
import { ScheduleStatusQueryDto } from './dto/schedule-status-query.dto';

// Read-only for any logged-in user. Changes live in AdminClubScheduleController.
@Auth()
@ApiTags('clubs')
@Controller('clubs/:clubId/schedule')
export class ClubScheduleController {
  constructor(private readonly scheduleService: ClubScheduleService) {}

  // GET /api/v1/clubs/:clubId/schedule
  //   ->  { timezone, hours: [{ weekday, opensAt, closesAt }], exceptions: [{ date, closed, ... }] }
  @Get()
  getSchedule(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.scheduleService.getSchedule(clubId);
  }

  // GET /api/v1/clubs/:clubId/schedule/status?at=2026-11-14T23:30:00Z   ->  { open, at }
  // Without `at` it answers for this very moment.
  @Get('status')
  async getStatus(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Query() { at }: ScheduleStatusQueryDto,
  ) {
    const moment = at ? new Date(at) : new Date();
    return { open: await this.scheduleService.isOpen(clubId, moment), at: moment.toISOString() };
  }
}
