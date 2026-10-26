import { applyDecorators, UseGuards } from '@nestjs/common';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { BlockedUserGuard } from '../guards/blocked-user.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

// Один декоратор вместо трёх:
//   @Auth()                — нужен валидный токен;
//   @Auth(UserRole.ADMIN)  — нужен токен И роль admin.
// Guard order matters: JWT (who are you?) → blocked (are you allowed to act at all?) → roles (what may you do?).
export const Auth = (...roles: UserRole[]) =>
  applyDecorators(Roles(...roles), UseGuards(JwtAuthGuard, BlockedUserGuard, RolesGuard));
