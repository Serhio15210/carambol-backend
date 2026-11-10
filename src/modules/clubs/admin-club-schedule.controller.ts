import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/types/request-user.type';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { ClubScheduleService } from './club-schedule.service';
import { OpeningHoursParamsDto } from './dto/opening-hours-params.dto';
import { ScheduleExceptionParamsDto } from './dto/schedule-exception-params.dto';
import { SetOpeningHoursDto } from './dto/set-opening-hours.dto';
import { SetScheduleExceptionDto } from './dto/set-schedule-exception.dto';

@Auth(UserRole.ADMIN, UserRole.SUPERADMIN)
@ApiTags('admin: clubs')
@Controller('admin/clubs/:clubId/schedule')
export class AdminClubScheduleController {
  constructor(private readonly scheduleService: ClubScheduleService) {}

  // PUT /api/v1/admin/clubs/:clubId/schedule/hours/:weekday   { "opensAt": "10:00", "closesAt": "22:00" }
  // weekday: 1 = Monday ... 7 = Sunday. The same call sets a day for the first time and changes it.
  @Put('hours/:weekday')
  setHours(
    @CurrentUser() actor: RequestUser,
    @Param() { clubId, weekday }: OpeningHoursParamsDto,
    @Body() body: SetOpeningHoursDto,
  ) {
    return this.scheduleService.setHours(actor, clubId, weekday, body);
  }

  // DELETE /api/v1/admin/clubs/:clubId/schedule/hours/:weekday   (the day becomes a closed day)
  @Delete('hours/:weekday')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeHours(
    @CurrentUser() actor: RequestUser,
    @Param() { clubId, weekday }: OpeningHoursParamsDto,
  ) {
    return this.scheduleService.removeHours(actor, clubId, weekday);
  }

  // PUT /api/v1/admin/clubs/:clubId/schedule/exceptions/2026-12-31   { "closed": true, "note": "New Year" }
  //     or { "closed": false, "opensAt": "10:00", "closesAt": "16:00" }
  @Put('exceptions/:date')
  setException(
    @CurrentUser() actor: RequestUser,
    @Param() { clubId, date }: ScheduleExceptionParamsDto,
    @Body() body: SetScheduleExceptionDto,
  ) {
    return this.scheduleService.setException(actor, clubId, date, body);
  }

  // DELETE /api/v1/admin/clubs/:clubId/schedule/exceptions/:date   (the date follows its weekday again)
  @Delete('exceptions/:date')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeException(
    @CurrentUser() actor: RequestUser,
    @Param() { clubId, date }: ScheduleExceptionParamsDto,
  ) {
    return this.scheduleService.removeException(actor, clubId, date);
  }
}
