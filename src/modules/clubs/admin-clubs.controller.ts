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
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';

@Auth(UserRole.ADMIN, UserRole.SUPERADMIN)
@ApiTags('admin: clubs')
@Controller('admin/clubs')
export class AdminClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  // POST /api/v1/admin/clubs
  @Post()
  create(@CurrentUser() actor: RequestUser, @Body() body: CreateClubDto) {
    return this.clubsService.create(actor, body);
  }

  // PATCH /api/v1/admin/clubs/:id   (only the fields that were sent)
  @Patch(':id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClubDto,
  ) {
    return this.clubsService.update(actor, id, body);
  }

  // DELETE /api/v1/admin/clubs/:id   (a real delete; 409 while rooms reference the club)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.clubsService.remove(actor, id);
  }
}
