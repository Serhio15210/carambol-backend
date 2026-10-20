import { applyDecorators, UseGuards } from '@nestjs/common';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

// Один декоратор вместо трёх:
//   @Auth()                — нужен валидный токен;
//   @Auth(UserRole.ADMIN)  — нужен токен И роль admin.
// Порядок guard'ов важен: сначала JWT (кто ты?), потом роли (что тебе можно?).
export const Auth = (...roles: UserRole[]) =>
  applyDecorators(Roles(...roles), UseGuards(JwtAuthGuard, RolesGuard));
