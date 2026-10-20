import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../types/request-user.type';

// Guard — это «охранник» перед контроллером: возвращает true (пустить) или false (403).
// Он запускается ПОСЛЕ JwtAuthGuard, поэтому request.user уже заполнен.
@Injectable()
export class RolesGuard implements CanActivate {
  // Reflector читает метаданные, которые записал декоратор @Roles(...).
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Роли ищем сначала на методе, потом на классе контроллера.
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Роли не указаны (@Auth() без аргументов) — достаточно быть залогиненным.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    return request.user !== undefined && requiredRoles.includes(request.user.role);
  }
}
