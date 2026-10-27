import { ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/types/request-user.type';
import { UsersService } from './users.service';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateUserByAdminDto } from './dto/create-user-by-admin.dto';
import { UserRole } from './types/user-role.enum';

// Только для администраторов: RolesGuard вернёт 403 всем остальным.
// The acting admin (@CurrentUser) is passed on for the role hierarchy check and the audit log.
@Auth(UserRole.ADMIN, UserRole.SUPERADMIN)
@ApiTags('admin: users')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  // POST /api/admin/users
  @Post()
  create(@CurrentUser() actor: RequestUser, @Body() body: CreateUserByAdminDto) {
    return this.usersService.createByAdmin(actor, body);
  }

  // GET /api/admin/users?page=1&limit=20&search=ivan
  @Get()
  findAll(@Query() query: GetUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  // ParseUUIDPipe проверяет формат id. На строку "abc" будет 400 Bad Request,
  // а без этой проверки PostgreSQL упал бы на невалидном uuid и вернул 500.
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  // PATCH /api/admin/users/:id   body: { "firstName": "..." }
  @Patch(':id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProfileDto,
  ) {
    return this.usersService.updateByAdmin(actor, id, body);
  }

  // PATCH /api/admin/users/:id/role   body: { "role": "admin" }
  @Patch(':id/role')
  updateRole(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(actor, id, body.role);
  }

  // POST /api/admin/users/:id/block
  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  block(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.setBlocked(actor, id, true);
  }

  // POST /api/admin/users/:id/unblock
  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  unblock(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.setBlocked(actor, id, false);
  }

  // DELETE /api/admin/users/:id   (soft delete: the row stays, deletedAt is filled)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.softDelete(actor, id);
  }
}
