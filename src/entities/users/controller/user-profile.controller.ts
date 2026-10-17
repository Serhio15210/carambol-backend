import { Body, Controller, Delete, Get, Patch } from '@nestjs/common';
import { Auth } from '@/entities/auth/decorators/auth.decorator';
import { CurrentUser } from '@/entities/auth/decorators/current-user.decorator';
import { UpdateUserDto } from '@/entities/users/dto/update-user.dto';
import { RequestUser } from '@/entities/users/interfaces/user.interface';
import { UserRole } from '@/entities/users/model/user.entity';
import { UsersService } from '@/entities/users/service/users.service';

@Auth(UserRole.ADMIN, UserRole.USER)
@Controller('users/profile')
export class UserProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getProfile(@CurrentUser() user: RequestUser) {
    return this.usersService.getUser(user.id);
  }

  @Patch()
  updateProfile(@CurrentUser() user: RequestUser, @Body() data: UpdateUserDto) {
    return this.usersService.updateUser(user.id, data);
  }

  @Delete()
  deleteProfile(@CurrentUser() user: RequestUser) {
    return this.usersService.deleteUser(user.id);
  }
}
