import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { Auth } from '@/entities/auth/decorators/auth.decorator';
import { UserRole } from '@/entities/users/model/user.entity';
import { UsersService } from '@/entities/users/service/users.service';
import { GetUsersQueryDto } from '@/entities/users/dto/get-users-query.dto';

@Auth(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getUsers(@Query() query: GetUsersQueryDto) {
    return this.usersService.getUsers(query);
  }

  @Get(':userId')
  getUser(@Param('userId') userId: string) {
    return this.usersService.getUser(userId);
  }

  @Patch(':userId')
  updateUserRole(@Param('userId') userId: string, @Body() role: UserRole) {
    return this.usersService.updateUserRole(userId, role);
  }

  @Delete(':userId')
  deleteUser(@Param('userId') userId: string) {
    return this.usersService.deleteUser(userId);
  }
}
