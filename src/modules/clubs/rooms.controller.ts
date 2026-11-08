import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { RoomsService } from './rooms.service';

// Nested resource: a room exists only inside a club, so the club id is part of the path.
@Auth()
@ApiTags('clubs')
@Controller('clubs/:clubId/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  // GET /api/v1/clubs/:clubId/rooms
  @Get()
  findAll(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.roomsService.findAllByClub(clubId);
  }

  // GET /api/v1/clubs/:clubId/rooms/:roomId
  @Get(':roomId')
  findOne(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.roomsService.findInClub(clubId, roomId);
  }
}
