import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/entities/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/entities/auth/guards/roles.guard';
import { UserRole } from '@/entities/users/model/user.entity';
import { Roles } from '@/entities/auth/decorators/roles.decorator';

export function Auth(...roles: UserRole[]) {
  return applyDecorators(Roles(...roles), UseGuards(JwtAuthGuard, RolesGuard));
}
