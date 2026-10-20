import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { UsersService } from './users.service';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UserRole } from './types/user-role.enum';

// Только для администраторов: RolesGuard вернёт 403 всем остальным.
@Auth(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

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

  // PATCH /api/admin/users/:id/role   body: { "role": "admin" }
  @Patch(':id/role')
  updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUserRoleDto) {
    return this.usersService.updateRole(id, body.role);
  }
}
