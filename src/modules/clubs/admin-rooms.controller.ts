import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/types/request-user.type';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@Auth(UserRole.ADMIN, UserRole.SUPERADMIN)
@ApiTags('admin: clubs')
@Controller('admin/clubs/:clubId/rooms')
export class AdminRoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  // POST /api/v1/admin/clubs/:clubId/rooms
  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body() body: CreateRoomDto,
  ) {
    return this.roomsService.create(actor, clubId, body);
  }

  // PATCH /api/v1/admin/clubs/:clubId/rooms/:roomId
  @Patch(':roomId')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() body: UpdateRoomDto,
  ) {
    return this.roomsService.update(actor, clubId, roomId, body);
  }

  // DELETE /api/v1/admin/clubs/:clubId/rooms/:roomId   (409 while tables reference the room)
  @Delete(':roomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: RequestUser,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.roomsService.remove(actor, clubId, roomId);
  }
}
