import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/types/request-user.type';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { ClubStaffService } from './club-staff.service';
import { SetStaffRoleDto } from './dto/set-staff-role.dto';

@Auth(UserRole.ADMIN, UserRole.SUPERADMIN)
@ApiTags('admin: clubs')
@Controller('admin/clubs/:clubId/staff')
export class AdminClubStaffController {
  constructor(private readonly staffService: ClubStaffService) {}

  // GET /api/v1/admin/clubs/:clubId/staff
  @Get()
  findAll(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.staffService.findAllByClub(clubId);
  }

  // PUT /api/v1/admin/clubs/:clubId/staff/:userId   { "role": "manager" }
  // PUT, not POST: the client knows the full address of the record (club + user) and repeating
  // the request gives the same result, so it assigns a person and changes the role alike.
  @Put(':userId')
  assign(
    @CurrentUser() actor: RequestUser,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SetStaffRoleDto,
  ) {
    return this.staffService.assign(actor, clubId, userId, body.role);
  }

  // DELETE /api/v1/admin/clubs/:clubId/staff/:userId
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: RequestUser,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.staffService.remove(actor, clubId, userId);
  }
}
