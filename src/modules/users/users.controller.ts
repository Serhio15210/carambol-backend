import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/types/request-user.type';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

// Все маршруты начинаются с /api/users (префикс /api задан в main.ts).
// @Auth() без ролей — пускаем любого залогиненного пользователя.
@Auth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // GET /api/users/me
  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return this.usersService.findById(user.id);
  }

  // PATCH /api/users/me
  @Patch('me')
  updateMe(@CurrentUser() user: RequestUser, @Body() body: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, body);
  }
}
