import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { BlockedUserGuard } from '../guards/blocked-user.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

// Один декоратор вместо трёх:
//   @Auth()                — нужен валидный токен;
//   @Auth(UserRole.ADMIN)  — нужен токен И роль admin.
// Guard order matters: JWT (who are you?) → blocked (are you allowed to act at all?) → roles (what may you do?).
// The Api* decorators describe the same protection in the docs, so code and docs cannot drift apart.
export const Auth = (...roles: UserRole[]) =>
  applyDecorators(
    Roles(...roles),
    UseGuards(JwtAuthGuard, BlockedUserGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing, invalid or expired access token' }),
    ApiForbiddenResponse({ description: forbiddenDescription(roles) }),
  );

// 403 text for the docs: a blocked account is possible on every @Auth route, a role mismatch only when roles are required.
export function forbiddenDescription(roles: UserRole[]): string {
  return roles.length > 0
    ? `Account is blocked. Or the user role is insufficient. Required role(s): ${roles.join(', ')}`
    : 'Account is blocked.';
}
